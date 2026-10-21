import type { Server, ServerTemplate } from "@/generated/prisma/client";

/** 연결 문자열을 만들어줄 수 있는 DB 템플릿들과 그 규칙(기본 사용자명 등 — 비밀번호는 항상
 * accessSecret). "서비스 연결"(Railway/Render의 "Connect" 기능과 같은 개념) 대상 목록이다 */
const DB_TEMPLATES: Record<string, { kind: "postgres" | "mongodb" | "redis"; user: string }> = {
  "postgres-16": { kind: "postgres", user: "pterodactyl" },
  "mongodb-7": { kind: "mongodb", user: "admin" },
  "redis-7": { kind: "redis", user: "" },
};

export function isDatabaseTemplate(templateKey: string): boolean {
  return templateKey in DB_TEMPLATES;
}

export function databaseTemplateKeys(): string[] {
  return Object.keys(DB_TEMPLATES);
}

/** DB 서버 하나의 연결 문자열을 만든다 — host/port는 서버에 할당된 공개 주소, 비밀번호는 항상
 * accessSecret(서버마다 랜덤 생성됨, provisioning.ts 참고). DB 서버가 아니거나 아직 접속 정보가
 * 없으면 null */
export function buildConnectionString(
  dbServer: Pick<Server, "accessSecret" | "allocationIp" | "allocationPort">,
  template: Pick<ServerTemplate, "key">,
): string | null {
  const meta = DB_TEMPLATES[template.key];
  if (!meta || !dbServer.accessSecret || !dbServer.allocationIp || !dbServer.allocationPort) return null;

  const { kind, user } = meta;
  const host = dbServer.allocationIp;
  const port = dbServer.allocationPort;
  const pass = encodeURIComponent(dbServer.accessSecret);

  switch (kind) {
    case "postgres":
      return `postgresql://${user}:${pass}@${host}:${port}/postgres`;
    case "mongodb":
      return `mongodb://${user}:${pass}@${host}:${port}`;
    case "redis":
      return `redis://:${pass}@${host}:${port}`;
  }
}
