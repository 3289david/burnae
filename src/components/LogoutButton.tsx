"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function LogoutButton() {
  const router = useRouter();
  const t = useTranslations("logoutButton");
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="text-sm text-text-dim hover:text-text active:scale-95 transition-transform inline-block"
    >
      {t("label")}
    </button>
  );
}
