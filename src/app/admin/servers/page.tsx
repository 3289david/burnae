"use client";

import { useEffect, useState } from "react";

interface Server {
  id: string;
  name: string;
  status: string;
  ramMb: number;
  nodeId: string;
  owner: { name: string; email: string };
  node: { name: string; location: string };
  product: { name: string };
  subdomains: { subdomain: string }[];
}

interface AdminNode {
  id: string;
  name: string;
  location: string;
  status: string;
}

export default function AdminServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [nodes, setNodes] = useState<AdminNode[]>([]);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [migratingRowId, setMigratingRowId] = useState<string | null>(null);
  const [targetNodeId, setTargetNodeId] = useState("");

  async function load(query = "") {
    const res = await fetch(`/api/admin/servers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (res.ok) setServers(await res.json());
  }

  useEffect(() => {
    load();
    fetch("/api/admin/nodes").then(async (res) => {
      if (res.ok) setNodes(await res.json());
    });
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

  async function migrate(id: string) {
    if (!targetNodeId) return;
    if (
      !confirm(
        "이 서버를 선택한 노드로 이전할까요?\n\n서버가 잠시 정지되고, 이전이 끝나면 다시 정지 상태로 남습니다(확인 후 직접 시작해주세요). 원본 서버는 안전하게 확인할 수 있도록 바로 지우지 않고 정지 상태로만 남겨두니, 문제없는 걸 확인한 뒤 관리자가 직접 정리해주세요.",
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetNodeId }),
      });
      const data = await res.json();
      alert(data.message ?? data.error ?? "요청을 보냈어요.");
      setMigratingRowId(null);
      setTargetNodeId("");
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
          <div key={s.id} className="card-glow p-4">
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
                <button
                  disabled={busyId === s.id || s.status === "MIGRATING"}
                  onClick={() => {
                    setMigratingRowId(migratingRowId === s.id ? null : s.id);
                    setTargetNodeId("");
                  }}
                  className="btn-secondary px-2.5 py-1 text-xs"
                >
                  노드 이전
                </button>
                <button disabled={busyId === s.id} onClick={() => remove(s.id)} className="btn-secondary px-2.5 py-1 text-xs text-red">삭제</button>
              </div>
            </div>

            {migratingRowId === s.id && (
              <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
                <select
                  className="input text-xs py-1.5"
                  value={targetNodeId}
                  onChange={(e) => setTargetNodeId(e.target.value)}
                >
                  <option value="">대상 노드 선택...</option>
                  {nodes
                    .filter((n) => n.id !== s.nodeId)
                    .map((n) => (
                      <option key={n.id} value={n.id} disabled={n.status !== "ONLINE"}>
                        {n.name}/{n.location} {n.status !== "ONLINE" ? `(${n.status})` : ""}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!targetNodeId || busyId === s.id}
                  onClick={() => migrate(s.id)}
                  className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  이전 시작
                </button>
                <p className="text-xs text-text-dim w-full">
                  서버 데이터 전체를 압축해 대상 노드로 복사합니다. 진행 중에는 서버가 정지돼요.
                  완료되면 정지 상태로 남으니 확인 후 직접 시작해주세요. 원본은 안전을 위해 자동
                  삭제하지 않고 정지 상태로 남으니, 확인 후 관리자가 직접 삭제해주세요.
                </p>
              </div>
            )}
          </div>
        ))}
        {servers.length === 0 && <p className="text-sm text-text-dim">서버가 없어요.</p>}
      </div>
    </div>
  );
}
