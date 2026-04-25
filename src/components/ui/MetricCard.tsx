import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

type Props = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function MetricCard({ label, value, hint, right, className = "" }: Props) {
  return (
    <Card className={"!p-5 " + className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums leading-tight text-neutral-50">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-sm leading-snug text-neutral-400">{hint}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </Card>
  );
}

