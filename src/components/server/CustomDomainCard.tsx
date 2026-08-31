"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Copy, Check } from "lucide-react";
import type { ServerCustomDomainInfo } from "./ServerDetailClient";

interface DnsInstructions {
  srv: { name: string; type: string; priority: number; weight: number; port: number; target: string };
  a: { name: string; type: string; value: string };
}

export default function CustomDomainCard({
  serverId,
  isOwner,
  initial,
}: {
  serverId: string;
  isOwner: boolean;
  initial: ServerCustomDomainInfo[];
}) {
  const [domains, setDomains] = useState(initial);
  const [hostname, setHostname] = useState("");
  const [instructions, setInstructions] = useState<DnsInstructions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/custom-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDomains((prev) => [...prev, { id: data.id, hostname: data.hostname, verified: data.verified }]);
      setInstructions(data.dnsInstructions);
      setHostname("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결 실패");
    } finally {
      setLoading(false);
    }
  }

  async function verify(id: string) {
    setLoading(true);
    setVerifyMsg(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/custom-domain/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, verified: data.verified } : d)));
      setVerifyMsg(data.reason);
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : "확인 실패");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 도메인 연결을 삭제할까요?")) return;
    await fetch(`/api/servers/${serverId}/custom-domain/${id}`, { method: "DELETE" });
    setDomains((prev) => prev.filter((d) => d.id !== id));
    setInstructions(null);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  if (!isOwner && domains.length === 0) return null;

  return (
    <div className="card-glow p-5">
      <h3 className="font-semibold">커스텀 도메인</h3>
      <p className="text-sm text-text-dim mt-1">
        직접 소유한 도메인을 서버에 연결할 수 있어요. 아직 도메인이 없다면{" "}
        <a href="https://krl.kr/domains" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          여기서 구매하기
        </a>
        .
      </p>

      <div className="space-y-3 mt-3">
        {domains.map((d, i) => (
          <div key={d.id} className="border border-border rounded-xl p-3 animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm min-w-0 break-all flex items-center gap-1.5">
                {d.verified ? (
                  <CheckCircle2 size={14} className="text-green shrink-0" />
                ) : (
                  <Clock size={14} className="text-yellow shrink-0" />
                )}
                {d.hostname}
              </span>
              {isOwner && (
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <button onClick={() => verify(d.id)} disabled={loading} className="text-accent hover:underline active:scale-95 transition-transform">
                    확인하기
                  </button>
                  <button onClick={() => remove(d.id)} className="text-red hover:underline active:scale-95 transition-transform">
                    삭제
                  </button>
                </div>
              )}
            </div>
            {!d.verified && (
              <p className="text-xs text-text-dim mt-1">
                아직 확인되지 않았어요. 아래 DNS 레코드를 자기 도메인에 등록한 뒤 확인하기를 눌러주세요.
              </p>
            )}
          </div>
        ))}
        {domains.length === 0 && <p className="text-sm text-text-dim">연결된 도메인이 없어요.</p>}
      </div>

      {verifyMsg && <p className="text-xs text-text-dim mt-2">{verifyMsg}</p>}

      {isOwner && domains.length === 0 && (
        <form onSubmit={connect} className="flex gap-2 mt-3 pt-3 border-t border-border">
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="예: play.mydomain.com"
            className="input flex-1 text-sm"
          />
          <button type="submit" disabled={loading || !hostname} className="btn-secondary px-3 py-1.5 text-sm shrink-0 active:scale-95 transition-transform">
            연결하기
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red mt-2">{error}</p>}

      {instructions && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs font-mono animate-fade-up">
          <p className="text-text-dim font-sans">
            아래 두 레코드를 도메인 DNS 설정에 추가하세요 (A 레코드 먼저, SRV는 선택이지만 추천):
          </p>
          <Record
            label="A"
            row={`${instructions.a.name}  A  ${instructions.a.value}`}
            onCopy={() => copy(instructions.a.value)}
          />
          <Record
            label="SRV"
            row={`${instructions.srv.name}  SRV  ${instructions.srv.priority} ${instructions.srv.weight} ${instructions.srv.port} ${instructions.srv.target}`}
            onCopy={() =>
              copy(`${instructions.srv.priority} ${instructions.srv.weight} ${instructions.srv.port} ${instructions.srv.target}`)
            }
          />
        </div>
      )}
    </div>
  );
}

function Record({ label, row, onCopy }: { label: string; row: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 bg-surface-2 rounded-lg px-2.5 py-1.5">
      <span className="min-w-0 break-all">
        <span className="text-text-dim">{label}</span> {row}
      </span>
      <button
        type="button"
        onClick={() => {
          onCopy();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-text-dim hover:text-text shrink-0 active:scale-90 transition-transform"
      >
        {copied ? <Check size={12} className="text-green animate-toast-in" /> : <Copy size={12} />}
      </button>
    </div>
  );
}
