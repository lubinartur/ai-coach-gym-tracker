import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Tag, type TagTone } from "@/components/ui/Tag";

type Props = {
  name: ReactNode;
  sets: ReactNode;
  progress?: ReactNode;
  decision?: ReactNode;
  decisionTone?: TagTone;
  className?: string;
};

export function ExerciseCard({
  name,
  sets,
  progress,
  decision,
  decisionTone = "neutral",
  className = "",
}: Props) {
  return (
    <Card className={"!p-0 overflow-hidden " + className}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-lg font-semibold leading-snug text-neutral-50">
            {name}
          </p>
          {decision ? (
            <Tag tone={decisionTone} className="shrink-0">
              {decision}
            </Tag>
          ) : null}
        </div>
        <div className="mt-2 text-xl font-medium tabular-nums leading-snug text-neutral-100 whitespace-pre-line">
          {sets}
        </div>
        {progress ? (
          <p className="mt-2 text-sm leading-snug text-neutral-400">{progress}</p>
        ) : null}
      </div>
    </Card>
  );
}

