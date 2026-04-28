import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onSelect?: () => void;
  left?: ReactNode;
  right?: ReactNode;
};

export function SelectableCard({
  title,
  subtitle,
  selected = false,
  onSelect,
  left,
  right,
}: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-2xl border px-5 py-[18px] text-left transition",
        "focus:outline-none focus:ring-2 focus:ring-purple-500/30",
        selected
          ? "border-violet-500/50 bg-violet-500/15 text-neutral-100 shadow-sm"
          : "border-neutral-800/90 bg-neutral-950/60 text-neutral-200 hover:border-neutral-700 active:opacity-90",
      ].join(" ")}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {left ? <div className="shrink-0">{left}</div> : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{title}</p>
            {subtitle ? (
              <p className="mt-1 text-sm leading-snug text-neutral-500">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </button>
  );
}

