import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "primary"
    | "ghost"
    | "danger"
    | "editorPrimary"
    | "editorSecondary"
    | "editorUtility";
};

export function Button({
  variant = "primary",
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  const base =
    "inline-flex min-h-11 w-full items-center justify-center rounded-[14px] px-4 py-2.5 " +
    "text-base font-semibold transition active:opacity-90 " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  const editorBase =
    "inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 " +
    "text-base transition active:opacity-90 " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  const styles =
    variant === "primary"
      ? "bg-[#A855F7] text-white shadow-[0_6px_20px_rgba(168,85,247,0.35)] hover:bg-[#C084FC] active:opacity-90"
      : variant === "danger"
        ? "bg-[#EF4444] text-white hover:opacity-90"
        : variant === "editorPrimary"
          ? "bg-[#A855F7] py-3 font-medium text-white shadow-[0_6px_20px_rgba(168,85,247,0.35)] hover:bg-[#C084FC]"
          : variant === "editorSecondary"
            ? "border border-[#2A2A2A] bg-[#1A1A1A] py-2.5 font-medium text-[#D4D4D4] " +
              "hover:bg-[#222222] active:opacity-90"
            : variant === "editorUtility"
              ? "border border-[#2A2A2A] bg-transparent py-2.5 font-medium text-[#9CA3AF] " +
                "hover:bg-[#222222]"
              : "border border-[#2A2A2A] bg-transparent text-[#D4D4D4] opacity-90 " +
                "hover:bg-[#222222] hover:opacity-100";

  const isEditor =
    variant === "editorPrimary" ||
    variant === "editorSecondary" ||
    variant === "editorUtility";

  return (
    <button
      type={type}
      className={`${isEditor ? editorBase : base} ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
