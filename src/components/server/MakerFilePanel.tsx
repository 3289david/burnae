"use client";

import { useEffect, useState } from "react";
import { FileText, Folder as FolderIcon, ChevronLeft, RefreshCw } from "lucide-react";

interface FileObject {
  name: string;
  is_file: boolean;
  size: number;
}

/** 메이커가 만들고 있는 프로젝트 파일들을 옆에서 바로 볼 수 있는 간단한 파일 탐색기 (읽기 전용) */
export default function MakerFilePanel({ serverId, refreshKey }: { serverId: string; refreshKey: number }) {
  const [dir, setDir] = useState("/");
  const [files, setFiles] = useState<FileObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);

  async function load(d: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/files?dir=${encodeURIComponent(d)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "불러오기 실패");
      setFiles(data);
      setDir(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, refreshKey]);

  async function openFile(name: string) {
    const path = dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
    const res = await fetch(`/api/servers/${serverId}/files/content?file=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (res.ok) setPreview({ path, content: data.content });
  }

  function parentDir(d: string) {
    const parts = d.split("/").filter(Boolean);
    parts.pop();
    return "/" + parts.join("/");
  }

  if (preview) {
    return (
      <div className="border-b border-border bg-surface-2/50">
        <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-b border-border">
          <button onClick={() => setPreview(null)} className="text-xs text-accent inline-flex items-center gap-1 shrink-0">
            <ChevronLeft size={13} /> 뒤로
          </button>
          <span className="font-mono text-xs truncate">{preview.path}</span>
        </div>
        <pre className="p-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{preview.content}</pre>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-surface-2/50">
      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border text-xs">
        {dir !== "/" && (
          <button onClick={() => load(parentDir(dir))} className="text-accent shrink-0 inline-flex items-center gap-0.5">
            <ChevronLeft size={13} /> 상위로
          </button>
        )}
        <span className="font-mono text-text-dim truncate flex-1">{dir}</span>
        <button onClick={() => load(dir)} disabled={loading} className="text-text-dim shrink-0">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="max-h-32 overflow-y-auto">
        {error && <p className="p-3 text-xs text-red">{error}</p>}
        {!error && files.length === 0 && !loading && (
          <p className="p-3 text-xs text-text-dim">아직 파일이 없어요. 채팅으로 뭔가 만들어보세요.</p>
        )}
        {files.map((f) => (
          <button
            key={f.name}
            onClick={() => (f.is_file ? openFile(f.name) : load(dir.endsWith("/") ? `${dir}${f.name}` : `${dir}/${f.name}`))}
            className="w-full flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-surface-2 text-left"
          >
            {f.is_file ? (
              <FileText size={12} className="text-text-dim shrink-0" />
            ) : (
              <FolderIcon size={12} className="text-yellow shrink-0" />
            )}
            <span className="truncate">{f.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
