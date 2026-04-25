import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[420px] bg-neutral-950 px-4 pb-10 pt-4 [padding-bottom:max(2.5rem,env(safe-area-inset-bottom,0px))]">
      {children}
    </div>
  );
}
