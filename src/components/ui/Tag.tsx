import type { HTMLAttributes } from "react";

export type TagTone = "neutral" | "violet" | "success" | "warning" | "danger";

function toneClass(tone: TagTone): string {
  switch (tone) {
    case "violet":
      return "border-violet-500/30 bg-violet-500/10 text-violet-100";
    case "success":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-500/25 bg-amber-500/10 text-amber-100";
    case "danger":
      return "border-rose-500/25 bg-rose-500/10 text-rose-100";
    case "neutral":
    default:
      return "border-neutral-700/70 bg-neutral-800/60 text-neutral-200";
  }
}

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: TagTone;
};

export function Tag({ tone = "neutral", className = "", ...rest }: Props) {
  return (
    <span
      className={
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium " +
        "tracking-wide " +
        toneClass(tone) +
        " " +
        className
      }
      {...rest}
    />
  );
}

