"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SuccessCheck from "@/components/SuccessCheck";
import { ShieldCheck, Flag, Users, ArrowRight, Search, X } from "lucide-react";

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
  gitRepoUrl: string;
  creatorName: string;
  verified: boolean;
  useCount: number;
  baseTemplateId: string;
  baseTemplateName: string;
  baseTemplateCategory: "MINECRAFT" | "DISCORD_BOT" | "GENERAL";
}

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
  const [query, setQuery] = useState("");
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [formTemplateId, setFormTemplateId] = useState("");
  const [formName, setFormName] = useState("");
  const [formBlurb, setFormBlurb] = useState("");
  const [formGitRepoUrl, setFormGitRepoUrl] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formDone, setFormDone] = useState(false);

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

  // 커뮤니티 프리셋은 "일반 런타임(Node.js/Python 등 직접 코드를 올리는 종류)"에만 깃허브
  // 저장소를 붙일 수 있다 — 음악봇처럼 egg 자체가 이미 완성된 프로그램인 종류는 고를 수 없다
  const gitRuntimeTemplates = useMemo(
    () => allTemplates.filter((t) => "GIT_ADDRESS" in t.defaultEnvironment),
    [allTemplates],
  );

  const filteredPresets = useMemo(() => {
    let list = categoryFilter === "ALL" ? presets : presets.filter((p) => p.baseTemplateCategory === categoryFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.displayName.toLowerCase().includes(q) ||
          (p.blurb?.toLowerCase().includes(q) ?? false) ||
          p.baseTemplateName.toLowerCase().includes(q) ||
          p.creatorName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [presets, categoryFilter, query]);

  async function reportPreset(id: string) {
    if (!confirm("이 프리셋을 신고할까요? 여러 명이 신고하면 자동으로 목록에서 내려가요.")) return;
    const res = await fetch(`/api/presets/${id}/report`, { method: "POST" });
    if (res.ok) setReportedIds((prev) => [...prev, id]);
  }

  function applyEgg(p: CommunityPreset) {
    const product = products.find((pr) => pr.allowedTemplates.some((t) => t.id === p.baseTemplateId));
    const qs = new URLSearchParams({ presetId: p.id, templateId: p.baseTemplateId });
    if (product) qs.set("productId", product.id);
    router.push(`/dashboard/servers/new?${qs.toString()}`);
  }

  async function submitForm() {
    if (!formTemplateId || !formGitRepoUrl) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseTemplateId: formTemplateId,
          displayName: formName,
          blurb: formBlurb || undefined,
          gitRepoUrl: formGitRepoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFormDone(true);
      setFormName("");
      setFormBlurb("");
      setFormGitRepoUrl("");
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
        <Users size={22} className="text-accent" /> 커뮤니티 프리셋
      </h1>
      <p className="text-sm text-text-dim mt-1">
        다른 유저가 공개한 &ldquo;일반 서버 + 내 GitHub 저장소&rdquo; 조합이에요 — 예: 직접 만든 디스코드 봇
        코드. 골라서 바로 서버를 만들거나, 직접 만들어 공개하면 다른 사람이 설치할 때마다 포인트를
        받아요.
      </p>

      {presets.length > 4 && (
        <div className="relative mt-4 animate-fade-up">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름, 설명, 만든 사람으로 검색"
            className="input w-full pl-9 pr-9"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text active:scale-90 transition-transform"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {availableCategories.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mt-3 p-1 bg-surface-2 rounded-full w-fit">
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
            <button type="button" onClick={() => applyEgg(p)} className="text-left w-full active:scale-[0.97] transition-transform">
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
              <span className="block text-text-dim text-[10px] mt-1 font-mono truncate">{p.gitRepoUrl}</span>
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
        <p className="text-sm text-text-dim mt-4">
          {query || categoryFilter !== "ALL" ? "검색 결과가 없어요." : "아직 공개된 커뮤니티 프리셋이 없어요. 첫 번째로 만들어보세요!"}
        </p>
      )}

      <div className="mt-6">
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-secondary px-3.5 py-2 text-sm inline-flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            + 내 커뮤니티 프리셋 공유하기
          </button>
        ) : formDone ? (
          <div className="card-glow p-4 flex items-center gap-3 animate-fade-up">
            <SuccessCheck size={32} confetti className="shrink-0" />
            <p className="text-sm text-green">
              공개했어요! 다른 사람이 이 프리셋으로 서버를 만들 때마다 포인트가 쌓여요.
            </p>
          </div>
        ) : (
          <div className="card-glow p-4 space-y-3 animate-fade-up">
            <h4 className="font-semibold text-sm">내 커뮤니티 프리셋 공유하기</h4>
            <p className="text-xs text-text-dim">
              일반 실행 환경(Node.js/Python 등 — 음악봇처럼 이미 완성된 종류는 고를 수 없어요)을
              고르고 내 코드가 있는 GitHub 저장소 주소를 붙여서 공개해요. 설정값(봇 토큰 등)는
              여기서 넣지 않아요 — 이 프리셋으로 서버를 만드는 사람이 직접 입력해요. 다른 사람이 이
              프리셋으로 서버를 만들 때마다 포인트가 쌓여요.
            </p>
            <select
              className="input w-full text-sm"
              value={formTemplateId}
              onChange={(e) => setFormTemplateId(e.target.value)}
            >
              <option value="">실행 환경 선택</option>
              {gitRuntimeTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.displayName}</option>
              ))}
            </select>
            <input
              className="input w-full text-sm"
              placeholder="이름 (예: 내 디스코드 봇)"
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
            <div>
              <label className="text-xs font-medium">코드 저장소 주소 (GitHub 등)</label>
              <input
                type="url"
                className="input w-full text-sm font-mono mt-1"
                placeholder="https://github.com/아이디/저장소이름"
                value={formGitRepoUrl}
                onChange={(e) => setFormGitRepoUrl(e.target.value)}
              />
              <p className="text-[11px] text-text-dim mt-1">
                이 저장소의 코드로 실행되는 서버가 만들어져요. 서버 생성 시 자동으로 clone돼요.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitForm}
                disabled={formBusy || !formTemplateId || !formGitRepoUrl || formName.length < 1}
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
