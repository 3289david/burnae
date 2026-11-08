"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import Toggle from "@/components/Toggle";
import type { ServerInfo } from "./ServerDetailClient";

export default function DangerZoneTab({ server }: { server: ServerInfo }) {
  const router = useRouter();
  const isMinecraft = server.templateCategory === "MINECRAFT";
  const [deleting, setDeleting] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);
  const [reinstallDone, setReinstallDone] = useState(false);
  const [keepBackup, setKeepBackup] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reinstall() {
    if (!confirm("서버를 재설치할까요? 설치 스크립트를 다시 실행해 초기 상태로 되돌립니다. 파일 대부분이 사라질 수 있어요.")) return;
    setReinstalling(true);
    setReinstallDone(false);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${server.id}/reinstall`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "재설치 실패");
      setReinstallDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setReinstalling(false);
    }
  }

  async function deleteServer() {
    if (!confirm("정말 서버를 삭제할까요? 서버와 모든 파일이 삭제됩니다.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createFinalBackup: keepBackup }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="card-glow p-5 space-y-2">
        <h3 className="font-semibold text-sm">서버 재설치</h3>
        <p className="text-xs text-text-dim">
          {isMinecraft
            ? "서버를 처음 만들 때 상태로 다시 설치해요. 월드 등 대부분의 파일이 사라질 수 있어요."
            : "서버를 처음 만들 때 상태로 다시 설치해요. GitHub 저장소를 새로 연결하거나 설치가 꼬였을 때 유용해요. 대부분의 파일이 사라질 수 있어요."}
        </p>
        <button onClick={reinstall} disabled={reinstalling} className="btn-secondary px-4 py-2 text-sm active:scale-95 transition-transform">
          {reinstalling ? "재설치 중..." : "재설치"}
        </button>
        {reinstallDone && <p className="text-sm text-green">재설치를 시작했어요. 콘솔에서 진행 상황을 확인하세요.</p>}
      </div>

      <div className="card-glow p-5 border-red">
        <h3 className="font-semibold text-red">위험 구역</h3>
        <p className="text-sm text-text-dim mt-1">서버를 삭제하면 되돌릴 수 없습니다.</p>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <Toggle checked={keepBackup} onChange={setKeepBackup} size="sm" />
          삭제 전 마지막 백업 생성
        </label>
        <button onClick={deleteServer} disabled={deleting} className="btn-secondary text-red px-4 py-2 text-sm mt-3 active:scale-95 transition-transform">
          {deleting ? "삭제 중..." : "서버 삭제"}
        </button>
      </div>

      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
