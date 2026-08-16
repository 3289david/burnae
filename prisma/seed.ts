import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * 최초 배포 시 1회 실행하는 초기화 스크립트.
 * 가짜 상품/서버/유저 데이터는 만들지 않는다 — HostingSettings 기본값만 생성.
 * 상품/서버 종류(Egg)/노드는 반드시 관리자 패널에서 실제 Pterodactyl 정보로 등록해야 한다.
 */
async function main() {
  await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  console.log("✅ HostingSettings 기본값 생성 완료");
  console.log("다음 단계: npm run make-admin -- you@example.com 로 관리자 계정을 지정하세요.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
