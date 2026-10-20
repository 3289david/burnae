"use client";

import { useEffect, useState } from "react";
import { Activity, Check, Copy } from "lucide-react";

/** Render/Railway 스타일 공개 상태 페이지. 헬스체크가 켜져 있어야 의미 있다(가동률/장애 이력이
 * 헬스체크 크론이 쌓는 UptimeIncident 기반이라서). 링크는 플레이어/고객에게 그대로 공유할 수 있다. */
export default function StatusPageCard({ serverId }: { serverId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/status-page`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setEnabled(!!data.statusPageEnabled);
          setSlug(data.statusPageSlug ?? null);
        }
        setLoaded(true);
      });
  }, [serverId]);

  async function toggle() {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/status-page`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnabled(!!data.statusPageEnabled);
        setSlug(data.statusPageSlug ?? null);
      }
    } finally {
      setSaving(false);
    }
  }

  function copyLink() {
    if (!slug) return;
    navigator.clipboard.writeText(`${window.location.origin}/status/${slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!loaded) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <Activity size={15} className="text-accent" />
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">공개 상태 페이지</h3>
          <p className="text-xs text-text-dim">가동률과 장애 이력을 보여주는 링크를 플레이어에게 공유할 수 있어요.</p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border ${
            enabled ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-text-dim"
          }`}
        >
          {enabled ? "켜짐" : "꺼짐"}
        </button>
      </div>

      {enabled && slug && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <code className="text-xs text-text-dim flex-1 truncate">/status/{slug}</code>
          <button onClick={copyLink} className="shrink-0 text-xs text-accent flex items-center gap-1">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      )}
    </div>
  );
}
