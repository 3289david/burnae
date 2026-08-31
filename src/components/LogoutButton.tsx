"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="text-sm text-text-dim hover:text-text active:scale-95 transition-transform inline-block"
    >
      로그아웃
    </button>
  );
}
