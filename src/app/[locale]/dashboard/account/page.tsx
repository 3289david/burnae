import ArtCallout from "@/components/ArtCallout";
import PageHeader from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DiscordLinkCard from "@/components/DiscordLinkCard";
import DepositorNameCard from "@/components/DepositorNameCard";
import PhoneVerificationCard from "@/components/PhoneVerificationCard";
import TwoFactorCard from "@/components/TwoFactorCard";
import ApiTokensCard from "@/components/ApiTokensCard";
import SshGatewayCodeCard from "@/components/SshGatewayCodeCard";
import { UserCircle2 } from "lucide-react";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ discordError?: string; discordLinked?: string }>;
}) {
  const user = await getCurrentUser();
  const link = await prisma.discordLink.findUnique({ where: { userId: user!.id } });
  const params = await searchParams;

  return (
    <div className="max-w-5xl">
      <PageHeader art="account" title="계정" desc="내 정보와 보안 설정이에요." />

      <div className="card p-5 mt-6 space-y-2 text-sm animate-fade-up max-w-md" style={{ animationDelay: "0.05s" }}>
        <div className="flex justify-between"><span className="text-text-dim">이름</span><span>{user!.name}</span></div>
        <div className="flex justify-between"><span className="text-text-dim">이메일</span><span>{user!.email}</span></div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 items-start">
      <div className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <DepositorNameCard initial={user!.preferredDepositorName} />
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "0.13s" }}>
        <PhoneVerificationCard verified={!!user!.verifiedPhoneNumber} />
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <DiscordLinkCard linked={!!link} error={params.discordError} justLinked={params.discordLinked === "1"} />
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "0.18s" }}>
        <TwoFactorCard enabled={user!.twoFactorEnabled} />
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
        <ApiTokensCard />
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "0.23s" }}>
        <SshGatewayCodeCard />
      </div>
        <ArtCallout className="md:col-span-2" src="head-account" title="계정을 안전하게" desc="2단계 인증과 휴대폰 인증을 켜두면 서버를 더 안전하게 지킬 수 있어요." />
      </div>
    </div>
  );
}
