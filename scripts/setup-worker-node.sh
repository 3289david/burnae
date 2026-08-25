#!/usr/bin/env bash
#
# Burnae 호스팅 플랫폼 — 추가 게임호스팅 노드("서버1", "서버2", ...) 초기 설정 스크립트
#
# 메인 관리서버(Pterodactyl Panel + Burnae 웹앱 + PostgreSQL)와는 별개로, 이 스크립트는
# 오직 "Wings"(실제 Docker 컨테이너로 마인크래프트 서버를 띄우는 데몬)만 설치합니다.
# Burnae 앱, DB, Panel은 이 서버에 설치되지 않습니다 — 여러 대를 추가해서 수평 확장할
# 대상은 항상 이 "Wings 전용 노드"입니다.
#
# 이 스크립트가 자동으로 하는 것:
#   - Docker 설치
#   - Pterodactyl 권장 커널/스왑 설정 확인
#   - Wings 바이너리 설치 + systemd 서비스 등록 (아직 시작은 안 함)
#
# 이 스크립트가 대신 못 해주는 것 (아래 "다음 단계" 참고):
#   - 메인 관리서버의 Panel에서 이 노드를 실제로 등록하는 것 (Admin → Nodes → Create New)
#     → 이건 Panel UI에서만 발급되는 노드별 설정(config.yml)이 필요해서 자동화할 수 없습니다.
#   - Burnae 관리자 패널(/admin/nodes)에 이 노드를 연결하는 것
#
# 사용법:
#   sudo bash scripts/setup-worker-node.sh

set -euo pipefail

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "root 권한으로 실행해주세요: sudo bash scripts/setup-worker-node.sh"

log "1/4 시스템 패키지 확인"
apt-get update -y
apt-get install -y ca-certificates curl gnupg

log "2/4 Docker 설치"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  log "Docker 이미 설치됨: $(docker --version)"
fi

log "3/4 Pterodactyl 권장 설정 확인"
if ! grep -q '^swapaccount=1' /proc/cmdline 2>/dev/null; then
  warn "swapaccount=1 커널 파라미터가 꺼져 있을 수 있어요. Wings 메모리 제한이 정확히 동작하려면"
  warn "  /etc/default/grub 의 GRUB_CMDLINE_LINUX 에 swapaccount=1 을 추가하고 update-grub 후 재부팅하세요."
fi

log "4/4 Wings 바이너리 설치"
mkdir -p /etc/pterodactyl
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) WINGS_ARCH="amd64" ;;
  aarch64) WINGS_ARCH="arm64" ;;
  *) die "지원하지 않는 아키텍처: $ARCH" ;;
esac
curl -L -o /usr/local/bin/wings "https://github.com/pterodactyl/wings/releases/latest/download/wings_linux_${WINGS_ARCH}"
chmod u+x /usr/local/bin/wings

cat > /etc/systemd/system/wings.service <<'EOF'
[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
PIDFile=/var/run/wings/daemon.pid
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload

PUBLIC_IP="$(curl -fsSL https://ifconfig.me || echo '(확인 실패 — 직접 확인해주세요)')"

cat <<EOF

✅ 이 서버(Wings 전용 노드)의 기본 설치가 끝났습니다. 아직 남은 작업:

  1. 메인 관리서버의 Pterodactyl Panel에 로그인 → Admin → Nodes → Create New
     - Name: 원하는 이름 (예: 서버1)
     - FQDN 또는 공인 IP: ${PUBLIC_IP}
     - Behind Proxy: 아니오 (Cloudflare 프록시 안 씀 — 마인크래프트 TCP는 직접 연결)
     - Memory/Disk: 이 서버의 실제 RAM/디스크 용량 입력 (판매 여유를 위해 일부는 남겨두는 걸 추천)
  2. 노드 저장 후 해당 노드의 "Configuration" 탭에서 자동 생성된 config.yml 내용을 복사해서
     이 서버의 /etc/pterodactyl/config.yml 에 붙여넣으세요.
  3. Allocation(포트) 탭에서 이 노드가 쓸 포트 범위를 추가하세요 (Burnae가 서버 생성마다 하나씩 자동 배정).
  4. Wings 시작:
       systemctl enable --now wings
       systemctl status wings
  5. 메인 관리서버의 Burnae 관리자 패널 /admin/nodes 에서 "노드 연결"로 이 노드를 추가하세요.
     - Pterodactyl Node ID: 1번에서 만든 노드의 ID (Panel URL 또는 API로 확인 가능)
     - 공인 IP: ${PUBLIC_IP}
     - 예약 RAM/디스크: 시스템용으로 남겨둘 용량 (선택)
     이렇게 등록하면 Burnae가 여유 자원이 가장 많은 노드에 새 서버를 자동으로 배치합니다
     (RAM/디스크/CPU 여유를 모두 감안해서 노드를 고름 — 노드 하나가 꽉 차면 자동으로 다음 노드로 넘어감).

EOF
