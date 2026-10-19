"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Crown } from "lucide-react";

interface Member {
  id: string;
  role: "ADMIN" | "MODERATOR" | "DEVELOPER" | "VIEWER";
  user: { id: string; name: string; email: string };
}
interface Owner {
  id: string;
  name: string;
  email: string;
}

const ROLE_LABEL_KEY: Record<Member["role"], string> = {
  ADMIN: "roleAdmin",
  MODERATOR: "roleModerator",
  DEVELOPER: "roleDeveloper",
  VIEWER: "roleViewer",
};

export default function TeamTab({ serverId, isOwner }: { serverId: string; isOwner: boolean }) {
  const t = useTranslations("teamTab");
  const router = useRouter();
  const [owner, setOwner] = useState<Owner | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/servers/${serverId}/members`);
    if (res.ok) {
      const data = await res.json();
      setOwner(data.owner);
      setMembers(data.members);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inviteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(memberId: string, newRole: Member["role"]) {
    await fetch(`/api/servers/${serverId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  async function remove(memberId: string) {
    if (!confirm(t("removeConfirm"))) return;
    await fetch(`/api/servers/${serverId}/members/${memberId}`, { method: "DELETE" });
    await load();
  }

  async function transferOwnership(memberId: string, memberName: string) {
    if (!confirm(t("transferConfirm", { name: memberName }))) return;
    setTransferring(memberId);
    try {
      const res = await fetch(`/api/servers/${serverId}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("transferFailed"));
    } finally {
      setTransferring(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="card-glow p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h3 className="font-semibold text-sm">{t("membersTitle")}</h3>
        </div>
        <div className="divide-y divide-border">
          {owner && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate">{owner.name} ({owner.email})</span>
              <span className="text-xs text-text-dim shrink-0">{t("owner")}</span>
            </div>
          )}
          {members.map((m, i) => (
            <div
              key={m.id}
              className="animate-fade-up flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
            >
              <span className="min-w-0 truncate">{m.user.name} ({m.user.email})</span>
              {isOwner ? (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    className="input text-xs py-1"
                    value={m.role}
                    onChange={(e) => changeRole(m.id, e.target.value as Member["role"])}
                  >
                    {Object.entries(ROLE_LABEL_KEY).map(([v, key]) => (
                      <option key={v} value={v}>{t(key)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => transferOwnership(m.id, m.user.name)}
                    disabled={transferring === m.id}
                    title={t("transferTooltip")}
                    className="text-xs text-text-dim hover:text-accent inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <Crown size={12} /> {t("transfer")}
                  </button>
                  <button onClick={() => remove(m.id)} className="text-xs text-red hover:underline active:scale-95 transition-transform">{t("remove")}</button>
                </div>
              ) : (
                <span className="text-xs text-text-dim">{t(ROLE_LABEL_KEY[m.role])}</span>
              )}
            </div>
          ))}
          {members.length === 0 && <p className="px-4 py-3 text-sm text-text-dim">{t("noMembers")}</p>}
        </div>
      </div>

      {isOwner && (
        <form onSubmit={invite} className="card-glow p-5 space-y-3">
          <h3 className="font-semibold text-sm">{t("inviteTitle")}</h3>
          <p className="text-xs text-text-dim">{t("inviteHint")}</p>
          <div className="flex gap-2">
            <input
              type="email"
              required
              className="input flex-1"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Member["role"])}>
              {Object.entries(ROLE_LABEL_KEY).map(([v, key]) => (
                <option key={v} value={v}>{t(key)}</option>
              ))}
            </select>
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm active:scale-95 transition-transform">{t("invite")}</button>
          </div>
          {error && <p className="text-sm text-red">{error}</p>}
        </form>
      )}
    </div>
  );
}
