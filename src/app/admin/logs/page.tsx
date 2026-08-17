import { prisma } from "@/lib/prisma";

export default async function AdminLogsPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">로그</h1>
      <p className="text-sm text-text-dim mt-1">최근 관리자/시스템 작업 150건</p>

      <div className="mt-6 card p-0 overflow-hidden">
        <div className="divide-y divide-border">
          {logs.map((log) => (
            <div key={log.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="font-medium">{log.action}</span>
                <span className="text-xs text-text-dim shrink-0">{log.createdAt.toLocaleString("ko-KR")}</span>
              </div>
              <p className="text-xs text-text-dim mt-0.5">
                {log.actor ? `${log.actor.name} (${log.actor.email})` : "시스템"} · {log.targetType} #{log.targetId.slice(-8)}
              </p>
              {log.metadata != null && (
                <pre className="text-xs text-text-dim mt-1 overflow-x-auto">{JSON.stringify(log.metadata)}</pre>
              )}
            </div>
          ))}
          {logs.length === 0 && <p className="px-4 py-6 text-sm text-text-dim">아직 기록된 로그가 없어요.</p>}
        </div>
      </div>
    </div>
  );
}
