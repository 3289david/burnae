#!/bin/bash
# Burnae VPS류(General) 서버 부팅 스크립트. 서버의 startup_command는 이 스크립트를
# 내려받아 실행만 하므로, 콘솔에는 이 파일의 "내용"이 아니라 짧은 다운로드+실행 한 줄만
# echo된다 — SSH 비밀번호 등 민감한 값이 콘솔 로그에 그대로 남지 않는다.
cd /home/container || exit 1

# 서버마다 처음 부팅할 때 한 번만 랜덤 비밀번호를 만들어서 파일로 저장해둔다. 재부팅해도
# 그대로 유지되고, 서버마다 다른 값이라 한 서버 비밀번호가 새도 다른 서버는 안전하다.
if [ ! -f .burnae_ssh_pass ]; then
  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20 > .burnae_ssh_pass
fi
SSH_PASS=$(cat .burnae_ssh_pass)

if [ ! -f ./burnae-sshd ]; then
  curl -fsSL https://burnae.kr/downloads/burnae-sshd-amd64 -o ./burnae-sshd
  chmod +x ./burnae-sshd
fi

./burnae-sshd -port "${SERVER_PORT}" -user container -pass "${SSH_PASS}" -shell /bin/bash -hostkey ./.burnae_ssh_host_key &

echo '서버 준비 완료 - 콘솔에 명령어를 입력해서 바로 쓸 수 있고, SSH로도 접속할 수 있어요. (SSH 비밀번호는 대시보드에서 확인하세요)'
exec /bin/sh
