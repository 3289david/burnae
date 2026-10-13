import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PteroApp } from "../src/lib/pterodactyl";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * golang-generic/java-generic egg에 GIT_ADDRESS 지원을 추가한 뒤, Burnae DB에 캐시된
 * defaultEnvironment/variableSchema/startupCommand가 egg와 어긋나지 않도록 한 번만 다시
 * 가져와 반영한다. (import-egg 라우트가 처음 등록할 때 쓰는 것과 같은 방식)
 */
async function main() {
  const keys = ["golang-generic", "java-generic"];
  for (const key of keys) {
    const template = await prisma.serverTemplate.findUniqueOrThrow({ where: { key } });
    const egg = await PteroApp.getEgg(template.pterodactylNestId, template.pterodactylEggId);
    const variables = egg.relationships?.variables?.data ?? [];

    const defaultEnvironment: Record<string, string> = {};
    const variableSchema = variables.map((v) => {
      defaultEnvironment[v.attributes.env_variable] = v.attributes.default_value;
      return {
        envVariable: v.attributes.env_variable,
        name: v.attributes.name,
        description: v.attributes.description,
        rules: v.attributes.rules,
      };
    });

    await prisma.serverTemplate.update({
      where: { key },
      data: { defaultEnvironment, variableSchema, startupCommand: egg.startup },
    });
    console.log(`[refresh-git-eggs] ${key} — env ${Object.keys(defaultEnvironment).length}개, startup 갱신`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
