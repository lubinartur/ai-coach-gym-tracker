import type { HTMLAttributes } from "react";

export type BadgeTone = "progress" | "maintain" | "caution";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone: BadgeTone;
};

const base =
  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold";

function toneClass(tone: BadgeTone): string {
  switch (tone) {
    case "progress":
      return "bg-[rgba(34,197,94,0.15)] text-[#22C55E]";
    case "maintain":
      return "bg-[rgba(245,158,11,0.15)] text-[#F59E0B]";
    case "caution":
    default:
      return "bg-[rgba(239,68,68,0.15)] text-[#EF4444]";
  }
}

export function Badge({ tone, className = "", ...rest }: Props) {
  return <span className={`${base} ${toneClass(tone)} ${className}`} {...rest} />;
}

