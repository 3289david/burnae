"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Folder as FolderIcon, Search } from "lucide-react";

interface FileObject {
  name: string;
  is_file: boolean;
  size: number;
  modified_at: string;
}

const ARCHIVE_EXT = /\.(zip|tar|tar\.gz|tgz|rar|7z)$/i;

export default function FilesTab({ serverId }: { serverId: string }) {
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
    const path = joinPath(dir, name);
    const res = await fetch(`/api/servers/${serverId}/files/content?file=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (res.ok) {
      setEditing(path);
      setContent(data.content);
    }
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

  if (editing) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <span className="font-mono text-xs sm:text-sm truncate">{editing}</span>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setEditing(null)} className="btn-secondary px-3 py-1.5 text-sm">취소</button>
            <button onClick={save} disabled={loading} className="btn-primary px-3 py-1.5 text-sm">저장</button>
          </div>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="input w-full h-96 font-mono text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className={`card p-0 overflow-hidden ${dragOver ? "border-accent" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
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
          {selected.size > 0 && (
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
            className="btn-secondary px-2.5 py-1 text-xs"
          >
            {uploading ? "업로드 중..." : "업로드"}
          </button>
        </div>
      </div>

      {dragOver && (
        <div className="px-4 py-6 text-center text-sm text-accent border-b border-border">
          여기에 파일을 놓으세요
        </div>
      )}
      {error && <p className="p-4 text-sm text-red">{error}</p>}

      <div className="divide-y divide-border">
        {filteredFiles.map((f) => {
          const isArchive = f.is_file && ARCHIVE_EXT.test(f.name);
          return (
            <div key={f.name} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
              <input
                type="checkbox"
                checked={selected.has(f.name)}
                onChange={() => toggleSelect(f.name)}
                className="shrink-0"
              />
              <button
                onClick={() => (f.is_file ? openFile(f.name) : load(joinPath(dir, f.name)))}
                className="flex-1 min-w-0 flex items-center gap-1.5 text-left truncate"
              >
                {f.is_file ? (
                  <FileText size={15} className="text-text-dim shrink-0" />
                ) : (
                  <FolderIcon size={15} className="text-yellow shrink-0" />
                )}
                {f.name}
              </button>
              {f.is_file && <span className="text-text-dim text-xs shrink-0">{(f.size / 1024).toFixed(1)}KB</span>}
              {f.is_file && (
                <button onClick={() => download(f.name)} className="text-xs text-accent shrink-0">받기</button>
              )}
              {isArchive && (
                <button onClick={() => decompress(f.name)} className="text-xs text-accent shrink-0">압축해제</button>
              )}
              <button onClick={() => copyItem(f.name)} className="text-xs text-text-dim shrink-0">복사</button>
              <button onClick={() => renameItem(f.name)} className="text-xs text-text-dim shrink-0">이름변경</button>
              <button onClick={() => deleteFiles([f.name])} className="text-xs text-red shrink-0">
                삭제
              </button>
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
