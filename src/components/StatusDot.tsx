const COLORS: Record<string, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  gray: "var(--text-dim)",
};

export default function StatusDot({ color }: { color: "green" | "yellow" | "red" | "gray" }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: COLORS[color] }}
      aria-hidden="true"
    />
  );
}
