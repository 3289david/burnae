// Burnae 빈 서버(blank-server) 기본 정적 파일 서버 — 고객이 자기 앱을 직접 띄우기 전까지,
// index.html 같은 파일을 올려두면 바로 보이게 하는 폴백. 실제 앱을 돌리려면 이 프로세스를
// 끄고(pkill -f burnae-static-server) 원하는 포트에 직접 띄우면 된다.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = "/home/container";
const PORT = Number(process.env.SERVER_PORT) || 0;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safeJoin(base, requested) {
  const resolved = path.normalize(path.join(base, requested));
  if (!resolved.startsWith(base)) return base;
  return resolved;
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = safeJoin(ROOT, urlPath);

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>404</h1><p>이 서버에는 아직 파일이 없어요. 파일 탐색기나 SSH로 올려보세요.</p>");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`burnae-static-server: listening on :${PORT}, serving ${ROOT}`);
});
