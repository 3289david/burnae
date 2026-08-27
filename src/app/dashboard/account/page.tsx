import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DiscordLinkCard from "@/components/DiscordLinkCard";
import DepositorNameCard from "@/components/DepositorNameCard";
import { UserCircle2 } from "lucide-react";

export default async function AccountPage() {
  const user = await getCurrentUser();
  const link = await prisma.discordLink.findUnique({ where: { userId: user!.id } });

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-3 animate-fade-up">
        <span className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
          <UserCircle2 size={20} className="text-accent" />
        </span>
        <h1 className="text-2xl font-bold font-display">계정</h1>
      </div>

      <div className="card-glow p-5 mt-6 space-y-2 text-sm animate-fade-up" style={{ animationDelay: "0.05s" }}>
        <div className="flex justify-between"><span className="text-text-dim">이름</span><span>{user!.name}</span></div>
        <div className="flex justify-between"><span className="text-text-dim">이메일</span><span>{user!.email}</span></div>
      </div>

      <div className="mt-4 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <DepositorNameCard initial={user!.preferredDepositorName} />
      </div>

      <div className="mt-4 animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <DiscordLinkCard linked={!!link} />
      </div>
    </div>
  );
}
