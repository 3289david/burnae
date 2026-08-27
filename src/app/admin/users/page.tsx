"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Template { id: string; displayName: string; minecraftVersions: string[]; active: boolean }
interface Product { id: string; name: string; active: boolean; allowedTemplates: Template[] }
interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  storageQuotaGbOverride: number | null;
  aiCreditsRemaining: number;
  promotionPoints: number;
  _count: { servers: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [grantOpenFor, setGrantOpenFor] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    setUsers(await res.json());
  }
  async function loadCatalog() {
    const [p, t] = await Promise.all([
      fetch("/api/admin/products").then((r) => r.json()),
      fetch("/api/admin/templates").then((r) => r.json()),
    ]);
    setProducts(p.filter((x: Product) => x.active));
    setTemplates(t.filter((x: Template) => x.active));
  }
  useEffect(() => { load(); loadCatalog(); }, []);

  async function updateQuota(id: string, value: string) {
    const num = value === "" ? null : Number(value);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageQuotaGbOverride: num }),
    });
    await load();
  }

  async function updateCredits(id: string, value: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiCreditsRemaining: Number(value) || 0 }),
    });
    await load();
  }

  async function toggleStatus(id: string, status: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }),
    });
    await load();
  }

  async function grantPoints(id: string) {
    const value = prompt("지급(또는 차감)할 포인트를 입력하세요. 음수도 가능해요.");
    if (!value) return;
    const points = Number(value);
    if (!points) return;
    const reason = prompt("사유 (선택, 로그에 남아요)") ?? undefined;
    const res = await fetch(`/api/admin/users/${id}/grant-points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points, reason }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error);
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">유저</h1>
      <p className="text-sm text-text-dim mt-1">
        저장공간 한도(기본 10GB)를 유저별로 상향하거나, 포인트·서버를 직접 지급할 수 있어요.
      </p>

      <div className="mt-6 space-y-2">
        {users.map((u) => (
          <div key={u.id} className="card p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-medium text-sm">{u.name} <span className="text-text-dim">· {u.email}</span></p>
                <p className="text-xs text-text-dim mt-0.5">
                  서버 {u._count.servers}개 · {u.role} · {u.status} · 포인트 {u.promotionPoints.toLocaleString()}P
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-text-dim flex items-center gap-1">
                  저장공간(GB)
                  <input
                    type="number"
                    placeholder="기본값"
                    defaultValue={u.storageQuotaGbOverride ?? ""}
                    onBlur={(e) => updateQuota(u.id, e.target.value)}
                    className="input w-20 text-sm"
                  />
                </label>
                <label className="text-xs text-text-dim flex items-center gap-1">
                  AI 크레딧
                  <input
                    type="number"
                    defaultValue={u.aiCreditsRemaining}
                    onBlur={(e) => updateCredits(u.id, e.target.value)}
                    className="input w-20 text-sm"
                  />
                </label>
                <button onClick={() => grantPoints(u.id)} className="btn-secondary px-3 py-1.5 text-sm">
                  포인트 지급
                </button>
                <button
                  onClick={() => setGrantOpenFor(grantOpenFor === u.id ? null : u.id)}
                  className="btn-secondary px-3 py-1.5 text-sm"
                >
                  서버 지급
                </button>
                <button onClick={() => toggleStatus(u.id, u.status)} className="btn-secondary px-3 py-1.5 text-sm">
                  {u.status === "ACTIVE" ? "정지" : "정지 해제"}
                </button>
              </div>
            </div>

            {grantOpenFor === u.id && (
              <GrantServerForm
                userId={u.id}
                userName={u.name}
                products={products}
                templates={templates}
                onDone={() => { setGrantOpenFor(null); load(); }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type Mode = "existing" | "custom";

function GrantServerForm({
  userId,
  userName,
  products,
  templates,
  onDone,
}: {
  userId: string;
  userName: string;
  products: Product[];
  templates: Template[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(products.length > 0 ? "existing" : "custom");

  // 기존 상품 모드
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);

  // 직접 설정(커스텀) 모드
  const [ramGb, setRamGb] = useState(1);
  const [cpuPercent, setCpuPercent] = useState(50);
  const [diskGb, setDiskGb] = useState(1);
  const [backupSlots, setBackupSlots] = useState(1);

  const templateOptions = mode === "existing" ? product?.allowedTemplates ?? [] : templates;
  const [templateId, setTemplateId] = useState(templateOptions[0]?.id ?? "");
  const template = templateOptions.find((t) => t.id === templateId);
  const [version, setVersion] = useState(template?.minecraftVersions[0] ?? "");
  const [serverName, setServerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    const opts = next === "existing" ? product?.allowedTemplates ?? [] : templates;
    setTemplateId(opts[0]?.id ?? "");
    setVersion(opts[0]?.minecraftVersions[0] ?? "");
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const body =
        mode === "existing"
          ? { mode, productId, templateId, minecraftVersion: version, serverName }
          : {
              mode,
              templateId,
              minecraftVersion: version,
              serverName,
              ramMb: ramGb * 1024,
              cpuPercent,
              diskMb: diskGb * 1024,
              backupSlots,
            };
      const res = await fetch(`/api/admin/users/${userId}/grant-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDone();
      // 결제 완료 후 화면과 동일하게, 실제로 만들어진 서버 페이지로 바로 이동
      if (data.serverId) {
        router.push(`/dashboard/servers/${data.serverId}`);
      } else if (data.preorderWaiting) {
        router.push("/admin/preorders");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "지급 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="flex items-center gap-1 text-xs">
        <span className="text-text-dim mr-1">{userName}님에게:</span>
        {products.length > 0 && (
          <button
            type="button"
            onClick={() => switchMode("existing")}
            className={`px-2.5 py-1 rounded-full border ${mode === "existing" ? "bg-accent border-accent text-white" : "border-border text-text-dim"}`}
          >
            기존 상품에서 지급
          </button>
        )}
        <button
          type="button"
          onClick={() => switchMode("custom")}
          className={`px-2.5 py-1 rounded-full border ${mode === "custom" ? "bg-accent border-accent text-white" : "border-border text-text-dim"}`}
        >
          직접 설정해서 지급
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {mode === "existing" ? (
          <select
            className="input text-sm"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              const p = products.find((x) => x.id === e.target.value);
              const t = p?.allowedTemplates[0];
              setTemplateId(t?.id ?? "");
              setVersion(t?.minecraftVersions[0] ?? "");
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <>
            <NumField label="RAM(GB)" value={ramGb} onChange={setRamGb} />
            <NumField label="CPU(%)" value={cpuPercent} onChange={setCpuPercent} />
            <NumField label="디스크(GB)" value={diskGb} onChange={setDiskGb} />
            <NumField label="백업 슬롯" value={backupSlots} onChange={setBackupSlots} />
          </>
        )}

        <select
          className="input text-sm"
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            const t = templateOptions.find((x) => x.id === e.target.value);
            setVersion(t?.minecraftVersions[0] ?? "");
          }}
        >
          {templateOptions.length === 0 && <option value="">선택 가능한 서버 종류 없음</option>}
          {templateOptions.map((t) => (
            <option key={t.id} value={t.id}>{t.displayName}</option>
          ))}
        </select>
        <select className="input text-sm" value={version} onChange={(e) => setVersion(e.target.value)}>
          {template?.minecraftVersions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <input
          className="input text-sm flex-1 min-w-[140px]"
          placeholder="서버 이름"
          maxLength={24}
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
        />
        <button onClick={submit} disabled={loading || serverName.length < 2 || !templateId} className="btn-primary px-4 py-1.5 text-sm">
          {loading ? "지급 중..." : "지급하기"}
        </button>
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-xs text-text-dim flex items-center gap-1">
      {label}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input w-16 text-sm"
      />
    </label>
  );
}
