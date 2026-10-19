"use client";

import { useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";

/** Render/Railway 스타일 헬스체크 — HTTP로 서비스하는 서버(GENERAL/DISCORD_BOT)에서만 쓴다.
 * 설정한 경로를 유지보수 크론이 주기적으로 핑 해서, 연속으로 응답이 없으면 자동 재시작한다. */
export default function HealthCheckCard({ serverId }: { serverId: string }) {
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/deploy`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.healthCheckPath) setPath(data.healthCheckPath);
        setLoaded(true);
      });
  }, [serverId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/servers/${serverId}/health-check`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path.trim() || null }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-green/15 flex items-center justify-center shrink-0">
          <HeartPulse size={15} className="text-green" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">헬스체크</h3>
          <p className="text-xs text-text-dim">설정한 경로가 계속 응답 없으면 자동으로 재시작해요.</p>
        </div>
      </div>

      <form onSubmit={save} className="flex gap-2">
        <input
          type="text"
          className="input flex-1 font-mono text-xs"
          placeholder="예: /health (비워두면 꺼짐)"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button type="submit" disabled={saving} className="btn-secondary px-3.5 py-1.5 text-xs shrink-0">
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>
      {saved && <p className="text-xs text-green">저장됐어요.</p>}
    </div>
  );
}
