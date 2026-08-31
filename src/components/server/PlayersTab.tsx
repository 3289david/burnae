"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

interface PlayersData {
  online: string[];
  whitelist: { uuid: string; name: string }[];
  ops: { uuid: string; name: string; level: number }[];
  bans: { name: string; reason?: string }[];
  whitelistEnabled: boolean;
}

export default function PlayersTab({ serverId }: { serverId: string }) {
  const [data, setData] = useState<PlayersData | null>(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/servers/${serverId}/players`);
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function act(type: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/players/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...extra }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-sm text-text-dim">불러오는 중...</p>;

  return (
    <div className="space-y-6 animate-fade-up">
      {error && <p className="text-sm text-red">{error}</p>}

      <div className="card-glow p-5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input flex-1 min-w-0"
            placeholder="플레이어 닉네임"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input flex-1 min-w-0"
            placeholder="사유 (밴/킥 시 선택)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button disabled={busy || !name} onClick={() => act("whitelist_add", { name })} className="btn-secondary px-3 py-1.5 text-sm active:scale-95 transition-transform">화이트리스트 추가</button>
          <button disabled={busy || !name} onClick={() => act("op", { name })} className="btn-secondary px-3 py-1.5 text-sm active:scale-95 transition-transform">OP 지정</button>
          <button disabled={busy || !name} onClick={() => act("kick", { name, reason })} className="btn-secondary px-3 py-1.5 text-sm active:scale-95 transition-transform">킥</button>
          <button disabled={busy || !name} onClick={() => act("ban", { name, reason })} className="btn-secondary px-3 py-1.5 text-sm text-red active:scale-95 transition-transform">밴</button>
        </div>
      </div>

      <Section title={`접속 중 (${data.online.length}명)`}>
        {data.online.length === 0 && <Empty>지금 접속한 플레이어가 없어요.</Empty>}
        {data.online.map((n) => (
          <Row key={n} label={n}>
            <button disabled={busy} onClick={() => act("kick", { name: n })} className="text-xs text-text-dim hover:text-text active:scale-95 transition-transform">킥</button>
          </Row>
        ))}
      </Section>

      <Section
        title="화이트리스트"
        action={
          <label className="flex items-center gap-1.5 text-xs text-text-dim">
            <Toggle checked={data.whitelistEnabled} onChange={(next) => act("whitelist_toggle", { enabled: next })} size="sm" />
            사용
          </label>
        }
      >
        {data.whitelist.length === 0 && <Empty>등록된 플레이어가 없어요.</Empty>}
        {data.whitelist.map((w) => (
          <Row key={w.uuid || w.name} label={w.name}>
            <button disabled={busy} onClick={() => act("whitelist_remove", { name: w.name })} className="text-xs text-red hover:underline active:scale-95 transition-transform">제거</button>
          </Row>
        ))}
      </Section>

      <Section title="운영자(OP)">
        {data.ops.length === 0 && <Empty>OP가 없어요.</Empty>}
        {data.ops.map((o) => (
          <Row key={o.uuid || o.name} label={o.name}>
            <button disabled={busy} onClick={() => act("deop", { name: o.name })} className="text-xs text-red hover:underline active:scale-95 transition-transform">해제</button>
          </Row>
        ))}
      </Section>

      <Section title="차단 목록">
        {data.bans.length === 0 && <Empty>차단된 플레이어가 없어요.</Empty>}
        {data.bans.map((b) => (
          <Row key={b.name} label={`${b.name}${b.reason ? ` · ${b.reason}` : ""}`}>
            <button disabled={busy} onClick={() => act("pardon", { name: b.name })} className="text-xs text-accent hover:underline active:scale-95 transition-transform">해제</button>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-glow p-0 overflow-hidden animate-fade-up">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        {action}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-surface-2 transition-colors">
      <span className="min-w-0 break-words">{label}</span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-sm text-text-dim">{children}</p>;
}
