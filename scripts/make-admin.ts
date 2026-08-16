import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * 복구용 스크립트. 관리자 패널은 오직 ADMIN_EMAIL(기본값 davideom0414@gmail.com) 하나만
 * 들어갈 수 있고, 그 이메일로 가입/로그인하면 자동으로 ADMIN이 되므로 평소엔 필요 없다.
 * DB를 직접 만졌거나 role이 꼬였을 때 복구용으로만 사용.
 * 사용: npm run make-admin
 */
async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "davideom0414@gmail.com").toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) {
    console.error(
      `${adminEmail} 계정이 아직 없습니다. 먼저 웹에서 이 이메일로 회원가입(또는 소셜 로그인)을 한 번 해주세요.`,
    );
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });
  console.log(`✅ ${updated.email} 을(를) 관리자로 지정했습니다.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
