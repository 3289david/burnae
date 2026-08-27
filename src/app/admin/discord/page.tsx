"use client";

import { useEffect, useState } from "react";

interface BotSettings {
  verifiedRoleId: string | null;
  purchaserRoleId: string | null;
  subscriberRoleId: string | null;
  rulesTitle: string;
  rulesContent: string;
  rulesChannelId: string | null;
  linktreeTitle: string;
  linktreeChannelId: string | null;
  statusBoardChannelId: string | null;
  announcementChannelId: string | null;
  logChannelId: string | null;
}

interface LinktreeLink {
  id: string;
  label: string;
  url: string;
  emoji: string | null;
  sortOrder: number;
  active: boolean;
}

const ROLE_FIELDS: { key: keyof BotSettings; label: string; hint: string }[] = [
  { key: "verifiedRoleId", label: "인증 완료 역할 ID", hint: "규칙 임베드의 ✅ 인증하기 버튼을 누르면 부여" },
  { key: "purchaserRoleId", label: "구매자 역할 ID", hint: "서버(유료/포인트 교환 모두)를 만들면 자동 부여" },
  { key: "subscriberRoleId", label: "공지 알림 역할 ID", hint: "/알림설정 버튼으로 유저가 스스로 켜고 끔" },
];

const CHANNEL_FIELDS: { key: keyof BotSettings; label: string; hint: string }[] = [
  { key: "rulesChannelId", label: "규칙 채널 ID", hint: "규칙+인증 버튼 임베드가 여기 올라가요" },
  { key: "linktreeChannelId", label: "링크트리 채널 ID", hint: "아래 링크 목록이 임베드로 여기 올라가요" },
  { key: "statusBoardChannelId", label: "실시간 현황판 채널 ID", hint: "1분마다 자동 갱신되는 집계 통계 임베드" },
  { key: "announcementChannelId", label: "공지사항 채널 ID", hint: "관리자 공지 등록 시 자동으로 임베드 발송" },
  { key: "logChannelId", label: "운영 로그 채널 ID", hint: "서버 생성/삭제/이전 기록" },
];

const emptyLink = { label: "", url: "", emoji: "", sortOrder: 0 };

export default function AdminDiscordPage() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [links, setLinks] = useState<LinktreeLink[]>([]);
  const [linkForm, setLinkForm] = useState(emptyLink);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/bot-settings").then((r) => r.json()).then(setSettings);
    loadLinks();
  }, []);

  async function loadLinks() {
    const res = await fetch("/api/admin/linktree");
    if (res.ok) setLinks(await res.json());
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/bot-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkError(null);
    try {
      const res = await fetch("/api/admin/linktree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...linkForm, emoji: linkForm.emoji || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLinkForm(emptyLink);
      await loadLinks();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "추가 실패");
    }
  }

  async function toggleLinkActive(id: string, active: boolean) {
    await fetch(`/api/admin/linktree/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await loadLinks();
  }

  async function removeLink(id: string) {
    if (!confirm("이 링크를 삭제할까요?")) return;
    await fetch(`/api/admin/linktree/${id}`, { method: "DELETE" });
    await loadLinks();
  }

  if (!settings) return <p className="text-text-dim text-sm">불러오는 중...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">디스코드 봇</h1>
        <p className="text-sm text-text-dim mt-1">
          역할/채널은 디스코드 서버 설정에서 ID를 복사해 입력하세요(개발자 모드 켜고 우클릭 → ID 복사).
          저장하면 규칙/링크트리 임베드가 즉시 갱신돼요.
        </p>
      </div>

      <div className="card-glow p-5">
        <h2 className="font-semibold mb-3">역할</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {ROLE_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-sm text-text-dim">{f.label}</label>
              <input
                className="input w-full mt-1"
                value={settings[f.key] ?? ""}
                onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value || null })}
              />
              <p className="text-xs text-text-dim mt-1">{f.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card-glow p-5">
        <h2 className="font-semibold mb-3">채널</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {CHANNEL_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-sm text-text-dim">{f.label}</label>
              <input
                className="input w-full mt-1"
                value={settings[f.key] ?? ""}
                onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value || null })}
              />
              <p className="text-xs text-text-dim mt-1">{f.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card-glow p-5 space-y-3">
        <h2 className="font-semibold">규칙</h2>
        <div>
          <label className="text-sm text-text-dim">제목</label>
          <input
            className="input w-full mt-1"
            value={settings.rulesTitle}
            onChange={(e) => setSettings({ ...settings, rulesTitle: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm text-text-dim">내용</label>
          <textarea
            className="input w-full mt-1"
            rows={8}
            maxLength={3800}
            value={settings.rulesContent}
            onChange={(e) => setSettings({ ...settings, rulesContent: e.target.value })}
          />
        </div>
      </div>

      <div className="card-glow p-5">
        <label className="text-sm text-text-dim">링크트리 제목</label>
        <input
          className="input w-full mt-1"
          value={settings.linktreeTitle}
          onChange={(e) => setSettings({ ...settings, linktreeTitle: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary px-5 py-2.5">
          {saving ? "저장 중..." : "저장"}
        </button>
        {saved && <span className="text-sm text-green">저장했어요. 디스코드 메시지도 갱신했어요.</span>}
      </div>

      <div>
        <h2 className="text-xl font-bold">링크트리 목록</h2>
        <div className="mt-3 space-y-2">
          {links.map((l) => (
            <div key={l.id} className="card-glow p-4 flex items-center justify-between flex-wrap gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {l.emoji ? `${l.emoji} ` : ""}
                  {l.label} {!l.active && <span className="text-text-dim text-xs">(비활성)</span>}
                </p>
                <p className="text-xs text-text-dim mt-0.5 truncate">{l.url}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => toggleLinkActive(l.id, !l.active)} className="btn-secondary px-3 py-1.5 text-sm">
                  {l.active ? "비활성화" : "활성화"}
                </button>
                <button onClick={() => removeLink(l.id)} className="text-red text-sm px-2">삭제</button>
              </div>
            </div>
          ))}
          {links.length === 0 && <p className="text-sm text-text-dim">등록된 링크가 없어요.</p>}
        </div>

        <form onSubmit={addLink} className="card-glow p-5 mt-4 space-y-3">
          <h3 className="font-semibold">새 링크 추가</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-text-dim">라벨</label>
              <input
                className="input w-full mt-1"
                value={linkForm.label}
                onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm text-text-dim">URL</label>
              <input
                type="url"
                className="input w-full mt-1"
                value={linkForm.url}
                onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm text-text-dim">이모지 (선택)</label>
              <input
                className="input w-full mt-1"
                placeholder="🔥"
                value={linkForm.emoji}
                onChange={(e) => setLinkForm({ ...linkForm, emoji: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-text-dim">순서</label>
              <input
                type="number"
                className="input w-full mt-1"
                value={linkForm.sortOrder}
                onChange={(e) => setLinkForm({ ...linkForm, sortOrder: Number(e.target.value) })}
              />
            </div>
          </div>
          {linkError && <p className="text-sm text-red">{linkError}</p>}
          <button type="submit" className="btn-primary px-5 py-2.5">추가</button>
        </form>
      </div>
    </div>
  );
}
