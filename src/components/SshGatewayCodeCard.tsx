"use client";

import { useEffect, useState } from "react";
import { Terminal, Copy, Check } from "lucide-react";

interface IssuedCode {
  code: string;
  expiresAt: string;
}

/** ssh burnae.kr로 들어가면 서버 목록을 보고 바로 시작/정지할 수 있는 관리 게이트웨이 —
 * 계정에 SSH 키 체계가 없어서, 비밀번호 자리에 여기서 발급한 1회용 코드를 입력하는 방식. */
export default function SshGatewayCodeCard() {
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!issued) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(issued.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [issued]);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/ssh-gateway-code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIssued(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "발급 실패");
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!issued) return;
    navigator.clipboard.writeText(issued.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const expired = issued && remaining <= 0;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <Terminal size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">터미널로 서버 관리</h3>
          <p className="text-xs text-text-dim">
            <code className="font-mono">ssh burnae.kr</code> 로 접속해서 서버를 보고 시작/정지할 수 있어요.
          </p>
        </div>
      </div>

      {issued && !expired && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-3.5 space-y-2 text-xs animate-toast-in">
          <p className="text-text-dim">
            <code className="font-mono">ssh burnae.kr</code> 접속 후 비밀번호 자리에 이 코드를 입력하세요 — {remaining}초 후 만료.
          </p>
          <button
            onClick={copy}
            className="w-full flex items-center justify-between gap-2 font-mono text-base bg-surface-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2/70 tracking-widest"
          >
            <span>{issued.code}</span>
            {copied ? <Check size={13} className="text-green shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
          </button>
        </div>
      )}
      {expired && <p className="text-xs text-text-dim">코드가 만료됐어요. 다시 발급해주세요.</p>}

      <button onClick={issue} disabled={busy} className="btn-secondary w-full py-2 text-sm">
        {busy ? "발급 중..." : issued ? "새 코드 발급" : "로그인 코드 발급"}
      </button>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
