"use client";

import { useEffect, useState } from "react";
import { HardDriveDownload, Check, Copy } from "lucide-react";

interface SftpInfo {
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
}

export default function SftpCard({ serverId }: { serverId: string }) {
  const [info, setInfo] = useState<SftpInfo | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(key: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    });
  }

  useEffect(() => {
    fetch(`/api/servers/${serverId}/sftp`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => {});
  }, [serverId]);

  async function resetPassword() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/sftp`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPassword(data.password);
      setInfo((prev) => (prev ? { ...prev, hasPassword: true } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호 재발급 실패");
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;

  return (
    <div className="card-glow p-5 space-y-3 animate-fade-up">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <HardDriveDownload size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">SFTP 접속</h3>
          <p className="text-xs text-text-dim">에디터·rsync·git으로 파일에 직접 접근할 수 있어요.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-y-1.5 text-sm items-center">
        <span className="text-text-dim">호스트</span>
        <button onClick={() => copy("host", info.host)} className="font-mono text-left inline-flex items-center gap-1.5 hover:text-accent active:scale-95 transition-transform w-fit">
          {info.host} {copied === "host" ? <Check size={12} className="text-green animate-toast-in" /> : <Copy size={11} className="text-text-dim" />}
        </button>
        <span className="text-text-dim">포트</span>
        <button onClick={() => copy("port", String(info.port))} className="font-mono text-left inline-flex items-center gap-1.5 hover:text-accent active:scale-95 transition-transform w-fit">
          {info.port} {copied === "port" ? <Check size={12} className="text-green animate-toast-in" /> : <Copy size={11} className="text-text-dim" />}
        </button>
        <span className="text-text-dim">사용자명</span>
        <button onClick={() => copy("username", info.username)} className="font-mono text-left break-all inline-flex items-center gap-1.5 hover:text-accent active:scale-95 transition-transform w-fit">
          {info.username} {copied === "username" ? <Check size={12} className="text-green animate-toast-in" /> : <Copy size={11} className="text-text-dim shrink-0" />}
        </button>
        {password && (
          <>
            <span className="text-text-dim">비밀번호</span>
            <span className="font-mono select-all animate-toast-in">{password}</span>
          </>
        )}
      </div>

      <button onClick={resetPassword} disabled={busy} className="btn-secondary px-3.5 py-2 text-xs active:scale-95 transition-transform">
        {busy ? "발급 중..." : info.hasPassword ? "비밀번호 재발급" : "비밀번호 발급"}
      </button>
      {!password && info.hasPassword && (
        <p className="text-xs text-text-dim">보안을 위해 비밀번호는 발급 시 한 번만 보여줘요. 잊었다면 다시 재발급하세요.</p>
      )}
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
