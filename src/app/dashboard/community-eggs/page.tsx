"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SuccessCheck from "@/components/SuccessCheck";
import { ShieldCheck, Flag, Users, ArrowRight } from "lucide-react";

interface Template {
  id: string;
  key: string;
  displayName: string;
  category: "MINECRAFT" | "DISCORD_BOT" | "GENERAL";
  defaultEnvironment: Record<string, unknown>;
}
interface Product {
  id: string;
  allowedTemplates: Template[];
}
interface CommunityPreset {
  id: string;
  displayName: string;
  blurb: string | null;
  creatorName: string;
  verified: boolean;
  useCount: number;
  baseTemplateId: string;
  baseTemplateName: string;
  baseTemplateCategory: "MINECRAFT" | "DISCORD_BOT" | "GENERAL";
}

const SECRET_ENV_KEYS = ["PASSWORD", "PGPASSWORD", "SERVER_PASSWORD", "MONGO_USER_PASS", "MEILI_MASTER_KEY"];
const CATEGORY_LABEL: Record<"ALL" | Template["category"], string> = {
  ALL: "전체",
  MINECRAFT: "마인크래프트",
  DISCORD_BOT: "디스코드 봇",
  GENERAL: "일반 서버",
};

export default function CommunityEggsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [presets, setPresets] = useState<CommunityPreset[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | Template["category"]>("ALL");
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [formTemplateId, setFormTemplateId] = useState("");
  const [formName, setFormName] = useState("");
  const [formBlurb, setFormBlurb] = useState("");
  const [formEnv, setFormEnv] = useState<Record<string, string>>({});
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formDone, setFormDone] = useState<number | null>(null);

  function loadPresets() {
    fetch("/api/presets")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPresets)
      .catch(() => {});
  }
  useEffect(() => {
    fetch("/api/catalog/products")
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => {});
    loadPresets();
  }, []);

  const allTemplates = useMemo(() => {
    const map = new Map<string, Template>();
    for (const p of products) for (const t of p.allowedTemplates) map.set(t.id, t);
    return [...map.values()];
  }, [products]);

  const filteredPresets = useMemo(
    () => (categoryFilter === "ALL" ? presets : presets.filter((p) => p.baseTemplateCategory === categoryFilter)),
    [presets, categoryFilter],
  );

  const formTemplate = allTemplates.find((t) => t.id === formTemplateId);
  const formFields = useMemo(() => {
    if (!formTemplate) return [];
    return Object.keys(formTemplate.defaultEnvironment).filter((k) => !SECRET_ENV_KEYS.includes(k));
  }, [formTemplate]);
  const gitFieldKey = formFields.includes("GIT_ADDRESS") ? "GIT_ADDRESS" : null;
  const otherFormFields = formFields.filter((k) => k !== gitFieldKey);

  async function reportPreset(id: string) {
    if (!confirm("이 프리셋을 신고할까요? 여러 명이 신고하면 자동으로 목록에서 내려가요.")) return;
    const res = await fetch(`/api/presets/${id}/report`, { method: "POST" });
    if (res.ok) setReportedIds((prev) => [...prev, id]);
  }

  function useThisEgg(p: CommunityPreset) {
    const product = products.find((pr) => pr.allowedTemplates.some((t) => t.id === p.baseTemplateId));
    const qs = new URLSearchParams({ presetId: p.id, templateId: p.baseTemplateId });
    if (product) qs.set("productId", product.id);
    router.push(`/dashboard/servers/new?${qs.toString()}`);
  }

  async function submitForm() {
    if (!formTemplate) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const environment = Object.fromEntries(formFields.map((k) => [k, formEnv[k] ?? ""]));
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseTemplateId: formTemplateId,
          displayName: formName,
          blurb: formBlurb || undefined,
          environment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFormDone(data.pointsAwarded ?? 0);
      setFormName("");
      setFormBlurb("");
      setFormEnv({});
      loadPresets();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setFormBusy(false);
    }
  }

  const availableCategories = useMemo(() => {
    const set = new Set(presets.map((p) => p.baseTemplateCategory));
    return [...set];
  }, [presets]);

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Users size={22} className="text-accent" /> 커뮤니티 Egg
      </h1>
      <p className="text-sm text-text-dim mt-1">
        다른 유저가 만들어 공개한 서버 종류예요 — 예: 자기 코드로 만든 디스코드 봇, 특정 설정으로
        튜닝된 마인크래프트 서버 등. 골라서 바로 서버를 만들거나, 직접 만들어 공개하면 포인트를 받아요.
      </p>

      {availableCategories.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mt-4 p-1 bg-surface-2 rounded-full w-fit">
          {(["ALL", ...availableCategories] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                categoryFilter === c ? "bg-accent text-white shadow-sm" : "text-text-dim hover:text-text"
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
        {filteredPresets.map((p, i) => (
          <div
            key={p.id}
            className="animate-fade-up rounded-2xl border border-border bg-surface p-3.5 flex flex-col gap-1.5 hover:border-accent/40 hover:bg-surface-2 transition-all duration-150 relative"
            style={{ animationDelay: `${Math.min(i, 12) * 0.025}s` }}
          >
            <button type="button" onClick={() => useThisEgg(p)} className="text-left w-full active:scale-[0.97] transition-transform">
              <span className="font-semibold text-sm inline-flex items-center gap-1 flex-wrap pr-5">
                {p.displayName}
                {p.verified && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-accent bg-accent/10 rounded-full px-1.5 py-0.5">
                    <ShieldCheck size={9} /> 공식
                  </span>
                )}
              </span>
              <span className="block text-text-dim text-[11px] mt-0.5">{p.baseTemplateName} 기반</span>
              {p.blurb && <span className="block text-text-dim text-[11px] leading-tight mt-1">{p.blurb}</span>}
              <span className="block text-text-dim text-[10px] mt-1">
                by {p.creatorName}{p.useCount > 0 ? ` · ${p.useCount}번 사용됨` : ""}
              </span>
              <span className="inline-flex items-center gap-1 text-accent text-xs font-medium mt-2">
                이 종류로 서버 만들기 <ArrowRight size={12} />
              </span>
            </button>
            {!p.verified && (
              <button
                type="button"
                onClick={() => reportPreset(p.id)}
                disabled={reportedIds.includes(p.id)}
                title="신고"
                className="absolute top-2 right-2 text-text-dim hover:text-red p-0.5 disabled:opacity-40"
              >
                <Flag size={11} />
              </button>
            )}
          </div>
        ))}
      </div>
      {filteredPresets.length === 0 && (
        <p className="text-sm text-text-dim mt-4">아직 공개된 커뮤니티 Egg가 없어요. 첫 번째로 만들어보세요!</p>
      )}

      <div className="mt-6">
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-secondary px-3.5 py-2 text-sm inline-flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            + 내 서버 종류(Egg) 공유하기
          </button>
        ) : formDone !== null ? (
          <div className="card-glow p-4 flex items-center gap-3 animate-fade-up">
            <SuccessCheck size={32} confetti className="shrink-0" />
            <p className="text-sm text-green">
              공개했어요{formDone > 0 ? ` (포인트 ${formDone}P 적립)` : ""}! 위 목록에서 바로 골라 쓸 수 있어요.
            </p>
          </div>
        ) : (
          <div className="card-glow p-4 space-y-3 animate-fade-up">
            <h4 className="font-semibold text-sm">내 서버 종류(Egg) 공유하기</h4>
            <p className="text-xs text-text-dim">
              실행 환경(런타임)을 고르고, 코드 저장소 주소나 설정값을 채워서 완전히 새로운 서버
              종류로 공개해요 — 예를 들어 &ldquo;Node.js 봇&rdquo; 실행환경 + 내 디스코드 봇 GitHub
              주소를 합치면 그 자체로 &ldquo;내 디스코드 봇&rdquo;이라는 새 Egg가 돼요. 도커
              이미지·설치 스크립트 자체는 이미 검수된 실행환경 그대로 유지돼요.
            </p>
            <select
              className="input w-full text-sm"
              value={formTemplateId}
              onChange={(e) => { setFormTemplateId(e.target.value); setFormEnv({}); }}
            >
              <option value="">실행 환경(런타임) 선택</option>
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.displayName}</option>
              ))}
            </select>
            <input
              className="input w-full text-sm"
              placeholder={gitFieldKey ? "이름 (예: 내 디스코드 봇)" : "이름 (예: 롤플레이용 기본 설정)"}
              maxLength={40}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <input
              className="input w-full text-sm"
              placeholder="한 줄 설명 (선택)"
              maxLength={200}
              value={formBlurb}
              onChange={(e) => setFormBlurb(e.target.value)}
            />
            {gitFieldKey && (
              <div>
                <label className="text-xs font-medium">코드 저장소 주소 (GitHub 등)</label>
                <input
                  className="input w-full text-sm font-mono mt-1"
                  placeholder="https://github.com/아이디/저장소이름"
                  value={formEnv[gitFieldKey] ?? ""}
                  onChange={(e) => setFormEnv((v) => ({ ...v, [gitFieldKey]: e.target.value }))}
                />
                <p className="text-[11px] text-text-dim mt-1">
                  이 저장소의 코드로 실행되는 서버가 만들어져요. 서버 생성 시 자동으로 clone돼요.
                </p>
              </div>
            )}
            {otherFormFields.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2">
                {otherFormFields.map((k) => (
                  <div key={k}>
                    <label className="text-[11px] text-text-dim font-mono">{k}</label>
                    <input
                      className="input w-full text-xs font-mono mt-0.5"
                      value={formEnv[k] ?? ""}
                      onChange={(e) => setFormEnv((v) => ({ ...v, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitForm}
                disabled={formBusy || !formTemplateId || formName.length < 1}
                className="btn-primary px-3.5 py-1.5 text-xs active:scale-95 transition-transform"
              >
                {formBusy ? "공개하는 중..." : "공개하기"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-secondary px-3.5 py-1.5 text-xs active:scale-95 transition-transform"
              >
                취소
              </button>
            </div>
            {formError && <p className="text-xs text-red">{formError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
