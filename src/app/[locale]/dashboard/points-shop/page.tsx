import ArtCallout from "@/components/ArtCallout";
import PageHeader from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import ShopSection from "@/components/ShopSection";

/** 포인트로 아이템을 교환하는 화면 — "홍보 포인트"(/dashboard/promotions, 포인트를 버는 쪽)와는
 * 별개 페이지로 분리했다. 포인트를 버는 것과 쓰는 것을 한 화면에 섞지 않는다. */
export default async function PointsShopPage() {
  const user = await getCurrentUser();
  return (
    <>
      <PageHeader art="shop" title="포인트 상점" desc={`모은 포인트 ${user!.promotionPoints.toLocaleString()}P로 교환할 수 있어요.`} />
      <ShopSection points={user!.promotionPoints} />
      <ArtCallout className="mt-8" src="head-promo" title="포인트가 부족하세요?" desc="친구 추천과 홍보 활동으로 포인트를 모아요." href="/dashboard/promotions" cta="포인트 받으러 가기" flip />
    </>
  );
}
