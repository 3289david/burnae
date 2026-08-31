"use client";

import { useState } from "react";
import { Copy, Check, QrCode } from "lucide-react";
import QRCode from "qrcode";

/** 접속 주소 원클릭 복사 + QR코드 보기 — 모바일에서 친구에게 주소 공유할 때 쓰기 쉽게 */
export default function AddressActions({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 조용히 무시
    }
  }

  async function toggleQr() {
    if (qr) {
      setQr(null);
      return;
    }
    const dataUrl = await QRCode.toDataURL(address, { margin: 1, width: 160 });
    setQr(dataUrl);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        title="주소 복사"
        className="text-text-dim hover:text-text shrink-0 active:scale-90 transition-transform"
      >
        {copied ? <Check size={14} className="text-green animate-toast-in" /> : <Copy size={14} />}
      </button>
      <button
        type="button"
        onClick={toggleQr}
        title="QR코드 보기"
        className="text-text-dim hover:text-text shrink-0 active:scale-90 transition-transform"
      >
        <QrCode size={14} />
      </button>
      {qr && (
        <div className="animate-toast-in absolute z-10 mt-2 p-2 bg-surface-2 border border-border rounded-xl shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- 런타임에 생성되는 data URL이라 next/image 최적화 대상이 아님 */}
          <img src={qr} alt={address} width={160} height={160} />
        </div>
      )}
    </div>
  );
}
