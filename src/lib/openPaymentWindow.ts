/** 결제(입금 안내 + 코인 결제) 화면을 현재 페이지 안이 아니라 별도 창으로 띄운다.
 * 현재 URL의 로케일 접두사(/kr, /en)를 그대로 유지해서 연다. */
export function openPaymentWindow(orderId: string): void {
  const locale = window.location.pathname.split("/")[1] || "kr";
  window.open(`/${locale}/dashboard/pay/${orderId}`, "_blank", "width=480,height=760");
}
