"use client";

import { useEffect, useState } from "react";

interface Server {
  id: string;
  name: string;
  status: string;
  ramMb: number;
  owner: { name: string; email: string };
  node: { name: string; location: string };
  product: { name: string };
  subdomains: { subdomain: string }[];
}

export default function AdminServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(query = "") {
    const res = await fetch(`/api/admin/servers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (res.ok) setServers(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function power(id: string, signal: string) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/servers/${id}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal }),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function suspend(id: string, suspended: boolean) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/servers/${id}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended }),
      });
      await load(q);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("정말 이 서버를 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusyId(id);
    try {
      await fetch(`/api/admin/servers/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createFinalBackup: true }),
      });
      await load(q);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">전체 서버</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          className="input flex-1"
          placeholder="서버명, 소유자 이름/이메일로 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn-secondary px-4 py-2 text-sm">검색</button>
      </form>

      <div className="mt-6 space-y-2">
        {servers.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-medium text-sm">
                  {s.name} <span className="text-text-dim">· {s.status}</span>
                </p>
                <p className="text-xs text-text-dim mt-0.5">
                  {s.owner.name} ({s.owner.email}) · {s.product.name} · {s.node.name}/{s.node.location}
                  {s.subdomains[0] && ` · ${s.subdomains[0].subdomain}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button disabled={busyId === s.id} onClick={() => power(s.id, "restart")} className="btn-secondary px-2.5 py-1 text-xs">재시작</button>
                <button disabled={busyId === s.id} onClick={() => power(s.id, "stop")} className="btn-secondary px-2.5 py-1 text-xs">정지</button>
                {s.status === "SUSPENDED" ? (
                  <button disabled={busyId === s.id} onClick={() => suspend(s.id, false)} className="btn-secondary px-2.5 py-1 text-xs">정지 해제</button>
                ) : (
                  <button disabled={busyId === s.id} onClick={() => suspend(s.id, true)} className="btn-secondary px-2.5 py-1 text-xs">계정정지</button>
                )}
                <button disabled={busyId === s.id} onClick={() => remove(s.id)} className="btn-secondary px-2.5 py-1 text-xs text-red">삭제</button>
              </div>
            </div>
          </div>
        ))}
        {servers.length === 0 && <p className="text-sm text-text-dim">서버가 없어요.</p>}
      </div>
    </div>
  );
}
