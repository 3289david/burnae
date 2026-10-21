"use client";

import { useEffect, useState } from "react";
import { Database, Check } from "lucide-react";

interface DbOption {
  id: string;
  name: string;
  connectionString: string;
}

/** Railway/Render의 "Connect" 기능과 같은 개념 — 같은 계정의 Postgres/MongoDB/Redis 서버를
 * 골라서 연결 문자열을 바로 받거나, 이 서버의 .env 파일에 바로 써넣을 수 있다. */
export default function DatabaseConnectCard({ serverId }: { serverId: string }) {
  const [options, setOptions] = useState<DbOption[] | null>(null);
  const [selected, setSelected] = useState("");
  const [envVarName, setEnvVarName] = useState("DATABASE_URL");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/connect-database`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setOptions((data?.databases ?? []).filter((d: DbOption) => d.id !== serverId)));
  }, [serverId]);

  async function connect() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/connect-database`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseServerId: selected, envVarName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(`.env 파일에 ${data.envVarName}이 저장됐어요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (!options) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <Database size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">데이터베이스 연결</h3>
          <p className="text-xs text-text-dim">내가 가진 다른 서버(Postgres/MongoDB/Redis)의 접속 정보를 이 서버의 .env 파일에 바로 써줘요.</p>
        </div>
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-text-dim">연결할 수 있는 데이터베이스 서버가 없어요. Postgres/MongoDB/Redis 서버를 먼저 만들어주세요.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select className="input flex-1 min-w-[140px] text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">데이터베이스 서버 선택</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            className="input w-44 text-sm font-mono"
            value={envVarName}
            onChange={(e) => setEnvVarName(e.target.value.toUpperCase())}
            placeholder="DATABASE_URL"
          />
          <button onClick={connect} disabled={busy || !selected} className="btn-primary px-3.5 py-2 text-xs">
            {busy ? "연결 중..." : "연결"}
          </button>
        </div>
      )}

      {result && (
        <p className="text-xs text-green flex items-center gap-1">
          <Check size={13} /> {result}
        </p>
      )}
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
