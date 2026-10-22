#!/bin/bash
# 모든 서버 공통 SSH 사이드카. 서버의 "실제" 시작 명령(Node/Python 앱 실행 등)은 안 건드리고,
# 이 스크립트 뒤에 그 명령이 그대로 이어서 실행된다 — 백그라운드로 SSH 데몬만 띄워준다.
cd /home/container || exit 1

if [ ! -f .burnae_ssh_pass ]; then
  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20 > .burnae_ssh_pass
fi
SSH_PASS=$(cat .burnae_ssh_pass)

if [ ! -f ./burnae-sshd ]; then
  curl -fsSL https://burnae.kr/downloads/burnae-sshd-amd64 -o ./burnae-sshd
  chmod +x ./burnae-sshd
fi

./burnae-sshd -port "${SERVER_PORT}" -user container -pass "${SSH_PASS}" -shell /bin/bash -hostkey ./.burnae_ssh_host_key &
