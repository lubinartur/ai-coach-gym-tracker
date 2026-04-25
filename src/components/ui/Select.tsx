import type { SelectHTMLAttributes } from "react";

type Option = { value: string; label: string };

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Option[];
};

export function Select({ label, id, options, className = "", ...rest }: Props) {
  const fid = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label className="flex w-full flex-col gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
      <span>{label}</span>
      <select
        id={fid}
        className={`min-h-[48px] w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none ring-neutral-400 focus:ring-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${className}`}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
