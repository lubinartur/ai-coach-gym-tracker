import { Suspense } from "react";
import { OnboardingView } from "@/components/pages/OnboardingView";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
      }
    >
      <OnboardingView />
    </Suspense>
  );
}
