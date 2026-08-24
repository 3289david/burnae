import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const [tasks, completions] = await Promise.all([
    prisma.promotionTask.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.promotionCompletion.findMany({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    points: user.promotionPoints,
    referralCode: user.referralCode,
    tasks: tasks.map((t) => {
      const taskCompletions = completions.filter((c) => c.taskId === t.id);
      const approved = taskCompletions.filter((c) => c.status === "APPROVED");
      const pending = taskCompletions.some((c) => c.status === "PENDING_REVIEW");
      return {
        id: t.id,
        key: t.key,
        title: t.title,
        description: t.description,
        pointsAwarded: t.pointsAwarded,
        verifyMethod: t.verifyMethod,
        repeatable: t.repeatable,
        completed: !t.repeatable && approved.length > 0,
        pending,
        completedCount: approved.length,
      };
    }),
  });
}
