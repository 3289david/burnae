import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/PageHeader";
import EnvGroupsClient from "./EnvGroupsClient";

export default async function EnvGroupsPage() {
  const user = await getCurrentUser();
  const servers = await prisma.server.findMany({
    where: { ownerId: user!.id, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <PageHeader
        art="new"
        title="환경변수 그룹"
        desc="여러 서버에 같은 API 키·설정값을 한 번에 적용해요. 그룹을 수정하면 연결된 서버 전부에 다시 적용할 수 있어요."
      />
      <EnvGroupsClient servers={servers} />
    </div>
  );
}
