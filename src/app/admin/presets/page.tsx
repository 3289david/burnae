"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Flag, Trash2, RotateCcw, Ban } from "lucide-react";

interface Preset {
  id: string;
  displayName: string;
  blurb: string | null;
  environment: Record<string, unknown>;
  reportCount: number;
  delisted: boolean;
  createdAt: string;
  createdBy: { id: string; name: string; email: string; role: string };
  baseTemplate: { displayName: string };
  reports: { reason: string | null; createdAt: string; reporterId: string }[];
}

export default function AdminPresetsPage() {
  const [items, setItems] = useState<Preset[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/presets");
    if (res.ok) setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function setDelisted(id: string, delisted: boolean) {
    setBusyId(id);
    await fetch(`/api/admin/presets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delisted }),
    });
    await load();
    setBusyId(null);
  }

  async function remove(id: string) {
    if (!confirm("이 프리셋을 완전히 삭제할까요? 되돌릴 수 없어요.")) return;
    setBusyId(id);
    await fetch(`/api/admin/presets/${id}`, { method: "DELETE" });
    await load();
    setBusyId(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">커뮤니티 프리셋</h1>
      <p className="text-sm text-text-dim mt-1">
        유저가 공개한 시작 변수 프리셋 목록이에요. 신고가 3건 쌓이면 자동으로 비공개(회수)되고
        지급됐던 포인트도 회수돼요. 여기서 직접 비공개/재공개하거나 완전히 삭제할 수 있어요.
      </p>

      {items === null && <p className="text-sm text-text-dim mt-6">불러오는 중...</p>}
      {items?.length === 0 && <p className="text-sm text-text-dim mt-6">등록된 프리셋이 없어요.</p>}

      <div className="mt-6 space-y-3">
        {items?.map((p, i) => (
          <div
            key={p.id}
            className={`card-glow p-4 animate-fade-up ${p.delisted ? "opacity-60" : ""}`}
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                  {p.displayName}
                  {p.createdBy.role === "ADMIN" && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-accent bg-accent/10 rounded-full px-1.5 py-0.5">
                      <ShieldCheck size={10} /> 공식
                    </span>
                  )}
                  {p.delisted && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red bg-red/10 rounded-full px-1.5 py-0.5">
                      <Ban size={10} /> 비공개됨
                    </span>
                  )}
                </p>
                <p className="text-xs text-text-dim mt-0.5">
                  {p.baseTemplate.displayName} · {p.createdBy.name} ({p.createdBy.email})
                </p>
                {p.blurb && <p className="text-xs text-text-dim mt-1">{p.blurb}</p>}
                <p className="text-[11px] font-mono text-text-dim mt-2 break-all">
                  {JSON.stringify(p.environment)}
                </p>
                {p.reportCount > 0 && (
                  <p className="text-xs text-yellow mt-1.5 flex items-center gap-1">
                    <Flag size={12} /> 신고 {p.reportCount}건
                    {p.reports.some((r) => r.reason) && (
                      <span className="text-text-dim">
                        — {p.reports.filter((r) => r.reason).map((r) => r.reason).join(", ")}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.delisted ? (
                  <button
                    onClick={() => setDelisted(p.id, false)}
                    disabled={busyId === p.id}
                    className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1"
                  >
                    <RotateCcw size={12} /> 재공개
                  </button>
                ) : (
                  <button
                    onClick={() => setDelisted(p.id, true)}
                    disabled={busyId === p.id}
                    className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1"
                  >
                    <Ban size={12} /> 비공개
                  </button>
                )}
                <button
                  onClick={() => remove(p.id)}
                  disabled={busyId === p.id}
                  className="text-red hover:bg-red/10 rounded-lg p-1.5"
                  title="삭제"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
