type Props = {
  step: number;
  total: number;
  label?: string;
};

export function ProgressIndicator({ step, total, label }: Props) {
  const safeTotal = Math.max(1, total);
  const safeStep = Math.min(safeTotal, Math.max(1, step));
  const pct = (safeStep / safeTotal) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {label ?? `Step ${safeStep} of ${safeTotal}`}
        </p>
      </div>
      <div className="h-1 w-full rounded-full bg-neutral-800/70">
        <div
          className="h-1 rounded-full bg-purple-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

