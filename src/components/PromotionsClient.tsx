"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check, CheckCircle2, Clock, Gift } from "lucide-react";
import CountUp from "@/components/CountUp";

type VerifyMethod =
  | "URL_CONTAINS_LINK"
  | "SERVER_MOTD_BRANDED"
  | "DISCORD_MEMBER"
  | "REFERRAL_SIGNUP"
  | "REFERRAL_FIRST_PAYMENT"
  | "MANUAL_REVIEW"
  | "CUSTOM_PRESET_PUBLISHED";

interface Task {
  id: string;
  title: string;
  description: string;
  pointsAwarded: number;
  verifyMethod: VerifyMethod;
  repeatable: boolean;
  completed: boolean;
  pending: boolean;
}

interface ServerOption {
  id: string;
  name: string;
}

const AUTO_LABEL_KEY: Record<VerifyMethod, string> = {
  URL_CONTAINS_LINK: "autoUrlSubmit",
  SERVER_MOTD_BRANDED: "autoMotd",
  DISCORD_MEMBER: "autoDiscord",
  REFERRAL_SIGNUP: "autoReferralSignup",
  REFERRAL_FIRST_PAYMENT: "autoReferralPayment",
  MANUAL_REVIEW: "manualReview",
  CUSTOM_PRESET_PUBLISHED: "autoPreset",
};

export default function PromotionsClient({
  points,
  referralLink,
  servers,
  tasks,
}: {
  points: number;
  referralLink: string;
  servers: ServerOption[];
  tasks: Task[];
}) {
  const t = useTranslations("promotionsClient");
  const [currentPoints, setCurrentPoints] = useState(points);
  const [taskState, setTaskState] = useState(tasks);
  const [copied, setCopied] = useState(false);

  function copyReferralLink() {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function updateTask(id: string, patch: Partial<Task>) {
    setTaskState((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  return (
    <div className="relative">
      <div className="blob w-72 h-72 bg-pink -top-28 -right-16 animate-float pointer-events-none" />

      <h1 className="text-2xl font-bold font-display animate-fade-up">
        {t("titlePrefix")}<span className="text-gradient">{t("titleHighlight")}</span>{t("titleSuffix")}
      </h1>
      <p className="text-sm text-text-dim mt-1 animate-fade-up" style={{ animationDelay: "0.05s" }}>
        {t("subtitle")}
      </p>

      <div
        className="relative card-glow p-5 mt-6 flex flex-wrap items-center justify-between gap-4 animate-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
            <Gift size={20} className="text-accent" />
          </span>
          <div>
            <p className="text-xs text-text-dim">{t("myPoints")}</p>
            <p className="text-2xl font-bold font-display text-gradient">
              <CountUp value={currentPoints} />P
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-text-dim mb-1">{t("myReferralLink")}</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-surface-2 rounded-lg px-2.5 py-1.5 truncate max-w-[220px]">{referralLink}</code>
            <button onClick={copyReferralLink} className="text-text-dim hover:text-text shrink-0 active:scale-90 transition-transform">
              {copied ? <Check size={14} className="text-green animate-toast-in" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>

      <h2 className="font-semibold mt-8 mb-3 animate-fade-up" style={{ animationDelay: "0.15s" }}>{t("sectionTitle")}</h2>
      <div className="space-y-2.5">
        {taskState.map((task, i) => (
          <TaskRow
            key={task.id}
            task={task}
            servers={servers}
            delay={0.15 + Math.min(i, 8) * 0.04}
            onDone={(patch) => updateTask(task.id, patch)}
            onPoints={(p) => setCurrentPoints((c) => c + p)}
          />
        ))}
      </div>

    </div>
  );
}

function TaskRow({
  task,
  servers,
  delay = 0,
  onDone,
  onPoints,
}: {
  task: Task;
  servers: ServerOption[];
  delay?: number;
  onDone: (patch: Partial<Task>) => void;
  onPoints: (p: number) => void;
}) {
  const t = useTranslations("promotionsClient");
  const [url, setUrl] = useState("");
  const [serverId, setServerId] = useState(servers[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auto = task.verifyMethod === "REFERRAL_SIGNUP" || task.verifyMethod === "REFERRAL_FIRST_PAYMENT";

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, string> =
        task.verifyMethod === "SERVER_MOTD_BRANDED" ? { serverId } : { url };
      const res = await fetch(`/api/promotions/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "APPROVED") {
        onPoints(data.pointsAwarded);
        onDone({ completed: !task.repeatable, pending: false });
      } else {
        onDone({ pending: true });
      }
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("submitFailed"));
    } finally {
      setLoading(false);
    }
  }

  const done = task.completed && !task.repeatable;

  return (
    <div className="card-glow p-4 animate-fade-up" style={{ animationDelay: `${delay}s` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm flex items-center gap-1.5">
            {done && <CheckCircle2 size={14} className="text-green shrink-0" />}
            {task.pending && <Clock size={14} className="text-yellow shrink-0" />}
            {task.title}
          </p>
          <p className="text-xs text-text-dim mt-0.5">{task.description}</p>
          <p className="text-xs text-text-dim mt-0.5">{t(AUTO_LABEL_KEY[task.verifyMethod])}</p>
        </div>
        <span className="text-sm font-semibold text-accent shrink-0">+{task.pointsAwarded}P</span>
      </div>

      {!auto && !done && !task.pending && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
          {task.verifyMethod === "SERVER_MOTD_BRANDED" ? (
            <select className="input flex-1 text-sm" value={serverId} onChange={(e) => setServerId(e.target.value)}>
              {servers.length === 0 && <option value="">{t("noServers")}</option>}
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : task.verifyMethod === "DISCORD_MEMBER" ? null : (
            <input
              className="input flex-1 text-sm"
              placeholder={t("urlPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
          <button
            onClick={submit}
            disabled={loading || (task.verifyMethod === "SERVER_MOTD_BRANDED" && !serverId) || (task.verifyMethod !== "SERVER_MOTD_BRANDED" && task.verifyMethod !== "DISCORD_MEMBER" && !url)}
            className="btn-secondary px-4 py-1.5 text-sm shrink-0 active:scale-95 transition-transform"
          >
            {loading ? t("checking") : t("checkButton")}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red mt-2">{error}</p>}
      {task.pending && <p className="text-xs text-yellow mt-2">{t("pendingReview")}</p>}
    </div>
  );
}
