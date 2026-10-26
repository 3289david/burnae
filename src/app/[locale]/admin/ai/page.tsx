"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Play,
  Eye,
  EyeOff,
  Copy,
  Check,
  Cpu,
} from "lucide-react";

interface ApmixKey {
  id: string;
  key: string;
  label: string | null;
  active: boolean;
  fail_count: number;
  last_error: string | null;
  last_used_at: string | null;
  created_at: string;
}

export default function AdminAiSettingsPage() {
  const [keys, setKeys] = useState<ApmixKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [rawInput, setRawInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  async function loadKeys() {
    try {
      const res = await fetch("/api/admin/ai-keys");
      const data = await res.json();
      if (data.keys) {
        setKeys(data.keys);
      }
    } catch (err) {
      console.error("키 목록 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

  async function handleAddKeys(e: React.FormEvent) {
    e.preventDefault();
    if (!rawInput.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawKeys: rawInput, label: labelInput }),
      });
      const data = await res.json();
      if (data.ok) {
        setRawInput("");
        setLabelInput("");
        await loadKeys();
      } else {
        alert(data.error || "추가 실패");
      }
    } catch (err) {
      alert("키 추가 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(keyItem: ApmixKey) {
    try {
      const res = await fetch(`/api/admin/ai-keys/${keyItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !keyItem.active }),
      });
      const data = await res.json();
      if (data.ok) {
        await loadKeys();
      }
    } catch (err) {
      alert("상태 변경 실패");
    }
  }

  async function handleResetFail(keyItem: ApmixKey) {
    try {
      const res = await fetch(`/api/admin/ai-keys/${keyItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetFail: true }),
      });
      const data = await res.json();
      if (data.ok) {
        await loadKeys();
      }
    } catch (err) {
      alert("오류 상태 초기화 실패");
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm("정말 이 API 키를 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/ai-keys/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        await loadKeys();
      }
    } catch (err) {
      alert("키 삭제 실패");
    }
  }

  async function handleTestKey(keyItem: ApmixKey) {
    setTestingId(keyItem.id);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/ai-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: keyItem.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ id: keyItem.id, ok: true, message: "정상적으로 응답을 받았습니다! (호출 성공)" });
        await loadKeys();
      } else {
        setTestResult({ id: keyItem.id, ok: false, message: data.error || "호출 실패" });
      }
    } catch (err) {
      setTestResult({ id: keyItem.id, ok: false, message: "네트워크 오류" });
    } finally {
      setTestingId(null);
    }
  }

  function toggleReveal(id: string) {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function copyKey(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function maskDisplayKey(rawKey: string, isRevealed: boolean) {
    if (isRevealed) return rawKey;
    if (rawKey.length <= 10) return "••••••••";
    return rawKey.slice(0, 7) + "••••••••" + rawKey.slice(-4);
  }

  const activeCount = keys.filter((k) => k.active).length;
  const errorCount = keys.filter((k) => k.fail_count > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cpu className="text-accent" size={26} /> AI 설정 (apmix.ai)
        </h1>
        <p className="text-sm text-text-dim mt-1">
          서버 대시보드의 AI 탭(일반 대화)에서 사용할 apmix.ai API 키를 관리합니다.
        </p>
      </div>

      {/* 안내 카드 */}
      <div className="card-glow p-5 border-l-4 border-l-accent space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-text">
          <Key size={16} className="text-accent" /> 동작 원리 및 다중 키 전환 (Failover)
        </h2>
        <ul className="text-xs text-text-dim space-y-1 list-disc list-inside">
          <li>
            <strong>일반 AI 대화:</strong> <a href="https://apmix.ai" target="_blank" rel="noreferrer" className="text-accent underline">apmix.ai</a>의 <code>claude-sonnet-4-6-free</code> 모델을 사용합니다.
          </li>
          <li>
            <strong>메이커 모드:</strong> 플러그인 생성 및 서버 자동 제작을 위해 기존 프로바이더 설정을 그대로 유지합니다.
          </li>
          <li>
            <strong>다중 API 키 전환:</strong> 여러 개의 API 키를 등록해두면, 요청 시 첫 번째 키가 할당량 초과나 오류로 실패할 경우 <strong>자동으로 다음 키로 전환</strong>되어 중단 없이 답변을 생성합니다.
          </li>
        </ul>
      </div>

      {/* 키 요약 정보 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-glow p-4 text-center">
          <div className="text-xs text-text-dim">전체 등록 키</div>
          <div className="text-xl font-bold mt-1">{keys.length}개</div>
        </div>
        <div className="card-glow p-4 text-center">
          <div className="text-xs text-text-dim">활성화된 키</div>
          <div className="text-xl font-bold text-accent mt-1">{activeCount}개</div>
        </div>
        <div className="card-glow p-4 text-center">
          <div className="text-xs text-text-dim">오류 발생 키</div>
          <div className={`text-xl font-bold mt-1 ${errorCount > 0 ? "text-red" : "text-text-dim"}`}>
            {errorCount}개
          </div>
        </div>
      </div>

      {/* API 키 추가 폼 */}
      <div className="card-glow p-5 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Plus size={18} className="text-accent" /> 새 apmix.ai API 키 추가
        </h2>
        <form onSubmit={handleAddKeys} className="space-y-3">
          <div>
            <label className="text-xs text-text-dim block mb-1">
              API 키 (여러 개를 한 번에 추가하려면 한 줄에 하나씩 입력하거나 쉼표로 구분하세요)
            </label>
            <textarea
              className="input w-full font-mono text-xs h-24 resize-y"
              placeholder="apx_live_xxxxxxxxxxxxxxxxxxxxxxxx&#10;apx_live_yyyyyyyyyyyyyyyyyyyyyyyy"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-text-dim block mb-1">메모 / 라벨 (선택 사항)</label>
            <input
              type="text"
              className="input w-full text-xs"
              placeholder="예: 무료 계정 1, 백업 키"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !rawInput.trim()}
            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
          >
            <Plus size={14} /> {submitting ? "추가 중..." : "API 키 추가하기"}
          </button>
        </form>
      </div>

      {/* 키 목록 */}
      <div className="card-glow p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Key size={18} className="text-accent" /> 등록된 API 키 목록
          </h2>
          <button
            type="button"
            onClick={loadKeys}
            className="text-xs text-text-dim hover:text-text flex items-center gap-1"
          >
            <RefreshCw size={12} /> 새로고침
          </button>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center justify-between ${
              testResult.ok ? "bg-accent/10 border border-accent text-accent" : "bg-red/10 border border-red text-red"
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{testResult.message}</span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-text-dim hover:text-text font-bold text-sm ml-2"
            >
              ×
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-text-dim py-4 text-center">API 키 목록을 불러오는 중...</p>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-text-dim space-y-2">
            <Key size={32} className="mx-auto opacity-30" />
            <p className="text-xs">등록된 apmix.ai API 키가 없습니다.</p>
            <p className="text-[11px]">위의 폼에서 키를 등록하면 즉시 AI 대화에 적용됩니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k, index) => {
              const isRevealed = !!revealedKeys[k.id];
              const isCopied = copiedId === k.id;
              const isTesting = testingId === k.id;

              return (
                <div
                  key={k.id}
                  className={`p-3.5 rounded-lg border transition-colors ${
                    !k.active
                      ? "border-border/40 bg-surface-2/40 opacity-60"
                      : k.fail_count > 0
                      ? "border-red/40 bg-red/5"
                      : "border-border bg-surface-2"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-mono font-bold text-text-dim shrink-0">
                        #{index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-bg px-2 py-0.5 rounded border border-border">
                            {maskDisplayKey(k.key, isRevealed)}
                          </code>
                          <button
                            type="button"
                            onClick={() => toggleReveal(k.id)}
                            className="text-text-dim hover:text-text p-1"
                            title={isRevealed ? "키 가리기" : "키 보기"}
                          >
                            {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyKey(k.id, k.key)}
                            className="text-text-dim hover:text-text p-1"
                            title="복사"
                          >
                            {isCopied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
                          </button>
                          {k.label && (
                            <span className="text-xs text-text-dim font-medium px-2 py-0.5 rounded bg-bg border border-border">
                              {k.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Toggle checked={k.active} onChange={() => toggleActive(k)} />
                        <span className="text-text-dim text-[11px]">{k.active ? "활성" : "비활성"}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTestKey(k)}
                        disabled={isTesting || !k.active}
                        className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1"
                        title="apmix.ai에 테스트 ping을 보내 정상 작동하는지 확인합니다"
                      >
                        <Play size={11} /> {isTesting ? "테스트 중..." : "테스트"}
                      </button>

                      {k.fail_count > 0 && (
                        <button
                          type="button"
                          onClick={() => handleResetFail(k)}
                          className="btn-secondary text-xs px-2.5 py-1 text-accent flex items-center gap-1"
                          title="오류 횟수를 0으로 리셋하고 다시 우선순위로 시도합니다"
                        >
                          <RefreshCw size={11} /> 오류 리셋
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteKey(k.id)}
                        className="text-text-dim hover:text-red p-1 transition-colors"
                        title="키 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* 에러 또는 상태 표시 */}
                  <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-text-dim">
                    <div className="flex items-center gap-2">
                      {k.fail_count > 0 ? (
                        <span className="text-red flex items-center gap-1">
                          <AlertTriangle size={12} />
                          최근 {k.fail_count}회 호출 실패: {k.last_error || "오류 발생"}
                        </span>
                      ) : (
                        <span className="text-accent flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          정상 상태
                        </span>
                      )}
                    </div>
                    <div>
                      {k.last_used_at ? (
                        <span>마지막 사용: {new Date(k.last_used_at).toLocaleString("ko-KR")}</span>
                      ) : (
                        <span>미사용</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
