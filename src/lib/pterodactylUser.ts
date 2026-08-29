/** Burnae 유저당 하나씩 존재하는 Pterodactyl 패널 계정의 결정적(deterministic) 유저명 — 항상 이 규칙으로 생성한다 */
export function panelUsernameForUser(userId: string): string {
  return `burnae_${userId.slice(-8)}`;
}
