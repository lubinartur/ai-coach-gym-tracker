"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { db } from "@/db/database";
import { updateExercise } from "@/db/exercises";
import type { Exercise } from "@/types/trainingDiary";
import { getExerciseStats } from "@/services/exerciseStats";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function ExerciseDetailView({ id }: { id: string }) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [bestSet, setBestSet] =
    useState<Awaited<ReturnType<typeof getExerciseStats>>["bestSet"]>();
  const [totalVolume, setTotalVolume] = useState(0);
  const [totalSets, setTotalSets] = useState(0);
  const [recent, setRecent] =
    useState<Awaited<ReturnType<typeof getExerciseStats>>["last5"]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const row = await db.exercises.get(id);
        if (!mounted) return;
        setExercise(row ?? null);
        if (!row) return;
        setStatsLoading(true);
        const s = await getExerciseStats(row.name);
        if (!mounted) return;
        setBestSet(s.bestSet);
        setTotalVolume(s.totalVolume);
        setTotalSets(s.totalSets);
        setRecent(s.last5);
      } finally {
        if (mounted) {
          setStatsLoading(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  const metaLine = useMemo(() => {
    if (!exercise) return null;
    return [exercise.muscleGroup, exercise.equipment].filter(Boolean).join(" · ");
  }, [exercise]);

  return (
    <main className="flex flex-col gap-5">
      <header className="space-y-3">
        <Link
          href="/exercises"
          className="inline-block text-sm font-medium text-neutral-400 underline-offset-2 hover:text-neutral-200"
        >
          Exercises
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-neutral-50">
            {exercise?.name ?? "Exercise"}
          </h1>
          {metaLine ? (
            <p className="mt-0.5 text-sm text-neutral-400">{metaLine}</p>
          ) : null}
        </div>
        {!loading && exercise ? (
          <button
            type="button"
            className="w-full min-h-11 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm font-medium text-neutral-200 transition active:opacity-90"
            onClick={() => {
              const ex = exercise;
              const next = !ex.isFavorite;
              void (async () => {
                await updateExercise(ex.id, { isFavorite: next });
                const row = await db.exercises.get(ex.id);
                if (row) setExercise(row);
              })();
            }}
          >
            {exercise.isFavorite ? "★ Favorited" : "☆ Add to favorites"}
          </button>
        ) : null}
      </header>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : !exercise ? (
        <Card className="!py-3 !space-y-1">
          <p className="text-sm font-semibold text-neutral-100">Not found</p>
          <p className="text-sm text-neutral-400">
            This exercise doesn’t exist (or was deleted).
          </p>
        </Card>
      ) : (
        <>
          <Card className="!space-y-0 divide-y divide-neutral-800/80 !p-0">
            {[
              {
                label: "Best set",
                value: statsLoading
                  ? "…"
                  : bestSet
                    ? `${bestSet.weight} × ${bestSet.reps}`
                    : "—",
              },
              {
                label: "Total volume",
                value: statsLoading ? "…" : `${round2(totalVolume)} kg`,
              },
              {
                label: "Total sets (all time)",
                value: statsLoading ? "…" : String(totalSets),
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="text-neutral-400">{row.label}</span>
                <span className="font-medium tabular-nums text-neutral-100">
                  {row.value}
                </span>
              </div>
            ))}
          </Card>

          <section>
            <h2 className="text-sm font-medium text-neutral-400">Last 5 sessions</h2>
            {statsLoading ? (
              <p className="mt-2 text-sm text-neutral-500">Loading…</p>
            ) : recent.length === 0 ? (
              <Card className="!mt-2 !py-3 !space-y-1">
                <p className="text-sm text-neutral-300">No history yet</p>
                <p className="text-sm text-neutral-500">
                  Log this exercise in a saved workout to see it here.
                </p>
              </Card>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {recent.map((r) => (
                  <Link key={r.sessionId} href={`/workout/${r.sessionId}`}>
                    <Card className="!py-3 !space-y-1.5 transition active:opacity-90">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-neutral-200">{r.date}</p>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-neutral-200">
                          {round2(r.volume)} kg
                        </p>
                      </div>
                      <p className="text-xs text-neutral-500">
                        {r.sets.length} set{r.sets.length === 1 ? "" : "s"} · {r.title}
                      </p>
                      <p className="text-sm text-neutral-300">
                        {r.sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
