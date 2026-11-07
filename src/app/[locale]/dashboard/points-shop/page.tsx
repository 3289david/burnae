import { getCurrentUser } from "@/lib/auth";
import ShopSection from "@/components/ShopSection";

/** 포인트로 아이템을 교환하는 화면 — "홍보 포인트"(/dashboard/promotions, 포인트를 버는 쪽)와는
 * 별개 페이지로 분리했다. 포인트를 버는 것과 쓰는 것을 한 화면에 섞지 않는다. */
export default async function PointsShopPage() {
  const user = await getCurrentUser();
  return <ShopSection points={user!.promotionPoints} />;
}
