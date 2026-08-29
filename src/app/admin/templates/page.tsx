"use client";

import { useEffect, useState } from "react";

type ServerCategory = "MINECRAFT" | "VPS" | "DISCORD_BOT" | "GENERAL";

const CATEGORY_LABEL: Record<ServerCategory, string> = {
  MINECRAFT: "마인크래프트",
  VPS: "VPS",
  DISCORD_BOT: "디스코드 봇 호스팅",
  GENERAL: "일반 서버(기타)",
};

interface Template {
  id: string;
  key: string;
  displayName: string;
  category: ServerCategory;
  pterodactylNestId: number;
  pterodactylEggId: number;
  dockerImage: string;
  startupCommand: string;
  minecraftVersions: string[];
  availableDockerImages: Record<string, string> | null;
  active: boolean;
}

interface NestOption {
  id: number;
  name: string;
  eggs: { id: number; name: string }[];
}

const empty = {
  key: "",
  displayName: "",
  category: "MINECRAFT" as ServerCategory,
  pterodactylNestId: "",
  pterodactylEggId: "",
  dockerImage: "",
  startupCommand: "",
  minecraftVersionsText: "",
  environmentText: "",
};

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // "쉬운 모드": Pterodactyl에서 실제 Nest/Egg 목록을 가져와 이름만 보고 고를 수 있게 함
  const [nests, setNests] = useState<NestOption[] | null>(null);
  const [nestsError, setNestsError] = useState<string | null>(null);
  const [selectedNestId, setSelectedNestId] = useState("");
  const [selectedEggId, setSelectedEggId] = useState("");
  const [javaVersionLabel, setJavaVersionLabel] = useState("");
  const [dockerImages, setDockerImages] = useState<Record<string, string>>({});
  const [multiVersionLabels, setMultiVersionLabels] = useState<Set<string>>(new Set());
  const [fetchingEgg, setFetchingEgg] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/templates");
    setTemplates(await res.json());
  }
  useEffect(() => {
    load();
    fetch("/api/admin/pterodactyl/nests")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error);
        return r.json();
      })
      .then(setNests)
      .catch((err) => setNestsError(err instanceof Error ? err.message : "불러오기 실패"));
  }, []);

  const selectedNest = nests?.find((n) => String(n.id) === selectedNestId);

  async function pickEgg(nestId: string, eggId: string) {
    setSelectedNestId(nestId);
    setSelectedEggId(eggId);
    setDockerImages({});
    setJavaVersionLabel("");
    setMultiVersionLabels(new Set());
    if (!nestId || !eggId) return;

    setFetchingEgg(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pterodactyl/eggs/${nestId}/${eggId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const firstJavaLabel = Object.keys(data.dockerImages)[0] ?? "";
      setDockerImages(data.dockerImages);
      setJavaVersionLabel(firstJavaLabel);
      setForm({
        key: data.suggestedKey,
        displayName: data.name,
        category: form.category,
        pterodactylNestId: nestId,
        pterodactylEggId: eggId,
        dockerImage: data.dockerImages[firstJavaLabel] ?? "",
        startupCommand: data.startup,
        minecraftVersionsText: data.suggestedMinecraftVersions.join(", "),
        environmentText: Object.entries(data.defaultEnvironment as Record<string, string>)
          .map(([k, v]) => `${k}=${v}`)
          .join(", "),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Egg 정보를 불러오지 못했어요.");
    } finally {
      setFetchingEgg(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const environment: Record<string, string> = {};
      for (const pair of form.environmentText.split(",")) {
        const [k, v] = pair.split("=");
        if (k && v) environment[k.trim()] = v.trim();
      }
      const availableDockerImages =
        multiVersionLabels.size > 1
          ? Object.fromEntries(Object.entries(dockerImages).filter(([label]) => multiVersionLabels.has(label)))
          : undefined;
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.key,
          displayName: form.displayName,
          category: form.category,
          pterodactylNestId: Number(form.pterodactylNestId),
          pterodactylEggId: Number(form.pterodactylEggId),
          dockerImage: form.dockerImage,
          startupCommand: form.startupCommand,
          minecraftVersions: form.minecraftVersionsText.split(",").map((v) => v.trim()).filter(Boolean),
          defaultEnvironment: environment,
          availableDockerImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(empty);
      setSelectedNestId("");
      setSelectedEggId("");
      setDockerImages({});
      setMultiVersionLabels(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">서버 종류 (Egg)</h1>
      <p className="text-sm text-text-dim mt-1">
        아래에서 종류를 고르기만 하면 도커 이미지(자바 버전)·시작 명령어·기본 설정을 연결된
        Pterodactyl 패널에서 자동으로 가져와요. Nest ID/Egg ID를 몰라도 괜찮아요.
      </p>

      <div className="mt-6 space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="card-glow p-4 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">
                {t.displayName} <span className="text-text-dim">({t.key})</span>{" "}
                <span className="text-accent">· {CATEGORY_LABEL[t.category]}</span>
              </span>
              <span className="text-text-dim">{t.active ? "활성" : "비활성"}</span>
            </div>
            <p className="text-text-dim text-xs mt-1">Nest #{t.pterodactylNestId} / Egg #{t.pterodactylEggId} · {t.dockerImage}</p>
            {t.category === "MINECRAFT" && (
              <p className="text-text-dim text-xs">버전: {t.minecraftVersions.join(", ")}</p>
            )}
            {t.availableDockerImages && (
              <p className="text-text-dim text-xs">런타임 버전: {Object.keys(t.availableDockerImages).join(", ")}</p>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={create} className="card-glow p-5 mt-6 space-y-4">
        <h2 className="font-semibold">새 서버 종류 추가</h2>

        {nestsError && (
          <p className="text-xs text-red">
            Pterodactyl에서 목록을 못 가져왔어요 ({nestsError}) — .env의 PTERODACTYL_URL/API 키를
            확인하거나, 아래 &ldquo;직접 입력&rdquo;으로 진행하세요.
          </p>
        )}

        {nests && !advanced && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-text-dim">1. Nest 선택</label>
              <select
                className="input w-full mt-1"
                value={selectedNestId}
                onChange={(e) => pickEgg(e.target.value, "")}
              >
                <option value="">선택하세요</option>
                {nests.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-text-dim">2. Egg (서버 종류) 선택</label>
              <select
                className="input w-full mt-1"
                value={selectedEggId}
                disabled={!selectedNest}
                onChange={(e) => pickEgg(selectedNestId, e.target.value)}
              >
                <option value="">선택하세요</option>
                {selectedNest?.eggs.map((egg) => (
                  <option key={egg.id} value={egg.id}>{egg.name}</option>
                ))}
              </select>
            </div>
            {Object.keys(dockerImages).length > 0 && (
              <div className="sm:col-span-2">
                <label className="text-sm text-text-dim">3. 자바 버전 선택</label>
                <select
                  className="input w-full mt-1"
                  value={javaVersionLabel}
                  onChange={(e) => {
                    setJavaVersionLabel(e.target.value);
                    setForm({ ...form, dockerImage: dockerImages[e.target.value] });
                  }}
                >
                  {Object.keys(dockerImages).map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            {Object.keys(dockerImages).length > 1 && (
              <div className="sm:col-span-2">
                <label className="text-sm text-text-dim">
                  버전 여러 개 선택 가능하게 하기 (선택, 서버 생성 화면에서 유저가 고를 수 있어요)
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1.5">
                  {Object.keys(dockerImages).map((label) => (
                    <label key={label} className="flex items-center gap-1.5 text-xs text-text-dim">
                      <input
                        type="checkbox"
                        checked={multiVersionLabels.has(label)}
                        onChange={(e) => {
                          const next = new Set(multiVersionLabels);
                          if (e.target.checked) next.add(label);
                          else next.delete(label);
                          setMultiVersionLabels(next);
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {fetchingEgg && <p className="text-xs text-text-dim sm:col-span-2">불러오는 중...</p>}
          </div>
        )}

        {(!!selectedEggId || advanced || !nests) && (
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <p className="sm:col-span-2 text-xs text-text-dim">
              {advanced || !nests ? "직접 입력" : "자동으로 채워졌어요 — 필요하면 고쳐도 돼요"}
            </p>
            <Field label="키 (예: paper)" value={form.key} onChange={(v) => setForm({ ...form, key: v })} />
            <Field label="표시 이름 (예: Paper)" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
            <div>
              <label className="text-sm text-text-dim">분류</label>
              <select
                className="input w-full mt-1"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ServerCategory })}
              >
                {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            {(advanced || !nests) && (
              <>
                <Field label="Nest ID" value={form.pterodactylNestId} onChange={(v) => setForm({ ...form, pterodactylNestId: v })} />
                <Field label="Egg ID" value={form.pterodactylEggId} onChange={(v) => setForm({ ...form, pterodactylEggId: v })} />
              </>
            )}
            <Field label="Docker 이미지" value={form.dockerImage} onChange={(v) => setForm({ ...form, dockerImage: v })} className="sm:col-span-2" />
            <Field label="시작 명령어" value={form.startupCommand} onChange={(v) => setForm({ ...form, startupCommand: v })} className="sm:col-span-2" />
            <Field label="지원 버전 (쉼표 구분)" value={form.minecraftVersionsText} onChange={(v) => setForm({ ...form, minecraftVersionsText: v })} className="sm:col-span-2" />
            <Field label="기본 환경변수 (KEY=VALUE, 쉼표 구분)" value={form.environmentText} onChange={(v) => setForm({ ...form, environmentText: v })} className="sm:col-span-2" />
          </div>
        )}

        {nests && (
          <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-xs text-text-dim underline">
            {advanced ? "쉬운 모드로 돌아가기" : "Nest/Egg ID를 직접 입력할래요"}
          </button>
        )}

        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={loading || !form.key || !form.displayName} className="btn-primary px-5 py-2.5">
          추가
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, className }: { label: string; value: string | number; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm text-text-dim">{label}</label>
      <input className="input w-full mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
