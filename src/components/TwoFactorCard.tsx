"use client";

import { useState } from "react";
import { ShieldCheck, Copy, Check } from "lucide-react";

type Step = "idle" | "setup" | "backupCodes" | "disable";

export default function TwoFactorCard({ enabled: initialEnabled }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQrDataUrl(data.qrDataUrl);
      setSecret(data.secret);
      setStep("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "설정 시작 실패");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBackupCodes(data.backupCodes);
      setStep("backupCodes");
      setEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "활성화 실패");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEnabled(false);
      setStep("idle");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "해제 실패");
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (!secret) return;
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (step === "backupCodes") {
    return (
      <div className="card-glow p-5 space-y-3 animate-fade-up">
        <p className="font-semibold text-sm flex items-center gap-1.5">
          <ShieldCheck size={16} className="text-green" /> 2단계 인증이 켜졌어요
        </p>
        <p className="text-xs text-text-dim">
          휴대폰을 잃어버렸을 때 쓸 복구 코드예요. 지금 한 번만 보여지니 안전한 곳에 저장해주세요.
        </p>
        <div className="grid grid-cols-2 gap-1.5 font-mono text-xs bg-surface rounded-lg p-3">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <button
          onClick={() => setStep("idle")}
          className="btn-primary w-full py-2 text-sm active:scale-95 transition-transform"
        >
          저장했어요
        </button>
      </div>
    );
  }

  if (enabled && step !== "disable") {
    return (
      <div className="card-glow p-5 space-y-2 animate-fade-up">
        <p className="font-semibold text-sm flex items-center gap-1.5">
          <ShieldCheck size={16} className="text-green" /> 2단계 인증 사용 중
        </p>
        <p className="text-xs text-text-dim">로그인할 때 인증기 앱의 코드가 추가로 필요해요.</p>
        <button
          onClick={() => setStep("disable")}
          className="btn-secondary px-3.5 py-1.5 text-xs active:scale-95 transition-transform"
        >
          끄기
        </button>
      </div>
    );
  }

  if (step === "disable") {
    return (
      <div className="card-glow p-5 space-y-2 animate-fade-up">
        <p className="font-semibold text-sm">2단계 인증 끄기</p>
        <p className="text-xs text-text-dim">현재 인증기 앱의 코드나 복구 코드를 입력해주세요.</p>
        <input
          type="text"
          className="input w-full text-sm font-mono"
          placeholder="코드"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <div className="flex gap-2">
          <button onClick={disable} disabled={busy || !code} className="btn-primary flex-1 py-2 text-sm active:scale-95 transition-transform disabled:opacity-40">
            {busy ? "확인 중..." : "끄기"}
          </button>
          <button onClick={() => { setStep("idle"); setCode(""); setError(null); }} className="btn-secondary px-4 py-2 text-sm active:scale-95 transition-transform">
            취소
          </button>
        </div>
        {error && <p className="text-xs text-red">{error}</p>}
      </div>
    );
  }

  if (step === "setup") {
    return (
      <div className="card-glow p-5 space-y-3 animate-fade-up">
        <p className="font-semibold text-sm">2단계 인증 설정</p>
        <p className="text-xs text-text-dim">Google Authenticator 등 인증기 앱으로 QR코드를 스캔하세요.</p>
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- 서버에서 만든 data URL이라 next/image 최적화 대상이 아님
          <img src={qrDataUrl} alt="2FA QR코드" className="rounded-lg border border-border mx-auto" width={180} height={180} />
        )}
        {secret && (
          <div className="flex items-center gap-2">
            <span className="input flex-1 text-center font-mono text-xs break-all">{secret}</span>
            <button onClick={copySecret} className="btn-secondary px-3 py-1.5 shrink-0 active:scale-95 transition-transform" title="복사">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
        <input
          type="text"
          inputMode="numeric"
          className="input w-full text-sm font-mono tracking-widest"
          placeholder="앱에 나온 6자리 코드"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button onClick={confirmEnable} disabled={busy || code.length !== 6} className="btn-primary w-full py-2 text-sm active:scale-95 transition-transform disabled:opacity-40">
          {busy ? "확인 중..." : "활성화"}
        </button>
        {error && <p className="text-xs text-red">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card-glow p-5 space-y-2 animate-fade-up">
      <p className="font-semibold text-sm flex items-center gap-1.5">
        <ShieldCheck size={16} className="text-accent" /> 2단계 인증
      </p>
      <p className="text-xs text-text-dim">계정 보안을 강화하려면 인증기 앱 기반 2단계 인증을 켜보세요.</p>
      <button onClick={startSetup} disabled={busy} className="btn-primary px-3.5 py-1.5 text-sm active:scale-95 transition-transform disabled:opacity-40">
        {busy ? "준비 중..." : "설정 시작"}
      </button>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
