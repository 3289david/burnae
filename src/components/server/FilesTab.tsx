"use client";

import { useEffect, useState } from "react";

interface FileObject {
  name: string;
  is_file: boolean;
  size: number;
  modified_at: string;
}

export default function FilesTab({ serverId }: { serverId: string }) {
  const [dir, setDir] = useState("/");
  const [files, setFiles] = useState<FileObject[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (editing) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-sm">{editing}</span>
          <div className="flex gap-2">
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
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-sm">
        <span className="text-text-dim">경로:</span>
        <span className="font-mono">{dir}</span>
        {dir !== "/" && (
          <button onClick={() => load(parentDir(dir))} className="text-accent ml-auto">상위로</button>
        )}
      </div>
      {error && <p className="p-4 text-sm text-red">{error}</p>}
      <div className="divide-y divide-border">
        {files.map((f) => (
          <button
            key={f.name}
            onClick={() => (f.is_file ? openFile(f.name) : load(joinPath(dir, f.name)))}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-2 text-left"
          >
            <span>{f.is_file ? "📄" : "📁"} {f.name}</span>
            {f.is_file && <span className="text-text-dim text-xs">{(f.size / 1024).toFixed(1)}KB</span>}
          </button>
        ))}
        {!loading && files.length === 0 && <p className="p-4 text-sm text-text-dim">빈 폴더예요.</p>}
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
