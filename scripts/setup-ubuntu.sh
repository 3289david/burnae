#!/usr/bin/env bash
#
# Burnae 호스팅 플랫폼 — Ubuntu 22.04+ 서버 초기 설정 스크립트
#
# 이 스크립트가 자동으로 하는 것:
#   - Node.js 22, PostgreSQL, Nginx, certbot, JDK(AI 플러그인 메이커가 Bukkit/Paper 플러그인을
#     javac로 직접 컴파일하는 데 필요) 설치
#   - burnae 시스템 유저 + PostgreSQL DB 생성
#   - 앱 배치(/opt/burnae), .env 뼈대 생성(AUTH_SECRET 자동 생성)
#   - npm install / prisma migrate deploy / build
#   - systemd 서비스(burnae-web, burnae-bot) 등록
#   - (선택) Nginx reverse proxy + certbot HTTPS
#
# 이 스크립트가 대신 못 해주는 것 (README.md 참고해서 직접 진행):
#   - Pterodactyl Panel/Wings 설치, Cloudflare/하나은행 Open API/디스코드/OAuth/OpenRouter 키 발급
#   - .env의 나머지 값 채우기, 관리자 계정 지정(npm run make-admin)
#
# 사용법:
#   sudo bash scripts/setup-ubuntu.sh [git-repo-url]
#   git-repo-url을 생략하면 이 스크립트가 들어있는 현재 저장소를 그대로 /opt/burnae 로 복사한다.

set -euo pipefail

APP_DIR="/opt/burnae"
APP_USER="burnae"
DB_NAME="burnae"
DB_USER="burnae"
REPO_URL="${1:-}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "root 권한으로 실행해주세요: sudo bash scripts/setup-ubuntu.sh"

log "1/8 시스템 패키지 설치"
apt-get update -y
apt-get install -y ca-certificates curl gnupg postgresql nginx certbot python3-certbot-nginx git default-jdk-headless

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 22 ]; then
  log "Node.js 22.x 설치"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  log "Node.js 이미 설치됨: $(node -v)"
fi

log "2/8 시스템 유저 생성"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  log "유저 생성됨: $APP_USER"
else
  log "유저 이미 존재함: $APP_USER"
fi

log "3/8 PostgreSQL 데이터베이스 생성"
DB_PASSWORD="$(openssl rand -hex 16)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
log "DB 준비됨 (비밀번호는 아래 .env에 자동으로 채워짐)"

log "4/8 앱 코드 배치: ${APP_DIR}"
mkdir -p "$APP_DIR"
if [ -n "$REPO_URL" ]; then
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" pull
  else
    git clone "$REPO_URL" "$APP_DIR"
  fi
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [ "$SCRIPT_DIR" != "$APP_DIR" ]; then
    rsync -a --exclude node_modules --exclude .next --exclude .git "$SCRIPT_DIR"/ "$APP_DIR"/
  fi
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

log "5/8 .env 파일 준비"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  AUTH_SECRET="$(openssl rand -base64 32)"
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public\"#" "$APP_DIR/.env"
  sed -i "s#^AUTH_SECRET=.*#AUTH_SECRET=\"${AUTH_SECRET}\"#" "$APP_DIR/.env"
  chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  log ".env 생성됨 — DATABASE_URL/AUTH_SECRET은 자동 설정, 나머지는 직접 채워야 함:"
  echo "    nano ${APP_DIR}/.env"
else
  log ".env 이미 존재함 — 건드리지 않음"
fi

log "6/8 의존성 설치 + 빌드"
cd "$APP_DIR"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run db:generate
sudo -u "$APP_USER" npm run db:migrate:deploy
sudo -u "$APP_USER" npm run db:seed
sudo -u "$APP_USER" npm run build

log "7/8 systemd 서비스 등록"
for svc in burnae-web burnae-bot burnae-maintenance; do
  sed "s#User=burnae#User=${APP_USER}#; s#/opt/burnae#${APP_DIR}#g" "$APP_DIR/deploy/${svc}.service" > "/etc/systemd/system/${svc}.service"
done
cp "$APP_DIR/deploy/burnae-maintenance.timer" /etc/systemd/system/burnae-maintenance.timer
systemctl daemon-reload
systemctl enable burnae-web
systemctl enable --now burnae-maintenance.timer

log "8/8 Nginx 설정"
read -rp "도메인을 입력하세요 (예: burnae.kr, 비워두면 건너뜀): " DOMAIN
if [ -n "$DOMAIN" ]; then
  sed "s#burnae.kr#${DOMAIN}#g" "$APP_DIR/deploy/nginx.conf" > "/etc/nginx/sites-available/${DOMAIN}"
  ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
  nginx -t && systemctl reload nginx
  read -rp "지금 certbot으로 HTTPS 인증서를 발급할까요? (y/N): " ISSUE_CERT
  if [[ "$ISSUE_CERT" =~ ^[Yy]$ ]]; then
    certbot --nginx -d "$DOMAIN" || log "certbot 실패 — DNS가 아직 이 서버를 안 가리키고 있을 수 있어요. 나중에 수동으로 재시도하세요."
  fi
fi

cat <<EOF

✅ 기본 설치가 끝났습니다. 아직 남은 작업:

  1. ${APP_DIR}/.env 나머지 값 채우기 (Pterodactyl, Cloudflare, 하나은행 Open API, OpenRouter,
     OAuth, 디스코드 봇 — README.md 0~6번 참고)
  2. 채운 뒤 서비스 시작:
       systemctl restart burnae-web
       systemctl start burnae-bot   # DISCORD_GUILD_ID까지 채운 뒤에 실행
  3. ADMIN_EMAIL로 https://${DOMAIN:-burnae.kr}/register 에서 가입 → 자동 관리자 지정
     (안 되면 복구용: sudo -u ${APP_USER} npm --prefix ${APP_DIR} run make-admin)
  4. 디스코드 슬래시 명령어 등록:
       sudo -u ${APP_USER} npm --prefix ${APP_DIR} run bot:deploy-commands
  5. 관리자 패널(/admin)에서 노드/상품/서버종류/결제계좌 등록 (README.md 8번)

EOF
