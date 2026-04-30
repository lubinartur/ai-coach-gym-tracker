"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { InsightCard } from "@/components/ui/InsightCard";
import { Tag } from "@/components/ui/Tag";
import { useI18n } from "@/i18n/LocaleContext";
import { QUICK_WORKOUT_TEMPLATES } from "@/lib/workoutQuickTemplates";
import { AI_WORKOUT_DRAFT_KEY, type AiWorkoutDraftPayload } from "@/lib/aiWorkoutDraftStorage";
import { buildAiCoachRequestPayload } from "@/services/aiCoachContext";
import { normalizeSuggestNextResponseClient } from "@/lib/aiCoachResponseNormalize";
import { findBaselineForExerciseName } from "@/lib/aiCoachResponseNormalize";
import { normalizeExerciseName } from "@/lib/exerciseName";
import type { AiDecisionContext, ProgressionPlanExercise, SuggestNextWorkoutResponse } from "@/types/aiCoach";
import type { Exercise } from "@/types/trainingDiary";
import { listExercises } from "@/db/exercises";
import { resolveCatalogRowByExerciseName, buildCatalogLookup } from "@/services/exerciseCatalogResolve";
import { buildAutoProgressionTargetsFromBaselines } from "@/services/autoProgressionEngine";

type WorkingScheme = { w: number; r: number; n: number };

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function extractWorkingSchemeFromBaseline(
  latestSets: { weight: number; reps: number }[],
): WorkingScheme | null {
  const norm = (latestSets ?? [])
    .map((s) => ({
      w: roundHalf(Math.max(0, Number(s.weight) || 0)),
      r: Math.round(Math.max(0, Number(s.reps) || 0)),
    }))
    .filter((x) => x.w > 0 && x.r > 0);
  if (norm.length < 1) return null;

  // Most frequent working weight, then most frequent reps at that weight.
  const wCounts = new Map<number, number>();
  for (const s of norm) wCounts.set(s.w, (wCounts.get(s.w) ?? 0) + 1);
  const bestW = [...wCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (bestW == null) return null;
  const reps = norm.filter((x) => x.w === bestW).map((x) => x.r);
  const rCounts = new Map<number, number>();
  for (const r of reps) rCounts.set(r, (rCounts.get(r) ?? 0) + 1);
  const bestR = [...rCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? reps[0] ?? 0;
  const n = norm.filter((x) => x.w === bestW).length;
  return { w: bestW, r: bestR, n: Math.max(1, n) };
}

function extractWorkingSchemeFromPrescription(ex: SuggestNextWorkoutResponse["exercises"][0]): WorkingScheme | null {
  const sets = ex.sets ?? [];
  if (sets.length < 1) return null;
  const norm = sets.map((s) => ({
    w: roundHalf(Math.max(0, Number(s.weight) || 0)),
    r: Math.round(Math.max(0, Number(s.reps) || 0)),
  }));
  const same = norm.every((x) => x.w === norm[0]!.w && x.r === norm[0]!.r);
  if (!same) return null;
  return { w: norm[0]!.w, r: norm[0]!.r, n: norm.length };
}

function planForExercise(
  decisionContext: AiDecisionContext | null,
  name: string,
): ProgressionPlanExercise | null {
  const plans = decisionContext?.progressionPlan?.exercisePlans ?? [];
  const k = normalizeExerciseName(name);
  if (!k) return null;
  return plans.find((p) => normalizeExerciseName(p.exerciseName) === k) ?? null;
}

function actionBadge(action: ProgressionPlanExercise["action"], isRu: boolean): string {
  if (isRu) {
    if (action === "increase_reps") return "+1 повт.";
    if (action === "increase_weight") return "+вес";
    if (action === "increase_sets") return "+1 подход";
    if (action === "reduce_sets") return "−подход";
    if (action === "reduce_weight") return "−вес";
    if (action === "swap_exercise") return "замена";
    return "держать";
  }
  if (action === "increase_reps") return "+1 rep";
  if (action === "increase_weight") return "+weight";
  if (action === "increase_sets") return "+1 set";
  if (action === "reduce_sets") return "−set";
  if (action === "reduce_weight") return "−weight";
  if (action === "swap_exercise") return "swap";
  return "maintain";
}

function badgeTone(action: ProgressionPlanExercise["action"]): import("@/components/ui/Tag").TagTone {
  if (action === "increase_reps" || action === "increase_weight" || action === "increase_sets") {
    return "success";
  }
  if (action === "reduce_sets" || action === "reduce_weight") return "danger";
  if (action === "swap_exercise") return "warning";
  return "neutral";
}

function computedBadgeText(input: {
  action: ProgressionPlanExercise["action"];
  prev: WorkingScheme | null;
  next: WorkingScheme | null;
  isRu: boolean;
}): string {
  const { action, prev, next, isRu } = input;
  if (!prev || !next) return actionBadge(action, isRu);

  if (action === "increase_reps" && prev.w === next.w && prev.n === next.n) {
    const d = next.r - prev.r;
    if (d !== 0) return isRu ? `${d > 0 ? "+" : ""}${d} повт.` : `${d > 0 ? "+" : ""}${d} rep`;
  }
  if (action === "increase_weight" && prev.r === next.r && prev.n === next.n) {
    const d = Math.round((next.w - prev.w) * 10) / 10;
    if (d !== 0) return isRu ? `${d > 0 ? "+" : ""}${d} кг` : `${d > 0 ? "+" : ""}${d} kg`;
  }
  if (action === "increase_sets" && prev.w === next.w && prev.r === next.r) {
    const d = next.n - prev.n;
    if (d !== 0) return isRu ? `${d > 0 ? "+" : ""}${d} подход` : `${d > 0 ? "+" : ""}${d} set`;
  }
  return actionBadge(action, isRu);
}

function formatSchemeShort(s: WorkingScheme, isRu: boolean): string {
  const w = Math.round(s.w * 10) / 10;
  if (s.n > 1) return isRu ? `${w} кг × ${s.r} × ${s.n}` : `${w} kg × ${s.r} × ${s.n}`;
  return isRu ? `${w} кг × ${s.r}` : `${w} kg × ${s.r}`;
}

function autoTone(action: import("@/services/autoProgressionEngine").AutoProgressionAction): import("@/components/ui/Tag").TagTone {
  if (action === "increase_reps" || action === "increase_weight") return "success";
  if (action === "reduce_weight" || action === "reduce_sets") return "danger";
  return "neutral";
}

function autoBadge(action: import("@/services/autoProgressionEngine").AutoProgressionAction, isRu: boolean): string {
  if (isRu) {
    if (action === "increase_reps") return "+1 повт.";
    if (action === "increase_weight") return "+вес";
    if (action === "reduce_weight") return "−вес";
    if (action === "reduce_sets") return "−подход";
    return "держать";
  }
  if (action === "increase_reps") return "+1 rep";
  if (action === "increase_weight") return "+weight";
  if (action === "reduce_weight") return "−weight";
  if (action === "reduce_sets") return "−set";
  return "maintain";
}

function stripTargetPrefix(s: string): string {
  return String(s ?? "").replace(/^\s*(Today|Target)\s*:\s*/i, "").trim();
}

function localizeKgText(s: string, isRu: boolean): string {
  if (!isRu) return s;
  return s.replace(/\bkg\b/g, "кг");
}

function focusFromExercises(exercises: SuggestNextWorkoutResponse["exercises"], catalog: Exercise[]): string[] {
  if (!exercises.length || !catalog.length) return [];
  const lookup = buildCatalogLookup(catalog);
  const counts = new Map<string, number>();
  for (const ex of exercises) {
    const row = resolveCatalogRowByExerciseName(ex.name, lookup);
    const m = row?.primaryMuscle ?? "other";
    if (m === "other") continue;
    counts.set(m, (counts.get(m) ?? 0) + (ex.sets?.length ?? 0));
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);
}

export function TodayView() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const isRu = locale === "ru";

  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuggestNextWorkoutResponse | null>(null);
  const [decisionContext, setDecisionContext] = useState<AiDecisionContext | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const ex = await listExercises();
        if (mounted) setCatalog(ex);
      } catch {
        // ignore; focus derivation becomes best-effort
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await buildAiCoachRequestPayload({ aiMode: "history_based" });
        const res = await fetch("/api/ai-coach/suggest-next-workout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(t("error_suggestion"));
        const parsed: unknown = JSON.parse(text);
        const normalized = normalizeSuggestNextResponseClient(parsed, payload.trainingSignals);
        if (!mounted) return;
        setDecisionContext(payload.aiDecisionContext);
        setResult(normalized);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : t("error_suggestion"));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [t]);

  const focus = useMemo(() => (result ? focusFromExercises(result.exercises, catalog) : []), [result, catalog]);
  const splitLabel = (result?.training_signals?.split ?? "").trim() || (result?.title ?? "").trim() || t("suggested_workout");

  const autoTargets = useMemo(() => {
    if (!result || !decisionContext) return [];
    const baselines = decisionContext.fatigueSignals?.exerciseBaselines ?? [];
    return buildAutoProgressionTargetsFromBaselines({
      suggested: result.exercises,
      exerciseBaselines: baselines,
      catalog,
      workoutGoal: "hypertrophy",
    });
  }, [result, decisionContext, catalog]);

  const autoByNorm = useMemo(() => {
    const m = new Map<string, (typeof autoTargets)[number]>();
    for (const t of autoTargets) {
      const k = normalizeExerciseName(t.exerciseName);
      if (!k) continue;
      m.set(k, t);
    }
    return m;
  }, [autoTargets]);

  function startWorkoutFromResult(r: SuggestNextWorkoutResponse) {
    const draft: AiWorkoutDraftPayload = {
      title: r.title.trim() || "Workout",
      exercises: r.exercises.map((e) => ({
        name: e.name,
        sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
      })),
    };
    sessionStorage.setItem(AI_WORKOUT_DRAFT_KEY, JSON.stringify(draft));
    router.push("/workout");
  }

  function startQuickTemplate(id: string) {
    const tpl = QUICK_WORKOUT_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    const draft: AiWorkoutDraftPayload = {
      title: `${tpl.label} Workout`,
      exercises: tpl.exercises.map((name) => ({ name, sets: [{ weight: 0, reps: 0 }] })),
    };
    sessionStorage.setItem(AI_WORKOUT_DRAFT_KEY, JSON.stringify(draft));
    router.push("/workout");
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-neutral-100">{isRu ? "Сегодня" : "Today"}</h1>
        <p className="text-sm text-neutral-500">
          {isRu ? "Что тренировать сегодня и как прогрессировать." : "What to train today and how to progress."}
        </p>
      </header>

      {/* Next workout card */}
      <section className="space-y-2">
        <SectionHeader title={isRu ? "Следующая тренировка" : "Next workout"} />
        <Card className="!p-5">
          {loading ? (
            <p className="text-sm text-neutral-500">{t("thinking")}</p>
          ) : error ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-200/90">{error}</p>
              <Button type="button" onClick={() => location.reload()}>
                {isRu ? "Повторить" : "Retry"}
              </Button>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-lg font-semibold text-neutral-100">{splitLabel}</p>
                <p className="text-sm text-neutral-500">
                  {focus.length ? (
                    <>
                      {isRu ? "Фокус: " : "Focus: "}
                      <span className="text-neutral-300">
                        {focus.join(", ")}
                      </span>
                    </>
                  ) : (
                    <span className="text-neutral-500">{isRu ? "Фокус: —" : "Focus: —"}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => startWorkoutFromResult(result)} className="w-full">
                  {t("start_workout")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">{t("em_dash")}</p>
          )}
        </Card>
      </section>

      {/* Today's progression */}
      <section className="space-y-2">
        <SectionHeader title={isRu ? "Прогрессия на сегодня" : "Today’s progression"} />
        <Card className="!p-5">
          {!result || !decisionContext ? (
            <p className="text-sm text-neutral-500">
              {isRu ? "Базовая сессия — прогрессии пока нет." : "Baseline session — no progression yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {result.exercises.map((ex, idx) => {
                const plan = planForExercise(decisionContext, ex.name);
                const fatigue = decisionContext.fatigueSignals;
                const baseline = findBaselineForExerciseName(fatigue, ex.name);
                const prev = baseline?.latestSets?.length ? extractWorkingSchemeFromBaseline(baseline.latestSets) : null;
                const next = extractWorkingSchemeFromPrescription(ex);
                const action = plan?.action ?? null;
                const reason = (plan?.reason ?? "").trim();
                const baselineOnly = !prev;
                const auto = autoByNorm.get(normalizeExerciseName(ex.name) ?? "") ?? null;
                const autoTargetText = auto ? localizeKgText(stripTargetPrefix(auto.nextTarget), isRu) : null;
                return (
                  <div key={`${ex.name}-${idx}`} className="min-w-0 border-b border-neutral-800/70 pb-4 last:border-b-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-100">{ex.name}</p>
                        {baselineOnly ? (
                          <p className="mt-1 text-sm text-neutral-500">
                            {isRu ? "Базовая сессия — прогрессии пока нет." : "Baseline session — no progression yet."}
                          </p>
                        ) : (
                          <>
                            <p className="mt-1 text-sm text-neutral-400">
                              {isRu ? "Было" : "Last"}:{" "}
                              {prev ? formatSchemeShort(prev, isRu) : "—"}
                            </p>
                            <p className="mt-1 text-sm text-neutral-200/90">
                              {isRu ? "Сегодня" : "Today"}:{" "}
                              {autoTargetText
                                ? autoTargetText
                                : next
                                ? formatSchemeShort(next, isRu)
                                : action === "maintain"
                                  ? (isRu ? "держи ту же нагрузку" : "keep the same load")
                                  : "—"}
                            </p>
                          </>
                        )}
                        {reason ? (
                          <p className="mt-1 text-sm text-neutral-500">
                            {isRu ? "Причина" : "Reason"}: {reason}
                          </p>
                        ) : null}
                      </div>
                      {auto ? (
                        <Tag tone={autoTone(auto.action)}>{autoBadge(auto.action, isRu)}</Tag>
                      ) : action ? (
                          <Tag tone={badgeTone(action)}>
                            {computedBadgeText({ action, prev, next, isRu })}
                          </Tag>
                        ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* AI insight */}
      <section className="space-y-2">
        <SectionHeader title={isRu ? "ИИ‑тренер" : "AI Coach"} />
        {result ? (
          <InsightCard
            tone="violet"
            title={isRu ? "Коротко" : "In short"}
            body={(result.reason ?? "").trim() || (isRu ? "—" : "—")}
            compact
          />
        ) : (
          <Card className="!p-5">
            <p className="text-sm text-neutral-500">{t("em_dash")}</p>
          </Card>
        )}
      </section>

      {/* Quick start */}
      <section className="space-y-2">
        <SectionHeader title={isRu ? "Быстрый старт" : "Quick start"} />
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="editorSecondary" onClick={() => startQuickTemplate("full")}>
            {isRu ? "На всё тело" : "Full Body"}
          </Button>
          <Button type="button" variant="editorSecondary" onClick={() => startQuickTemplate("push")}>
            {isRu ? "Толкать" : "Push"}
          </Button>
          <Button type="button" variant="editorSecondary" onClick={() => startQuickTemplate("pull")}>
            {isRu ? "Тянуть" : "Pull"}
          </Button>
          <Button type="button" variant="editorSecondary" onClick={() => startQuickTemplate("legs")}>
            {isRu ? "Ноги" : "Legs"}
          </Button>
          <Button type="button" variant="editorSecondary" onClick={() => router.push("/workout?custom=1")} className="col-span-2">
            {isRu ? "Своя тренировка" : "Custom Workout"}
          </Button>
        </div>
      </section>
    </main>
  );
}
