import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** 사용: npm run make-admin -- you@example.com  (먼저 웹에서 회원가입을 마친 이메일이어야 함) */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("사용법: npm run make-admin -- you@example.com");
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
  });
  console.log(`✅ ${user.email} 을(를) 관리자로 지정했습니다.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
