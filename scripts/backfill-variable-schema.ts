import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PteroApp } from "../src/lib/pterodactyl";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * import-egg로 등록된 기존 템플릿들은 variableSchema가 없다(그 기능이 나중에 추가됨) — 이미
 * Pterodactyl에 있는 egg이므로 Application API로 변수 메타데이터를 가져와 한 번만 채워준다.
 * (새로 import하는 템플릿은 import-egg 라우트가 생성 시점에 바로 채움)
 */
async function main() {
  const templates = await prisma.serverTemplate.findMany({ where: { variableSchema: { equals: Prisma.DbNull } } });
  console.log(`[backfill] variableSchema 없는 템플릿 ${templates.length}개`);

  for (const t of templates) {
    try {
      const egg = await PteroApp.getEgg(t.pterodactylNestId, t.pterodactylEggId);
      const variables = egg.relationships?.variables?.data ?? [];
      const variableSchema = variables.map((v) => ({
        envVariable: v.attributes.env_variable,
        name: v.attributes.name,
        description: v.attributes.description,
        rules: v.attributes.rules,
      }));
      await prisma.serverTemplate.update({ where: { id: t.id }, data: { variableSchema } });
      console.log(`[backfill] ${t.key} — 변수 ${variableSchema.length}개 저장`);
    } catch (err) {
      console.error(`[backfill] ${t.key} 실패:`, err instanceof Error ? err.message : err);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
