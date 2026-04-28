import type { TextareaHTMLAttributes } from "react";

const areaBase =
  "min-h-[120px] w-full rounded-[14px] border px-3 py-2.5 text-base outline-none transition " +
  "border-[#2A2A2A] bg-[#1A1A1A] text-[#FFFFFF] caret-[#FFFFFF] " +
  "placeholder:text-[#9CA3AF] " +
  "focus:border-[#C084FC] focus:ring-2 focus:ring-[#A855F7]/25 " +
  "[color-scheme:dark] " +
  "autofill:shadow-[inset_0_0_0px_1000px_rgb(26_26_26)] autofill:text-[#FFFFFF]";

const labelClass = "text-xs text-[#9CA3AF]";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
};

export function TextArea({ label, id, className = "", ...rest }: Props) {
  const fid = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label className="flex w-full flex-col gap-2">
      <span className={labelClass}>{label}</span>
      <textarea
        id={fid}
        className={`${areaBase} ${className}`}
        {...rest}
      />
    </label>
  );
}
