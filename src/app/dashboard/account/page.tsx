import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DiscordLinkCard from "@/components/DiscordLinkCard";
import DepositorNameCard from "@/components/DepositorNameCard";

export default async function AccountPage() {
  const user = await getCurrentUser();
  const link = await prisma.discordLink.findUnique({ where: { userId: user!.id } });

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold">계정</h1>

      <div className="card p-5 mt-6 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-text-dim">이름</span><span>{user!.name}</span></div>
        <div className="flex justify-between"><span className="text-text-dim">이메일</span><span>{user!.email}</span></div>
      </div>

      <div className="mt-4">
        <DepositorNameCard initial={user!.preferredDepositorName} />
      </div>

      <div className="mt-4">
        <DiscordLinkCard linked={!!link} />
      </div>
    </div>
  );
}
