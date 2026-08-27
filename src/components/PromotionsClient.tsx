"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, CheckCircle2, Clock, Gift } from "lucide-react";

type VerifyMethod =
  | "URL_CONTAINS_LINK"
  | "SERVER_MOTD_BRANDED"
  | "DISCORD_MEMBER"
  | "REFERRAL_SIGNUP"
  | "REFERRAL_FIRST_PAYMENT"
  | "MANUAL_REVIEW";

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

interface RedeemableProduct {
  id: string;
  name: string;
  ramMb: number;
  cpuPercent: number;
  diskMb: number;
  pointsCost: number;
  allowedTemplates: { id: string; displayName: string; minecraftVersions: string[] }[];
}

const AUTO_LABEL: Record<VerifyMethod, string> = {
  URL_CONTAINS_LINK: "URL 제출 → 자동 확인",
  SERVER_MOTD_BRANDED: "내 서버 확인 → 자동 확인",
  DISCORD_MEMBER: "디스코드 확인 → 자동 확인",
  REFERRAL_SIGNUP: "친구 가입 시 자동 지급",
  REFERRAL_FIRST_PAYMENT: "친구 첫 결제 시 자동 지급",
  MANUAL_REVIEW: "관리자 확인 필요",
};

export default function PromotionsClient({
  points,
  referralLink,
  servers,
  redeemableProducts,
  tasks,
}: {
  points: number;
  referralLink: string;
  servers: ServerOption[];
  redeemableProducts: RedeemableProduct[];
  tasks: Task[];
}) {
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
        서버 <span className="text-gradient">홍보</span>하고 포인트 받기
      </h1>
      <p className="text-sm text-text-dim mt-1 animate-fade-up" style={{ animationDelay: "0.05s" }}>
        아래 방법으로 Burnae를 홍보하면 포인트가 쌓여요. 모은 포인트로 무료 체험 서버를 받을 수 있어요.
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
            <p className="text-xs text-text-dim">내 포인트</p>
            <p className="text-2xl font-bold font-display text-gradient">{currentPoints.toLocaleString()}P</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-text-dim mb-1">내 추천 링크</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-surface-2 rounded-lg px-2.5 py-1.5 truncate max-w-[220px]">{referralLink}</code>
            <button onClick={copyReferralLink} className="text-text-dim hover:text-text shrink-0">
              {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>

      <h2 className="font-semibold mt-8 mb-3 animate-fade-up" style={{ animationDelay: "0.15s" }}>홍보 방법</h2>
      <div className="space-y-2.5">
        {taskState.map((t, i) => (
          <TaskRow
            key={t.id}
            task={t}
            servers={servers}
            delay={0.15 + Math.min(i, 8) * 0.04}
            onDone={(patch) => updateTask(t.id, patch)}
            onPoints={(p) => setCurrentPoints((c) => c + p)}
          />
        ))}
      </div>

      {redeemableProducts.length > 0 && (
        <>
          <h2 className="font-semibold mt-8 mb-3 flex items-center gap-1.5 animate-fade-up"><Gift size={16} /> 포인트로 교환하기</h2>
          <div className="space-y-3">
            {redeemableProducts.map((p, i) => (
              <RedeemCard
                key={p.id}
                product={p}
                points={currentPoints}
                delay={Math.min(i, 8) * 0.04}
                onRedeemed={(cost) => setCurrentPoints((c) => c - cost)}
              />
            ))}
          </div>
        </>
      )}
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
      setError(err instanceof Error ? err.message : "제출 실패");
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
          <p className="text-xs text-text-dim mt-0.5">{AUTO_LABEL[task.verifyMethod]}</p>
        </div>
        <span className="text-sm font-semibold text-accent shrink-0">+{task.pointsAwarded}P</span>
      </div>

      {!auto && !done && !task.pending && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
          {task.verifyMethod === "SERVER_MOTD_BRANDED" ? (
            <select className="input flex-1 text-sm" value={serverId} onChange={(e) => setServerId(e.target.value)}>
              {servers.length === 0 && <option value="">보유한 서버가 없어요</option>}
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : task.verifyMethod === "DISCORD_MEMBER" ? null : (
            <input
              className="input flex-1 text-sm"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
          <button
            onClick={submit}
            disabled={loading || (task.verifyMethod === "SERVER_MOTD_BRANDED" && !serverId) || (task.verifyMethod !== "SERVER_MOTD_BRANDED" && task.verifyMethod !== "DISCORD_MEMBER" && !url)}
            className="btn-secondary px-4 py-1.5 text-sm shrink-0"
          >
            {loading ? "확인 중..." : "확인하기"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red mt-2">{error}</p>}
      {task.pending && <p className="text-xs text-yellow mt-2">관리자 확인을 기다리고 있어요.</p>}
    </div>
  );
}

function RedeemCard({
  product,
  points,
  delay = 0,
  onRedeemed,
}: {
  product: RedeemableProduct;
  points: number;
  delay?: number;
  onRedeemed: (cost: number) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverName, setServerName] = useState("");
  const [templateId, setTemplateId] = useState(product.allowedTemplates[0]?.id ?? "");
  const template = product.allowedTemplates.find((t) => t.id === templateId);
  const [version, setVersion] = useState(template?.minecraftVersions[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canAfford = points >= product.pointsCost;

  async function redeem() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/promotions/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, templateId, minecraftVersion: version, serverName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onRedeemed(product.pointsCost);
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "교환 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card-glow p-4 animate-fade-up" style={{ animationDelay: `${delay}s` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{product.name}</p>
          <p className="text-xs text-text-dim mt-0.5">
            RAM {(product.ramMb / 1024).toFixed(1)}GB · CPU {product.cpuPercent}% · 디스크 {(product.diskMb / 1024).toFixed(1)}GB
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold">{product.pointsCost.toLocaleString()}P</span>
          {!open && (
            <button
              onClick={() => setOpen(true)}
              disabled={!canAfford}
              className="btn-primary px-4 py-1.5 text-sm disabled:opacity-40"
            >
              {canAfford ? "교환하기" : "포인트 부족"}
            </button>
          )}
        </div>
      </div>

      {open && !done && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <input
            className="input w-full text-sm"
            placeholder="서버 이름"
            maxLength={24}
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <select
              className="input flex-1 text-sm"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const t = product.allowedTemplates.find((x) => x.id === e.target.value);
                setVersion(t?.minecraftVersions[0] ?? "");
              }}
            >
              {product.allowedTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.displayName}</option>
              ))}
            </select>
            <select className="input flex-1 text-sm" value={version} onChange={(e) => setVersion(e.target.value)}>
              {template?.minecraftVersions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <button
            onClick={redeem}
            disabled={loading || serverName.length < 2}
            className="btn-primary w-full py-2 text-sm"
          >
            {loading ? "만드는 중..." : `${product.pointsCost.toLocaleString()}P로 교환하기`}
          </button>
          {error && <p className="text-xs text-red">{error}</p>}
        </div>
      )}
      {done && (
        <p className="text-xs text-green mt-2 flex items-center gap-1"><CheckCircle2 size={14} /> 교환 완료! 대시보드로 이동할게요.</p>
      )}
    </div>
  );
}
