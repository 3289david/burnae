# 🔥 Burnae Hosting

Pterodactyl을 백엔드 엔진으로 쓰고, 고객에게는 완전히 다른 심플한 자체 UI + AI 서버 관리 챗봇을 제공하는
마인크래프트 호스팅 플랫폼입니다. 가짜 데이터/시뮬레이션 없이 실제 Pterodactyl API, PaySync 결제,
Cloudflare DNS, 디스코드 봇과 연동합니다.

- **웹**: Next.js 16 (App Router) + PostgreSQL + Prisma 7
- **호스팅 엔진**: Pterodactyl (Application API + Client API)
- **결제**: [paysync.kr](https://paysync.kr) 무통장입금 자동확인 (계좌 비밀번호 불필요)
- **서브도메인**: Cloudflare API로 서버 생성 시 `이름.krl.kr` A/SRV 레코드 자동 생성
- **AI**: Anthropic API 기반 Tool-calling — 실제 서버를 읽고/쓰고/재시작
- **디스코드 봇**: discord.js, `/서버목록` `/상태` `/시작` `/정지` `/재시작` `/link`

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
| paysync.kr 계정 | https://paysync.kr | 무통장입금 자동확인 |
| Discord Application | https://discord.com/developers | 봇 토큰 |
| Anthropic API 키 | https://console.anthropic.com | AI 챗봇 |

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

## 3. PaySync (무통장입금 자동확인)

⚠️ 계좌 비밀번호나 주민번호를 요구하는 서비스는 절대 쓰지 마세요. PaySync는 은행 입출금 SMS를
파싱하는 방식이라 비밀번호가 필요 없습니다.

1. https://paysync.kr 가입 (구글/카카오/디스코드 가능)
2. 대시보드 → 계좌 추가 → 은행 앱에서 입출금 알림 SMS 수신 번호를 안내된 번호로 변경
3. 1원 인증 (안내된 5자리 코드를 입금자명으로 1원 이체)
4. API 관리 → 새 키 발급 → `PAYSYNC_API_KEY`
5. 웹훅 관리 → 새 웹훅 추가
   - 엔드포인트 URL: `https://burnae.kr/api/webhooks/paysync`
   - 생성 시 발급되는 서명 시크릿(`whsec_...`) → `PAYSYNC_WEBHOOK_SECRET`
6. Burnae 관리자 패널 `/admin/bank-account` 에 **PaySync에 등록한 것과 동일한 계좌**를 입력하세요.
   (여기서 보여주는 계좌 정보 = 고객이 실제로 입금할 계좌. PaySync가 그 계좌의 SMS를 감시합니다.)

---

## 4. 디스코드 봇 (Burnae 소유 · 여러 고객 서버에 설치되는 구조)

Burnae가 만드는 봇은 **하나**이고, 이 하나의 봇을 고객들이 각자 자기 디스코드 서버(친구들 SMP
디스코드 등)에 초대해서 씁니다. 계정 연동은 디스코드 유저 ID 기준이라 어느 서버에서 명령어를
쓰든 항상 그 사람 본인의 Burnae 서버만 조회/조작됩니다 — 서버별 봇을 따로 만들 필요 없습니다.

1. https://discord.com/developers/applications → New Application → 이름 "Burnae"
2. Bot 탭 → Reset Token → `DISCORD_BOT_TOKEN`
3. General Information 탭 → Application ID → `DISCORD_CLIENT_ID`
4. OAuth2 → URL Generator → scope `bot` + `applications.commands` 체크, **권한은 아무것도 선택하지
   않아도 됩니다** (콘솔 상태 조회/전원 제어는 상호작용 응답과 DM만 쓰므로 채널 권한이 필요 없음).
   생성된 초대 링크를 복사해두세요 — 이게 나중에 **고객들에게 나눠줄 "봇 초대 링크"** 입니다
   (예: 대시보드 `/dashboard/account`에 버튼으로 붙여도 됨).
5. 슬래시 명령어를 **전역으로** 등록합니다 (`.env`에 `DISCORD_GUILD_ID`를 비워두면 전역 등록 —
   모든 고객의 서버에서 동일하게 명령어가 뜹니다. 전파에는 최대 1시간 걸릴 수 있어요):
   ```bash
   npm run bot:deploy-commands
   ```
   개발 중 특정 서버에서 즉시 테스트하고 싶을 때만 `DISCORD_GUILD_ID`를 임시로 채우고 실행하세요.

---

## 5. Anthropic API 키

https://console.anthropic.com → API Keys → Create Key → `ANTHROPIC_API_KEY`

---

## 6. 서버 배포 (Ubuntu)

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
nano .env   # 위 0~5번에서 발급받은 값들을 전부 채우기 (AUTH_SECRET은 `openssl rand -base64 32`)

# 4) 설치 & DB 마이그레이션
npm install
npm run db:migrate:deploy
npm run db:seed
npm run build

# 5) 첫 관리자 계정 만들기
# → 먼저 https://burnae.kr/register 에서 회원가입 1회 진행한 뒤:
npm run make-admin -- you@example.com

# 6) 슬래시 명령어 등록 (디스코드)
npm run bot:deploy-commands
```

### systemd 서비스 등록

```bash
sudo cp deploy/burnae-web.service /etc/systemd/system/
sudo cp deploy/burnae-bot.service /etc/systemd/system/
# 두 유닛 파일의 User=burnae 를 실제 배포 계정으로 바꿔주세요.
sudo systemctl daemon-reload
sudo systemctl enable --now burnae-web burnae-bot
sudo systemctl status burnae-web burnae-bot
```

### Nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/burnae.kr
sudo ln -s /etc/nginx/sites-available/burnae.kr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d burnae.kr -d www.burnae.kr
```

---

## 7. 관리자 패널에서 첫 세팅

1. `/admin/nodes` — 1번에서 만든 Pterodactyl Node ID + 공인 IP 입력해서 연결
2. `/admin/templates` — Paper/Fabric/Vanilla 등 Nest ID/Egg ID 입력
3. `/admin/products` — 판매할 RAM/CPU/디스크 플랜 생성 (위 템플릿 연결)
4. `/admin/bank-account` — PaySync에 등록한 계좌와 동일하게 입력
5. `/admin/settings` — RAM 단가, 유저 기본 저장공간(10GB), 서브도메인 존(krl.kr) 등 조정
6. `/admin/events` — 프로모션/쿠폰 생성

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
  app/                 # Next.js 라우트 (고객 UI, 관리자 UI, API)
  lib/
    pterodactyl/       # Pterodactyl Application/Client API wrapper
    paysync.ts         # PaySync 결제 연동 + 웹훅 서명 검증
    cloudflare.ts       # 서브도메인 A/SRV 레코드 자동화
    provisioning.ts      # 서버 생성/삭제 전체 오케스트레이션
    ai/                  # AI 챗봇 (tool 정의 + 실행 엔진)
  bot/                  # 디스코드 봇 (별도 프로세스)
prisma/schema.prisma     # 전체 데이터 모델
deploy/                  # systemd, nginx 설정 예시
```
