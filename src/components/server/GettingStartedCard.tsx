"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Compass, X } from "lucide-react";
import type { ServerInfo } from "./ServerDetailClient";

function stepsFor(server: ServerInfo, t: ReturnType<typeof useTranslations<"gettingStartedCard">>): string[] {
  if (server.templateCategory === "MINECRAFT") {
    return [t("mcStep1"), t("mcStep2"), t("mcStep3"), t("mcStep4")];
  }
  if (server.templateCategory === "DISCORD_BOT") {
    return [t("botStep1"), t("botStep2"), t("botStep3"), t("botStep4")];
  }
  return [
    server.accessSecret ? t("genStepPassword") : t("genStepStartup"),
    t("genStep2"),
    t("genStep3"),
    t("genStep4"),
  ];
}

export default function GettingStartedCard({ server }: { server: ServerInfo }) {
  const t = useTranslations("gettingStartedCard");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(`burnae-guide-dismissed-${server.id}`) === "1");
  }, [server.id]);

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(`burnae-guide-dismissed-${server.id}`, "1");
    setDismissed(true);
  }

  return (
    <div className="card-glow p-5 space-y-2.5 border-accent/40 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Compass size={15} className="text-accent" />
          </span>
          <h3 className="font-semibold text-sm">{t("title")}</h3>
        </div>
        <button onClick={dismiss} className="text-text-dim hover:text-text p-1 active:scale-90 transition-transform" aria-label={t("close")}>
          <X size={16} />
        </button>
      </div>
      <ol className="space-y-1.5 text-sm text-text-dim list-decimal pl-5">
        {stepsFor(server, t).map((step, i) => (
          <li key={i} className="animate-fade-up" style={{ animationDelay: `${i * 0.06}s` }}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
