import { getTranslations } from "next-intl/server";

/** 영어 페이지에서 법적 문서는 한국어 원문이 기준이라는 걸 명확히 알려주는 안내 배너 */
export default async function LegalEnglishNotice({ locale }: { locale: string }) {
  if (locale !== "en") return null;
  const t = await getTranslations("legal");
  return (
    <div className="mb-6 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
      {t("enNotice")}
    </div>
  );
}
