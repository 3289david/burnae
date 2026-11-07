/** 결제(입금 안내 + 코인 결제) 화면을 현재 페이지 안이 아니라 별도 창으로 띄운다.
 * URL에 더 이상 /kr 같은 로케일 접두사가 안 붙으므로(proxy.ts가 내부적으로만 처리) 그대로 연다. */
export function openPaymentWindow(orderId: string): void {
  window.open(`/dashboard/pay/${orderId}`, "_blank", "width=480,height=760");
}
