/**
 * MB 단위 용량을 보기 좋게 표시한다. 1024 미만이면 MB 그대로, 아니면 GB로 변환한다.
 * (ramMb/1024).toFixed(0) 같은 식으로 직접 계산하면 512MB가 0.5 → "1GB"로 반올림되는
 * 버그가 여러 곳에 흩어져 있었다 — 그걸 막기 위한 공용 헬퍼.
 */
export function formatMb(mb: number): string {
  if (mb < 1024) return `${mb}MB`;
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)}GB`;
}
