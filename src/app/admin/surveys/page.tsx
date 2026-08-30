"use client";

import { useEffect, useState } from "react";

interface SurveyResponse {
  id: string;
  discordTag: string | null;
  content: string;
  reviewed: boolean;
  createdAt: string;
  user: { name: string; email: string } | null;
}

const emptyPoll = { question: "", optionsText: "", channelId: "" };

export default function AdminSurveysPage() {
  const [items, setItems] = useState<SurveyResponse[]>([]);
  const [poll, setPoll] = useState(emptyPoll);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollSaving, setPollSaving] = useState(false);
  const [pollDone, setPollDone] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/surveys");
    if (res.ok) setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function createPoll(e: React.FormEvent) {
    e.preventDefault();
    setPollError(null);
    setPollDone(false);
    setPollSaving(true);
    try {
      const options = poll.optionsText.split(",").map((v) => v.trim()).filter(Boolean);
      const res = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: poll.question, options, channelId: poll.channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      setPoll(emptyPoll);
      setPollDone(true);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setPollSaving(false);
    }
  }

  async function toggleReviewed(id: string, reviewed: boolean) {
    await fetch(`/api/admin/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewed }),
    });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">설문/피드백</h1>

      <form onSubmit={createPoll} className="card-glow p-5 mt-6 space-y-3">
        <h2 className="font-semibold">새 설문(투표) 만들기</h2>
        <p className="text-xs text-text-dim">
          디스코드 채널에 버튼 투표로 올라가서 서버 멤버 누구나 답할 수 있어요.
        </p>
        <div>
          <label className="text-sm text-text-dim">질문</label>
          <input
            className="input w-full mt-1"
            placeholder="예: 다음 이벤트로 뭘 하면 좋을까요?"
            value={poll.question}
            onChange={(e) => setPoll({ ...poll, question: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm text-text-dim">선택지 (쉼표로 구분, 2~10개)</label>
          <input
            className="input w-full mt-1"
            placeholder="예: PVP 대회, 건축 대회, 낚시 대회"
            value={poll.optionsText}
            onChange={(e) => setPoll({ ...poll, optionsText: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm text-text-dim">올릴 채널 ID</label>
          <input
            className="input w-full mt-1"
            placeholder="디스코드 개발자 모드 켜고 채널 우클릭 → ID 복사"
            value={poll.channelId}
            onChange={(e) => setPoll({ ...poll, channelId: e.target.value })}
          />
        </div>
        {pollError && <p className="text-sm text-red">{pollError}</p>}
        {pollDone && <p className="text-sm text-green">설문을 채널에 올렸어요!</p>}
        <button
          type="submit"
          disabled={pollSaving || !poll.question || !poll.channelId}
          className="btn-primary px-5 py-2.5"
        >
          {pollSaving ? "올리는 중..." : "설문 올리기"}
        </button>
      </form>

      <h2 className="text-xl font-bold mt-10">자유 피드백</h2>
      <p className="text-sm text-text-dim mt-1">
        디스코드 <code>/설문</code> 명령어로 받은 자유 응답이에요.
      </p>

      <div className="mt-6 space-y-2">
        {items.map((r, i) => (
          <div
            key={r.id}
            className={`card-glow p-4 animate-fade-up ${r.reviewed ? "opacity-60" : ""}`}
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">{r.content}</p>
                <p className="text-xs text-text-dim mt-1">
                  {r.user ? `${r.user.name} (${r.user.email})` : r.discordTag ?? "익명"} ·{" "}
                  {new Date(r.createdAt).toLocaleString("ko-KR")}
                </p>
              </div>
              <button
                onClick={() => toggleReviewed(r.id, !r.reviewed)}
                className="btn-secondary px-3 py-1.5 text-xs shrink-0"
              >
                {r.reviewed ? "미확인으로" : "확인 완료"}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-dim">아직 받은 응답이 없어요.</p>}
      </div>
    </div>
  );
}
