"use client";

import { Copy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import UpgradeCard from "./UpgradeCard";
import type { ServerInfo } from "./ServerDetailClient";

export default function UpgradeTab({ server }: { server: ServerInfo }) {
  return (
    <div className="space-y-6 animate-fade-up">
      <UpgradeCard serverId={server.id} currentProductId={server.productId} />

      {server.productId && (
        <div className="card-glow p-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm">이 설정으로 새 서버 또 만들기</h3>
            <p className="text-xs text-text-dim mt-0.5">같은 플랜으로 처음부터 다시 설정할 필요 없이 바로 시작해요.</p>
          </div>
          <Link href={`/dashboard/servers/new?productId=${server.productId}`} className="btn-secondary px-4 py-2 text-sm inline-flex items-center gap-1.5 shrink-0">
            <Copy size={14} /> 또 만들기
          </Link>
        </div>
      )}
    </div>
  );
}
