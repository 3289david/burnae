"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  ServersMock, ConsoleMock, BackupMock, DomainMock, TeamMock, EnvMock, DeployMock, PlayersMock, PluginsMock, AiMock,
} from "./Mocks";

interface Feature { key: string; title: string; desc: string }
interface Ai { user: string; ai: string; server: string; kind: string; applyLabel: string }

function Visual({ k, ai }: { k: string; ai: Ai }) {
  switch (k) {
    case "create": return <ServersMock />;
    case "console": return <ConsoleMock />;
    case "backup": return <BackupMock />;
    case "subdomain": return <DomainMock />;
    case "team": return <TeamMock />;
    case "genEnv": return <EnvMock />;
    case "genDeploy": return <DeployMock />;
    case "mcPlayers": return <PlayersMock />;
    case "mcPlugins": return <PluginsMock />;
    default: return <AiMock {...ai} />;
  }
}

/** 왼쪽에 고정된 제품 화면이 오른쪽 목록 선택에 따라 바뀜(모바일은 항목 안에 표시) */
export default function FeatureShowcase({ features, ai }: { features: Feature[]; ai: Ai }) {
  const [active, setActive] = useState(0);
  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-20 items-start">
      <div className="hidden lg:block lg:sticky lg:top-28">
        <div key={features[active].key} className="animate-fade-up">
          <Visual k={features[active].key} ai={ai} />
        </div>
      </div>
      <ol className="border-t border-border">
        {features.map((f, i) => (
          <li
            key={f.key}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            className="border-b border-border group py-6"
          >
            <div className="flex gap-5 sm:gap-8">
              <span className={`text-xs font-mono pt-1 w-6 shrink-0 ${active === i ? "text-accent" : "text-text-dim"}`}>{String(i + 1).padStart(2, "0")}</span>
              <div className="flex-1">
                <h3 className={`font-semibold text-lg transition-colors ${active === i ? "text-text" : "lg:text-text-dim"}`}>{f.title}</h3>
                <p className="mt-1.5 text-sm text-text-dim leading-relaxed">{f.desc}</p>
              </div>
              <ArrowUpRight size={16} className={`shrink-0 mt-1 transition-colors ${active === i ? "text-accent" : "text-text-dim"}`} />
            </div>
            <div className="lg:hidden mt-5">
              <Visual k={f.key} ai={ai} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
