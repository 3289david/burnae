"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/components/Toggle";
import { hasServerRank, type ServerAccessRole } from "@/lib/serverRoleRank";

interface PlayersData {
  online: string[];
  whitelist: { uuid: string; name: string }[];
  ops: { uuid: string; name: string; level: number }[];
  bans: { name: string; reason?: string }[];
  whitelistEnabled: boolean;
}

export default function PlayersTab({ serverId, myRole }: { serverId: string; myRole: ServerAccessRole | null }) {
  const t = useTranslations("playersTab");
  const canModerate = hasServerRank(myRole, "MODERATOR");
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
      setError(err instanceof Error ? err.message : t("processFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-sm text-text-dim">{t("loading")}</p>;

  return (
    <div className="space-y-6 animate-fade-up">
      {error && <p className="text-sm text-red">{error}</p>}

      {canModerate && (
        <div className="card-glow p-5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1 min-w-0"
              placeholder={t("playerPlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input flex-1 min-w-0"
              placeholder={t("reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button disabled={busy || !name} onClick={() => act("whitelist_add", { name })} className="btn-secondary px-3 py-1.5 text-sm active:scale-95 transition-transform">{t("whitelistAdd")}</button>
            <button disabled={busy || !name} onClick={() => act("op", { name })} className="btn-secondary px-3 py-1.5 text-sm active:scale-95 transition-transform">{t("opAssign")}</button>
            <button disabled={busy || !name} onClick={() => act("kick", { name, reason })} className="btn-secondary px-3 py-1.5 text-sm active:scale-95 transition-transform">{t("kick")}</button>
            <button disabled={busy || !name} onClick={() => act("ban", { name, reason })} className="btn-secondary px-3 py-1.5 text-sm text-red active:scale-95 transition-transform">{t("ban")}</button>
          </div>
        </div>
      )}

      <Section title={t("onlineTitle", { count: data.online.length })}>
        {data.online.length === 0 && <Empty>{t("noOnlinePlayers")}</Empty>}
        {data.online.map((n) => (
          <Row key={n} label={n}>
            {canModerate && <button disabled={busy} onClick={() => act("kick", { name: n })} className="text-xs text-text-dim hover:text-text active:scale-95 transition-transform">{t("kick")}</button>}
          </Row>
        ))}
      </Section>

      <Section
        title={t("whitelistTitle")}
        action={
          <label className="flex items-center gap-1.5 text-xs text-text-dim">
            <Toggle checked={data.whitelistEnabled} onChange={(next) => act("whitelist_toggle", { enabled: next })} size="sm" disabled={!canModerate} />
            {t("whitelistUse")}
          </label>
        }
      >
        {data.whitelist.length === 0 && <Empty>{t("noWhitelistedPlayers")}</Empty>}
        {data.whitelist.map((w) => (
          <Row key={w.uuid || w.name} label={w.name}>
            {canModerate && <button disabled={busy} onClick={() => act("whitelist_remove", { name: w.name })} className="text-xs text-red hover:underline active:scale-95 transition-transform">{t("remove")}</button>}
          </Row>
        ))}
      </Section>

      <Section title={t("opsTitle")}>
        {data.ops.length === 0 && <Empty>{t("noOps")}</Empty>}
        {data.ops.map((o) => (
          <Row key={o.uuid || o.name} label={o.name}>
            {canModerate && <button disabled={busy} onClick={() => act("deop", { name: o.name })} className="text-xs text-red hover:underline active:scale-95 transition-transform">{t("release")}</button>}
          </Row>
        ))}
      </Section>

      <Section title={t("bansTitle")}>
        {data.bans.length === 0 && <Empty>{t("noBannedPlayers")}</Empty>}
        {data.bans.map((b) => (
          <Row key={b.name} label={`${b.name}${b.reason ? ` · ${b.reason}` : ""}`}>
            {canModerate && <button disabled={busy} onClick={() => act("pardon", { name: b.name })} className="text-xs text-accent hover:underline active:scale-95 transition-transform">{t("release")}</button>}
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
