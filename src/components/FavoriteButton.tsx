"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Star } from "lucide-react";

export default function FavoriteButton({ serverId, initial }: { serverId: string; initial: boolean }) {
  const [isFavorite, setIsFavorite] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const router = useRouter();

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !isFavorite;
    setIsFavorite(next);
    setPopKey((k) => k + 1);
    try {
      const res = await fetch(`/api/servers/${serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setIsFavorite(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      className={`shrink-0 p-1 rounded-full transition-colors active:scale-90 ${isFavorite ? "text-yellow" : "text-text-dim hover:text-yellow"}`}
    >
      <Star key={popKey} size={16} fill={isFavorite ? "currentColor" : "none"} className={popKey > 0 ? "animate-star-pop" : ""} />
    </button>
  );
}
