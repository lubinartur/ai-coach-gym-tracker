import type { ReactNode } from "react";
import { OnboardingGate } from "@/components/OnboardingGate";
import { MobileShell } from "@/components/MobileShell";
import { LocaleProvider } from "@/i18n/LocaleContext";

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingGate>
      <LocaleProvider>
        <MobileShell>{children}</MobileShell>
      </LocaleProvider>
    </OnboardingGate>
  );
}
