import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import ServerDetailClient from "@/components/server/ServerDetailClient";

export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const access = await authorizeServerAccess(user, id);
  if (!access) notFound();

  const server = await prisma.server.findUniqueOrThrow({
    where: { id },
    include: { template: true, product: true, subdomains: { orderBy: { isPrimary: "desc" } } },
  });
  const settings = await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return (
    <ServerDetailClient
      server={{
        id: server.id,
        name: server.name,
        status: server.status,
        subdomains: server.subdomains.map((s) => ({ id: s.id, subdomain: s.subdomain, isPrimary: s.isPrimary })),
        subdomainZone: settings.subdomainZone,
        allocationIp: server.allocationIp,
        allocationPort: server.allocationPort,
        ramMb: server.ramMb,
        diskMb: server.diskMb,
        cpuPercent: server.cpuPercent,
        backupSlots: server.backupSlots,
        templateName: server.template.displayName,
        minecraftVersion: server.minecraftVersion,
        isOwner: server.ownerId === user.id,
      }}
    />
  );
}
