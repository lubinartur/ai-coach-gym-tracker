import type { HTMLAttributes } from "react";

const cardClass =
  "rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-4 text-[#FFFFFF] shadow-[0_4px_20px_rgba(0,0,0,0.25)]";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${cardClass} ${className}`} {...rest} />;
}
