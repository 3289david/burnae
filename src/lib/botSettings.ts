import { prisma } from "@/lib/prisma";

/** 봇 설정 싱글턴을 읽는다. 관리자가 아직 아무 것도 설정 안 했으면 null(=해당 기능 비활성)을 준다 */
export async function getBotSettings() {
  return prisma.botSettings.findUnique({ where: { id: 1 } });
}
