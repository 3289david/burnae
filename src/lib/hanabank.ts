import crypto from "node:crypto";

/**
 * 하나은행 Open API(apiportal.hanabank.com) "거래내역조회" 직접 연동.
 *
 * 금융결제원 오픈뱅킹과 달리 사용자(계좌 소유자) 동의 OAuth 절차가 없다 — client_credentials
 * 방식으로 앱키/시크릿만으로 토큰을 발급받아 바로 API를 호출한다(토큰 유효기간 1년).
 * 다만 이 API는 실시간 웹훅이 없어서, KFTC 오픈뱅킹 때와 마찬가지로 크론이 주기적으로
 * 거래내역조회를 폴링해서 "입금자명(적요) + 금액"이 일치하는 대기 중인 주문을 찾아 매칭한다.
 *
 * ⚠️ 거래내역조회 요청 필드 중 RSBZ_REG_NO(사업자번호)가 필수다 — 즉 결제를 받을 계좌는
 * **하나은행 + 사업자등록번호가 연결된 계좌**(개인사업자 또는 법인)여야 한다. 사업자 등록이
 * 안 된 순수 개인계좌라면 이 API를 쓸 수 없다.
 * ⚠️ 이용을 위해서는 하나은행 오픈API 포털에서 서비스 등록/앱키 발급을 먼저 받아야 하고,
 * 서버의 아웃바운드 IP를 화이트리스트에 등록해야 한다.
 * ⚠️ 적요(RMRK) 필드를 입금자명 매칭에 쓰는데, 공개 문서 범위에서 확인한 표준 필드라
 * 실제 앱키 발급 후 받는 정식 연동 가이드로 한 번 더 대조하는 걸 권장한다.
 */

type Env = "dev" | "test" | "prod";

function getEnv(): Env {
  const value = process.env.HANABANK_ENV;
  if (value === "dev" || value === "test") return value;
  return "prod";
}

function baseUrl(): string {
  switch (getEnv()) {
    case "dev":
      return "https://dev-api.hanabank.com";
    case "test":
      return "https://test-api.hanabank.com";
    default:
      return "https://api.hanabank.com";
  }
}

function getCredentials() {
  const clientId = process.env.HANABANK_CLIENT_ID;
  const clientSecret = process.env.HANABANK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("HANABANK_CLIENT_ID / HANABANK_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return { clientId, clientSecret };
}

function getAccountConfig() {
  const accountNumber = process.env.HANABANK_ACCOUNT_NUMBER;
  const businessRegNo = process.env.HANABANK_BUSINESS_REG_NO;
  if (!accountNumber || !businessRegNo) {
    throw new Error("HANABANK_ACCOUNT_NUMBER / HANABANK_BUSINESS_REG_NO 환경변수가 설정되지 않았습니다.");
  }
  return { accountNumber, businessRegNo };
}

/** 실명번호/계좌번호 등 민감 필드는 발급받은 Client-ID를 키로 쓰는 AES-128-CBC로 암호화해서 보낸다 */
function encryptField(plain: string, clientId: string): string {
  const keyBytes = Buffer.alloc(16);
  Buffer.from(clientId, "utf-8").copy(keyBytes, 0, 0, 16);
  const iv = Buffer.from(clientId.slice(0, 16), "utf-8");
  const cipher = crypto.createCipheriv("aes-128-cbc", keyBytes, iv);
  return Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]).toString("base64");
}

interface TokenResponse {
  rsp_code: string;
  rsp_message: string;
  token_type: string;
  access_token: string;
  expires_in: number;
  scope: string;
}

// 같은 크론 실행(프로세스) 안에서는 토큰을 재사용 — client_credentials라 유효기간이 1년이나 되므로
// 매 페이지 호출마다 새로 받을 필요가 없다.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function fetchAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.value;
  }

  const { clientId, clientSecret } = getCredentials();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${baseUrl()}/oauth/2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.rsp_code !== "00000") {
    throw new Error(`하나은행 토큰 발급 실패: ${JSON.stringify(data)}`);
  }

  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

interface TransactionListResponse {
  BNK_RSPS_CD: string;
  BNK_RSPS_MSG: string;
  NEXT_TRSC_YN?: "Y" | "N";
  NEXT_INQ_CSE_KEY_CTT?: string;
  GRID?: Array<{
    TRSC_DTM: string;
    TRSC_NO: string;
    TRSC_TYP_CD: string; // 01:신규 02:출금 03:입금 06:출금취소 07:입금취소 98:기타입금 99:기타출금
    TRSC_DV_NM: string;
    CUR_CD: string;
    TRSC_AMT: string;
    TRSC_AF_BAL: string;
    TRT_BR_NM: string;
    RMRK: string; // 적요 — 입금자명 매칭에 사용
  }>;
}

export interface HanaBankDeposit {
  tranDateTime: string; // YYYYMMDDHHMMSS
  amount: number;
  /** 적요(RMRK) — 입금자명 자동매칭에 사용하는 필드 */
  printContent: string;
}

const DEPOSIT_TYPE_CODES = new Set(["03", "98"]); // 입금, 기타입금

/** 특정 기간의 입금 거래만 조회한다 (500건 초과 시 NEXT_INQ_CSE_KEY_CTT로 자동 페이지네이션) */
export async function getRecentDeposits(params: { fromDate: Date; toDate: Date }): Promise<HanaBankDeposit[]> {
  const { accountNumber, businessRegNo } = getAccountConfig();
  const { clientId } = getCredentials();
  const accessToken = await fetchAccessToken();
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

  const deposits: HanaBankDeposit[] = [];
  let nextKey: string | undefined;

  for (;;) {
    const res = await fetch(`${baseUrl()}/kebhnb/acctInfo/v1/inquiry/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        RSBZ_REG_NO: encryptField(businessRegNo, clientId),
        ACCT_NO: encryptField(accountNumber, clientId),
        INQ_STR_DT: fmt(params.fromDate),
        INQ_END_DT: fmt(params.toDate),
        NEXT_INQ_CSE_KEY_CTT: nextKey,
        INQ_RQRE_NCNT: "500",
      }),
    });

    const data = (await res.json()) as TransactionListResponse;
    if (!res.ok || data.BNK_RSPS_CD !== "00000") {
      throw new Error(`하나은행 거래내역조회 실패: ${JSON.stringify(data)}`);
    }

    for (const item of data.GRID ?? []) {
      if (!DEPOSIT_TYPE_CODES.has(item.TRSC_TYP_CD)) continue;
      deposits.push({
        tranDateTime: item.TRSC_DTM,
        amount: Number(item.TRSC_AMT),
        printContent: item.RMRK,
      });
    }

    if (data.NEXT_TRSC_YN !== "Y" || !data.NEXT_INQ_CSE_KEY_CTT) break;
    nextKey = data.NEXT_INQ_CSE_KEY_CTT;
  }

  return deposits;
}

/** 관리자 패널의 "연동 테스트" 버튼용 — 토큰 발급까지만 시도해서 앱키/시크릿이 유효한지 확인 */
export async function testConnection(): Promise<void> {
  cachedToken = null; // 캐시 무시하고 실제로 새로 발급받아본다
  await fetchAccessToken();
}

/** 결제 안내에 쓸 5자 이내 입금자명 생성 */
export function buildDepositorName(userName: string, userId: string): string {
  const cleaned = userName.replace(/\s+/g, "");
  if (cleaned.length >= 1 && cleaned.length <= 5) return cleaned;
  return `B${userId.slice(-4).toUpperCase()}`;
}

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
