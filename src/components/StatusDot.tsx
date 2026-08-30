const COLORS: Record<string, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  gray: "var(--text-dim)",
};

export default function StatusDot({ color }: { color: "green" | "yellow" | "red" | "gray" }) {
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
      {color === "green" && (
        <span
          className="absolute inline-flex w-full h-full rounded-full animate-ping opacity-60"
          style={{ background: COLORS[color] }}
        />
      )}
      <span className="relative inline-block w-2 h-2 rounded-full" style={{ background: COLORS[color] }} />
    </span>
  );
}
