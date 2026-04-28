import type { HTMLAttributes } from "react";

export type TagTone = "neutral" | "violet" | "success" | "warning" | "danger";

function toneClass(tone: TagTone): string {
  switch (tone) {
    case "violet":
      return "bg-[rgba(168,85,247,0.15)] text-[#A855F7]";
    case "success":
      return "bg-[rgba(34,197,94,0.15)] text-[#22C55E]";
    case "warning":
      return "bg-[rgba(245,158,11,0.15)] text-[#F59E0B]";
    case "danger":
      return "bg-[rgba(239,68,68,0.15)] text-[#EF4444]";
    case "neutral":
    default:
      return "bg-[rgba(156,163,175,0.12)] text-[#D4D4D4]";
  }
}

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: TagTone;
};

export function Tag({ tone = "neutral", className = "", ...rest }: Props) {
  return (
    <span
      className={
        "inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold " +
        toneClass(tone) +
        " " +
        className
      }
      {...rest}
    />
  );
}

