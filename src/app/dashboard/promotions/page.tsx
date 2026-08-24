import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PromotionsClient from "@/components/PromotionsClient";

export default async function PromotionsPage() {
  const user = await getCurrentUser();
  const [tasks, completions, servers, redeemableProducts] = await Promise.all([
    prisma.promotionTask.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.promotionCompletion.findMany({ where: { userId: user!.id } }),
    prisma.server.findMany({
      where: { ownerId: user!.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { active: true, pointsRedeemable: true, allowedTemplates: { some: { active: true } } },
      include: { allowedTemplates: { where: { active: true } } },
    }),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <PromotionsClient
      points={user!.promotionPoints}
      referralLink={`${siteUrl}/register?ref=${user!.referralCode}`}
      servers={servers}
      redeemableProducts={redeemableProducts.map((p) => ({
        id: p.id,
        name: p.name,
        ramMb: p.ramMb,
        cpuPercent: p.cpuPercent,
        diskMb: p.diskMb,
        pointsCost: p.pointsCost ?? 0,
        allowedTemplates: p.allowedTemplates.map((t) => ({
          id: t.id,
          displayName: t.displayName,
          minecraftVersions: t.minecraftVersions,
        })),
      }))}
      tasks={tasks.map((t) => {
        const taskCompletions = completions.filter((c) => c.taskId === t.id);
        const approvedCount = taskCompletions.filter((c) => c.status === "APPROVED").length;
        const pending = taskCompletions.some((c) => c.status === "PENDING_REVIEW");
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          pointsAwarded: t.pointsAwarded,
          verifyMethod: t.verifyMethod,
          repeatable: t.repeatable,
          completed: !t.repeatable && approvedCount > 0,
          pending,
        };
      })}
    />
  );
}
