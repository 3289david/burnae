"use client";

import { useEffect, useState } from "react";
import { KeyRound, Copy, Check, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";

interface TokenInfo {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Render/Railway/Fly.io 스타일 개인 API 토큰 관리 — 계정 설정에서 발급하고, CLI/스크립트에서
 * Authorization: Bearer <토큰>으로 /api/v1/* 공개 API를 쓸 수 있다. */
export default function ApiTokensCard() {
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/account/api-tokens")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTokens);
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/account/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFreshToken(data.token);
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("이 토큰을 삭제할까요? 이 토큰을 쓰는 스크립트는 바로 동작을 멈춰요.")) return;
    await fetch(`/api/account/api-tokens/${id}`, { method: "DELETE" });
    load();
  }

  function copy() {
    if (!freshToken) return;
    navigator.clipboard.writeText(freshToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <KeyRound size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">API 토큰</h3>
          <p className="text-xs text-text-dim">
            CLI나 스크립트에서 내 서버를 조회·조작할 수 있어요.{" "}
            <Link href="/docs/api" className="text-accent hover:underline">API 문서 보기</Link>
          </p>
        </div>
      </div>

      {freshToken && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-3.5 space-y-2 text-xs animate-toast-in">
          <p className="text-text-dim">
            이 토큰은 지금만 보여요 — 안전한 곳에 저장하세요. 다시 조회할 수 없어요.
          </p>
          <button
            onClick={copy}
            className="w-full flex items-center justify-between gap-2 font-mono bg-surface-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2/70"
          >
            <span className="truncate">{freshToken}</span>
            {copied ? <Check size={13} className="text-green shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
          </button>
          <button onClick={() => setFreshToken(null)} className="text-text-dim hover:text-text">
            닫기
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {tokens?.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-xs">
            <div className="min-w-0">
              <p className="font-medium truncate">{t.name}</p>
              <p className="text-text-dim font-mono mt-0.5">
                {t.prefix}... · {t.lastUsedAt ? `최근 사용 ${new Date(t.lastUsedAt).toLocaleDateString("ko-KR")}` : "아직 사용 안 함"}
              </p>
            </div>
            <button onClick={() => revoke(t.id)} className="text-red hover:underline shrink-0 flex items-center gap-1">
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        ))}
        {tokens?.length === 0 && <p className="text-xs text-text-dim">아직 만든 토큰이 없어요.</p>}
      </div>

      <form onSubmit={create} className="flex gap-2 pt-2 border-t border-border">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="토큰 이름 (예: 배포 스크립트)"
          className="input flex-1 text-sm"
        />
        <button type="submit" disabled={creating || !name.trim()} className="btn-secondary px-3.5 py-1.5 text-sm shrink-0">
          발급
        </button>
      </form>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
