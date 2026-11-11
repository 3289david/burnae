"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { supportsSsh } from "@/lib/sshSupport";
import Toggle from "@/components/Toggle";
import AddressActions from "./AddressActions";
import CustomDomainCard from "./CustomDomainCard";
import SftpCard from "./SftpCard";
import type { ServerInfo } from "./ServerDetailClient";

/** 주소/도메인/SFTP/SSH처럼 "이 서버에 어떻게 접속하는가"에 관한 모든 걸 한 곳에 모은다 —
 * 예전엔 Overview 탭(주소 목록/추가)과 설정 탭(커스텀 도메인/SFTP)에 나뉘어 있었다. */
export default function NetworkTab({ server }: { server: ServerInfo }) {
  const [subdomains, setSubdomains] = useState(server.subdomains);
  const [newName, setNewName] = useState("");
  const [subError, setSubError] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(server.maintenanceModeEnabled);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);

  async function toggleMaintenanceMode(next: boolean) {
    setMaintenanceBusy(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/maintenance-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) setMaintenanceMode(next);
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function addSubdomain(e: React.FormEvent) {
    e.preventDefault();
    setSubError(null);
    setSubLoading(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/subdomains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubdomains((prev) => [...prev, data]);
      setNewName("");
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setSubLoading(false);
    }
  }

  async function removeSubdomain(id: string) {
    if (!confirm("이 주소를 삭제할까요?")) return;
    await fetch(`/api/servers/${server.id}/subdomains/${id}`, { method: "DELETE" });
    setSubdomains((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="tab-grid animate-fade-up">
      <div className="card-glow p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">접속 주소</h3>
          <span className="text-xs text-text-dim">{subdomains.length} / {2 + server.extraSubdomainSlots}</span>
        </div>
        <div className="space-y-2">
          {subdomains.map((s) => (
            <div key={s.id} className="relative flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-mono min-w-0 break-all">
                {s.subdomain}.{server.subdomainZone}
                {" "}{s.isPrimary && <span className="text-text-dim text-xs">(기본)</span>}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <AddressActions address={`${s.subdomain}.${server.subdomainZone}`} />
                {server.isOwner && (
                  <button onClick={() => removeSubdomain(s.id)} className="text-red text-xs hover:underline active:scale-95 transition-transform">삭제</button>
                )}
              </div>
            </div>
          ))}
          {subdomains.length === 0 && <p className="text-sm text-text-dim">주소 준비 중이에요.</p>}
        </div>

        {server.isOwner && subdomains.length < 2 + server.extraSubdomainSlots && (
          <form onSubmit={addSubdomain} className="flex gap-2 mt-3 pt-3 border-t border-border">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: play"
              className="input flex-1 text-sm"
            />
            <button type="submit" disabled={subLoading || !newName} className="btn-secondary px-3 py-1.5 text-sm active:scale-95 transition-transform">
              주소 추가
            </button>
          </form>
        )}
        {subError && <p className="text-xs text-red mt-2">{subError}</p>}
      </div>

      {server.isOwner && server.templateCategory !== "MINECRAFT" && (
        <div className="card-glow p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Wrench size={18} className="text-accent shrink-0" />
              <div className="min-w-0">
                <h3 className="font-semibold text-sm">유지보수 모드</h3>
                <p className="text-xs text-text-dim mt-0.5">켜면 주소로 들어온 방문자에게 실제 서버 대신 "점검 중" 페이지를 보여줘요.</p>
              </div>
            </div>
            <Toggle checked={maintenanceMode} onChange={toggleMaintenanceMode} disabled={maintenanceBusy} />
          </div>
        </div>
      )}

      <CustomDomainCard serverId={server.id} isOwner={server.isOwner} initial={server.customDomains} />

      {supportsSsh(server.templateKey) && server.accessSecret && server.allocationIp && server.sshPort && (
        <div className="card-glow p-5">
          <h3 className="font-semibold mb-3">SSH 접속</h3>
          <p className="text-xs text-text-dim mb-3">
            터미널에서 <code className="font-mono bg-surface-2 rounded px-1">ssh burnae.kr</code> — 계정 설정에서 발급한 코드로 로그인 후 이 서버 선택.
          </p>
          <div className="mt-3 bg-black/30 rounded-lg px-3 py-2 font-mono text-xs select-all">
            ssh burnae.kr
          </div>
          <details className="mt-3 text-xs">
            <summary className="text-text-dim cursor-pointer hover:text-text">고급: scp/rsync 등 직접 접속이 필요하면</summary>
            <div className="grid grid-cols-2 gap-y-2 mt-2">
              <span className="text-text-dim">호스트</span>
              <span className="font-mono select-all">{server.allocationIp}</span>
              <span className="text-text-dim">포트</span>
              <span className="font-mono select-all">{server.sshPort}</span>
              <span className="text-text-dim">사용자명</span>
              <span className="font-mono select-all">container</span>
              <span className="text-text-dim">비밀번호</span>
              <span className="font-mono select-all">{server.accessSecret}</span>
            </div>
          </details>
        </div>
      )}

      {server.isOwner && <SftpCard serverId={server.id} />}
    </div>
  );
}
