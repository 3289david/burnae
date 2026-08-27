"use client";

import { useEffect, useState } from "react";

interface Member {
  id: string;
  role: "ADMIN" | "MODERATOR" | "DEVELOPER" | "VIEWER";
  user: { id: string; name: string; email: string };
}
interface Owner {
  id: string;
  name: string;
  email: string;
}

const ROLE_LABEL: Record<Member["role"], string> = {
  ADMIN: "관리자",
  MODERATOR: "운영자",
  DEVELOPER: "개발자",
  VIEWER: "뷰어",
};

export default function TeamTab({ serverId, isOwner }: { serverId: string; isOwner: boolean }) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/servers/${serverId}/members`);
    if (res.ok) {
      const data = await res.json();
      setOwner(data.owner);
      setMembers(data.members);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "초대 실패");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(memberId: string, newRole: Member["role"]) {
    await fetch(`/api/servers/${serverId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  async function remove(memberId: string) {
    if (!confirm("이 팀원을 제거할까요?")) return;
    await fetch(`/api/servers/${serverId}/members/${memberId}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="card-glow p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h3 className="font-semibold text-sm">팀원</h3>
        </div>
        <div className="divide-y divide-border">
          {owner && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate">{owner.name} ({owner.email})</span>
              <span className="text-xs text-text-dim shrink-0">소유자</span>
            </div>
          )}
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate">{m.user.name} ({m.user.email})</span>
              {isOwner ? (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    className="input text-xs py-1"
                    value={m.role}
                    onChange={(e) => changeRole(m.id, e.target.value as Member["role"])}
                  >
                    {Object.entries(ROLE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <button onClick={() => remove(m.id)} className="text-xs text-red">제거</button>
                </div>
              ) : (
                <span className="text-xs text-text-dim">{ROLE_LABEL[m.role]}</span>
              )}
            </div>
          ))}
          {members.length === 0 && <p className="px-4 py-3 text-sm text-text-dim">아직 초대한 팀원이 없어요.</p>}
        </div>
      </div>

      {isOwner && (
        <form onSubmit={invite} className="card-glow p-5 space-y-3">
          <h3 className="font-semibold text-sm">팀원 초대</h3>
          <p className="text-xs text-text-dim">초대하려는 사람이 먼저 burnae.kr에 가입돼있어야 해요.</p>
          <div className="flex gap-2">
            <input
              type="email"
              required
              className="input flex-1"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Member["role"])}>
              {Object.entries(ROLE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">초대</button>
          </div>
          {error && <p className="text-sm text-red">{error}</p>}
        </form>
      )}
    </div>
  );
}
