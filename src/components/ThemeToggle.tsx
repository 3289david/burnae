"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.getAttribute("data-theme") as "light" | null) ?? "dark");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("burnae-theme", next);
  }

  // 첫 렌더(테마 확정 전)엔 깜빡임 방지를 위해 자리만 차지하고 아이콘은 숨긴다
  return (
    <button
      onClick={toggle}
      aria-label="화면 모드 전환"
      className={`w-8 h-8 rounded-full flex items-center justify-center text-text-dim hover:text-text hover:bg-surface-2 transition-colors active:scale-90 ${className}`}
    >
      {theme === "light" ? (
        <Moon size={16} key="moon" className="animate-star-pop" />
      ) : theme === "dark" ? (
        <Sun size={16} key="sun" className="animate-star-pop" />
      ) : (
        <span className="w-4 h-4" />
      )}
    </button>
  );
}
