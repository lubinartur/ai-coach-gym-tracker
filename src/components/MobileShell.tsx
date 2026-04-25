import type { ReactNode } from "react";
import { FloatingTabBar } from "./FloatingTabBar";

/** 6rem (96px) bottom inset so scrollable content clears the fixed tab bar; safe area for notched devices. */
export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[420px] bg-neutral-950 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
      {children}
      <FloatingTabBar />
    </div>
  );
}
