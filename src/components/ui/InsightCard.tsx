import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Tag, type TagTone } from "@/components/ui/Tag";

export type InsightTone = "violet" | "success" | "warning" | "danger" | "neutral";

function panelClass(tone: InsightTone): { wrap: string; tag: TagTone } {
  switch (tone) {
    case "success":
      return { wrap: "border-emerald-500/20 bg-emerald-500/[0.04]", tag: "success" };
    case "warning":
      return { wrap: "border-amber-500/20 bg-amber-500/[0.04]", tag: "warning" };
    case "danger":
      return { wrap: "border-rose-500/20 bg-rose-500/[0.04]", tag: "danger" };
    case "violet":
      return { wrap: "border-violet-500/20 bg-violet-500/[0.04]", tag: "violet" };
    case "neutral":
    default:
      return { wrap: "border-neutral-800 bg-neutral-900", tag: "neutral" };
  }
}

type Props = {
  title: ReactNode;
  body?: ReactNode;
  tone?: InsightTone;
  tag?: ReactNode;
  className?: string;
};

export function InsightCard({ title, body, tone = "neutral", tag, className = "" }: Props) {
  const { wrap, tag: tagTone } = panelClass(tone);
  return (
    <Card className={"!p-5 " + wrap + " " + className}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold leading-snug text-neutral-50">{title}</p>
        {tag ? <Tag tone={tagTone}>{tag}</Tag> : null}
      </div>
      {body ? (
        <p className="mt-1 text-sm leading-snug text-neutral-400">{body}</p>
      ) : null}
    </Card>
  );
}

