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

./burnae-sshd -port "${SSH_PORT}" -user container -pass "${SSH_PASS}" -shell /bin/bash -hostkey ./.burnae_ssh_host_key &

# apt로도 Node.js를 설치할 수 있지만, 그래도 미리 컴파일된 바이너리를 깔아둬서 바로 쓸 수
# 있게 한다 — apt 미러가 느리거나 안 될 때도 바로 node/npm이 되고, 에그 버전과 무관하게
# 항상 같은 Node 버전을 보장한다. 처음 부팅할 때 한 번만 설치 — 실패해도 로그만 남기고
# 부팅 자체는 계속 진행한다
NODE_VERSION="22.11.0"
if [ ! -d "node-v${NODE_VERSION}-linux-x64" ]; then
  (
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/burnae-node.tar.xz \
      && tar -xf /tmp/burnae-node.tar.xz \
      && rm -f /tmp/burnae-node.tar.xz
  ) > .burnae_node_install.log 2>&1
  if [ -x "./node-v${NODE_VERSION}-linux-x64/bin/node" ] && ! grep -q 'node-v.*-linux-x64/bin' .bashrc 2>/dev/null; then
    echo "export PATH=\"/home/container/node-v${NODE_VERSION}-linux-x64/bin:\$PATH\"" >> .bashrc
  fi
fi

# 대시보드에서 켠 경우에만(기본은 꺼짐) index.html 같은 파일을 올려두는 것만으로 바로
# 보이게 기본 정적 파일 서버를 띄워준다 — 꺼져 있으면 아무것도 안 하니 고객이 원하는 포트에
# 자기 앱을 자유롭게 띄울 수 있다.
if [ "${STATIC_SERVER_ENABLED}" = "1" ]; then
  if [ ! -f ./burnae-static-server.js ]; then
    curl -fsSL https://burnae.kr/downloads/burnae-static-server.js -o ./burnae-static-server.js
  fi
  export PATH="/home/container/node-v${NODE_VERSION}-linux-x64/bin:$PATH"
  nohup node ./burnae-static-server.js > .burnae_static_server.log 2>&1 &
fi

echo '서버 준비 완료 - 콘솔에 명령어를 입력해서 바로 쓸 수 있고, SSH로도 접속할 수 있어요. (SSH 비밀번호는 대시보드에서 확인하세요)'
if [ "${STATIC_SERVER_ENABLED}" = "1" ]; then
  echo "참고: 지금은 기본 정적 파일 서버가 ${SERVER_PORT}번 포트에서 /home/container를 그대로 보여주고 있어요 — index.html을 올려두면 바로 보여요. 직접 앱을 띄우려면 대시보드에서 이 기능을 꺼주세요."
fi
echo '참고: apt install도 돼요(진짜 VPS처럼 쓸 수 있어요). Node.js는 이미 설치돼 있고요(node --version, npm --version) — 다른 언어/패키지는 apt install로 바로 깔거나, 비슷하게 /home/container 안에 압축 풀어서 써도 돼요.'
exec /bin/sh
