"use client";

import { useEffect, useState } from "react";
import { GithubLogo } from "@/components/ProviderIcons";

interface GithubRepoSummary {
  fullName: string;
  cloneUrl: string;
  private: boolean;
  updatedAt: string;
}

/** 프리셋 공개 시 깃허브 저장소 주소를 직접 타이핑하는 대신, 연동된 계정의 저장소 목록에서
 * 고르게 한다. 연동이 안 되어 있으면 연동 버튼을 보여준다(돌아올 위치는 returnTo로 받음). */
export default function GithubRepoPicker({
  value,
  onChange,
  returnTo,
}: {
  value: string;
  onChange: (cloneUrl: string) => void;
  returnTo: string;
}) {
  const [githubLogin, setGithubLogin] = useState<string | null | undefined>(undefined);
  const [repos, setRepos] = useState<GithubRepoSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/github/repos")
      .then(async (r) => {
        if (!r.ok) {
          setGithubLogin(null);
          return;
        }
        const data = await r.json();
        setGithubLogin(data.githubLogin);
        setRepos(data.repos);
      })
      .catch(() => setGithubLogin(null));
  }, []);

  if (githubLogin === undefined) {
    return <p className="text-xs text-text-dim">저장소 목록 불러오는 중...</p>;
  }

  if (githubLogin === null) {
    return (
      <a
        href={`/api/github/connect/start?returnTo=${encodeURIComponent(returnTo)}`}
        className="btn-secondary px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
      >
        <GithubLogo size={13} /> GitHub 연동하고 저장소 선택하기
      </a>
    );
  }

  return (
    <select className="input w-full text-sm font-mono" value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">저장소 선택</option>
      {repos?.map((r) => (
        <option key={r.fullName} value={r.cloneUrl}>
          {r.fullName}{r.private ? " (비공개)" : ""}
        </option>
      ))}
    </select>
  );
}
