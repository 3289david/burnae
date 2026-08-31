"use client";

import { useEffect, useState } from "react";
import { Info, AlertTriangle, Siren, X } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  body: string;
  level: "INFO" | "WARNING" | "CRITICAL";
}

const STYLE: Record<Announcement["level"], { icon: typeof Info; classes: string }> = {
  INFO: { icon: Info, classes: "bg-blue/10 border-blue/30 text-blue" },
  WARNING: { icon: AlertTriangle, classes: "bg-yellow/10 border-yellow/30 text-yellow" },
  CRITICAL: { icon: Siren, classes: "bg-red/10 border-red/30 text-red" },
};

const DISMISSED_KEY = "burnae_dismissed_announcements";

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function AnnouncementBanner({ maxWidthClass = "max-w-5xl" }: { maxWidthClass?: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((data: Announcement[]) => {
        const dismissed = getDismissed();
        setAnnouncements(data.filter((a) => !dismissed.includes(a.id)));
      })
      .catch(() => {});
  }, []);

  function dismiss(id: string) {
    const dismissed = getDismissed();
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, id]));
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  }

  if (announcements.length === 0) return null;

  return (
    <div className={`${maxWidthClass} mx-auto px-4 sm:px-6 pt-4 space-y-2`}>
      {announcements.map((a) => {
        const { icon: Icon, classes } = STYLE[a.level];
        return (
          <div key={a.id} className={`animate-toast-in border rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm ${classes}`}>
            <Icon size={16} className="shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-text">
              <p className="font-semibold">{a.title}</p>
              <p className="text-text-dim mt-0.5">{a.body}</p>
            </div>
            <button onClick={() => dismiss(a.id)} className="text-text-dim hover:text-text shrink-0 active:scale-90 transition-transform" aria-label="닫기">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
