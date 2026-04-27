import { useId, useMemo } from "react";

type Props = {
  values: number[];
  className?: string;
  /** Shown in aria-label and title for accessibility. */
  description?: string;
};

/**
 * Compact trend line: padded plot, area fill, baseline, single polyline.
 * For 0–1 values, renders an empty slot container.
 */
export function SparklineChart({ values, className = "", description }: Props) {
  const rawId = useId();
  const gradId = "spark" + rawId.replace(/[:]/g, "");
  const { polyline, min, max, underD } = useMemo(() => {
    const v = values.filter((n) => Number.isFinite(n));
    if (v.length < 2) {
      return { polyline: "", min: 0, max: 0, underD: "" };
    }
    const minV = Math.min(...v);
    const maxV = Math.max(...v);
    const span = Math.max(1e-6, maxV - minV);
    const padX = 6;
    const padY = 8;
    const innerW = 100 - padX * 2;
    const innerH = 100 - padY * 2;
    const bottom = padY + innerH;
    const pts: string[] = [];
    for (let i = 0; i < v.length; i += 1) {
      const n = v[i]!;
      const x = padX + (i / (v.length - 1)) * innerW;
      const y = padY + innerH - ((n - minV) / span) * innerH;
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    const poly = pts.join(" ");
    const lineInner = pts.map((p) => p.replace(",", " ")).join(" L ");
    const under = `M ${padX} ${bottom} L ${lineInner} L ${(padX + innerW).toFixed(2)} ${bottom} Z`;
    return { polyline: poly, min: minV, max: maxV, underD: under };
  }, [values]);

  if (values.length < 2) {
    return (
      <div
        className={
          "h-10 w-24 shrink-0 rounded-lg border border-neutral-800/90 bg-neutral-950/50 " +
          className
        }
        aria-hidden
      />
    );
  }

  const label =
    description ??
    (Number.isFinite(min) && Number.isFinite(max)
      ? `Trend from ${min.toFixed(0)} to ${max.toFixed(0)}`
      : "Trend");

  return (
    <svg
      viewBox="0 0 100 100"
      className={"h-10 w-28 shrink-0 text-violet-400/90 " + className}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(167 139 250)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="rgb(167 139 250)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="6"
        y1="92"
        x2="94"
        y2="92"
        stroke="rgb(64 64 64)"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />
      <path d={underD} fill={`url(#${gradId})`} className="text-violet-500" />
      <polyline
        points={polyline}
        fill="none"
        stroke="rgb(167 139 250)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
