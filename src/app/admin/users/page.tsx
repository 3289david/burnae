"use client";

import { useEffect, useState } from "react";

interface Product { id: string; name: string; active: boolean }
interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  aiCreditsRemaining: number;
  promotionPoints: number;
  discordLink: { discordUserId: string } | null;
  _count: { servers: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [grantOpenFor, setGrantOpenFor] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    setUsers(await res.json());
  }
  async function loadCatalog() {
    const p = await fetch("/api/admin/products").then((r) => r.json());
    setProducts(p.filter((x: Product) => x.active));
  }
  useEffect(() => { load(); loadCatalog(); }, []);

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

  async function sendDiscordMessage(id: string) {
    const message = prompt("디스코드 DM으로 보낼 메시지를 입력하세요.");
    if (!message) return;
    const res = await fetch(`/api/admin/users/${id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json().catch(() => ({}));
    alert(res.ok ? "보냈어요." : data.error ?? "전송 실패");
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
        AI 크레딧·포인트·서버를 직접 지급하거나 계정을 정지할 수 있어요.
      </p>

      <div className="mt-6 space-y-2">
        {users.map((u, i) => (
          <div key={u.id} className="card-glow p-4 animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-medium text-sm">{u.name} <span className="text-text-dim">· {u.email}</span></p>
                <p className="text-xs text-text-dim mt-0.5">
                  서버 {u._count.servers}개 · {u.role} · {u.status} · 포인트 {u.promotionPoints.toLocaleString()}P
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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
                {u.discordLink && (
                  <button onClick={() => sendDiscordMessage(u.id)} className="btn-secondary px-3 py-1.5 text-sm">
                    디스코드 메시지
                  </button>
                )}
              </div>
            </div>

            {grantOpenFor === u.id && (
              <GrantServerForm
                userId={u.id}
                userName={u.name}
                products={products}
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
  onDone,
}: {
  userId: string;
  userName: string;
  products: Product[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(products.length > 0 ? "existing" : "custom");

  // 기존 상품 모드
  const [productId, setProductId] = useState(products[0]?.id ?? "");

  // 직접 설정(커스텀) 모드
  const [ramGb, setRamGb] = useState(1);
  const [cpuPercent, setCpuPercent] = useState(50);
  const [diskGb, setDiskGb] = useState(1);
  const [backupSlots, setBackupSlots] = useState(1);

  const [serverName, setServerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const body =
        mode === "existing"
          ? { mode, productId, serverName }
          : {
              mode,
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
      setDone(true);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "지급 실패");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs text-green">지급 완료! {userName}님이 로그인해서 서버 종류/버전을 고르면 바로 만들어져요.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="flex items-center gap-1 text-xs">
        <span className="text-text-dim mr-1">{userName}님에게:</span>
        {products.length > 0 && (
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`px-2.5 py-1 rounded-full border ${mode === "existing" ? "bg-accent border-accent text-white" : "border-border text-text-dim"}`}
          >
            기존 상품에서 지급
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`px-2.5 py-1 rounded-full border ${mode === "custom" ? "bg-accent border-accent text-white" : "border-border text-text-dim"}`}
        >
          직접 설정해서 지급
        </button>
      </div>
      <p className="text-[11px] text-text-dim">서버 종류(마인크래프트 로더/버전, VPS, 디스코드 봇 등)는 유저가 직접 골라요.</p>

      <div className="flex flex-wrap gap-2 items-center">
        {mode === "existing" ? (
          <select className="input text-sm" value={productId} onChange={(e) => setProductId(e.target.value)}>
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

        <input
          className="input text-sm flex-1 min-w-[140px]"
          placeholder="서버 이름"
          maxLength={24}
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
        />
        <button
          onClick={submit}
          disabled={loading || serverName.length < 2 || (mode === "existing" && !productId)}
          className="btn-primary px-4 py-1.5 text-sm"
        >
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
