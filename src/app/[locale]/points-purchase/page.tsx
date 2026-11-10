import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import PointsPurchaseClient from "./PointsPurchaseClient";

/** 대시보드 레이아웃(사이드바/탭바) 밖의 완전히 분리된 화면 — 새 탭에서 결제만 진행한다. */
export default async function PointsPurchasePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale: "kr" });
    return null;
  }
  return <PointsPurchaseClient />;
}
