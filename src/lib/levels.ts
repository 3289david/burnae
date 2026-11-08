/**
 * 채팅 레벨링 — 보유 포인트로 바로 계산한다(예전엔 별도 XP 테이블이 있었는데 포인트로
 * 통합되면서 없어졌다). 포인트는 돈이기도 해서 기존 포인트 마일스톤
 * (1000/5000/10000/50000/100000) 감각과 맞게 곡선을 잡았다. 순수 함수라 discord.js/prisma에
 * 의존하지 않는 이 파일에 둬서 Next.js 앱(src/bot/activityRewards.ts를 직접 import하면
 * 게이트웨이 코드까지 번들링돼서 빌드가 깨짐)과 봇 양쪽에서 그대로 쓸 수 있다.
 */
export function pointsForLevel(level: number): number {
  return 500 * level * (level + 1);
}

export function levelForPoints(points: number): number {
  let level = 0;
  while (pointsForLevel(level + 1) <= points) level++;
  return level;
}
