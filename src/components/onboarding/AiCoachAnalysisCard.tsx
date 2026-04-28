type Props = {
  percent: number;
  insight: string;
  showBasedOnLabel?: boolean;
  title?: string;
  basedOnLabel?: string;
};

export function AiCoachAnalysisCard({
  percent,
  insight,
  showBasedOnLabel,
  title,
  basedOnLabel,
}: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="insight-pop insight-glow relative overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.25)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(168,85,247,0.08),rgba(168,85,247,0.00))]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="mt-[1px] inline-flex size-8 items-center justify-center rounded-2xl border border-[#2A2A2A] bg-[#222222] text-[#A855F7]"
            aria-hidden="true"
          >
            ✦
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#FFFFFF]">{title ?? "AI coach"}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#D4D4D4]">{insight}</p>
            {showBasedOnLabel ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">
                {basedOnLabel ?? "Based on your answers"}
              </p>
            ) : null}
          </div>
        </div>
        {pct > 0 ? (
          <p className="shrink-0 pt-[2px] text-xs font-semibold tabular-nums text-[#9CA3AF]">
            {pct}%
          </p>
        ) : null}
      </div>
    </div>
  );
}

