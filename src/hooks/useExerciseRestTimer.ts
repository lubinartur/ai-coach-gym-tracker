"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExerciseRestState } from "@/components/workout/ExerciseRestTimer";

export function useExerciseRestTimer(defaultRestSec: number) {
  const [rest, setRest] = useState<ExerciseRestState>({ status: "idle" });

  useEffect(() => {
    if (rest.status !== "running") return;
    const id = window.setInterval(() => {
      setRest((prev) => {
        if (prev.status !== "running") return prev;
        if (prev.left <= 1) return { status: "complete" };
        return { status: "running", left: prev.left - 1 };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [rest.status]);

  const startRest = useCallback(() => {
    setRest({ status: "running", left: Math.max(1, defaultRestSec) });
  }, [defaultRestSec]);

  const clearRest = useCallback(() => {
    setRest({ status: "idle" });
  }, []);

  const onAdd30 = useCallback(() => {
    setRest((r) =>
      r.status === "running" ? { status: "running", left: r.left + 30 } : r,
    );
  }, []);

  const onSub30 = useCallback(() => {
    setRest((r) => {
      if (r.status !== "running") return r;
      const next = Math.max(0, r.left - 30);
      if (next <= 0) return { status: "complete" };
      return { status: "running", left: next };
    });
  }, []);

  return { rest, startRest, clearRest, onAdd30, onSub30 };
}
