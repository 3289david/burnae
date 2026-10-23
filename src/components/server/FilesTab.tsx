"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Folder as FolderIcon,
  Search,
  Image as ImageIcon,
  Music,
  Video as VideoIcon,
  Archive as ArchiveIcon,
  FileCode,
  Database,
  File as FileIcon,
  MoreVertical,
} from "lucide-react";
import { hasServerRank, type ServerAccessRole } from "@/lib/serverRoleRank";

interface FileObject {
  name: string;
  is_file: boolean;
  size: number;
  modified_at: string;
}

const ARCHIVE_EXT = /\.(zip|tar|tar\.gz|tgz|rar|7z)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|flac|m4a|aac)$/i;
const VIDEO_EXT = /\.(mp4|mkv|webm|mov|avi)$/i;
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
/** 텍스트 에디터로 열면 깨지는(바이너리) 확장자 — 이미지/오디오/비디오는 별도 처리하고,
 * 나머지는 열지 않고 바로 다운로드시킨다. */
const OPAQUE_BINARY_EXT = /\.(jar|class|exe|dll|so|o|a|bin|db|sqlite3?|wasm|dat|pdf)$/i;
const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py|go|rs|java|kt|c|cpp|h|hpp|cs|rb|php|sh|bash|html|css|scss|less|json|ya?ml|sql|xml|toml|lua|swift|dart)$/i;
const DB_EXT = /\.(db|sqlite3?)$/i;

function fileIcon(name: string, isFile: boolean) {
  if (!isFile) return FolderIcon;
  if (IMAGE_EXT.test(name)) return ImageIcon;
  if (AUDIO_EXT.test(name)) return Music;
  if (VIDEO_EXT.test(name)) return VideoIcon;
  if (ARCHIVE_EXT.test(name)) return ArchiveIcon;
  if (DB_EXT.test(name)) return Database;
  if (CODE_EXT.test(name)) return FileCode;
  if (OPAQUE_BINARY_EXT.test(name) || FONT_EXT.test(name)) return FileIcon;
  return FileText;
}

export default function FilesTab({ serverId, myRole }: { serverId: string; myRole: ServerAccessRole | null }) {
  const canEdit = hasServerRank(myRole, "DEVELOPER");
  const [dir, setDir] = useState("/");
  const [files, setFiles] = useState<FileObject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [query, setQuery] = useState("");
  const [previewImage, setPreviewImage] = useState<{ name: string; url: string } | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load(d: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files?dir=${encodeURIComponent(d)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "불러오기 실패");
      setFiles(data);
      setDir(d);
      setSelected(new Set());
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function openFile(name: string) {
    // 이미지는 미리보기로, 그 외 바이너리(압축/오디오/비디오/폰트/실행파일 등)는 텍스트
    // 에디터로 열면 깨지니까 바로 다운로드시킨다 — 순수 텍스트 계열만 에디터로 연다.
    if (IMAGE_EXT.test(name)) {
      await previewImageFile(name);
      return;
    }
    if (ARCHIVE_EXT.test(name) || AUDIO_EXT.test(name) || VIDEO_EXT.test(name) || FONT_EXT.test(name) || OPAQUE_BINARY_EXT.test(name)) {
      await download(name);
      return;
    }
    const path = joinPath(dir, name);
    const res = await fetch(`/api/servers/${serverId}/files/content?file=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (res.ok) {
      setEditing(path);
      setContent(data.content);
    }
  }

  async function previewImageFile(name: string) {
    const path = joinPath(dir, name);
    const res = await fetch(`/api/servers/${serverId}/files/download-url?file=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (res.ok) setPreviewImage({ name, url: data.url });
  }

  async function save() {
    if (!editing) return;
    setLoading(true);
    try {
      await fetch(`/api/servers/${serverId}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: editing, content }),
      });
      setEditing(null);
    } finally {
      setLoading(false);
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/upload-url?dir=${encodeURIComponent(dir)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 준비 실패");

      const form = new FormData();
      for (const file of list) form.append("files", file);

      const uploadRes = await fetch(data.url, { method: "POST", body: form });
      if (!uploadRes.ok) throw new Error("업로드에 실패했어요.");
      await load(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function download(name: string) {
    const path = joinPath(dir, name);
    const res = await fetch(`/api/servers/${serverId}/files/download-url?file=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (res.ok) window.open(data.url, "_blank");
  }

  async function compressSelected() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/compress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir, files: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "압축 실패");
      await load(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "압축 실패");
    } finally {
      setLoading(false);
    }
  }

  async function decompress(name: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/decompress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir, file: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "압축 해제 실패");
      await load(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "압축 해제 실패");
    } finally {
      setLoading(false);
    }
  }

  async function deleteFiles(names: string[]) {
    if (names.length === 0) return;
    if (!confirm(`${names.length}개를 삭제할까요? 되돌릴 수 없어요.`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir, files: names }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      await load(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setLoading(false);
    }
  }
  const deleteSelected = () => deleteFiles(Array.from(selected));

  async function renameItem(name: string) {
    const next = prompt("새 이름을 입력하세요", name);
    if (!next || next === name) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir, from: name, to: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "이름 변경 실패");
      await load(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이름 변경 실패");
    } finally {
      setLoading(false);
    }
  }

  async function copyItem(name: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: joinPath(dir, name) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "복사 실패");
      await load(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "복사 실패");
    } finally {
      setLoading(false);
    }
  }

  async function newFolder() {
    const name = prompt("새 폴더 이름을 입력하세요");
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: dir, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "폴더 생성 실패");
      await load(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "폴더 생성 실패");
    } finally {
      setLoading(false);
    }
  }

  async function newFile() {
    const name = prompt("새 파일 이름을 입력하세요 (예: notes.txt)");
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: joinPath(dir, name), content: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "파일 생성 실패");
      await load(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일 생성 실패");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const filteredFiles = files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));

  if (previewImage) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <span className="font-mono text-xs sm:text-sm truncate">{previewImage.name}</span>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => download(previewImage.name)} className="text-xs text-accent hover:underline">받기</button>
            <button onClick={() => setPreviewImage(null)} className="btn-secondary px-3 py-1.5 text-sm">닫기</button>
          </div>
        </div>
        <div className="flex justify-center bg-surface-2 rounded-lg p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Wings가 발급한 1회용 외부 URL, next/image 최적화 대상 아님 */}
          <img src={previewImage.url} alt={previewImage.name} className="max-w-full max-h-[70vh] object-contain" />
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <span className="font-mono text-xs sm:text-sm truncate">{editing}</span>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setEditing(null)} className="btn-secondary px-3 py-1.5 text-sm">{canEdit ? "취소" : "닫기"}</button>
            {canEdit && <button onClick={save} disabled={loading} className="btn-primary px-3 py-1.5 text-sm">저장</button>}
          </div>
        </div>
        <textarea
          value={content}
          onChange={(e) => canEdit && setContent(e.target.value)}
          readOnly={!canEdit}
          spellCheck={false}
          className="input w-full h-96 font-mono text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className={`card p-0 overflow-hidden transition-colors duration-150 ${dragOver ? "border-accent bg-accent/[0.03]" : ""}`}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (canEdit && e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
      }}
    >
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-sm flex-wrap">
        <span className="text-text-dim">경로:</span>
        <span className="font-mono truncate">{dir}</span>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={(e) => {
              // 검색으로 화면에서 안 보이게 된 선택 항목이 남아있으면 "선택 삭제"를 누를 때
              // 본인이 잊은 파일까지 같이 지워질 수 있어서, 검색어를 바꾸면 선택을 초기화한다
              setQuery(e.target.value);
              setSelected(new Set());
            }}
            placeholder="파일 검색"
            className="input py-1 pl-7 text-xs w-32"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && selected.size > 0 && (
            <>
              <button onClick={compressSelected} disabled={loading} className="text-accent text-xs">
                선택 {selected.size}개 압축
              </button>
              <button onClick={deleteSelected} disabled={loading} className="text-red text-xs">
                선택 삭제
              </button>
            </>
          )}
          {dir !== "/" && (
            <button onClick={() => load(parentDir(dir))} className="text-accent text-xs">상위로</button>
          )}
          {canEdit && (
            <>
              <button onClick={newFolder} disabled={loading} className="btn-secondary px-2.5 py-1 text-xs">
                새 폴더
              </button>
              <button onClick={newFile} disabled={loading} className="btn-secondary px-2.5 py-1 text-xs">
                새 파일
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && uploadFiles(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-secondary px-2.5 py-1 text-xs active:scale-95 transition-transform"
              >
                {uploading ? "업로드 중..." : "업로드"}
              </button>
            </>
          )}
        </div>
      </div>

      {dragOver && (
        <div className="px-4 py-6 text-center text-sm text-accent border-b border-border animate-toast-in">
          여기에 파일을 놓으세요
        </div>
      )}
      {error && <p className="p-4 text-sm text-red">{error}</p>}

      <div className="divide-y divide-border">
        {filteredFiles.map((f, i) => {
          const isArchive = f.is_file && ARCHIVE_EXT.test(f.name);
          const Icon = fileIcon(f.name, f.is_file);
          return (
            <div
              key={f.name}
              className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2 transition-colors animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 12) * 0.02}s` }}
            >
              {canEdit && (
                <input
                  type="checkbox"
                  checked={selected.has(f.name)}
                  onChange={() => toggleSelect(f.name)}
                  className="shrink-0"
                />
              )}
              <button
                onClick={() => (f.is_file ? openFile(f.name) : load(joinPath(dir, f.name)))}
                className="flex-1 min-w-0 flex items-center gap-1.5 text-left truncate"
              >
                <Icon size={15} className={f.is_file ? "text-text-dim shrink-0" : "text-yellow shrink-0"} />
                {f.name}
              </button>
              {f.is_file && <span className="text-text-dim text-xs shrink-0 hidden sm:inline">{(f.size / 1024).toFixed(1)}KB</span>}
              {f.is_file && (
                <button onClick={() => download(f.name)} className="text-xs text-accent shrink-0 hover:underline">받기</button>
              )}
              {canEdit && (
                <div className="relative shrink-0">
                  <button
                    onClick={() => setMenuOpenFor((cur) => (cur === f.name ? null : f.name))}
                    className="p-1 -m-1 text-text-dim hover:text-text rounded active:scale-95 transition-transform"
                    aria-label="더보기"
                  >
                    <MoreVertical size={15} />
                  </button>
                  {menuOpenFor === f.name && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpenFor(null)} />
                      <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 z-20 min-w-28 animate-toast-in">
                        {isArchive && (
                          <button
                            onClick={() => { setMenuOpenFor(null); decompress(f.name); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-accent hover:bg-surface-2"
                          >
                            압축해제
                          </button>
                        )}
                        <button
                          onClick={() => { setMenuOpenFor(null); copyItem(f.name); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-text-dim hover:bg-surface-2 hover:text-text"
                        >
                          복사
                        </button>
                        <button
                          onClick={() => { setMenuOpenFor(null); renameItem(f.name); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-text-dim hover:bg-surface-2 hover:text-text"
                        >
                          이름변경
                        </button>
                        <button
                          onClick={() => { setMenuOpenFor(null); deleteFiles([f.name]); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-red hover:bg-surface-2"
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && files.length === 0 && <p className="p-4 text-sm text-text-dim">빈 폴더예요. 파일을 끌어다 놓아도 업로드돼요.</p>}
        {!loading && files.length > 0 && filteredFiles.length === 0 && <p className="p-4 text-sm text-text-dim">검색 결과가 없어요.</p>}
      </div>
    </div>
  );
}

function joinPath(dir: string, name: string) {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}
function parentDir(dir: string) {
  const parts = dir.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}
