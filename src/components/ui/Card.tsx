import type { HTMLAttributes } from "react";

const cardClass =
  "rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-neutral-100";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${cardClass} ${className}`} {...rest} />;
}
