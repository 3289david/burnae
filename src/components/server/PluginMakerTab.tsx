"use client";

import { useState } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";

interface PluginMakerResult {
  kind: "skript" | "datapack" | "java_plugin";
  summary: string;
  warnings: string[];
  skript?: { filename: string; content: string };
  datapack?: {
    namespace: string;
    functions: { name: string; commands: string[] }[];
    runOnLoad?: string[];
    runEveryTick?: string[];
  };
  javaPlugin?: {
    packageName: string;
    className: string;
    javaSource: string;
    pluginYml: string;
  };
  safetyReview?: { safe: boolean; reasons: string[] };
}

const KIND_LABEL: Record<PluginMakerResult["kind"], string> = {
  java_plugin: "컴파일된 자바 플러그인 (.jar)",
  skript: "Skript 스크립트",
  datapack: "바닐라 데이터팩",
};

const EXAMPLES = [
  "TNT를 설치하면 폭발 대신 불꽃놀이가 터지게 해줘",
  "/kit 명령어로 다이아몬드 장비 세트를 한 번씩 받을 수 있게 해줘",
  "플레이어가 죽으면 랜덤한 위치로 부활시켜줘",
];

export default function PluginMakerTab({ serverId }: { serverId: string }) {
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<PluginMakerResult | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    setApplied(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/plugin-maker/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setGenerating(false);
    }
  }

  async function apply() {
    if (!result) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/plugin-maker/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApplied(data.appliedPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "적용 실패");
    } finally {
      setApplying(false);
    }
  }

  const blockedByReview = result?.kind === "java_plugin" && result.safetyReview?.safe === false;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-semibold flex items-center gap-1.5"><Sparkles size={16} className="text-accent" /> 플러그인/모드 메이커</h3>
        <p className="text-sm text-text-dim mt-1">
          원하는 걸 말로 설명하면 AI가 서버 버전에 맞춰 즉시 적용 가능한 형태로 만들어줘요. Paper/Purpur
          서버는 <strong>실제 컴파일된 자바 플러그인</strong>까지 만들 수 있고(자동으로 안전성 검사를 거쳐요),
          그 외 서버는 <strong>바닐라 데이터팩</strong>으로 만들어요. Forge/Fabric처럼 컴파일이 필요한
          모드는 지원하지 않아요(별도 빌드 체계가 필요해서요).
        </p>
        <div className="mt-3">
          <textarea
            className="input w-full min-h-[90px] text-sm"
            placeholder={`예: ${EXAMPLES[0]}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDescription(ex)}
                className="text-xs text-text-dim border border-border rounded-full px-2.5 py-1 hover:text-text"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating || description.trim().length < 3}
          className="btn-primary px-5 py-2.5 text-sm mt-3"
        >
          {generating ? "만드는 중..." : "만들기"}
        </button>
        {error && <p className="text-sm text-red mt-2">{error}</p>}
      </div>

      {result && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-sm">미리보기 · {KIND_LABEL[result.kind]}</h3>
            {!applied && (
              <button
                onClick={apply}
                disabled={applying || blockedByReview}
                className="btn-primary px-4 py-1.5 text-sm disabled:opacity-40"
              >
                {applying ? "적용 중..." : "서버에 바로 적용"}
              </button>
            )}
          </div>
          <p className="text-sm">{result.summary}</p>

          {result.kind === "java_plugin" && result.safetyReview && (
            <p className={`text-xs flex items-center gap-1.5 ${result.safetyReview.safe ? "text-green" : "text-red"}`}>
              {result.safetyReview.safe ? <ShieldCheck size={14} className="shrink-0" /> : <ShieldAlert size={14} className="shrink-0" />}
              {result.safetyReview.safe
                ? "AI 안전성 검사를 통과했어요."
                : `안전성 검사 실패 — 적용할 수 없어요: ${result.safetyReview.reasons.join(", ")}`}
            </p>
          )}

          {result.warnings.length > 0 && (
            <ul className="space-y-1">
              {result.warnings.map((w) => (
                <li key={w} className="text-xs text-yellow flex items-center gap-1.5">
                  <AlertTriangle size={12} className="shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}

          {result.kind === "java_plugin" && result.javaPlugin && (
            <div className="space-y-2">
              <p className="text-xs text-text-dim">
                {result.javaPlugin.packageName}.{result.javaPlugin.className}
              </p>
              <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-96">{result.javaPlugin.javaSource}</pre>
            </div>
          )}

          {result.kind === "skript" && result.skript && (
            <div>
              <p className="text-xs text-text-dim mb-1">{result.skript.filename}</p>
              <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{result.skript.content}</pre>
            </div>
          )}

          {result.kind === "datapack" && result.datapack && (
            <div className="space-y-2">
              <p className="text-xs text-text-dim">네임스페이스: {result.datapack.namespace}</p>
              {result.datapack.functions.map((fn) => (
                <div key={fn.name}>
                  <p className="text-xs text-text-dim mb-1">function {fn.name}</p>
                  <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{fn.commands.join("\n")}</pre>
                </div>
              ))}
              {!!result.datapack.runOnLoad?.length && (
                <p className="text-xs text-text-dim">로드시 실행: {result.datapack.runOnLoad.join(", ")}</p>
              )}
              {!!result.datapack.runEveryTick?.length && (
                <p className="text-xs text-text-dim">매 틱 실행: {result.datapack.runEveryTick.join(", ")}</p>
              )}
            </div>
          )}

          {applied && (
            <p className="text-sm text-green flex items-center gap-1.5">
              <CheckCircle2 size={16} className="shrink-0" /> 서버에 적용했어요 ({applied}).
              {result.kind === "java_plugin" ? " 서버가 재시작돼요." : " 게임 안에서 바로 확인해보세요."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
