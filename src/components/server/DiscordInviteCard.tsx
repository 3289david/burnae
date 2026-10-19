"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Copy, Check, ExternalLink, RefreshCw } from "lucide-react";

interface InviteInfo {
  clientId: string;
  appName: string;
  inviteUrl: string;
}

const HIDE_ERRORS = ["봇 토큰 항목이 없어서"];

export default function DiscordInviteCard({ serverId }: { serverId: string }) {
  const t = useTranslations("discordInviteCard");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/servers/${serverId}/discord-invite`);
      const data = await res.json();
      if (!res.ok) {
        if (HIDE_ERRORS.some((s) => data.error?.includes(s))) {
          setHidden(true);
        } else {
          setError(data.error ?? t("createFailed"));
        }
        return;
      }
      setInvite(data);
    } catch {
      setError(t("createFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  if (hidden) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <Bot size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">{t("title")}</h3>
          <p className="text-xs text-text-dim">{t("desc")}</p>
        </div>
      </div>

      {loading && <p className="text-sm text-text-dim">{t("checking")}</p>}

      {!loading && invite && (
        <div className="animate-toast-in space-y-3">
          <p className="text-sm">
            <strong>{invite.appName}</strong> {t("foundBot")}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={invite.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5"
            >
              <ExternalLink size={14} /> {t("inviteButton")}
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(invite.inviteUrl);
                setCopied(true);
              }}
              className="btn-secondary px-4 py-2 text-sm inline-flex items-center gap-1.5"
            >
              {copied ? <Check size={14} className="text-green animate-toast-in" /> : <Copy size={14} />} {copied ? t("copied") : t("copyLink")}
            </button>
          </div>
          <p className="text-xs text-text-dim">{t("permissionHint")}</p>
        </div>
      )}

      {!loading && error && (
        <>
          <p className="text-sm text-yellow">{error}</p>
          <button onClick={load} className="btn-secondary px-3.5 py-2 text-xs inline-flex items-center gap-1.5">
            <RefreshCw size={13} /> {t("retry")}
          </button>
        </>
      )}
    </div>
  );
}
