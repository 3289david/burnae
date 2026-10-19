"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/** 결제 버튼을 누르기 전에 "이번 결제에 쓸 입금자명"을 매번 확인/수정할 수 있게 해주는 입력란.
 * 계정 설정에 저장된 기본값(또는 이름 기반 자동 생성값)으로 미리 채워두고, 비워서 결제하면
 * 서버가 같은 기본값을 알아서 쓴다 — 이 입력란은 "이번만 다르게 쓰고 싶을 때"를 위한 것. */
export default function DepositorNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations("depositorNameField");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/account/depositor-name")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.depositorName && !value) onChange(data.depositorName);
      })
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <label className="text-xs text-text-dim">{t("label")}</label>
      <input
        className="input w-full mt-1 text-sm"
        maxLength={5}
        placeholder={loaded ? "" : "..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-text-dim mt-1">{t("hint")}</p>
    </div>
  );
}
