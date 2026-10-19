"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import SuccessCheck from "@/components/SuccessCheck";

export default function DepositorNameCard({ initial }: { initial: string | null }) {
  const t = useTranslations("depositorNameCard");
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/depositor-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositorName: value.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-glow p-5 animate-fade-up">
      <h3 className="font-semibold">{t("title")}</h3>
      <p className="text-sm text-text-dim mt-1">{t("desc")}</p>
      <form onSubmit={save} className="flex gap-2 mt-3">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\s+/g, ""));
            setSaved(false);
          }}
          maxLength={5}
          placeholder={t("placeholder")}
          className="input flex-1 text-sm"
        />
        <button type="submit" disabled={saving} className="btn-secondary px-4 py-1.5 text-sm shrink-0 active:scale-95 transition-transform">
          {saving ? t("savingLabel") : t("saveLabel")}
        </button>
      </form>
      {saved && (
        <p className="animate-toast-in text-xs text-green mt-2 flex items-center gap-1">
          <SuccessCheck size={16} /> {t("saved")}
        </p>
      )}
      {error && <p className="text-xs text-red mt-2">{error}</p>}
    </div>
  );
}
