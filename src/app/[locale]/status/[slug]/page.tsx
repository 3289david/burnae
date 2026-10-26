import { notFound } from "next/navigation";
import { getStatusPageData } from "@/lib/statusPage";
import BrandMark from "@/components/BrandMark";

// 다운/복구가 실시간으로 바뀌어야 해서 매 요청마다 새로 조회한다
export const revalidate = 0;

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}시간 ${rem}분`;
}

export default async function StatusPage({ params }: PageProps<"/[locale]/status/[slug]">) {
  const { slug } = await params;
  const data = await getStatusPageData(slug);
  if (!data) notFound();

  const isEn = false;

  return (
    <div className="min-h-screen flex flex-col items-center bg-bg">
      <main className="max-w-2xl w-full px-6 py-16 flex-1">
        <div className="flex items-center gap-2 text-sm text-text-dim mb-8">
          <BrandMark size={18} /> Burnae Status
        </div>

        <div className="rounded-xl border border-border p-6 flex items-center gap-4">
          <span
            className={`h-3 w-3 rounded-full shrink-0 ${data.isUp ? "bg-green-500" : "bg-red-500 animate-pulse"}`}
          />
          <div>
            <h1 className="text-xl font-bold font-display">{data.serverName}</h1>
            <p className={`text-sm mt-0.5 ${data.isUp ? "text-green-500" : "text-red-500"}`}>
              {data.isUp
                ? isEn
                  ? "All systems operational"
                  : "정상 작동 중"
                : isEn
                  ? "Experiencing downtime"
                  : "현재 장애 발생 중"}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold font-display">{data.uptimePercent.toFixed(2)}%</p>
            <p className="text-xs text-text-dim">{isEn ? "uptime (90d)" : "가동률 (90일)"}</p>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-text-dim mt-10 mb-3">
          {isEn ? "Incident history" : "장애 이력"}
        </h2>
        {data.incidents.length === 0 ? (
          <p className="text-sm text-text-dim">
            {isEn ? "No incidents in the last 90 days." : "최근 90일간 장애가 없었어요."}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.incidents.map((inc, i) => {
              const end = inc.endedAt ?? new Date();
              const durationMs = end.getTime() - inc.startedAt.getTime();
              return (
                <li
                  key={i}
                  className="rounded-lg border border-border px-4 py-3 text-sm flex items-center justify-between"
                >
                  <span className="text-text-dim">
                    {inc.startedAt.toLocaleString(isEn ? "en-US" : "ko-KR")}
                  </span>
                  <span className={inc.endedAt ? "text-text-dim" : "text-red-500 font-medium"}>
                    {inc.endedAt
                      ? formatDuration(durationMs)
                      : "진행 중"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
