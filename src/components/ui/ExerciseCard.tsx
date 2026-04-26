import type { ReactNode } from "react";
import { Brain } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tag, type TagTone } from "@/components/ui/Tag";

type Props = {
  name: ReactNode;
  sets: ReactNode;
  recommendation?: ReactNode;
  progress?: ReactNode;
  decision?: ReactNode;
  decisionTone?: TagTone;
  compact?: boolean;
  showDecisionBadge?: boolean;
  className?: string;
};

export function ExerciseCard({
  name,
  sets,
  recommendation,
  progress,
  decision,
  decisionTone = "neutral",
  compact = false,
  showDecisionBadge = true,
  className = "",
}: Props) {
  return (
    <Card className={"!p-0 overflow-hidden " + className}>
      <div className={compact ? "p-4" : "p-5"}>
        <div className={"flex items-start gap-3 " + (showDecisionBadge ? "justify-between" : "")}>
          <p
            className={
              "min-w-0 font-semibold leading-snug text-neutral-50 " +
              (compact ? "text-base line-clamp-2" : "text-lg")
            }
          >
            {name}
          </p>
          {showDecisionBadge && decision ? (
            <Tag tone={decisionTone} className="shrink-0">
              {decision}
            </Tag>
          ) : null}
        </div>
        <div
          className={
            "mt-2 tabular-nums leading-snug text-neutral-100 whitespace-pre-line " +
            (compact ? "text-base font-medium" : "text-xl font-medium")
          }
        >
          {sets}
        </div>
        {recommendation ? (
          <p className="mt-1 flex items-start gap-2 text-[13px] font-medium leading-snug text-violet-500">
            <Brain className="mt-[1px] h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">{recommendation}</span>
          </p>
        ) : null}
        {progress ? (
          <p
            className={
              compact
                ? "mt-2 text-[12px] leading-snug text-neutral-200/60"
                : "mt-2 text-sm leading-snug text-neutral-400"
            }
          >
            {progress}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

