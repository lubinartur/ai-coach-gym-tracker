import type { InputHTMLAttributes } from "react";

const inputBase =
  "min-h-11 w-full rounded-xl border px-3 py-2.5 text-base outline-none transition " +
  "border-neutral-800 bg-neutral-950/80 text-neutral-100 caret-neutral-100 " +
  "placeholder:text-neutral-500 " +
  "focus:border-neutral-600 focus:ring-2 focus:ring-purple-500/25 " +
  "[color-scheme:dark] " +
  "autofill:shadow-[inset_0_0_0px_1000px_rgb(10_10_10)] autofill:text-neutral-100";

const labelClass = "text-xs text-neutral-500";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function TextField({ label, id, className = "", ...rest }: Props) {
  const fid = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label className="flex w-full flex-col gap-2">
      <span className={labelClass}>{label}</span>
      <input
        id={fid}
        className={`${inputBase} ${className}`}
        {...rest}
      />
    </label>
  );
}
