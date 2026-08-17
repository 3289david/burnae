import crypto from "node:crypto";

/**
 * 페이싱크(paysync.kr) 무통장입금 자동확인 연동.
 * 계좌 비밀번호/주민번호를 요구하지 않는 정식 서비스 — 은행 입출금 SMS를 파싱해
 * 입금자명+금액이 일치하는 주문을 자동으로 결제 완료 처리한다.
 * 문서: https://docs.paysync.kr
 */

const PAYSYNC_BASE = "https://api.paysync.kr";

export class PaySyncError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
    this.name = "PaySyncError";
  }
}

async function paysync<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.PAYSYNC_API_KEY;
  if (!apiKey) throw new Error("PAYSYNC_API_KEY 환경변수가 설정되지 않았습니다.");

  const res = await fetch(`${PAYSYNC_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const body = await res.json();
  if (!res.ok) {
    throw new PaySyncError(
      body?.errors?.[0] ?? body?.code ?? "PAYSYNC_REQUEST_FAILED",
      body?.code,
      res.status,
    );
  }
  return body as T;
}

export interface PaySyncInvoice {
  id: string;
  issuerId: string;
  customer: { name: string; email?: string; phoneNumber?: string };
  amount: number;
  paid: boolean;
  metadata: Record<string, string> | null;
  issuedAt: string;
  expiresAt: string | null;
}

/**
 * 주문 결제용 인보이스 생성.
 * customer.name 은 입금자명 자동 매칭 기준이라 1~5자, 공백 불가.
 */
export async function createInvoice(params: {
  depositorName: string;
  amountKrw: number;
  orderId: string;
  expireAfter?: string; // 예: "1d", "3d"
}): Promise<PaySyncInvoice> {
  const res = await paysync<{ code: string; data: PaySyncInvoice }>(
    "/v1/invoices",
    {
      method: "POST",
      body: JSON.stringify({
        customer: { name: params.depositorName },
        amount: params.amountKrw,
        expireAfter: params.expireAfter ?? "1d",
        metadata: { orderId: params.orderId },
      }),
    },
  );
  return res.data;
}

export async function getInvoice(invoiceId: string): Promise<PaySyncInvoice> {
  const res = await paysync<{ code: string; data: PaySyncInvoice }>(
    `/v1/invoices/${invoiceId}`,
  );
  return res.data;
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  await paysync(`/v1/invoices/${invoiceId}`, { method: "DELETE" });
}

/** 관리자가 계좌이체 외 경로(현금 등)로 받은 결제를 수동으로 완료 처리 */
export async function markInvoiceAsPaid(invoiceId: string): Promise<PaySyncInvoice> {
  const res = await paysync<{ code: string; data: PaySyncInvoice }>(
    `/v1/invoices/${invoiceId}/mark-as-paid`,
    { method: "POST" },
  );
  return res.data;
}

export interface PaySyncWebhookEvent {
  type: "invoice.created" | "invoice.paid" | "invoice.deleted";
  invoice: PaySyncInvoice;
  trigger?: "AUTOMATIC_MATCHING" | "MANUAL_MATCHING" | "MANUAL_APPROVE" | "API_CALL";
}

/**
 * Standard Webhooks 규격 시그니처 검증.
 * 반드시 파싱 전 원본 바디(rawBody)를 그대로 넘겨야 한다.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  webhookId: string;
  timestamp: string;
  signatureHeader: string;
}): boolean {
  const secret = process.env.PAYSYNC_WEBHOOK_SECRET;
  if (!secret) throw new Error("PAYSYNC_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.");

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${params.webhookId}.${params.timestamp}.${params.rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest();

  const provided = params.signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1])
    .find(Boolean);
  if (!provided) return false;

  let providedBuf: Buffer;
  try {
    providedBuf = Buffer.from(provided, "base64");
  } catch {
    return false;
  }

  if (providedBuf.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, providedBuf);
}

/** 결제 안내에 쓸 5자 이내 입금자명 생성 (customer.name 규칙: 1~5자, 공백 불가) */
export function buildDepositorName(userName: string, userId: string): string {
  const cleaned = userName.replace(/\s+/g, "");
  if (cleaned.length >= 1 && cleaned.length <= 5) return cleaned;
  // 이름이 규칙에 안 맞으면 유저 식별용 코드로 대체 (예: BN3F2)
  return `B${userId.slice(-4).toUpperCase()}`;
}

/** customer.name 규칙(1~5자, 공백 불가)을 만족하는지 검사 */
export function isValidDepositorName(value: string): boolean {
  return /^\S{1,5}$/.test(value);
}

/** 유저가 직접 설정한 입금자명이 있으면 그걸, 없으면 이름 기반 자동 생성값을 사용 */
export function resolveDepositorName(user: { name: string; id: string; preferredDepositorName?: string | null }): string {
  if (user.preferredDepositorName && isValidDepositorName(user.preferredDepositorName)) {
    return user.preferredDepositorName;
  }
  return buildDepositorName(user.name, user.id);
}
