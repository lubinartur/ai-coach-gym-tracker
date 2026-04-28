import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Tag, type TagTone } from "@/components/ui/Tag";

export type InsightTone = "violet" | "success" | "warning" | "danger" | "neutral";

function panelClass(tone: InsightTone): { wrap: string; tag: TagTone } {
  switch (tone) {
    case "success":
      return { wrap: "border-l-[3px] border-l-[#22C55E] bg-[#1A1A1A]", tag: "success" };
    case "warning":
      return { wrap: "border-l-[3px] border-l-[#F59E0B] bg-[#1A1A1A]", tag: "warning" };
    case "danger":
      return { wrap: "border-l-[3px] border-l-[#EF4444] bg-[#1A1A1A]", tag: "danger" };
    case "violet":
      return {
        wrap:
          "border-l-[3px] border-l-[#A855F7] bg-[#1A1A1A] " +
          "bg-[linear-gradient(180deg,rgba(168,85,247,0.08),rgba(168,85,247,0.00))]",
        tag: "violet",
      };
    case "neutral":
    default:
      return { wrap: "border-l-[3px] border-l-[#A855F7] bg-[#1A1A1A]", tag: "neutral" };
  }
}

type Props = {
  title: ReactNode;
  body?: ReactNode;
  tone?: InsightTone;
  tag?: ReactNode;
  compact?: boolean;
  className?: string;
  indicator?: ReactNode;
  indicatorClassName?: string;
  /** Allow wrapping instead of truncation. */
  wrap?: boolean;
  /** Clamp body to N lines when collapsed (only for string body). */
  clampBodyLines?: number;
  /** If true and body is clamped, show a show more/less toggle. */
  expandable?: boolean;
  showMoreLabel?: string;
  showLessLabel?: string;
};

export function InsightCard({
  title,
  body,
  tone = "neutral",
  tag,
  compact = false,
  className = "",
  indicator,
  indicatorClassName = "",
  wrap = false,
  clampBodyLines,
  expandable = false,
  showMoreLabel = "Show more",
  showLessLabel = "Show less",
}: Props) {
  const { wrap: panelWrap, tag: tagTone } = panelClass(tone);
  const [expanded, setExpanded] = useState(false);

  const isStringBody = typeof body === "string";
  const canClamp = Boolean(clampBodyLines && clampBodyLines > 0 && isStringBody);
  const clamped = canClamp && !expanded;

  const titleClass = (() => {
    const size = compact ? "text-sm " : "text-base ";
    const base = "min-w-0 font-semibold text-[#FFFFFF] ";
    if (wrap) return size + base + "whitespace-normal [line-height:1.4]";
    return size + base + "leading-snug line-clamp-1";
  })();

  const bodyClass = (() => {
    const size = compact ? "mt-1 text-xs " : "mt-1 text-sm ";
    const base = "text-[#D4D4D4] ";
    if (wrap) return size + base + "[line-height:1.4] whitespace-normal";
    return size + base + "leading-snug line-clamp-2";
  })();

  const clampStyle = useMemo(() => {
    if (!wrap || !clamped || !clampBodyLines) return undefined;
    return {
      display: "-webkit-box",
      WebkitBoxOrient: "vertical" as const,
      WebkitLineClamp: clampBodyLines,
      overflow: "hidden",
    };
  }, [wrap, clamped, clampBodyLines]);

  return (
    <Card className={(compact ? "!p-4 " : "!p-5 ") + panelWrap + " " + className}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={
              "mt-[1px] inline-flex size-6 items-center justify-center rounded-xl bg-[#222222] " +
              (indicatorClassName ? indicatorClassName : "text-[#A855F7]")
            }
            aria-hidden="true"
          >
            {indicator ?? "✦"}
          </span>
          <p className={titleClass}>
            {title}
          </p>
        </div>
        {tag ? <Tag tone={tagTone}>{tag}</Tag> : null}
      </div>
      {body ? (
        <div className="mt-1">
          <p className={bodyClass} style={clampStyle}>
            {body}
          </p>
          {wrap && expandable && canClamp ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-xs font-semibold text-violet-300/95 hover:text-violet-200"
            >
              {expanded ? showLessLabel : showMoreLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

