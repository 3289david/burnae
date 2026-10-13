"use client";

import { useState } from "react";
import { Smartphone, Copy, Check, MessageSquareText } from "lucide-react";

type Step = "idle" | "waiting" | "done";

/** sms: 링크를 누르면 휴대폰의 문자 앱이 수신번호+내용까지 채워진 채로 바로 열린다 (iOS/Android 구분자가 달라서 분기) */
function smsLink(number: string, body: string) {
  const digits = number.replace(/[^0-9]/g, "");
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return `sms:${digits}${isIOS ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

/**
 * OCTOMO 문자 발신(MO) 인증 — 번호를 입력하면 보낼 코드를 발급해주고, 유저가 자기 휴대폰으로
 * 그 코드를 1666-3538로 보낸 뒤 "보냈어요" 버튼을 누르면 실제 수신 여부를 서버가 확인한다.
 */
export default function PhoneVerificationCard({ verified: initialVerified }: { verified: boolean }) {
  const [verified, setVerified] = useState(initialVerified);
  const [step, setStep] = useState<Step>("idle");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [targetNumber, setTargetNumber] = useState("1666-3538");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startVerification() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/phone-verification/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCode(data.code);
      setTargetNumber(data.targetNumber);
      setStep("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }

  async function confirmVerification() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/phone-verification/confirm", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.verified) {
        setError("아직 문자가 확인되지 않았어요. 보낸 뒤 몇 초 기다렸다가 다시 눌러주세요.");
        return;
      }
      setStep("done");
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "확인 실패");
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (verified) {
    return (
      <div className="card-glow p-5 animate-fade-up">
        <p className="font-semibold text-sm flex items-center gap-1.5">
          <Smartphone size={16} className="text-green" /> 휴대폰 인증 완료
        </p>
        <p className="text-xs text-text-dim mt-1">무료 서버를 만들 수 있어요.</p>
      </div>
    );
  }

  return (
    <div className="card-glow p-5 animate-fade-up">
      <p className="font-semibold text-sm flex items-center gap-1.5">
        <Smartphone size={16} className="text-accent" /> 휴대폰 인증
      </p>
      <p className="text-xs text-text-dim mt-1">
        무료 서버를 만들려면 휴대폰 인증이 필요해요. 번호 하나당 계정 하나만 인증할 수 있어요.
      </p>

      {step === "idle" && (
        <div className="mt-3 flex gap-2">
          <input
            type="tel"
            className="input flex-1 text-sm"
            placeholder="01012345678"
            maxLength={11}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <button
            onClick={startVerification}
            disabled={busy || phoneNumber.length !== 11}
            className="btn-primary px-3.5 py-1.5 text-sm shrink-0 active:scale-95 transition-transform disabled:opacity-40"
          >
            인증 시작
          </button>
        </div>
      )}

      {step === "waiting" && code && (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <strong className="text-accent">{targetNumber}</strong>로 아래 코드를 문자로 보내주세요.
          </p>
          <div className="flex items-center gap-2">
            <span className="input flex-1 text-center font-mono text-lg tracking-widest">{code}</span>
            <button
              onClick={copyCode}
              className="btn-secondary px-3 py-1.5 shrink-0 active:scale-95 transition-transform"
              title="복사"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <a
            href={smsLink(targetNumber, code)}
            className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          >
            <MessageSquareText size={14} /> 문자 바로 보내기
          </a>
          <p className="text-xs text-text-dim">누르면 문자 앱이 내용까지 채워진 채로 열려요 — 보내기만 누르면 돼요 (문자 요금이 발생해요).</p>
          <button
            onClick={confirmVerification}
            disabled={busy}
            className="btn-secondary w-full py-2 text-sm active:scale-95 transition-transform disabled:opacity-40"
          >
            {busy ? "확인 중..." : "문자 보냈어요 - 확인하기"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red mt-2">{error}</p>}
    </div>
  );
}
