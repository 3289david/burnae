import type { AdminRole } from "@/generated/prisma/enums";

/**
 * 관리자 메뉴(경로)별로 어느 adminRole이 들어갈 수 있는지. 각 /api/admin/* 라우트도 같은 기준으로
 * requireAdminRole(...)을 호출한다 — 여기는 "어느 메뉴를 보여줄지"를 정하는 레이아웃용 지도일 뿐,
 * 실제 접근 차단은 각 API 라우트가 스스로 한다.
 */
export const ADMIN_NAV_AREAS: Record<string, AdminRole[]> = {
  "/admin": ["COMMUNITY", "PROMOTION", "GENERAL", "SUPER"],
  "/admin/servers": ["GENERAL", "SUPER"],
  "/admin/products": ["SUPER"],
  "/admin/templates": ["GENERAL", "SUPER"],
  "/admin/presets": ["COMMUNITY", "SUPER"],
  "/admin/nodes": ["GENERAL", "SUPER"],
  "/admin/users": ["GENERAL", "SUPER"],
  "/admin/events": ["PROMOTION", "SUPER"],
  "/admin/orders": ["GENERAL", "SUPER"],
  "/admin/preorders": ["GENERAL", "SUPER"],
  "/admin/announcements": ["GENERAL", "SUPER"],
  "/admin/blog": ["GENERAL", "SUPER"],
  "/admin/promotions": ["PROMOTION", "SUPER"],
  "/admin/shop": ["SUPER"],
  "/admin/bank-account": ["SUPER"],
  "/admin/crypto": ["SUPER"],
  "/admin/logs": ["GENERAL", "SUPER"],
  "/admin/statistics": ["GENERAL", "SUPER"],
  "/admin/discord": ["GENERAL", "SUPER"],
  "/admin/surveys": ["COMMUNITY", "SUPER"],
  "/admin/support": ["COMMUNITY", "SUPER"],
  "/admin/settings": ["SUPER"],
  "/admin/ai": ["SUPER"],
};
