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
    "inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 " +
    "text-base font-semibold transition active:opacity-90 " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  const editorBase =
    "inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 " +
    "text-base transition active:opacity-90 " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  const styles =
    variant === "primary"
      ? "bg-purple-600 text-white hover:bg-purple-500 active:bg-purple-700"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-500"
        : variant === "editorPrimary"
          ? "bg-purple-600 py-3 font-medium text-white hover:bg-purple-500 active:bg-purple-700"
          : variant === "editorSecondary"
            ? "border border-neutral-700 bg-neutral-800 py-2.5 font-medium text-neutral-200 " +
              "hover:bg-neutral-700/90 active:opacity-90"
            : variant === "editorUtility"
              ? "border border-neutral-800 bg-transparent py-2.5 font-medium text-neutral-400 " +
                "hover:bg-neutral-800/40"
              : "border border-neutral-800 bg-transparent text-neutral-300 opacity-90 " +
                "hover:border-neutral-700 hover:bg-neutral-800/30 hover:opacity-100 " +
                "active:bg-neutral-800/50";

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
