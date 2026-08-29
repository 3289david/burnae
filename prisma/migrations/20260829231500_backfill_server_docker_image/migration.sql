-- 런타임 버전 선택 기능(dockerImageRequested)이 Server.dockerImage 컬럼보다 먼저 생겨서,
-- 그 사이에 만들어진 서버는 dockerImage가 비어있을 수 있다 — 원래 주문에 남아있는 값으로 채운다
UPDATE "Server" s
SET "dockerImage" = o."dockerImageRequested"
FROM "Order" o
WHERE o."serverId" = s.id
  AND s."dockerImage" IS NULL
  AND o."dockerImageRequested" IS NOT NULL;
