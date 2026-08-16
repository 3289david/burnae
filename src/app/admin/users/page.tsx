"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  storageQuotaGbOverride: number | null;
  _count: { servers: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);

  async function load() {
    const res = await fetch("/api/admin/users");
    setUsers(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function updateQuota(id: string, value: string) {
    const num = value === "" ? null : Number(value);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageQuotaGbOverride: num }),
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

  return (
    <div>
      <h1 className="text-2xl font-bold">유저</h1>
      <p className="text-sm text-text-dim mt-1">저장공간 한도(기본 10GB)를 유저별로 상향할 수 있어요.</p>

      <div className="mt-6 space-y-2">
        {users.map((u) => (
          <div key={u.id} className="card p-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium text-sm">{u.name} <span className="text-text-dim">· {u.email}</span></p>
              <p className="text-xs text-text-dim mt-0.5">서버 {u._count.servers}개 · {u.role} · {u.status}</p>
            </div>
            <div className="flex items-center gap-2">
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
              <button onClick={() => toggleStatus(u.id, u.status)} className="btn-secondary px-3 py-1.5 text-sm">
                {u.status === "ACTIVE" ? "정지" : "정지 해제"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
