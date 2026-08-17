"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface SearchResult {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
}
interface VersionInfo {
  id: string;
  versionNumber: string;
  name: string;
  gameVersions: string[];
  primaryFile: { filename: string; size: number } | null;
}
interface InstalledFile {
  name: string;
  size: number;
}

export default function PluginsTab({ serverId }: { serverId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loader, setLoader] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, VersionInfo[]>>({});
  const [installed, setInstalled] = useState<InstalledFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadInstalled() {
    const res = await fetch(`/api/servers/${serverId}/plugins`);
    if (res.ok) {
      const data = await res.json();
      setInstalled(data.files ?? []);
    }
  }

  useEffect(() => {
    loadInstalled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/plugins/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results);
      setLoader(data.loader);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 실패");
    } finally {
      setBusy(false);
    }
  }

  async function loadVersions(projectId: string) {
    if (versions[projectId]) return;
    const res = await fetch(`/api/servers/${serverId}/plugins/versions?projectId=${projectId}`);
    if (res.ok) {
      const data = await res.json();
      setVersions((v) => ({ ...v, [projectId]: data }));
    }
  }

  async function install(versionId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/plugins/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "설치 실패");
    } finally {
      setBusy(false);
    }
  }

  async function uninstall(filename: string) {
    if (!confirm(`${filename} 을(를) 삭제할까요?`)) return;
    await fetch(`/api/servers/${serverId}/plugins`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    await loadInstalled();
  }

  return (
    <div className="space-y-6">
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h3 className="font-semibold text-sm">설치됨 ({installed.length})</h3>
        </div>
        <div className="divide-y divide-border">
          {installed.map((f) => (
            <div key={f.name} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>{f.name}</span>
              <button onClick={() => uninstall(f.name)} className="text-xs text-red">삭제</button>
            </div>
          ))}
          {installed.length === 0 && <p className="px-4 py-3 text-sm text-text-dim">아직 설치된 게 없어요.</p>}
        </div>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="플러그인/모드 검색 (예: LuckPerms, WorldGuard)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">검색</button>
      </form>
      {error && <p className="text-sm text-red">{error}</p>}
      {loader && <p className="text-xs text-text-dim">&ldquo;{loader}&rdquo; 서버 기준으로 검색해요.</p>}

      <div className="space-y-2">
        {results?.map((r) => (
          <div key={r.projectId} className="card p-4">
            <div className="flex items-center gap-3">
              {r.iconUrl && (
                <Image src={r.iconUrl} alt="" width={40} height={40} className="w-10 h-10 rounded" unoptimized />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{r.title}</p>
                <p className="text-xs text-text-dim truncate">{r.description}</p>
              </div>
              <button
                onClick={() => loadVersions(r.projectId)}
                className="btn-secondary px-3 py-1.5 text-sm shrink-0"
              >
                버전 보기
              </button>
            </div>
            {versions[r.projectId] && (
              <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                {versions[r.projectId].slice(0, 8).map((v) => (
                  <div key={v.id} className="flex items-center justify-between text-xs">
                    <span className="text-text-dim">
                      {v.versionNumber} · {v.gameVersions.slice(-3).join(", ")}
                    </span>
                    <button
                      disabled={busy || !v.primaryFile}
                      onClick={() => install(v.id)}
                      className="text-accent font-medium"
                    >
                      설치
                    </button>
                  </div>
                ))}
                {versions[r.projectId].length === 0 && (
                  <p className="text-xs text-text-dim">이 서버 버전에 맞는 파일이 없어요.</p>
                )}
              </div>
            )}
          </div>
        ))}
        {results && results.length === 0 && <p className="text-sm text-text-dim">검색 결과가 없어요.</p>}
      </div>
    </div>
  );
}
