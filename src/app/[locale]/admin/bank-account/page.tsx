"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

interface Account {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  active: boolean;
  createdAt: string;
}

export default function AdminBankAccountPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ bankName: "", accountNumber: "", accountHolder: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/bank-account");
    setAccounts(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bank-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ bankName: "", accountNumber: "", accountHolder: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  }

  async function testHanaBank() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/hanabank/test");
      const data = await res.json();
      setTestResult(res.ok ? { ok: true } : { ok: false, error: data.error });
    } catch {
      setTestResult({ ok: false, error: "요청 실패" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">결제 계좌</h1>
      <p className="text-sm text-text-dim mt-1">
        고객 결제 화면에 표시될 계좌예요. <strong>반드시 아래 하나은행 API에 등록한 계좌와 동일해야</strong>{" "}
        입금이 자동으로 확인됩니다.
      </p>

      <div className="mt-6 space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="card-glow p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm">{a.bankName} {a.accountNumber}</p>
              <p className="text-xs text-text-dim">{a.accountHolder}</p>
            </div>
            {a.active && <span className="text-xs text-green">사용 중</span>}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="card-glow p-5 mt-6 space-y-3">
        <h2 className="font-semibold">새 계좌 등록 (기존 계좌 대체)</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <F label="은행" value={form.bankName} onChange={(v) => setForm({ ...form, bankName: v })} />
          <F label="계좌번호" value={form.accountNumber} onChange={(v) => setForm({ ...form, accountNumber: v })} />
          <F label="예금주" value={form.accountHolder} onChange={(v) => setForm({ ...form, accountHolder: v })} />
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary px-5 py-2.5">등록</button>
      </form>

      <div className="card-glow p-5 mt-6">
        <h2 className="font-semibold">하나은행 Open API 연동</h2>
        <p className="text-sm text-text-dim mt-1">
          입금 자동확인은 하나은행 거래내역조회 API를 주기적으로 폴링하는 방식이에요. 먼저 하나은행
          오픈API 포털(apiportal.hanabank.com)에서 서비스 등록 후 앱키를 발급받고, 서버의 아웃바운드
          IP를 화이트리스트에 등록한 다음 <code className="mx-1">.env</code>를 채워야 동작해요.
          <strong> 거래내역조회 API는 사업자번호가 연결된 계좌(개인사업자/법인)만 지원</strong>하니,
          결제받을 계좌가 순수 개인계좌라면 이 방식을 쓸 수 없어요.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={testHanaBank} disabled={testing} className="btn-secondary px-4 py-1.5 text-sm">
            {testing ? "확인 중..." : "연동 테스트"}
          </button>
          {testResult?.ok && (
            <span className="text-sm text-green flex items-center gap-1.5">
              <CheckCircle2 size={14} className="shrink-0" /> 정상 연결됐어요.
            </span>
          )}
          {testResult && !testResult.ok && (
            <span className="text-sm text-red flex items-center gap-1.5">
              <AlertTriangle size={14} className="shrink-0" /> {testResult.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm text-text-dim">{label}</label>
      <input className="input w-full mt-1" value={value} onChange={(e) => onChange(e.target.value)} required />
    </div>
  );
}
