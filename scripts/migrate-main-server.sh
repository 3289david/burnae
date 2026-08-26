#!/usr/bin/env bash
#
# Burnae 메인 관리서버(웹앱+DB)를 완전히 새로운 서버로 옮기는 스크립트.
#
# 왜 관리자 패널 버튼이 아니라 스크립트인가:
#   고객 마인크래프트 서버 하나를 다른 노드로 옮기는 건 /admin/servers의 "노드 이전" 기능으로
#   앱이 켜진 채로 자동화할 수 있다. 하지만 앱 자기 자신과 그 DB를 옮기는 건 얘기가 다르다 —
#   지금 요청을 처리 중인 바로 그 프로세스가 자기 자신의 DB/파일시스템을 옮길 수는 없다(닭이 먼저냐
#   달걀이 먼저냐 문제). 그래서 이건 관리자가 두 서버에서 순서대로 실행하는 런북 스크립트다.
#
# 사용법 (기존 서버에서):
#   sudo bash scripts/migrate-main-server.sh export
#     → /opt/burnae-migration/burnae-export-<날짜>.tar.gz 생성 (DB 덤프 + .env + 앱 코드)
#
# 그 다음, 새 서버를 scripts/setup-ubuntu.sh로 먼저 기본 설치한 뒤(Postgres/Node 등 준비),
# export한 tar.gz를 새 서버로 옮기고(scp 등) 실행:
#   sudo bash scripts/migrate-main-server.sh import /path/to/burnae-export-<날짜>.tar.gz
#     → DB 복원 + .env 복사 + 서비스 재시작까지 자동 진행
#
# 마지막으로 직접 해야 하는 것 (스크립트가 대신 못 해주는 것):
#   - DNS(burnae.kr A 레코드)를 새 서버 IP로 변경
#   - Pterodactyl Panel이 새 관리서버와 다른 곳에 있다면 .env의 PTERODACTYL_URL이 여전히 유효한지 확인
#   - 옛 서버는 DNS 전환 후 며칠 안정성 확인하고 나서 종료할 것 (바로 끄지 말 것)

set -euo pipefail

APP_DIR="/opt/burnae"
DB_NAME="burnae"
DB_USER="burnae"
EXPORT_DIR="/opt/burnae-migration"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "root 권한으로 실행해주세요"

MODE="${1:-}"

case "$MODE" in
  export)
    log "1/3 데이터베이스 덤프"
    mkdir -p "$EXPORT_DIR"
    TIMESTAMP="$(date +%Y%m%d%H%M%S)"
    DUMP_FILE="$EXPORT_DIR/db-$TIMESTAMP.sql"
    sudo -u postgres pg_dump "$DB_NAME" > "$DUMP_FILE"

    log "2/3 앱 코드 + .env 압축 (node_modules/.next/.git 제외)"
    ARCHIVE="$EXPORT_DIR/burnae-export-$TIMESTAMP.tar.gz"
    tar -czf "$ARCHIVE" \
      --exclude="$APP_DIR/node_modules" \
      --exclude="$APP_DIR/.next" \
      --exclude="$APP_DIR/.git" \
      -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" \
      -C "$EXPORT_DIR" "$(basename "$DUMP_FILE")"
    rm -f "$DUMP_FILE"

    log "3/3 완료"
    cat <<EOF

✅ 내보내기 완료: $ARCHIVE

다음 단계:
  1. 새 서버에서 먼저 scripts/setup-ubuntu.sh를 실행해 Node/PostgreSQL/Nginx를 기본 설치하세요
     (이 단계에서 만들어지는 DB/사용자는 아래 import가 덮어씁니다).
  2. 이 파일을 새 서버로 복사: scp $ARCHIVE user@새서버:/tmp/
  3. 새 서버에서: sudo bash scripts/migrate-main-server.sh import /tmp/$(basename "$ARCHIVE")

EOF
    ;;

  import)
    ARCHIVE="${2:-}"
    [ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || die "사용법: migrate-main-server.sh import <burnae-export-*.tar.gz 경로>"
    command -v psql >/dev/null 2>&1 || die "PostgreSQL이 안 보여요. 먼저 scripts/setup-ubuntu.sh를 실행하세요."

    log "1/4 압축 해제"
    WORKDIR="$(mktemp -d)"
    tar -xzf "$ARCHIVE" -C "$WORKDIR"
    DUMP_FILE="$(find "$WORKDIR" -maxdepth 1 -name 'db-*.sql' | head -1)"
    [ -n "$DUMP_FILE" ] || die "DB 덤프 파일을 못 찾았어요. export 단계 결과물이 맞는지 확인하세요."

    log "2/4 기존 DB 초기화 후 복원 (주의: $DB_NAME 데이터베이스 내용을 덮어씁니다)"
    read -rp "정말 진행할까요? 되돌릴 수 없습니다 (yes 입력): " CONFIRM
    [ "$CONFIRM" = "yes" ] || die "취소했어요."
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};"
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
    sudo -u postgres psql "$DB_NAME" < "$DUMP_FILE"

    log "3/4 앱 코드 복원 (.env 포함, node_modules는 새로 설치)"
    systemctl stop burnae-web burnae-bot burnae-maintenance.timer 2>/dev/null || true
    cp -r "$WORKDIR/$(basename "$APP_DIR")/." "$APP_DIR/"
    chown -R burnae:burnae "$APP_DIR"

    log "4/4 의존성 설치 + 빌드 + 서비스 재시작"
    cd "$APP_DIR"
    sudo -u burnae npm install
    sudo -u burnae npm run build
    systemctl start burnae-web
    systemctl start burnae-maintenance.timer

    rm -rf "$WORKDIR"

    cat <<EOF

✅ 가져오기 완료.

아직 남은 작업 (직접 해야 함):
  1. .env의 PTERODACTYL_URL 등 이 서버 기준으로 여전히 맞는지 확인
  2. burnae.kr DNS A 레코드를 이 서버의 새 공인 IP로 변경
  3. DNS 전파 후 정상 동작 확인되면: systemctl start burnae-bot (봇도 옮겼다면)
  4. 며칠 안정성 확인 후 옛 서버 종료 — 문제 생기면 되돌릴 수 있게 바로 끄지 마세요

EOF
    ;;

  *)
    die "사용법: sudo bash scripts/migrate-main-server.sh [export|import <파일>]"
    ;;
esac
