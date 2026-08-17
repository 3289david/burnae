"use client";

import { useEffect, useState } from "react";

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

  async function load() {
    const res = await fetch("/api/admin/bank-account");
    setAccounts(await res.json());
  }
  useEffect(() => { load(); }, []);

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

  return (
    <div>
      <h1 className="text-2xl font-bold">결제 계좌</h1>
      <p className="text-sm text-text-dim mt-1">
        고객 결제 화면에 표시될 계좌예요. <strong>반드시 페이싱크(paysync.kr) 대시보드에 등록해
        입출금 SMS 알림을 연동해둔 계좌</strong>와 동일해야 입금이 자동으로 확인됩니다.
      </p>

      <div className="mt-6 space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="card p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm">{a.bankName} {a.accountNumber}</p>
              <p className="text-xs text-text-dim">{a.accountHolder}</p>
            </div>
            {a.active && <span className="text-xs text-green">사용 중</span>}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="card p-5 mt-6 space-y-3">
        <h2 className="font-semibold">새 계좌 등록 (기존 계좌 대체)</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <F label="은행" value={form.bankName} onChange={(v) => setForm({ ...form, bankName: v })} />
          <F label="계좌번호" value={form.accountNumber} onChange={(v) => setForm({ ...form, accountNumber: v })} />
          <F label="예금주" value={form.accountHolder} onChange={(v) => setForm({ ...form, accountHolder: v })} />
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary px-5 py-2.5">등록</button>
      </form>
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
