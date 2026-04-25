"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { WorkoutReviewContent } from "@/components/workout/WorkoutReviewContent";
import { useI18n } from "@/i18n/LocaleContext";
import { Card } from "@/components/ui/Card";
import {
  deleteWorkout,
  getWorkoutSessionById,
  setWorkoutSessionAiReview,
} from "@/db/workoutSessions";
import { buildWorkoutReviewRequestPayload } from "@/services/workoutReviewContext";
import type { WorkoutAiReview } from "@/types/aiCoach";
import type { WorkoutSession } from "@/types/trainingDiary";
import { Button } from "@/components/ui/Button";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatKg(n: number): string {
  return round2(n)
    .toLocaleString("en-US", { maximumFractionDigits: 2 })
    .replace(/,/g, " ");
}

type Heaviest = { name: string; weight: number; reps: number; vol: number };

function computeSessionAnalytics(session: WorkoutSession) {
  let heaviest: Heaviest | null = null;
  for (const ex of session.exercises) {
    for (const s of ex.sets) {
      const w = s.weight;
      const r = s.reps;
      const v = s.volume ?? round2(w * r);
      if (v < 0) continue;
      if (
        !heaviest ||
        v > heaviest.vol ||
        (v === heaviest.vol && w > heaviest.weight)
      ) {
        heaviest = { name: ex.name, weight: w, reps: r, vol: v };
      }
    }
  }

  let top: { name: string; vol: number } | null = null;
  for (const ex of session.exercises) {
    const v = ex.sets.reduce(
      (sum, s) => sum + (s.volume ?? round2(s.weight * s.reps)),
      0,
    );
    if (!top || v > top.vol) {
      top = { name: ex.name, vol: v };
    }
  }

  return { heaviest, topExercise: top };
}

export function WorkoutDetailView({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerateReviewLoading, setRegenerateReviewLoading] = useState(false);
  const [regenerateReviewError, setRegenerateReviewError] = useState<string | null>(
    null,
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const row = await getWorkoutSessionById(id);
        if (mounted) setSession(row ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  const analytics = useMemo(() => {
    if (!session) return null;
    return computeSessionAnalytics(session);
  }, [session]);

  async function regenerateAiReview() {
    if (!session?.aiReview) return;
    setRegenerateReviewError(null);
    setRegenerateReviewLoading(true);
    try {
      const payload = await buildWorkoutReviewRequestPayload(id);
      if (!payload) {
        setRegenerateReviewError(t("review_error"));
        return;
      }
      const res = await fetch("/api/ai-coach/review-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as
        | WorkoutAiReview
        | { error?: string; summary?: unknown };
      if (
        !res.ok ||
        !data ||
        typeof (data as WorkoutAiReview).summary !== "string" ||
        "error" in data
      ) {
        setRegenerateReviewError(t("review_error"));
        return;
      }
      const review = data as WorkoutAiReview;
      await setWorkoutSessionAiReview(id, review);
      setSession((prev) =>
        prev && prev.id === id ? { ...prev, aiReview: review } : prev,
      );
    } catch {
      setRegenerateReviewError(t("review_error"));
    } finally {
      setRegenerateReviewLoading(false);
    }
  }

  async function confirmDeleteWorkout() {
    if (!session) return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      await deleteWorkout(id);
      setDeleteConfirmOpen(false);
      router.replace("/history");
    } catch {
      setDeleteError(t("workout_delete_error"));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Link
              href="/history"
              className="text-sm font-medium text-neutral-400 underline-offset-2 hover:text-neutral-200"
            >
              Back to History
            </Link>
            {session ? (
              <>
                <h1 className="text-2xl font-bold text-neutral-50">
                  {session.title.trim() || "Workout"}
                </h1>
                <p className="text-sm text-neutral-400">{session.date}</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-neutral-50">Workout</h1>
                <p className="text-sm text-neutral-400">Details</p>
              </>
            )}
          </div>
          {session ? (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteConfirmOpen(true);
              }}
              className="shrink-0 rounded-xl border border-red-600/50 bg-red-500/10 p-2.5 text-red-300 transition hover:bg-red-500/20 active:opacity-90"
              aria-label={t("workout_delete_aria")}
              title={t("workout_delete")}
            >
              <Trash2 className="h-5 w-5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </header>

      {deleteConfirmOpen && session ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workout-delete-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl">
            <h2
              id="workout-delete-title"
              className="text-lg font-semibold text-neutral-50"
            >
              {t("workout_delete_title")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-300">
              {t("workout_delete_message")}
            </p>
            {deleteError ? (
              <p className="mt-3 text-sm text-red-300/90">{deleteError}</p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="!min-h-11 sm:!w-auto"
                onClick={() => {
                  if (!deleteLoading) setDeleteConfirmOpen(false);
                }}
                disabled={deleteLoading}
              >
                {t("workout_delete_cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                className="!min-h-11 sm:!w-auto"
                onClick={() => {
                  void confirmDeleteWorkout();
                }}
                disabled={deleteLoading}
              >
                {deleteLoading ? "…" : t("workout_delete_action")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-400">Loading workout…</p>
      ) : !session ? (
        <Card className="space-y-1">
          <p className="text-sm font-semibold text-neutral-100">Not found</p>
          <p className="text-sm text-neutral-400">
            This workout doesn’t exist (or was deleted).
          </p>
        </Card>
      ) : (
        <>
          <div>
            <Link href={`/workout/${id}/edit`} className="block">
              <Button className="!min-h-[52px]">Edit workout</Button>
            </Link>
          </div>

          {analytics ? (
            <section>
              <h2 className="text-sm font-medium text-neutral-400">
                Session analytics
              </h2>
              <div className="mt-2 w-full min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-2xl font-semibold text-white tabular-nums">
                      {formatKg(session.totalVolume)} kg
                    </p>
                    <p className="mt-0.5 text-xs uppercase text-neutral-500">
                      Total Volume
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold text-white tabular-nums">
                      {session.totalSets}
                    </p>
                    <p className="mt-0.5 text-xs uppercase text-neutral-500">
                      Sets
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold text-white tabular-nums">
                      {session.exercises.length}
                    </p>
                    <p className="mt-0.5 text-xs uppercase text-neutral-500">
                      Exercises
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold text-white">
                      {typeof session.durationMin === "number" &&
                      Number.isFinite(session.durationMin)
                        ? `${session.durationMin} min`
                        : "—"}
                    </p>
                    <p className="mt-0.5 text-xs uppercase text-neutral-500">
                      Duration
                    </p>
                  </div>
                </div>

                <div className="mt-4 min-w-0 border-t border-neutral-800 pt-4">
                  <p className="text-xs uppercase text-neutral-500">Highlights</p>
                  <div className="mt-3 space-y-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase text-neutral-500">
                        Heaviest set
                      </p>
                      {analytics.heaviest ? (
                        <p
                          className="mt-0.5 truncate text-base font-semibold text-white"
                          title={`${analytics.heaviest.name} · ${analytics.heaviest.weight}×${analytics.heaviest.reps}`}
                        >
                          {`${analytics.heaviest.name} · ${analytics.heaviest.weight}×${analytics.heaviest.reps}`}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-base font-semibold text-white">—</p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase text-neutral-500">
                        Top exercise
                      </p>
                      {analytics.topExercise ? (
                        <p
                          className="mt-0.5 truncate text-base font-semibold text-white"
                          title={`${analytics.topExercise.name} · ${formatKg(
                            analytics.topExercise.vol,
                          )} kg`}
                        >
                          {`${analytics.topExercise.name} · ${formatKg(
                            analytics.topExercise.vol,
                          )} kg`}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-base font-semibold text-white">—</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {session.aiReview ? (
            <section>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-sm font-medium text-neutral-400">
                  {t("review_screen_title")}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  className="!w-auto min-w-0 shrink-0 text-sm"
                  onClick={() => {
                    void regenerateAiReview();
                  }}
                  disabled={regenerateReviewLoading}
                  aria-busy={regenerateReviewLoading}
                >
                  {t("review_regenerate")}
                </Button>
              </div>
              {regenerateReviewError ? (
                <p className="mt-1 text-sm text-amber-200/90">
                  {regenerateReviewError}
                </p>
              ) : null}
              <Card className="mt-2 !p-4">
                <WorkoutReviewContent
                  layout="inline"
                  aiReview={session.aiReview}
                  reviewLoading={regenerateReviewLoading}
                  reviewError={null}
                />
              </Card>
            </section>
          ) : null}

          {session.notes ? (
            <p className="text-sm text-neutral-400">
              {session.notes}
            </p>
          ) : null}

          <div className="flex flex-col gap-4">
            {session.exercises.map((ex) => {
              const exVolume = ex.sets.reduce(
                (s, set) => s + (set.volume ?? round2(set.weight * set.reps)),
                0,
              );
              const nSets = ex.sets.length;
              return (
                <Card key={ex.id} className="!space-y-3">
                  <div>
                    <p className="text-base font-semibold text-neutral-100">
                      {ex.name}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-400">
                      {nSets} set{nSets === 1 ? "" : "s"} · {formatKg(exVolume)} kg
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {ex.sets.map((set, idx) => (
                      <div
                        key={set.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2 text-neutral-500">
                          Set {idx + 1}
                          {set.isDone ? (
                            <span
                              className="text-xs font-medium text-emerald-400/90"
                              title="Logged"
                            >
                              ✓
                            </span>
                          ) : null}
                        </span>
                        <span className="font-medium tabular-nums text-neutral-100">
                          {set.weight} × {set.reps}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
