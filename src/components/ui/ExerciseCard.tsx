import type { ReactNode } from "react";
import { Activity, ArrowDown, ArrowDownRight, Brain, Dumbbell } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tag, type TagTone } from "@/components/ui/Tag";

type Props = {
  name: ReactNode;
  sets: ReactNode;
  recommendation?: ReactNode;
  /** Short per-exercise coach note (e.g. model `reason`); shown under prescription / decision line. */
  coachNote?: ReactNode;
  /** Muted line under sets (e.g. “Last time: W×R” from baselines). */
  lastTimeLine?: ReactNode;
  /** Muted line for load provenance (e.g. history vs calibration). */
  loadSourceLine?: ReactNode;
  progress?: ReactNode;
  decision?: ReactNode;
  decisionTone?: TagTone;
  compact?: boolean;
  showDecisionBadge?: boolean;
  className?: string;
};

function iconForExerciseName(name: string): ReactNode {
  const s = name.toLowerCase();
  const iconClass = "h-4 w-4 text-[#A855F7]";
  if (s.includes("bench") || s.includes("press")) return <Dumbbell className={iconClass} strokeWidth={2} />;
  if (s.includes("row") || s.includes("pulldown") || s.includes("pull-up") || s.includes("pullup"))
    return <ArrowDown className={iconClass} strokeWidth={2} />;
  if (s.includes("pushdown") || s.includes("triceps")) return <ArrowDownRight className={iconClass} strokeWidth={2} />;
  if (s.includes("lateral") || s.includes("shoulder")) return <Activity className={iconClass} strokeWidth={2} />;
  return <Dumbbell className={iconClass} strokeWidth={2} />;
}

export function ExerciseCard({
  name,
  sets,
  recommendation,
  coachNote,
  lastTimeLine,
  loadSourceLine,
  progress,
  decision,
  decisionTone = "neutral",
  compact = false,
  showDecisionBadge = true,
  className = "",
}: Props) {
  const nameText = typeof name === "string" ? name : null;
  const leftIcon = nameText ? iconForExerciseName(nameText) : null;
  return (
    <Card className={"!p-0 overflow-hidden " + className}>
      <div className={compact ? "p-4" : "p-5"}>
        <div className={"flex items-start gap-3 " + (showDecisionBadge ? "justify-between" : "")}>
          <div className="flex min-w-0 items-start gap-3">
            {leftIcon ? (
              <div
                className="mt-[1px] inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#222222] ring-1 ring-[#2A2A2A]"
                aria-hidden="true"
              >
                {leftIcon}
              </div>
            ) : null}
            <p
              className={
                "min-w-0 font-bold leading-snug text-[#FFFFFF] " +
                (compact ? "text-base line-clamp-2" : "text-lg")
              }
            >
              {name}
            </p>
          </div>
          {showDecisionBadge && decision ? (
            <Tag tone={decisionTone} className="shrink-0">
              {decision}
            </Tag>
          ) : null}
        </div>
        <div
          className={
            "mt-2 whitespace-pre-line tabular-nums leading-snug text-[#FFFFFF] " +
            (compact ? "text-base font-medium" : "text-xl font-medium")
          }
        >
          {sets}
        </div>
        {lastTimeLine ? (
          <p className="mt-1.5 text-xs leading-snug text-[#9CA3AF]">{lastTimeLine}</p>
        ) : null}
        {loadSourceLine ? (
          <p
            className={
              (lastTimeLine ? "mt-1" : "mt-1.5") +
              " text-xs leading-snug text-[#9CA3AF]"
            }
          >
            {loadSourceLine}
          </p>
        ) : null}
        {recommendation ? (
          <p className="mt-2 flex items-start gap-2 text-[13px] font-semibold leading-snug text-[#A855F7]">
            <Brain className="mt-[1px] h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">{recommendation}</span>
          </p>
        ) : null}
        {coachNote ? (
          <p className="mt-2 text-[12px] leading-snug text-[#D4D4D4] [&_strong]:font-semibold">
            {coachNote}
          </p>
        ) : null}
        {progress ? (
          <p
            className={
              compact
                ? "mt-2 text-[12px] leading-snug text-[#9CA3AF]"
                : "mt-2 text-sm leading-snug text-[#9CA3AF]"
            }
          >
            {progress}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

