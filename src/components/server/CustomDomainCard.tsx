"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, Copy, Check, ShieldCheck, ShieldAlert } from "lucide-react";
import type { ServerCustomDomainInfo } from "./ServerDetailClient";

interface DnsInstructions {
  srv?: { name: string; type: string; priority: number; weight: number; port: number; target: string };
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
  const t = useTranslations("customDomainCard");
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
      setDomains((prev) => [
        ...prev,
        {
          id: data.id,
          hostname: data.hostname,
          verified: data.verified,
          sslEligible: data.sslEligible,
          sslStatus: data.sslStatus,
          sslError: data.sslError,
        },
      ]);
      setInstructions(data.dnsInstructions);
      setHostname("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("connectFailed"));
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
      setDomains((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, verified: data.verified, sslStatus: data.sslStatus, sslError: data.sslError }
            : d,
        ),
      );
      setVerifyMsg(data.reason);
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : t("verifyFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
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
      <h3 className="font-semibold">{t("title")}</h3>
      <p className="text-sm text-text-dim mt-1">
        {t("desc")}{" "}
        <a href="https://krl.kr/domains" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          {t("buyHere")}
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
                    {t("verify")}
                  </button>
                  <button onClick={() => remove(d.id)} className="text-red hover:underline active:scale-95 transition-transform">
                    {t("delete")}
                  </button>
                </div>
              )}
            </div>
            {!d.verified && (
              <p className="text-xs text-text-dim mt-1">{t("notVerifiedHint")}</p>
            )}
            {d.verified && d.sslEligible && (
              <p className="text-xs mt-1 flex items-center gap-1.5">
                {d.sslStatus === "ISSUED" ? (
                  <span className="text-green flex items-center gap-1">
                    <ShieldCheck size={13} /> {t("httpsApplied")}
                  </span>
                ) : d.sslStatus === "FAILED" ? (
                  <span className="text-red flex items-center gap-1" title={d.sslError ?? undefined}>
                    <ShieldAlert size={13} /> {t("certFailed")}{d.sslError ?? t("retryVerifyHint")}
                  </span>
                ) : (
                  <span className="text-text-dim flex items-center gap-1">
                    <Clock size={13} /> {t("httpsSettingUp")}
                  </span>
                )}
              </p>
            )}
          </div>
        ))}
        {domains.length === 0 && <p className="text-sm text-text-dim">{t("noDomains")}</p>}
      </div>

      {verifyMsg && <p className="text-xs text-text-dim mt-2">{verifyMsg}</p>}

      {isOwner && domains.length === 0 && (
        <form onSubmit={connect} className="flex gap-2 mt-3 pt-3 border-t border-border">
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder={t("hostnamePlaceholder")}
            className="input flex-1 text-sm"
          />
          <button type="submit" disabled={loading || !hostname} className="btn-secondary px-3 py-1.5 text-sm shrink-0 active:scale-95 transition-transform">
            {t("connect")}
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red mt-2">{error}</p>}

      {instructions && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs font-mono animate-fade-up">
          <p className="text-text-dim font-sans">
            {instructions.srv ? t("instructionsBoth") : t("instructionsAOnly")}
          </p>
          <Record
            label="A"
            row={`${instructions.a.name}  A  ${instructions.a.value}`}
            onCopy={() => copy(instructions.a.value)}
          />
          {instructions.srv && (
            <Record
              label="SRV"
              row={`${instructions.srv.name}  SRV  ${instructions.srv.priority} ${instructions.srv.weight} ${instructions.srv.port} ${instructions.srv.target}`}
              onCopy={() =>
                copy(`${instructions.srv!.priority} ${instructions.srv!.weight} ${instructions.srv!.port} ${instructions.srv!.target}`)
              }
            />
          )}
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
