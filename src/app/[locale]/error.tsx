"use client";

import EmptyState from "@/components/EmptyState";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <EmptyState art="error" title="문제가 생겼어요" desc="잠시 후 다시 시도해 주세요.">
        <button onClick={reset} className="btn-light px-6 py-3 text-sm">다시 시도</button>
      </EmptyState>
    </div>
  );
}
