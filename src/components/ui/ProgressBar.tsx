import type { HTMLAttributes } from "react";

export type ProgressTone = "neutral" | "ready" | "moderate" | "fatigued";

function barToneClass(tone: ProgressTone): string {
  switch (tone) {
    case "ready":
      return "bg-emerald-500";
    case "moderate":
      return "bg-amber-500";
    case "fatigued":
      return "bg-rose-500";
    case "neutral":
    default:
      return "bg-violet-500";
  }
}

type Props = HTMLAttributes<HTMLDivElement> & {
  value: number; // 0..100
  tone?: ProgressTone;
};

export function ProgressBar({ value, tone = "neutral", className = "", ...rest }: Props) {
  const v = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div
      className={
        "h-2 w-full overflow-hidden rounded-full bg-neutral-800/80 ring-1 ring-neutral-700/60 " +
        className
      }
      {...rest}
    >
      <div
        className={"h-full rounded-full " + barToneClass(tone)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

