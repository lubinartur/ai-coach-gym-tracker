"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getOrCreateAthleteProfile, isOnboardingComplete } from "@/db/athleteProfile";

export function OnboardingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [gate, setGate] = useState<"loading" | "ok" | "redirecting">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getOrCreateAthleteProfile();
      if (cancelled) return;
      if (!isOnboardingComplete(p) && !pathname.startsWith("/onboarding")) {
        router.replace("/onboarding");
        setGate("redirecting");
        return;
      }
      setGate("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (gate !== "ok") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[420px] items-center justify-center bg-neutral-950 px-4">
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
