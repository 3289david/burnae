"use client";

import { useEffect, useState } from "react";

interface Coupon {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED_KRW";
  discountValue: number;
  usedCount: number;
  maxUses: number | null;
  active: boolean;
}
interface Event {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  coupon: Coupon | null;
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const [couponForm, setCouponForm] = useState({ code: "", discountType: "PERCENT" as const, discountValue: 10, maxUses: "" });
  const [eventForm, setEventForm] = useState({
    title: "", description: "", couponId: "",
    startsAt: toLocalInput(new Date()),
    endsAt: toLocalInput(new Date(Date.now() + 7 * 86400000)),
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [e, c] = await Promise.all([
      fetch("/api/admin/events").then((r) => r.json()),
      fetch("/api/admin/coupons").then((r) => r.json()),
    ]);
    setEvents(e);
    setCoupons(c);
  }
  useEffect(() => { load(); }, []);

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: couponForm.code,
        discountType: couponForm.discountType,
        discountValue: couponForm.discountValue,
        maxUses: couponForm.maxUses ? Number(couponForm.maxUses) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setCouponForm({ code: "", discountType: "PERCENT", discountValue: 10, maxUses: "" });
    await load();
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: eventForm.title,
        description: eventForm.description,
        couponId: eventForm.couponId || undefined,
        startsAt: new Date(eventForm.startsAt).toISOString(),
        endsAt: new Date(eventForm.endsAt).toISOString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setEventForm({ ...eventForm, title: "", description: "" });
    await load();
  }

  async function endEvent(id: string) {
    await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">이벤트</h1>
        <div className="mt-4 space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{ev.title} {!ev.active && <span className="text-text-dim text-xs">(종료됨)</span>}</p>
                <p className="text-xs text-text-dim mt-0.5">
                  {new Date(ev.startsAt).toLocaleDateString("ko-KR")} ~ {new Date(ev.endsAt).toLocaleDateString("ko-KR")}
                  {ev.coupon && ` · 쿠폰 ${ev.coupon.code}`}
                </p>
              </div>
              {ev.active && <button onClick={() => endEvent(ev.id)} className="btn-secondary px-3 py-1.5 text-sm">종료</button>}
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-text-dim">등록된 이벤트가 없어요.</p>}
        </div>

        <form onSubmit={createEvent} className="card p-5 mt-4 space-y-3">
          <h2 className="font-semibold">새 이벤트</h2>
          <input className="input w-full" placeholder="제목" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
          <textarea className="input w-full" placeholder="설명" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} required />
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-text-dim">시작</label>
              <input type="datetime-local" className="input w-full mt-1" value={eventForm.startsAt} onChange={(e) => setEventForm({ ...eventForm, startsAt: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-text-dim">종료</label>
              <input type="datetime-local" className="input w-full mt-1" value={eventForm.endsAt} onChange={(e) => setEventForm({ ...eventForm, endsAt: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-text-dim">연결 쿠폰 (선택)</label>
              <select className="input w-full mt-1" value={eventForm.couponId} onChange={(e) => setEventForm({ ...eventForm, couponId: e.target.value })}>
                <option value="">없음</option>
                {coupons.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary px-5 py-2.5">이벤트 만들기</button>
        </form>
      </div>

      <div>
        <h1 className="text-2xl font-bold">쿠폰</h1>
        <div className="mt-4 space-y-2">
          {coupons.map((c) => (
            <div key={c.id} className="card p-4 text-sm flex justify-between">
              <span className="font-mono">{c.code}</span>
              <span className="text-text-dim">
                {c.discountType === "PERCENT" ? `${c.discountValue}%` : `${c.discountValue.toLocaleString()}원`} 할인 ·
                {" "}{c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""}회 사용
              </span>
            </div>
          ))}
        </div>

        <form onSubmit={createCoupon} className="card p-5 mt-4 space-y-3">
          <h2 className="font-semibold">새 쿠폰</h2>
          <div className="grid sm:grid-cols-4 gap-3">
            <input className="input" placeholder="코드 (예: SUMMER10)" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} required />
            <select className="input" value={couponForm.discountType} onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value as "PERCENT" })}>
              <option value="PERCENT">퍼센트 할인</option>
              <option value="FIXED_KRW">정액 할인</option>
            </select>
            <input type="number" className="input" placeholder="할인값" value={couponForm.discountValue} onChange={(e) => setCouponForm({ ...couponForm, discountValue: Number(e.target.value) })} />
            <input type="number" className="input" placeholder="최대 사용횟수 (선택)" value={couponForm.maxUses} onChange={(e) => setCouponForm({ ...couponForm, maxUses: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary px-5 py-2.5">쿠폰 만들기</button>
        </form>
      </div>

      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
