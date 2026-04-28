type Props = {
  text: string;
};

export function InsightCard({ text }: Props) {
  return (
    <div className="insight-pop rounded-2xl border border-neutral-800/80 bg-neutral-950/50 p-4">
      <div className="flex items-start gap-3">
        <div
          className="mt-[1px] inline-flex size-9 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/60 text-purple-300"
          aria-hidden="true"
        >
          ✨
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-100">AI coach insight</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-400">{text}</p>
        </div>
      </div>
    </div>
  );
}

