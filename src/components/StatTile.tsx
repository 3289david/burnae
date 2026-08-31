"use client";

import CountUp from "@/components/CountUp";

const FORMATTERS: Record<string, (n: number) => string> = {
  percent: (n) => `${n.toFixed(1)}%`,
  gb: (n) => `${n.toFixed(1)}GB`,
  krw: (n) => `${Math.round(n).toLocaleString()}원`,
};

/**
 * 서버 컴포넌트에서 CountUp의 format을 함수로 그대로 넘기면 "함수는 클라이언트 컴포넌트로
 * 직렬화될 수 없다" 에러가 난다 — 그래서 함수 대신 이 문자열 키(unit)만 서버→클라이언트로
 * 넘기고, 실제 포맷 함수는 여기(클라이언트 컴포넌트) 안에서 만들어 CountUp에 넘긴다.
 */
export default function StatTile({ label, value, unit }: { label: string; value: number; unit?: "percent" | "gb" | "krw" }) {
  return (
    <div className="card-glow p-4 animate-fade-up">
      <div className="text-xs text-text-dim">{label}</div>
      <div className="mt-1 text-xl font-bold">
        <CountUp value={value} format={unit ? FORMATTERS[unit] : undefined} />
      </div>
    </div>
  );
}
