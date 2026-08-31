"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

interface Node {
  id: string;
  name: string;
  location: string;
  fqdn: string;
  sftpFqdn: string | null;
  publicIp: string;
  totalRamMb: number;
  totalDiskMb: number;
  reservedRamMb: number;
  usedRamMb: number;
  totalCpuPercent: number;
  usedCpuPercent: number;
  status: string;
  autoDeployEnabled: boolean;
}

const empty = {
  pterodactylNodeId: "",
  name: "",
  location: "서울",
  publicIp: "",
  reservedRamMb: 0,
  reservedDiskMb: 0,
  cpuCores: 8,
};

export default function AdminNodesPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [migratingNodeId, setMigratingNodeId] = useState<string | null>(null);
  const [migrateTarget, setMigrateTarget] = useState("");

  async function load() {
    const res = await fetch("/api/admin/nodes");
    setNodes(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function migrateAll(nodeId: string) {
    if (!migrateTarget) return;
    if (!confirm("이 노드의 모든 서버를 대상 노드로 순서대로 이전할까요? 서버마다 잠시 정지될 수 있어요.")) return;
    const res = await fetch(`/api/admin/nodes/${nodeId}/migrate-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetNodeId: migrateTarget }),
    });
    const data = await res.json();
    alert(data.message ?? data.error ?? "요청을 보냈어요.");
    setMigratingNodeId(null);
    setMigrateTarget("");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, pterodactylNodeId: Number(form.pterodactylNodeId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(empty);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(id: string, field: "status" | "autoDeployEnabled" | "sftpFqdn", value: string | boolean | null) {
    await fetch(`/api/admin/nodes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">노드</h1>
      <p className="text-sm text-text-dim mt-1">Wings가 이미 설치되고 Pterodactyl 패널에 등록된 노드만 연결할 수 있어요.</p>

      <div className="mt-6 space-y-2">
        {nodes.map((n, i) => (
          <div key={n.id} className="card-glow p-4 animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{n.name} · {n.location}</p>
                <p className="text-xs text-text-dim mt-0.5">{n.fqdn} ({n.publicIp})</p>
                <label className="flex items-center gap-1.5 text-xs text-text-dim mt-1.5">
                  SFTP 주소
                  <input
                    defaultValue={n.sftpFqdn ?? ""}
                    placeholder={n.fqdn}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (n.sftpFqdn ?? "")) toggle(n.id, "sftpFqdn", v || null);
                    }}
                    className="input text-xs py-1 w-40"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={n.status} onChange={(e) => toggle(n.id, "status", e.target.value)} className="input text-sm">
                  <option value="ONLINE">ONLINE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="OFFLINE">OFFLINE</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-text-dim">
                  <Toggle checked={n.autoDeployEnabled} onChange={(next) => toggle(n.id, "autoDeployEnabled", next)} size="sm" />
                  자동배치
                </label>
                <button
                  onClick={() => { setMigratingNodeId(migratingNodeId === n.id ? null : n.id); setMigrateTarget(""); }}
                  className="btn-secondary px-2.5 py-1 text-xs"
                >
                  노드 전체 이전
                </button>
              </div>
            </div>

            {migratingNodeId === n.id && (
              <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
                <select className="input text-xs py-1.5" value={migrateTarget} onChange={(e) => setMigrateTarget(e.target.value)}>
                  <option value="">대상 노드 선택...</option>
                  {nodes.filter((o) => o.id !== n.id).map((o) => (
                    <option key={o.id} value={o.id} disabled={o.status !== "ONLINE"}>
                      {o.name}/{o.location} {o.status !== "ONLINE" ? `(${o.status})` : ""}
                    </option>
                  ))}
                </select>
                <button disabled={!migrateTarget} onClick={() => migrateAll(n.id)} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40">
                  전체 이전 시작
                </button>
                <p className="text-xs text-text-dim w-full">
                  이 노드의 활성 서버 전부를 순서대로 대상 노드로 옮겨요. 서버마다 개별 이전과 동일하게
                  진행 중 정지되고, 완료되면 정지 상태로 남으니 확인 후 시작해주세요.
                </p>
              </div>
            )}
            <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.round((n.usedRamMb / Math.max(1, n.totalRamMb - n.reservedRamMb)) * 100))}%` }} />
            </div>
            <p className="text-xs text-text-dim mt-1">
              RAM {(n.usedRamMb / 1024).toFixed(0)}GB / {((n.totalRamMb - n.reservedRamMb) / 1024).toFixed(0)}GB 판매 가능
            </p>
            <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-purple" style={{ width: `${Math.min(100, Math.round((n.usedCpuPercent / Math.max(1, n.totalCpuPercent)) * 100))}%` }} />
            </div>
            <p className="text-xs text-text-dim mt-1">
              CPU {n.usedCpuPercent}% / {n.totalCpuPercent}% 판매 가능
            </p>
          </div>
        ))}
      </div>

      <form onSubmit={create} className="card-glow p-5 mt-6 space-y-3">
        <h2 className="font-semibold">노드 연결</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <F label="Pterodactyl Node ID" value={form.pterodactylNodeId} onChange={(v) => setForm({ ...form, pterodactylNodeId: v })} />
          <F label="이름" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <F label="위치" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
          <F label="공인 IP" value={form.publicIp} onChange={(v) => setForm({ ...form, publicIp: v })} />
          <F label="예약 RAM (MB)" value={String(form.reservedRamMb)} onChange={(v) => setForm({ ...form, reservedRamMb: Number(v) })} />
          <F label="예약 디스크 (MB)" value={String(form.reservedDiskMb)} onChange={(v) => setForm({ ...form, reservedDiskMb: Number(v) })} />
          <F label="CPU 코어 수" value={String(form.cpuCores)} onChange={(v) => setForm({ ...form, cpuCores: Number(v) })} />
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary px-5 py-2.5">연결</button>
      </form>
    </div>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm text-text-dim">{label}</label>
      <input className="input w-full mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
