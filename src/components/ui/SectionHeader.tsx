import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, right, className = "" }: Props) {
  return (
    <div className={"flex items-baseline justify-between gap-3 " + className}>
      <h2 className="text-sm font-medium text-neutral-400">{title}</h2>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

