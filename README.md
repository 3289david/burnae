# 🔥 Burnae Hosting

Pterodactyl을 백엔드 엔진으로 쓰고, 고객에게는 완전히 다른 심플한 자체 UI + AI 서버 관리 챗봇을 제공하는
마인크래프트 호스팅 플랫폼입니다. 가짜 데이터/시뮬레이션 없이 실제 Pterodactyl API, 하나은행 Open API 결제,
Cloudflare DNS, 디스코드 봇과 연동합니다.

- **웹**: Next.js 16 (App Router) + PostgreSQL + Prisma 7
- **호스팅 엔진**: Pterodactyl (Application API + Client API)
- **결제**: [하나은행 Open API](https://apiportal.hanabank.com) 직접 연동 (계좌 비밀번호 불필요, 사업자번호 연결 계좌 전용)
- **서브도메인**: Cloudflare API로 서버 생성 시 `이름.krl.kr` A/SRV 레코드 자동 생성, 유저가 이름 직접 지정(서버당 2개)
- **커스텀 도메인**: 유저가 소유한 외부 도메인을 서버에 연결 — A/SRV 레코드 안내 후 DNS 조회로 자동 확인
- **입금자명**: 계정에서 직접 지정 가능(공백 없이 1~5자), 미설정 시 이름 기반 자동 생성
- **AI**: [OpenRouter](https://openrouter.ai) 기반 Tool-calling — 저렴한 오픈소스 모델(Qwen3), 실제 서버를 읽고/쓰고/재시작/플레이어관리/플러그인설치까지
- **디스코드 봇**: discord.js, `/서버목록` `/상태` `/시작` `/정지` `/재시작` `/link` `/요금제` `/이벤트` `/문의`
- **로그인**: Google/GitHub/Discord OAuth 전용 (비밀번호 없음). 관리자는 `ADMIN_EMAIL` 한 명으로 고정
- **플레이어 관리**: 화이트리스트/OP/밴/킥 (콘솔 명령 + 서버 파일 기반, RCON 불필요)
- **플러그인/모드**: [Modrinth](https://modrinth.com) 검색·설치, AI도 같은 기능으로 직접 설치 가능
- **팀**: 서버별 팀원 초대(Owner/Admin/Moderator/Developer/Viewer)
- **플랜 변경/갱신/만료 자동화**: 업그레이드·갱신 결제, 결제 만료 D-3/D-1 알림 → 정지 → 7일 후 삭제
- **관리자**: 전체 서버 강제조치, 로그, 통계(MRR·RAM 판매율 등), 노드 과부하 알림
- **선주문**: 결제(또는 포인트 교환, 관리자 지급)는 끝났는데 그 순간 노드에 자리가 없으면 "선주문"으로
  대기시켰다가 자리가 나는 대로 크론이 자동으로 서버를 생성
- **홍보 포인트**: 친구 추천(`/register?ref=내추천코드`), 디스코드 가입, 블로그/영상/커뮤니티에 링크
  공유 등 22가지 방법으로 포인트 적립 → 관리자가 지정한 상품(예: RAM 1GB · CPU 50% · 디스크 500MB
  무료 체험 서버)으로 교환
- **관리자 수동 지급**: `/admin/users`에서 특정 유저에게 포인트나 서버를 결제/포인트 차감 없이
  바로 지급 가능. 서버는 기존 상품에서 골라도 되고, RAM/CPU/디스크/백업 슬롯을 그때그때 직접 정해서
  지급할 수도 있음 (이벤트 경품, 문의 보상, 테스트 서버 등)

---

## 0. 준비물 체크리스트

배포 전에 아래 항목들을 각각 발급/준비해야 합니다. (전부 `.env` 에 들어감 — [.env.example](.env.example) 참고)

| 항목 | 어디서 | 비고 |
|---|---|---|
| Ubuntu 서버 (22.04+) | 클라우드/베어메탈 | Pterodactyl Wings가 Docker를 직접 다룸 |
| PostgreSQL 15+ | 같은 서버 또는 관리형 DB | |
| 도메인 `burnae.kr` | 가비아 등 | 사이트 주소 |
| 도메인 `krl.kr` + Cloudflare 연결 | Cloudflare | 서버 서브도메인 전용 존 |
| Pterodactyl Panel + Wings | 자체 설치 | 아래 1번 참고 |
| 하나은행 오픈API 포털 앱키 | https://apiportal.hanabank.com | 무통장입금 자동확인 (사업자번호 연결 계좌 필요) |
| Discord Application | https://discord.com/developers | 봇 토큰 + OAuth 로그인 |
| Google/GitHub OAuth 앱 | 각 콘솔 | 소셜 로그인 |
| OpenRouter API 키 | https://openrouter.ai/keys | AI 챗봇 (저렴한 오픈소스 모델) |

---

## 1. Pterodactyl 설치 (Panel + Wings)

이 저장소는 Pterodactyl을 **대체하지 않고 백엔드로 사용**합니다. 공식 설치 스크립트를 그대로 따라가세요.

```bash
# Panel (패널 서버 — Wings와 같은 서버여도 되고 분리해도 됩니다)
bash <(curl -s https://pterodactyl-installer.se)
# → 메뉴에서 "Install the panel" 선택, DB/도메인 안내에 따라 진행

# Wings (실제 Docker 컨테이너를 띄우는 데몬 — 같은 서버에 설치 가능)
bash <(curl -s https://pterodactyl-installer.se)
# → 메뉴에서 "Install Wings" 선택
```

설치가 끝나면 패널에 관리자로 로그인해서 아래를 해두세요.

1. **Node 등록**: Admin → Nodes → Create New. 여기서 만든 Node ID를 나중에 Burnae 관리자 패널
   `/admin/nodes`에 입력합니다. Allocation(IP:포트)도 넉넉히 추가해두세요 — Burnae가 서버 생성마다
   하나씩 자동으로 씁니다.
2. **Nest/Egg 확인**: Admin → Nests. Paper/Fabric/Forge/NeoActive/Vanilla 등 원하는 Egg를 Import 하거나
   기본 제공 Egg를 사용하고, 각 Egg의 **Nest ID / Egg ID**를 적어두세요 (Burnae 관리자 `/admin/templates`에서 필요).
3. **관리자 계정 전체 서버 접근 허용**: Admin → Settings → Advanced 에서 "Allow admins to view/manage
   all servers via the Client API" 옵션을 켭니다. Burnae는 이 계정의 **Client API 키**로 모든 고객
   서버의 콘솔/전원/파일을 제어합니다 (개별 고객이 패널에 직접 로그인할 필요는 전혀 없습니다).
4. **API 키 발급**:
   - Application API 키: Admin 계정 → API Credentials → Application API → Create → `PTERODACTYL_APPLICATION_API_KEY`
   - Client API 키: 같은 계정 → Account API → Create → `PTERODACTYL_CLIENT_API_KEY`

---

## 2. Cloudflare (krl.kr 서브도메인 자동화)

1. `krl.kr` 도메인을 Cloudflare에 추가하고 네임서버를 변경합니다.
2. My Profile → API Tokens → Create Token → **Zone:DNS:Edit** 권한으로 `krl.kr` 존만 대상으로 생성
   → `CLOUDFLARE_API_TOKEN`
3. 해당 존 개요 페이지 우측에서 **Zone ID** 확인 → `CLOUDFLARE_ZONE_ID`
4. 서버를 만들 노드가 있는 서버들의 공인 IP가 실제로 열려 있어야 합니다 (Cloudflare 프록시는 끈 상태로
   생성되므로 — 마인크래프트 TCP 트래픽은 Cloudflare를 거치지 않습니다).

---

## 3. 하나은행 Open API (무통장입금 자동확인)

⚠️ 계좌 비밀번호나 주민번호를 요구하는 서비스는 절대 쓰지 마세요. 하나은행 Open API는 발급받은
앱키/시크릿으로 서버 간(client_credentials) 인증하는 방식이라 비밀번호가 필요 없습니다.

⚠️ **거래내역조회 API는 사업자번호(RSBZ_REG_NO)가 필수 파라미터입니다** — 결제를 받을 계좌는
반드시 하나은행 + 사업자등록번호가 연결된 계좌(개인사업자 또는 법인)여야 합니다. 사업자 등록이
안 된 순수 개인계좌는 이 API를 쓸 수 없습니다.

⚠️ paysync.kr/payaction.app 같은 SMS 파싱 대행 서비스와 달리, 이 API는 입금이 발생해도 실시간
웹훅을 주지 않습니다. `scripts/maintenance-cron.ts`가 10분마다 거래내역조회 API를 폴링해서
"입금자명(적요) + 금액"이 일치하는 대기 중인 주문을 찾아 직접 매칭 처리합니다.

1. https://apiportal.hanabank.com 회원가입 후 마이페이지에서 서비스(앱) 등록 → `거래내역조회`
   API 이용 신청. client_credential용 앱키/시크릿을 발급받습니다.
2. 발급받은 값을 `.env`의 `HANABANK_CLIENT_ID` / `HANABANK_CLIENT_SECRET`에 채웁니다.
3. 결제 받을 계좌번호와 그 계좌에 연결된 사업자등록번호를 각각 `HANABANK_ACCOUNT_NUMBER` /
   `HANABANK_BUSINESS_REG_NO`에 채웁니다.
4. 서버의 아웃바운드 공인 IP를 포털의 API 화이트리스트에 등록합니다 (등록 안 하면 API가
   `Not allowed IP Address` 에러를 반환합니다).
5. Burnae 관리자 패널 `/admin/bank-account`에 위와 동일한 계좌 정보를 등록하고, **"연동 테스트"**
   버튼으로 앱키가 정상 동작하는지 확인하세요.
6. (선택) 운영 전에 먼저 테스트하고 싶다면 `.env`에 `HANABANK_ENV="dev"` 또는 `"test"`를 설정해서
   하나은행 개발계/품질계 서버로 연동을 확인할 수 있습니다.

---

## 4. 디스코드 봇 (Burnae **공식 서버 전용**)

⚠️ 고객이 이 봇을 자기 디스코드 서버에 초대하는 구조가 **아닙니다**. Burnae 공식 디스코드
서버(burnae.kr 커뮤니티) **딱 하나**에서만 동작하고, 일반 방문객과 고객 모두 그 서버에
들어와서 함께 씁니다. `src/bot/index.ts`가 `DISCORD_GUILD_ID`로 지정한 서버가 아니면 아예
응답하지 않도록 막아둡니다.

제공 명령어:
- 누구나: `/도움말` `/요금제` `/이벤트` `/문의`(비공개 문의 스레드 생성)
- `/link`로 Burnae 계정을 연동한 사람만: `/서버목록` `/상태` `/시작` `/정지` `/재시작`
- 연동 성공 시 설정해둔 "고객" 역할이 자동으로 부여됩니다.
- 서버가 예기치 않게 꺼지면 소유자에게 DM으로 알립니다.

설정 순서:

1. Burnae 공식 디스코드 서버를 먼저 만들고(또는 기존 서버 사용), 서버 ID를 복사해 `DISCORD_GUILD_ID`에
   입력합니다. (디스코드 설정 → 고급 → 개발자 모드 켜기 → 서버 아이콘 우클릭 → ID 복사)
2. https://discord.com/developers/applications → New Application → 이름 "Burnae"
3. Bot 탭 → **Privileged Gateway Intents**에서 **Server Members Intent**를 켭니다
   (신규 멤버 환영 메시지 + 역할 자동 부여에 필요). → Reset Token → `DISCORD_BOT_TOKEN`
4. General Information 탭 → Application ID → `DISCORD_CLIENT_ID`
5. OAuth2 → URL Generator → scope `bot` + `applications.commands` 체크 (권한은 필요 시
   "채널 관리"만 — `/문의`가 비공개 스레드를 만들려면 필요) → 생성된 링크로 **공식 서버에만** 봇을 초대합니다.
6. (선택) 서버에 "고객" 역할과 운영진 역할을 만들고 각 역할 ID를 `DISCORD_CUSTOMER_ROLE_ID`,
   `DISCORD_SUPPORT_ROLE_ID`에 입력합니다.
7. 공식 서버 초대 링크(길드 초대 링크, 봇 초대 링크 아님)를 `NEXT_PUBLIC_DISCORD_SERVER_INVITE_URL`에
   넣으면 대시보드에 "공식 디스코드 참여하기" 버튼으로 노출됩니다.
8. 슬래시 명령어를 공식 서버에 등록합니다 (길드 단위 등록이라 즉시 반영됩니다):
   ```bash
   npm run bot:deploy-commands
   ```

---

## 5. OpenRouter API 키 (AI 챗봇)

Anthropic/OpenAI 같은 비싼 상용 API 대신 OpenRouter로 저렴한 오픈소스 모델을 씁니다.

1. https://openrouter.ai 가입 → Keys → Create Key → `OPENROUTER_API_KEY`
2. 기본 모델은 `qwen/qwen3-235b-a22b-2507` (Qwen3, Apache-2.0 오픈소스, tool-calling 지원).
   비용을 더 줄이고 싶으면 `.env`의 `OPENROUTER_MODEL`을 `qwen/qwen3-30b-a3b-instruct-2507` 등으로 바꾸면 됩니다.
   https://openrouter.ai/models?supported_parameters=tools 에서 tool-calling 지원 모델과
   실시간 가격을 확인할 수 있습니다.

---

## 6. 관리자 계정 & 소셜 로그인

**관리자 패널(`/admin`)은 오직 `ADMIN_EMAIL`(기본값 `davideom0414@gmail.com`) 이메일 하나만
들어갈 수 있습니다.** 이 이메일로 가입하거나 소셜 로그인하면 자동으로 관리자가 되고, 그 외
계정은 DB에서 role을 직접 ADMIN으로 바꿔도 서버(proxy.ts)와 API(requireAdmin) 양쪽에서
이메일이 다르면 무조건 막힙니다. 다른 사람을 관리자로 만들고 싶다면 `.env`의 `ADMIN_EMAIL`
자체를 바꿔야 합니다 (여러 명을 관리자로 두는 기능은 없음 — 딱 한 명 전용).

소셜 로그인(Google/GitHub/Discord)은 이메일이 같으면 기존 계정에 자동으로 연결됩니다.
비밀번호 없이 소셜 로그인만으로 가입한 계정도 정상 동작합니다.

1. **Google**: https://console.cloud.google.com → API 및 서비스 → OAuth 동의 화면 설정 →
   사용자 인증 정보 → OAuth 클라이언트 ID 만들기 (웹 애플리케이션) →
   승인된 리디렉션 URI에 `https://burnae.kr/api/auth/oauth/google/callback` 추가
   → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
2. **GitHub**: https://github.com/settings/developers → New OAuth App →
   Authorization callback URL에 `https://burnae.kr/api/auth/oauth/github/callback` 입력
   → `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
3. **Discord**: 위 4번에서 만든 Burnae Application을 그대로 재사용합니다.
   OAuth2 탭 → Redirects에 `https://burnae.kr/api/auth/oauth/discord/callback` 추가,
   Client Secret 발급 → `DISCORD_CLIENT_SECRET` (`DISCORD_CLIENT_ID`는 이미 있는 값 그대로 사용)

---

## 7. 서버 배포 (Ubuntu)

### 자동 스크립트 (권장)

아래 수동 단계를 대신 처리해주는 스크립트입니다. Node/PostgreSQL/Nginx 설치, DB 생성,
`.env` 뼈대 생성(AUTH_SECRET 자동 생성), 빌드, systemd 서비스 등록, (선택)Nginx+HTTPS까지
한 번에 진행하고, 끝나면 남은 수동 작업(나머지 `.env` 값, 관리자 지정 등)을 안내해줍니다.

```bash
git clone <이 저장소 URL> burnae && cd burnae
sudo bash scripts/setup-ubuntu.sh
```

### 수동 단계

```bash
# 1) 기본 패키지
sudo apt update && sudo apt install -y postgresql nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# 2) DB
sudo -u postgres psql -c "CREATE USER burnae WITH PASSWORD '비밀번호';"
sudo -u postgres psql -c "CREATE DATABASE burnae OWNER burnae;"

# 3) 코드 배치
sudo mkdir -p /opt/burnae && sudo chown $USER:$USER /opt/burnae
git clone <이 저장소> /opt/burnae
cd /opt/burnae
cp .env.example .env
nano .env   # 위 0~6번에서 발급받은 값들을 전부 채우기 (AUTH_SECRET은 `openssl rand -base64 32`)

# 4) 설치 & DB 마이그레이션
npm install
npm run db:migrate:deploy
npm run db:seed
npm run build

# 5) 첫 관리자 계정 만들기
# → ADMIN_EMAIL로 지정한 이메일로 https://burnae.kr/register 에서 가입(또는 소셜 로그인)하면
#   자동으로 관리자가 됩니다. role이 꼬였을 때만 복구용으로:
npm run make-admin

# 6) 슬래시 명령어 등록 (디스코드)
npm run bot:deploy-commands
```

### systemd 서비스 등록

```bash
sudo cp deploy/burnae-web.service /etc/systemd/system/
sudo cp deploy/burnae-bot.service /etc/systemd/system/
sudo cp deploy/burnae-maintenance.service /etc/systemd/system/
sudo cp deploy/burnae-maintenance.timer /etc/systemd/system/
# 유닛 파일들의 User=burnae 를 실제 배포 계정으로 바꿔주세요.
sudo systemctl daemon-reload
sudo systemctl enable --now burnae-web burnae-bot
sudo systemctl enable --now burnae-maintenance.timer
sudo systemctl status burnae-web burnae-bot
sudo systemctl list-timers burnae-maintenance.timer
```

`burnae-maintenance.timer`는 10분마다 `scripts/maintenance-cron.ts`를 한 번 실행합니다.
결제 만료 D-3/D-1 알림 → 연체 시 서버 정지 → 정지 7일 후 삭제, 서버별 예약 자동 백업/재시작,
노드 RAM/CPU 판매율 90% 초과 시 관리자(디스코드 연동된 경우) 알림, 하나은행 거래내역 폴링을 통한
입금 자동 매칭(웹훅이 없어서 주기적으로 조회), "선주문" 상태 주문의 노드 재배치 재시도를
처리합니다. 수동 1회 실행: `npm run maintenance:cron`.

### Nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/burnae.kr
sudo ln -s /etc/nginx/sites-available/burnae.kr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d burnae.kr -d www.burnae.kr
```

---

## 8. 관리자 패널에서 첫 세팅

1. `/admin/nodes` — 1번에서 만든 Pterodactyl Node ID + 공인 IP 입력해서 연결
2. `/admin/templates` — Paper/Fabric/Vanilla 등 Nest ID/Egg ID 입력
3. `/admin/products` — 판매할 RAM/CPU/디스크 플랜 생성 (위 템플릿 연결)
4. `/admin/bank-account` — 계좌 정보를 등록하고 "연동 테스트"로 하나은행 API 앱키 동작 확인
5. `/admin/settings` — RAM 단가, 유저 기본 저장공간(10GB), 서브도메인 존(krl.kr) 등 조정
6. `/admin/events` — 프로모션/쿠폰 생성
7. `/admin/promotions` — 홍보 포인트 항목 활성화/포인트 조정, 수동심사(MANUAL_REVIEW) 제출 승인/반려.
   포인트로 교환 가능한 무료 서버를 만들려면 `/admin/products`에서 상품 생성 시
   "홍보 포인트로 교환 가능"을 체크하세요 (예: RAM 1GB · CPU 50% · 디스크 500MB · 0원, 필요 포인트 지정).

운영 중 자주 쓰는 화면: `/admin/servers`(전체 서버 강제 재시작/정지/삭제),
`/admin/logs`(관리자·시스템 작업 로그), `/admin/statistics`(MRR·RAM 판매율 등),
`/admin/users`(저장공간/AI크레딧 조정 + 포인트·서버 수동 지급).

여기까지 끝나면 고객이 회원가입 → 서버 생성 → 입금 → 자동으로 Pterodactyl에 Docker 컨테이너가
만들어지고 `이름.krl.kr` 서브도메인이 자동으로 연결됩니다.

---

## 로컬 개발

```bash
npm install
npm run db:migrate      # 로컬 Postgres에 스키마 적용
npm run dev              # http://localhost:3000
npm run bot               # 디스코드 봇 (별도 터미널)
```

## 프로젝트 구조

```
src/
  app/                   # Next.js 라우트 (고객 UI, 관리자 UI, API)
  lib/
    pterodactyl/         # Pterodactyl Application/Client API wrapper
    hanabank.ts          # 하나은행 Open API 연동 (토큰 발급 + 거래내역조회)
    orderFulfillment.ts  # 입금(또는 포인트/관리자 지급) 확인된 주문 처리 공용 로직, "선주문" 재시도
    promotions.ts        # 홍보 포인트 적립/검증 (URL 스캔, 디스코드 멤버십, 서버 MOTD 등)
    cloudflare.ts        # 서브도메인 A/SRV 레코드 자동화
    provisioning.ts      # 서버 생성/삭제 전체 오케스트레이션
    players.ts           # 화이트리스트/OP/밴/킥 (콘솔 명령 + 파일 읽기)
    modrinth.ts           # 플러그인/모드 검색·다운로드 (Modrinth API)
    discordNotify.ts      # 게이트웨이 없이 REST로 디스코드 DM 발송 (크론용)
    oauth.ts               # Google/GitHub/Discord OAuth2 직접 구현
    ai/                    # AI 챗봇 (tool 정의 + 실행 엔진, OpenRouter)
  bot/                    # 디스코드 봇 (공식 서버 전용, 별도 프로세스)
scripts/
  maintenance-cron.ts      # 결제만료/예약백업/예약재시작/노드알림 — systemd timer로 주기 실행
  setup-ubuntu.sh           # 서버 초기 설정 자동화
prisma/schema.prisma       # 전체 데이터 모델
deploy/                    # systemd, nginx 설정 예시
```
