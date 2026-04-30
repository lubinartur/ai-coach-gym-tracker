"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronRight, Dumbbell, Flame, Layers, Play, Repeat2, Trash2, Wand2 } from "lucide-react";
import { ExerciseSetRow } from "@/components/workout/ExerciseSetRow";
import { WorkoutReviewContent } from "@/components/workout/WorkoutReviewContent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { createId } from "@/lib/id";
import {
  AI_WORKOUT_DRAFT_KEY,
  type AiWorkoutDraftPayload,
} from "@/lib/aiWorkoutDraftStorage";
import { formatMMSS } from "@/lib/formatMMSS";
import { setVolumeForWithMultiplier } from "@/lib/workoutSetQuick";
import { getOrCreateSettings } from "@/db/settings";
import { getOrCreateExerciseByName, listExercises } from "@/db/exercises";
import {
  listWorkoutSessions,
  saveWorkoutSessionDraft,
  setWorkoutSessionAiReview,
} from "@/db/workoutSessions";
import { buildWorkoutReviewRequestPayload } from "@/services/workoutReviewContext";
import { inferCoachMemoryFromNote } from "@/services/aiCoachMemoryInference";
import { addCoachMemoryEntries } from "@/db/coachMemory";
import type { WorkoutAiReview } from "@/types/aiCoach";
import {
  formatWorkoutLastPerformed,
} from "@/lib/workoutStartScreen";
import { ExerciseRestTimer } from "@/components/workout/ExerciseRestTimer";
import { useExerciseRestTimer } from "@/hooks/useExerciseRestTimer";
import type { Exercise, WorkoutExercise, WorkoutSession } from "@/types/trainingDiary";
import { QUICK_WORKOUT_TEMPLATES, type WorkoutQuickTemplate } from "@/lib/workoutQuickTemplates";
import { formatExerciseLine } from "@/services/gymProgressStats";
import {
  exerciseMatchesPickerCategory,
  getLastExercisePerformance,
  getRecentExerciseNamesUsed,
  normalizeExerciseName,
} from "@/services/exerciseStats";
import { useI18n } from "@/i18n/LocaleContext";
import type { AiCoachMode, AiDecisionContext, SuggestNextWorkoutResponse } from "@/types/aiCoach";
import { AiCoachSuggestionResult } from "@/components/ai/AiCoachSuggestionResult";
import { normalizeSuggestNextResponseClient } from "@/lib/aiCoachResponseNormalize";
import { saveAiDecisionTrace } from "@/db/aiDecisionTrace";
import { validateAiCoachSuggestion } from "@/lib/aiCoachQualityCheck";
import { buildAiCoachRequestPayload } from "@/services/aiCoachContext";
import { useAthleteProfile } from "@/hooks/useAthleteProfile";
import { inferWorkoutTitleFromExercises } from "@/lib/workoutTitleInference";

type WorkoutMode = "idle" | "active";

const MUSCLE_CATEGORIES = [
  { id: "chest", labelKey: "muscle_chest" },
  { id: "back", labelKey: "muscle_back" },
  { id: "legs", labelKey: "muscle_legs" },
  { id: "shoulders", labelKey: "muscle_shoulders" },
  { id: "biceps", labelKey: "muscle_biceps" },
  { id: "triceps", labelKey: "muscle_triceps" },
  { id: "core", labelKey: "muscle_core" },
  { id: "glutes", labelKey: "muscle_glutes" },
  { id: "full_body", labelKey: "full_body" },
] as const;

const TEMPLATE_CARD_CLASS =
  "flex min-h-[5.5rem] w-full flex-col items-stretch justify-center rounded-2xl border border-neutral-800/90 bg-neutral-950/60 px-4 py-3.5 text-left shadow-sm transition hover:border-neutral-600/50 hover:bg-neutral-900/70 active:scale-[0.99] active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500/50";
const TEMPLATE_TITLE_CLASS = "text-lg font-semibold leading-snug tracking-tight text-neutral-100";
const TEMPLATE_SUBLINE_CLASS = "mt-1.5 break-words text-sm leading-snug text-neutral-500";
const TEMPLATE_META_CLASS = "mt-1 text-xs tabular-nums text-neutral-600";

export function WorkoutView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { profile } = useAthleteProfile();
  const [mode, setMode] = useState<WorkoutMode>("idle");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishSummary, setFinishSummary] = useState<WorkoutSession | null>(null);
  const [workoutReviewLoading, setWorkoutReviewLoading] = useState(false);
  const [workoutReviewError, setWorkoutReviewError] = useState<string | null>(null);
  const [mostRecentSession, setMostRecentSession] =
    useState<WorkoutSession | null>(null);
  const [lastSessionLoading, setLastSessionLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [finishOpen, setFinishOpen] = useState(false);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [customExerciseName, setCustomExerciseName] = useState("");
  const [lastByExerciseId, setLastByExerciseId] = useState<
    Record<string, { date: string; sets: { weight: number; reps: number }[] } | undefined>
  >({});
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  /** In-page set editor: which workout exercise (local `WorkoutExercise.id`) is being edited. */
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [defaultRestSec, setDefaultRestSec] = useState(90);
  const { rest, startRest, clearRest, onAdd30, onSub30 } =
    useExerciseRestTimer(defaultRestSec);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<SuggestNextWorkoutResponse | null>(null);
  const [aiDecisionContext, setAiDecisionContext] =
    useState<AiDecisionContext | null>(null);
  const [aiExerciseCatalog, setAiExerciseCatalog] = useState<Exercise[] | null>(null);
  const [aiMode, setAiMode] = useState<AiCoachMode>("history_based");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [customBuilderOpen, setCustomBuilderOpen] = useState(false);
  const [customMuscles, setCustomMuscles] = useState<string[]>([]);
  const [customDuration, setCustomDuration] = useState<number | null>(null);
  const [customFocus, setCustomFocus] = useState<string | null>(null);
  const [customGenerating, setCustomGenerating] = useState(false);
  const [customPreviewOpen, setCustomPreviewOpen] = useState(false);

  useEffect(() => {
    // Quick-start entrypoint: allow Today screen to jump straight into the custom workout builder.
    if (searchParams?.get("custom") === "1") {
      setCustomBuilderOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state ?? {}) as { leapModal?: string };
      if (st.leapModal === "customWorkout") {
        setCustomBuilderOpen(true);
      } else {
        setCustomBuilderOpen(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!customBuilderOpen) return;
    // Create a history entry so router.back() can return to this generator.
    window.history.pushState({ leapModal: "customWorkout" }, "");
  }, [customBuilderOpen]);

  function setAiModeAndResetResult(next: AiCoachMode) {
    setAiMode(next);
    // Safer UX: switching modes invalidates the current recommendation.
    if (aiResult) {
      setAiResult(null);
      setAiError(null);
      setAiDecisionContext(null);
      setAiExerciseCatalog(null);
    } else if (aiError) {
      // Clear stale errors when user changes mode.
      setAiError(null);
    }
  }

  const addExerciseFlowRef = useRef<HTMLDivElement | null>(null);
  const aiDraftAppliedRef = useRef(false);
  const exerciseCardEls = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const pendingSetFocusRef = useRef<{
    exerciseId: string;
    setId: string;
    weight: number;
    reps: number;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await listExercises();
        if (mounted) setExercises(rows);
      } finally {
        if (mounted) setLoadingExercises(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await getOrCreateSettings();
      if (!mounted) return;
      const n = s.defaultRestSec;
      setDefaultRestSec(
        typeof n === "number" && n > 0 && Number.isFinite(n) ? Math.round(n) : 90,
      );
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "idle") return;
    let cancelled = false;
    (async () => {
      setLastSessionLoading(true);
      try {
        const rows = await listWorkoutSessions();
        if (!cancelled) setMostRecentSession(rows[0] ?? null);
      } finally {
        if (!cancelled) setLastSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const totals = useMemo(() => {
    const totalSets = workoutExercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const totalVolume = workoutExercises.reduce(
      (sum, ex) =>
        sum +
        ex.sets.reduce(
          (s, set) => s + Math.max(0, set.volume ?? 0),
          0,
        ),
      0,
    );
    return { totalSets, totalVolume };
  }, [workoutExercises]);

  useEffect(() => {
    if (mode !== "active" || !startedAt) return;
    const tick = () => {
      const t0 = Date.parse(startedAt);
      if (!Number.isFinite(t0)) return;
      const now = Date.now();
      setElapsedSec(Math.max(0, Math.floor((now - t0) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [mode, startedAt]);

  useEffect(() => {
    if (!pickerOpen) return;
    const id = requestAnimationFrame(() => {
      addExerciseFlowRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => cancelAnimationFrame(id);
  }, [pickerOpen]);

  const searchResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set<string>();
    return exercises
      .filter((e) => e.name.toLowerCase().includes(q))
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 10);
  }, [exercises, pickerQuery]);

  const favoriteExercises = useMemo(() => {
    return exercises
      .filter((e) => e.isFavorite)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 10);
  }, [exercises]);

  const favoriteNameKeys = useMemo(() => {
    return new Set(favoriteExercises.map((e) => normalizeExerciseName(e.name)));
  }, [favoriteExercises]);

  const recentNamesForPicker = useMemo(() => {
    return recentNames.filter(
      (n) => !favoriteNameKeys.has(normalizeExerciseName(n)),
    );
  }, [recentNames, favoriteNameKeys]);

  const categoryExercises = useMemo(() => {
    if (!pickerCategory) return [];
    return exercises
      .filter((e) => exerciseMatchesPickerCategory(e, pickerCategory))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, pickerCategory]);

  const editingExercise = useMemo(
    () => workoutExercises.find((e) => e.id === editingExerciseId) ?? null,
    [workoutExercises, editingExerciseId],
  );

  const catalogById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const volumeMultiplierFor = useCallback(
    (exerciseId?: string, name?: string): number => {
      const row = exerciseId ? catalogById.get(exerciseId) : undefined;
      if (row?.equipmentTags?.includes("dumbbell")) return 2;
      const s = (name ?? "").toLowerCase();
      if (s.includes("dumbbell")) return 2;
      return 1;
    },
    [catalogById],
  );

  // (kept for potential future use on the Workout dashboard)
  // const quickStartMuscleLine = useMemo(
  //   () =>
  //     mostRecentSession
  //       ? muscleLineForSession(mostRecentSession, exercises)
  //       : "",
  //   [mostRecentSession, exercises],
  // );

  const quickStartLastText = useMemo(
    () =>
      mostRecentSession
        ? formatWorkoutLastPerformed(mostRecentSession.date)
        : "",
    [mostRecentSession],
  );

  const customMuscleOptions = useMemo(
    () =>
      [
        { id: "chest", en: "Chest", ru: "Грудь" },
        { id: "back", en: "Back", ru: "Спина" },
        { id: "shoulders", en: "Shoulders", ru: "Плечи" },
        { id: "biceps", en: "Biceps", ru: "Бицепс" },
        { id: "triceps", en: "Triceps", ru: "Трицепс" },
        { id: "legs", en: "Legs", ru: "Ноги" },
        { id: "core", en: "Core", ru: "Кор" },
      ] as const,
    [],
  );

  const customDurationOptions = [30, 45, 60, 75] as const;
  const customFocusOptions = useMemo(
    () =>
      [
        { id: "hypertrophy", en: "Hypertrophy", ru: "Гипертрофия" },
        { id: "strength", en: "Strength", ru: "Сила" },
        { id: "pump", en: "Pump", ru: "Памп" },
        { id: "light", en: "Light", ru: "Легко" },
      ] as const,
    [],
  );

  useLayoutEffect(() => {
    const p = pendingSetFocusRef.current;
    if (!p) return;
    if (p.exerciseId !== editingExerciseId) {
      pendingSetFocusRef.current = null;
      return;
    }
    const wId = `eset-w-${p.setId}`;
    const rId = `eset-r-${p.setId}`;
    const tryFocus = () => {
      const wIn = document.getElementById(wId) as HTMLInputElement | null;
      const rIn = document.getElementById(rId) as HTMLInputElement | null;
      if (!wIn || !rIn) return false;
      wIn.closest("[data-set-row]")?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      if (!Number.isFinite(p.weight) || p.weight === 0) {
        wIn.focus();
      } else {
        rIn.focus();
      }
      pendingSetFocusRef.current = null;
      return true;
    };
    if (tryFocus()) return;
    const raf = requestAnimationFrame(() => {
      if (tryFocus()) return;
      pendingSetFocusRef.current = null;
    });
    return () => cancelAnimationFrame(raf);
  }, [workoutExercises, editingExerciseId]);

  function createWorkoutDraft() {
    setFinishSummary(null);
    setMode("active");
    setTitle("");
    setNotes("");
    setCustomPreviewOpen(false);
    setWorkoutExercises([]);
    setPickerOpen(false);
    setPickerQuery("");
    setPickerCategory(null);
    setCustomExerciseName("");
    setLastByExerciseId({});
    setStartedAt(new Date().toISOString());
    setElapsedSec(0);
    setEditingExerciseId(null);
  }

  function addEmptySet(exerciseId: string) {
    const newId = createId();
    pendingSetFocusRef.current = {
      exerciseId,
      setId: newId,
      weight: 0,
      reps: 0,
    };
    setWorkoutExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        return {
          ...ex,
          sets: [
            ...ex.sets,
            { id: newId, weight: 0, reps: 0, volume: 0 },
          ],
        };
      }),
    );
  }

  function addSameSet(exerciseId: string) {
    const newId = createId();
    setWorkoutExercises((prev) => {
      const ex = prev.find((e) => e.id === exerciseId);
      if (!ex) return prev;
      const last = ex.sets[ex.sets.length - 1];
      const weight = last?.weight ?? 0;
      const reps = last?.reps ?? 0;
      const volume = setVolumeForWithMultiplier(
        weight,
        reps,
        volumeMultiplierFor(ex.exerciseId, ex.name),
      );
      pendingSetFocusRef.current = {
        exerciseId,
        setId: newId,
        weight,
        reps,
      };
      return prev.map((e) => {
        if (e.id !== exerciseId) return e;
        return {
          ...e,
          sets: [
            ...e.sets,
            { id: newId, weight, reps, volume },
          ],
        };
      });
    });
  }

  /** New set = values of the set before the last (second-to-last); 1 set → that set; 0 sets → 0,0. */
  function addSetCopyingSecondToLast(exerciseId: string) {
    const newId = createId();
    setWorkoutExercises((prev) => {
      const ex = prev.find((e) => e.id === exerciseId);
      if (!ex) return prev;
      let weight = 0;
      let reps = 0;
      if (ex.sets.length === 0) {
        weight = 0;
        reps = 0;
      } else if (ex.sets.length === 1) {
        weight = ex.sets[0]!.weight ?? 0;
        reps = ex.sets[0]!.reps ?? 0;
      } else {
        const src = ex.sets[ex.sets.length - 2]!;
        weight = src.weight ?? 0;
        reps = src.reps ?? 0;
      }
      const volume = setVolumeForWithMultiplier(
        weight,
        reps,
        volumeMultiplierFor(ex.exerciseId, ex.name),
      );
      pendingSetFocusRef.current = {
        exerciseId,
        setId: newId,
        weight,
        reps,
      };
      return prev.map((e) => {
        if (e.id !== exerciseId) return e;
        return {
          ...e,
          sets: [
            ...e.sets,
            { id: newId, weight, reps, volume },
          ],
        };
      });
    });
  }

  function deleteSet(exerciseId: string, setId: string) {
    setWorkoutExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        return { ...ex, sets: ex.sets.filter((s) => s.id !== setId) };
      }),
    );
  }

  function deleteExerciseCard(exerciseId: string) {
    if (editingExerciseId === exerciseId) {
      clearRest();
      setEditingExerciseId(null);
    }
    setWorkoutExercises((prev) => prev.filter((ex) => ex.id !== exerciseId));
    setLastByExerciseId((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  }

  const hydrateLastTime = useCallback(async (localExerciseId: string, name: string) => {
    const perf = await getLastExercisePerformance(name);
    if (!perf) return;
    setLastByExerciseId((prev) => ({
      ...prev,
      [localExerciseId]: {
        date: perf.date,
        sets: perf.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
      },
    }));
  }, []);

  const applyAiDraftPayload = useCallback(async (data: AiWorkoutDraftPayload) => {
    // AI recommendations should land in a "prepared" edit state. Timer starts only when user presses Start.
    if (!data.exercises?.length) return;
    aiDraftAppliedRef.current = true;
    const titleTrim = data.title?.trim() || "Workout";
    const resolved = await Promise.all(
      data.exercises.map(async (ex) => {
        const row = await getOrCreateExerciseByName(ex.name, { ensureEnriched: true });
        return { row, ex };
      }),
    );
    queueMicrotask(() => {
      setFinishSummary(null);
      setMode("active");
      setTitle(titleTrim);
      setNotes("");
      setFinishOpen(false);
      const wex: WorkoutExercise[] = resolved.map(({ row, ex }) => {
        const mult = row.equipmentTags.includes("dumbbell") ? 2 : 1;
        return {
          id: createId(),
          exerciseId: row.id,
          name: ex.name,
          sets: (ex.sets ?? []).map((s) => {
            const setId = createId();
            const w = Math.max(0, Number(s.weight) || 0);
            const r = Math.max(0, Math.round(Number(s.reps) || 0));
            return {
              id: setId,
              weight: w,
              reps: r,
              volume: setVolumeForWithMultiplier(w, r, mult),
            };
          }),
        };
      });
      setWorkoutExercises(wex);
      setPickerOpen(false);
      setPickerQuery("");
      setPickerCategory(null);
      setCustomExerciseName("");
      setLastByExerciseId({});
      setStartedAt(null);
      setElapsedSec(0);
      setEditingExerciseId(null);
      for (const ex of wex) {
        void hydrateLastTime(ex.id, ex.name);
      }
    });
  }, [hydrateLastTime]);

  /** Apply AI suggestion payload (sessionStorage) once catalog is ready. */
  useEffect(() => {
    if (aiDraftAppliedRef.current) return;
    if (loadingExercises) return;
    let data: AiWorkoutDraftPayload;
    try {
      const raw = sessionStorage.getItem(AI_WORKOUT_DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(AI_WORKOUT_DRAFT_KEY);
      data = JSON.parse(raw) as AiWorkoutDraftPayload;
    } catch {
      return;
    }
    void applyAiDraftPayload(data);
  }, [loadingExercises, applyAiDraftPayload]);

  async function requestNextWorkout() {
    setAiError(null);
    setAiResult(null);
    setAiDecisionContext(null);
    setAiExerciseCatalog(null);
    setAiLoading(true);
    try {
      const payload = await buildAiCoachRequestPayload({ aiMode });
      const res = await fetch("/api/ai-coach/suggest-next-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(t("error_suggestion"));
      }
      setAiDecisionContext(payload.aiDecisionContext);
      setAiExerciseCatalog(payload.exerciseCatalog);
      const parsed: unknown = JSON.parse(text);
      const normalized = normalizeSuggestNextResponseClient(parsed, payload.trainingSignals);
      setAiResult(normalized);
      if (process.env.NODE_ENV !== "production" && normalized.aiDebug) {
        try {
          const dbg = normalized.aiDebug;
          const qc = validateAiCoachSuggestion(
            normalized,
            payload.aiDecisionContext,
            payload.exerciseCatalog,
          );
          const mode =
            dbg.mode === "coach"
              ? "coach"
              : dbg.generationSource === "adaptive_history"
                ? "adaptive"
                : "history";
          const split = String(normalized.training_signals?.split ?? "Unknown");
          await saveAiDecisionTrace({
            mode,
            generationSource: String(dbg.generationSource ?? "unknown"),
            insightSource: String(dbg.insightSource ?? "unknown"),
            split,
            preferredSplits: Array.isArray(dbg.preferredNextSplits) ? dbg.preferredNextSplits : [],
            qualityCheckPassed: qc.warnings.length === 0,
            strengthCalibrationUsed: dbg.strengthCalibrationUsed === true,
            payloadHasCalibration: dbg.strengthCalibrationDebug?.payloadHasStrengthCalibration === true,
            decisionContextHasCalibration:
              dbg.strengthCalibrationDebug?.decisionContextHasStrengthCalibration === true,
            exerciseLoadSources: Array.isArray(dbg.exerciseLoadDebug)
              ? dbg.exerciseLoadDebug.map((r) => ({
                  exercise: r.exercise,
                  source: r.source,
                  ...(typeof r.finalWeight === "number" && Number.isFinite(r.finalWeight)
                    ? { finalWeight: r.finalWeight }
                    : {}),
                }))
              : [],
            exerciseNames: normalized.exercises.map((e) => e.name),
          });
        } catch {
          // Best-effort only: never break the workout flow.
        }
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : t("error_suggestion"));
    } finally {
      setAiLoading(false);
    }
  }

  async function generateCustomWorkout() {
    if (!customMuscles.length) return;
    if (!customDuration) return;
    if (!customFocus) return;
    setCustomGenerating(true);
    try {
      const base = await buildAiCoachRequestPayload({ aiMode });
      const payload = {
        ...base,
        customWorkoutRequest: {
          targetMuscles: [...customMuscles],
          durationMin: customDuration,
          focus: customFocus,
        },
      } as typeof base & {
        customWorkoutRequest: {
          targetMuscles: string[];
          durationMin: number;
          focus: "hypertrophy" | "strength" | "pump" | "light";
        };
      };
      const res = await fetch("/api/ai-coach/suggest-next-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(t("error_suggestion"));
      }
      const parsed: unknown = JSON.parse(text);
      const normalized = normalizeSuggestNextResponseClient(parsed, base.trainingSignals);
      const draft: AiWorkoutDraftPayload = {
        title: "Custom Workout",
        exercises: normalized.exercises.map((e) => ({
          name: e.name,
          sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
        })),
      };
      setCustomPreviewOpen(true);
      void applyAiDraftPayload(draft);
      setCustomBuilderOpen(false);
    } finally {
      setCustomGenerating(false);
    }
  }

  function startSuggestedWorkout() {
    if (!aiResult || aiResult.exercises.length === 0) return;
    setCustomPreviewOpen(false);
    setAiDecisionContext(null);
    setAiExerciseCatalog(null);
    const payload: AiWorkoutDraftPayload = {
      title: aiResult.title.trim() || "Workout",
      exercises: aiResult.exercises.map((e) => ({
        name: e.name,
        sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
      })),
    };
    void applyAiDraftPayload(payload);
    setAiResult(null);
  }

  function startWorkoutFromTemplate(t: WorkoutQuickTemplate) {
    setFinishSummary(null);
    setMode("active");
    setTitle(t.label);
    setNotes("");
    setCustomPreviewOpen(false);
    void (async () => {
      const rows = await Promise.all(
        t.exercises.map(async (name) => {
          const row = await getOrCreateExerciseByName(name, { ensureEnriched: true });
          return { row, name };
        }),
      );
      const wex: WorkoutExercise[] = rows.map(({ row, name }) => ({
        id: createId(),
        exerciseId: row.id,
        name,
        sets: [],
      }));
      setWorkoutExercises(wex);
      for (const ex of wex) {
        void hydrateLastTime(ex.id, ex.name);
      }
    })();
    setPickerOpen(false);
    setPickerQuery("");
    setPickerCategory(null);
    setCustomExerciseName("");
    setLastByExerciseId({});
    // Templates should prepare the workout, not start the timer.
    setStartedAt(null);
    setElapsedSec(0);
    setEditingExerciseId(null);
  }

  function setExerciseCardEl(id: string) {
    return (el: HTMLDivElement | null) => {
      if (el) exerciseCardEls.current.set(id, el);
      else exerciseCardEls.current.delete(id);
    };
  }

  function scrollToExerciseCard(id: string) {
    const run = (attempt: number) => {
      const el = exerciseCardEls.current.get(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (attempt < 12) {
        requestAnimationFrame(() => run(attempt + 1));
      }
    };
    requestAnimationFrame(() => run(0));
  }

  function closePickerAfterAdd() {
    setPickerOpen(false);
    setPickerQuery("");
    setPickerCategory(null);
  }

  function addExerciseFromLibraryRow(e: Exercise) {
    const localId = createId();
    setWorkoutExercises((prev) => [
      ...prev,
      { id: localId, exerciseId: e.id, name: e.name, sets: [] },
    ]);
    closePickerAfterAdd();
    void hydrateLastTime(localId, e.name);
    scrollToExerciseCard(localId);
  }

  function addExerciseFromName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const localId = createId();
    void (async () => {
      const row = await getOrCreateExerciseByName(trimmed, { ensureEnriched: true });
      setWorkoutExercises((prev) => [
        ...prev,
        { id: localId, exerciseId: row.id, name: trimmed, sets: [] },
      ]);
      closePickerAfterAdd();
      void hydrateLastTime(localId, trimmed);
      scrollToExerciseCard(localId);
    })();
  }

  function copyLastSets(localExerciseId: string) {
    const last = lastByExerciseId[localExerciseId];
    if (!last || last.sets.length === 0) return;
    setWorkoutExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== localExerciseId) return ex;
        const mult = volumeMultiplierFor(ex.exerciseId, ex.name);
        return {
          ...ex,
          sets: last.sets.map((s) => ({
            id: createId(),
            weight: s.weight,
            reps: s.reps,
            volume: setVolumeForWithMultiplier(s.weight, s.reps, mult),
          })),
        };
      }),
    );
  }

  function updateSet(
    exerciseId: string,
    setId: string,
    patch: Partial<WorkoutSession["exercises"][number]["sets"][number]>,
  ) {
    setWorkoutExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const mult = volumeMultiplierFor(ex.exerciseId, ex.name);
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (s.id !== setId) return s;
            const weight =
              patch.weight !== undefined ? patch.weight : s.weight ?? 0;
            const reps = patch.reps !== undefined ? patch.reps : s.reps ?? 0;
            const volume = setVolumeForWithMultiplier(weight, reps, mult);
            const merged = { ...s, ...patch, weight, reps, volume };
            if (patch.isDone === false) {
              merged.completedAt = undefined;
            }
            return merged;
          }),
        };
      }),
    );
  }

  function toggleSetDone(exerciseId: string, setId: string) {
    setWorkoutExercises((prev) => {
      const ex = prev.find((e) => e.id === exerciseId);
      const s = ex?.sets.find((x) => x.id === setId);
      if (!ex || !s) return prev;
      const turningOff = s.isDone === true;
      const weight = s.weight ?? 0;
      const reps = s.reps ?? 0;
      const volume = setVolumeForWithMultiplier(
        weight,
        reps,
        volumeMultiplierFor(ex.exerciseId, ex.name),
      );
      const nextSets = ex.sets.map((x) => {
        if (x.id !== setId) return x;
        if (turningOff) {
          return { ...x, isDone: false, completedAt: undefined, weight, reps, volume };
        }
        return {
          ...x,
          isDone: true,
          completedAt: new Date().toISOString(),
          weight,
          reps,
          volume,
        };
      });
      queueMicrotask(() => {
        if (turningOff) clearRest();
        else startRest();
      });
      return prev.map((e) => (e.id === exerciseId ? { ...e, sets: nextSets } : e));
    });
  }

  async function saveWorkout() {
    setFinishOpen(false);
    setSaving(true);
    try {
      const durationMin =
        startedAt && Number.isFinite(elapsedSec)
          ? Math.max(0, Math.round(elapsedSec / 60))
          : undefined;
      const t = new Date().toISOString();
      const session = await saveWorkoutSessionDraft({
        date: t.slice(0, 10),
        performedAt: t,
        title: title.trim() || "Workout",
        durationMin:
          typeof durationMin === "number" && Number.isFinite(durationMin)
            ? durationMin
            : undefined,
        notes: notes.trim() || undefined,
        exercises: workoutExercises,
      });
      setFinishSummary(session);
      setWorkoutReviewError(null);
      setWorkoutReviewLoading(true);
      const savedId = session.id;
      void (async () => {
        try {
          const payload = await buildWorkoutReviewRequestPayload(savedId);
          if (!payload) {
            setWorkoutReviewError("Could not generate review.");
            return;
          }
          const res = await fetch("/api/ai-coach/review-workout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              locale,
              language: locale,
            }),
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
            setWorkoutReviewError("Could not generate review.");
            return;
          }
          const review = data as WorkoutAiReview;
          await setWorkoutSessionAiReview(savedId, review);
          setFinishSummary((prev) =>
            prev && prev.id === savedId ? { ...prev, aiReview: review } : prev,
          );

          // Best-effort durable coach memory write (client-side Dexie).
          try {
            const sessionId = payload.completedSession?.id;
            if (sessionId && Array.isArray(review.exercise_notes)) {
              const byNorm = new Map<string, string>();
              for (const ex of session.exercises ?? []) {
                const k = normalizeExerciseName(ex.name);
                if (k && ex.exerciseId && !byNorm.has(k)) byNorm.set(k, ex.exerciseId);
              }
              const entries = review.exercise_notes
                .map((row) => {
                  const exerciseName = row?.name?.trim();
                  const note = row?.note?.trim();
                  if (!exerciseName || !note) return null;
                  const inferred = inferCoachMemoryFromNote(note);
                  if (!inferred) return null;
                  const k = normalizeExerciseName(exerciseName) ?? "";
                  const exerciseId = k ? byNorm.get(k) : undefined;
                  return {
                    createdAt: Date.now(),
                    sessionId,
                    exerciseId,
                    exerciseName,
                    normalizedExerciseName: k || normalizeExerciseName(exerciseName) || exerciseName.toLowerCase(),
                    observation: inferred.observation,
                    decision: inferred.decision,
                    confidence: inferred.confidence,
                    source: "review_inferred" as const,
                    schemaVersion: 1 as const,
                  };
                })
                .filter((x): x is NonNullable<typeof x> => Boolean(x));
              if (entries.length) {
                await addCoachMemoryEntries(entries);
              }
            }
          } catch {
            // ignore
          }
        } catch {
          setWorkoutReviewError("Could not generate review.");
        } finally {
          setWorkoutReviewLoading(false);
        }
      })();
      // Reset draft for quick next workout entry.
      setMode("idle");
      setTitle("");
      setNotes("");
      setWorkoutExercises([]);
      setPickerOpen(false);
      setPickerQuery("");
      setPickerCategory(null);
      setCustomExerciseName("");
      setLastByExerciseId({});
      setStartedAt(null);
      setElapsedSec(0);
      setEditingExerciseId(null);
    } finally {
      setSaving(false);
    }
  }

  function closeExerciseEditor() {
    clearRest();
    setEditingExerciseId(null);
  }

  useEffect(() => {
    if (mode === "active") return;
    queueMicrotask(() => {
      setCustomPreviewOpen(false);
    });
  }, [mode]);

  const secondaryCtaClass =
    "w-full min-h-11 rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-center text-base font-medium text-neutral-200 transition active:opacity-90";

  const goalLabel = useMemo(() => {
    const g = profile?.goal;
    if (!g) return null;
    return g === "build_muscle"
      ? "Build muscle"
      : g === "lose_fat"
        ? "Lose fat"
        : g === "recomposition"
          ? "Recomposition"
          : g === "strength"
            ? "Strength"
            : "General fitness";
  }, [profile?.goal]);

  const levelLabel = useMemo(() => {
    const e = profile?.experience;
    if (!e) return null;
    return e === "beginner" ? "Beginner" : e === "advanced" ? "Advanced" : "Intermediate";
  }, [profile?.experience]);

  const trainingLabel = useMemo(() => {
    const d = profile?.trainingDaysPerWeek;
    if (typeof d !== "number") return null;
    const days = d >= 5 ? "5+" : String(Math.max(1, Math.round(d)));
    return `${days} days per week`;
  }, [profile?.trainingDaysPerWeek]);

  return (
    <main className="flex flex-col space-y-6 pb-32">
      {mode === "idle" ? (
        <div className="mx-auto flex w-full min-w-0 max-w-full flex-col space-y-6">
          <header>
            <h1 className="text-[28px] font-bold leading-tight text-neutral-50">
              Workout
            </h1>
          </header>

          {profile?.onboardingCompleted && (goalLabel || trainingLabel || levelLabel) ? (
            <section className="min-w-0">
              <Card className="space-y-3">
                <div>
                  <p className="text-[22px] font-bold leading-tight text-neutral-50">
                    {t("welcome_back")}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {t("ai_plan_ready")}
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  {goalLabel ? (
                    <p className="text-neutral-200">
                      <span className="text-neutral-500">{t("goal")}:</span> {goalLabel}
                    </p>
                  ) : null}
                  {trainingLabel ? (
                    <p className="text-neutral-200">
                      <span className="text-neutral-500">{t("training")}:</span> {trainingLabel}
                    </p>
                  ) : null}
                  {levelLabel ? (
                    <p className="text-neutral-200">
                      <span className="text-neutral-500">{t("level")}:</span> {levelLabel}
                    </p>
                  ) : null}
                </div>
              </Card>
            </section>
          ) : null}

          {!finishSummary ? (
            <section className="min-w-0">
              <Card className="relative overflow-hidden !p-0">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/14 via-transparent to-transparent" />
                <div className="relative p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {t("ai_coach_title")}
                      </p>
                      <p className="mt-1 text-base font-semibold text-neutral-100">
                        {t("next_workout_recommendation")}
                      </p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {aiMode === "history_based"
                          ? t("ai_mode_history_blurb")
                          : t("ai_mode_coach_blurb")}
                      </p>
                    </div>
                    <div
                      className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3 backdrop-blur"
                      aria-hidden
                    >
                      <Dumbbell className="h-6 w-6 text-purple-500" strokeWidth={2} />
                    </div>
                  </div>

                  <div
                    className="mt-4 flex rounded-2xl border border-neutral-800 bg-neutral-950/70 p-1"
                    role="group"
                    aria-label={t("ai_coach_title")}
                  >
                    <button
                      type="button"
                      onClick={() => setAiModeAndResetResult("history_based")}
                      disabled={aiLoading}
                      className={
                        "min-h-10 min-w-0 flex-1 rounded-xl px-2 text-center text-sm font-medium transition " +
                        (aiMode === "history_based"
                          ? "bg-neutral-800 text-neutral-100"
                          : "text-neutral-500 hover:text-neutral-300")
                      }
                    >
                      {t("ai_mode_history")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiModeAndResetResult("coach_recommended")}
                      disabled={aiLoading}
                      className={
                        "min-h-10 min-w-0 flex-1 rounded-xl px-2 text-center text-sm font-medium transition " +
                        (aiMode === "coach_recommended"
                          ? "bg-neutral-800 text-neutral-100"
                          : "text-neutral-500 hover:text-neutral-300")
                      }
                    >
                      {t("ai_mode_coach")}
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {!aiResult ? (
                      <button
                        type="button"
                        onClick={() => void requestNextWorkout()}
                        disabled={aiLoading}
                        className={
                          "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-purple-500 active:opacity-90 " +
                          (aiLoading ? "opacity-60" : "")
                        }
                      >
                        <Play className="h-5 w-5" aria-hidden />
                        {aiLoading
                          ? t("thinking")
                          : locale === "ru"
                            ? "Получить рекомендацию"
                            : "Get recommendation"}
                      </button>
                    ) : null}

                    {aiError ? (
                      <p className="text-sm text-red-400/90">{aiError}</p>
                    ) : null}

                    {aiResult ? (
                      <div className="mt-1 min-w-0">
                        <AiCoachSuggestionResult
                          result={aiResult}
                          decisionContext={aiDecisionContext}
                          exerciseCatalog={aiExerciseCatalog ?? undefined}
                          onStart={startSuggestedWorkout}
                          variant="compact"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            </section>
          ) : null}

          {finishSummary ? (
            <Card className="!space-y-0 !p-0 overflow-hidden">
              <div className="p-4">
                <WorkoutReviewContent
                  layout="postSave"
                  title={finishSummary.title}
                  durationMin={finishSummary.durationMin}
                  totalSets={finishSummary.totalSets}
                  totalVolume={finishSummary.totalVolume}
                  exerciseRows={finishSummary.exercises.map((ex) => {
                    const line = formatExerciseLine(ex);
                    return {
                      id: ex.id,
                      label: line.label,
                      setCount: line.setCount,
                      vol: line.vol,
                    };
                  })}
                  aiReview={finishSummary.aiReview ?? null}
                  reviewLoading={workoutReviewLoading}
                  reviewError={workoutReviewError}
                  trainingSignals={aiResult?.training_signals ?? null}
                />
              </div>
              <div className="flex flex-col gap-2 border-t border-neutral-800/80 p-4">
                <Link
                  href="/history"
                  className={secondaryCtaClass + " block !no-underline !text-neutral-200"}
                >
                  View history
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setFinishSummary(null);
                    setWorkoutReviewError(null);
                    setWorkoutReviewLoading(false);
                  }}
                  className={secondaryCtaClass}
                >
                  Start another workout
                </button>
              </div>
            </Card>
          ) : null}

          {/* 2) CONTINUE / LAST WORKOUT (single card) */}
          {!lastSessionLoading && mostRecentSession ? (
            <section className="min-w-0">
              <Card className="!p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Last workout
                    </p>
                    <p className="mt-1 text-base font-semibold text-neutral-100">
                      {inferWorkoutTitleFromExercises({
                        currentTitle: mostRecentSession.title,
                        exercises: mostRecentSession.exercises,
                        catalog: exercises,
                        workoutGoal: "general_fitness",
                      }).inferredTitle.trim() || t("workout_default_title")}
                    </p>
                    {quickStartLastText ? (
                      <p className="mt-1 text-sm text-neutral-500">{quickStartLastText}</p>
                    ) : null}
                  </div>
                  <Repeat2 className="h-5 w-5 shrink-0 text-purple-500" aria-hidden />
                </div>
                <div className="mt-4">
                  <Link
                    href="/history"
                    className={
                      secondaryCtaClass +
                      " block !rounded-2xl !no-underline !text-neutral-200"
                    }
                  >
                    History
                  </Link>
                </div>
              </Card>
            </section>
          ) : null}

          {/* 3) QUICK SPLITS (horizontal scroll) */}
          <section className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-neutral-400">{t("quick_splits")}</h2>
              <span className="text-xs text-neutral-500">{t("swipe")}</span>
            </div>
            <div className="mt-2 -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => {
                  setCustomBuilderOpen(true);
                }}
                className="min-w-[172px] max-w-[172px] rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-left shadow-sm transition active:scale-[0.99] active:opacity-90"
              >
                <div className="flex items-start justify-between gap-3">
                  <Wand2 className="h-5 w-5 text-purple-500" aria-hidden />
                  <ArrowRight className="h-4 w-4 text-neutral-600" aria-hidden />
                </div>
                <p className="mt-2 text-base font-semibold text-neutral-100">
                  {t("custom_workout_title")}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-snug text-neutral-500">
                  {t("custom_workout_subtitle")}
                </p>
                <div className="mt-2 space-y-0.5">
                  <p className="text-xs tabular-nums text-neutral-600">
                    {t("coming_soon")}
                  </p>
                </div>
              </button>

              {QUICK_WORKOUT_TEMPLATES.map((tpl) => {
                const difficultyLabel =
                  tpl.difficulty === "beginner"
                    ? locale === "ru"
                      ? "Для новичков"
                      : "Beginner"
                    : tpl.difficulty === "intermediate"
                      ? locale === "ru"
                        ? "Средний уровень"
                        : "Intermediate"
                      : null;
                const duration = typeof tpl.estimatedDurationMin === "number" ? tpl.estimatedDurationMin : null;
                const Icon =
                  tpl.label === "Push"
                    ? Flame
                    : tpl.label === "Pull"
                      ? Dumbbell
                      : tpl.label === "Legs"
                        ? Layers
                        : tpl.label === "Upper"
                          ? Dumbbell
                          : Layers;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => startWorkoutFromTemplate(tpl)}
                    className="min-w-[172px] max-w-[172px] rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 text-left shadow-sm transition active:scale-[0.99] active:opacity-90"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Icon className="h-5 w-5 text-purple-500" aria-hidden />
                      <ArrowRight className="h-4 w-4 text-neutral-600" aria-hidden />
                    </div>
                    <p className="mt-2 text-base font-semibold text-neutral-100">{tpl.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-neutral-500">
                      {tpl.muscleLine}
                    </p>
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs tabular-nums text-neutral-600">
                        {tpl.exercises.length} {t("label_exercises")}
                        {duration ? ` • ~${duration} ${t("minutes_short")}` : ""}
                      </p>
                      {difficultyLabel ? (
                        <p className="text-xs text-neutral-600">{difficultyLabel}</p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setTemplatesOpen(true)}
                className={secondaryCtaClass + " !rounded-2xl"}
              >
                {t("all_templates")}
              </button>
            </div>
          </section>

          {/* Custom workout builder (UI-only placeholder; AI hookup later) */}
          {customBuilderOpen ? (
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                aria-label={t("close")}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setCustomBuilderOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[420px]">
                <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl pb-[calc(env(safe-area-inset-bottom,0px)+96px)]">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        router.back();
                        setCustomBuilderOpen(false);
                      }}
                      className="min-h-10 shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-sm font-medium text-neutral-200 active:opacity-90"
                      aria-label={t("back")}
                    >
                      ← {t("back")}
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-100">
                        {t("custom_workout_title")}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {t("custom_workout_subtitle")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomBuilderOpen(false)}
                      className="min-h-10 rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-sm font-medium text-neutral-200 active:opacity-90"
                    >
                      {t("close")}
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {t("muscles")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {customMuscleOptions.map((m) => {
                          const on = customMuscles.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setCustomMuscles((prev) =>
                                  prev.includes(m.id)
                                    ? prev.filter((x) => x !== m.id)
                                    : [...prev, m.id],
                                );
                              }}
                              className={
                                "min-h-10 rounded-full border px-3 text-sm font-medium transition " +
                                (on
                                  ? "border-violet-500/50 bg-violet-500/15 text-neutral-100"
                                  : "border-neutral-800 bg-neutral-900 text-neutral-300 active:opacity-90")
                              }
                            >
                              {locale === "ru" ? m.ru : m.en}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {t("duration_label")}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {customDurationOptions.map((d) => {
                          const on = customDuration === d;
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setCustomDuration(d)}
                              className={
                                "min-h-10 rounded-2xl border text-sm font-semibold transition " +
                                (on
                                  ? "border-violet-500/50 bg-violet-500/15 text-neutral-100"
                                  : "border-neutral-800 bg-neutral-900 text-neutral-300 active:opacity-90")
                              }
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {t("focus")}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {customFocusOptions.map((f) => {
                          const on = customFocus === f.id;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setCustomFocus(f.id)}
                              className={
                                "min-h-10 rounded-2xl border text-sm font-semibold transition " +
                                (on
                                  ? "border-violet-500/50 bg-violet-500/15 text-neutral-100"
                                  : "border-neutral-800 bg-neutral-900 text-neutral-300 active:opacity-90")
                              }
                            >
                              {locale === "ru" ? f.ru : f.en}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void generateCustomWorkout()}
                        disabled={
                          customGenerating ||
                          customMuscles.length === 0 ||
                          customDuration === null ||
                          customFocus === null
                        }
                        className={
                          "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-semibold transition active:opacity-90 " +
                          (customGenerating ||
                          customMuscles.length === 0 ||
                          customDuration === null ||
                          customFocus === null
                            ? "bg-neutral-800 text-neutral-400"
                            : "bg-purple-600 text-white hover:bg-purple-500")
                        }
                      >
                        {customGenerating
                          ? t("generating")
                          : t("generate_workout")}
                      </button>
                      <p className="text-xs text-neutral-500">
                        {locale === "ru"
                          ? "Генерация создаст тренировку и откроет её в режиме подготовки. Таймер стартует только после кнопки «Начать»."
                          : "Generation will open a prepared workout. The timer starts only when you press Start."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Templates modal (bottom sheet) */}
          {templatesOpen ? (
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                aria-label={t("close")}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setTemplatesOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[420px]">
                <div className="rounded-t-3xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-100">Templates</p>
                      <p className="mt-0.5 text-xs text-neutral-500">Pick a split to start</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTemplatesOpen(false)}
                      className="min-h-10 rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-sm font-medium text-neutral-200 active:opacity-90"
                    >
                      {t("close")}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]">
                    {QUICK_WORKOUT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setTemplatesOpen(false);
                          startWorkoutFromTemplate(tpl);
                        }}
                        className={TEMPLATE_CARD_CLASS + " !px-5 !py-4"}
                      >
                        <p className={TEMPLATE_TITLE_CLASS}>{tpl.label}</p>
                        <p className={TEMPLATE_SUBLINE_CLASS}>{tpl.muscleLine}</p>
                        <p className={TEMPLATE_META_CLASS}>
                          {tpl.exercises.length} {t("label_exercises")}
                        </p>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setTemplatesOpen(false);
                        createWorkoutDraft();
                      }}
                      className={TEMPLATE_CARD_CLASS + " !px-5 !py-4"}
                    >
                      <p className={TEMPLATE_TITLE_CLASS}>{t("template_custom")}</p>
                      <p className={TEMPLATE_SUBLINE_CLASS}>{t("template_custom_sub")}</p>
                      <p className={TEMPLATE_META_CLASS}>{t("template_empty_session")}</p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "active" && !editingExercise ? (
        <div className="rounded-xl bg-neutral-900 px-4 py-3">
          <div className="flex items-start gap-3">
            {customPreviewOpen && !startedAt ? (
              <button
                type="button"
                onClick={() => router.back()}
                className="mt-0.5 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-3 text-sm font-semibold text-[#D4D4D4] transition hover:bg-[#222222] active:opacity-90"
              >
                ← {t("back")}
              </button>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold leading-tight text-neutral-50">
                {t("workout")}
              </h1>
          <p className="mt-0.5 text-xl font-semibold leading-tight text-neutral-100">
            {title.trim()
              ? title.trim()
              : t("untitled")}
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            <span className="font-medium tabular-nums text-neutral-200">
              {formatMMSS(elapsedSec)}
            </span>{" "}
            {t("elapsed")}
          </p>
          <div className="mt-3">
            <TextField
              label={t("title")}
              placeholder="e.g. Push A"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "active" ? (
        <section className={editingExercise ? "space-y-4" : "space-y-6"}>
          {editingExercise ? (
            <>
              <header className="flex min-h-11 items-center gap-2 border-b border-neutral-800/80 pb-2">
                <button
                  type="button"
                  className="flex min-h-11 min-w-11 shrink-0 items-center text-sm text-neutral-500 transition hover:text-neutral-300"
                  onClick={closeExerciseEditor}
                >
                  {t("back")}
                </button>
                <h1 className="line-clamp-2 min-w-0 flex-1 break-words text-center text-2xl font-semibold leading-tight text-neutral-100">
                  {editingExercise?.name?.trim()
                    ? editingExercise.name
                    : t("exercise")}
                </h1>
                <div className="w-11 shrink-0" aria-hidden />
              </header>

              <ExerciseRestTimer
                state={rest}
                onAdd30={onAdd30}
                onSub30={onSub30}
                onStop={clearRest}
              />

              <Card className="!mt-0 !space-y-3 !p-4">
              {editingExercise.sets.length === 0 ? (
                <p className="text-sm text-neutral-400">{t("no_sets_yet")}</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid items-center gap-2 border-b border-[#2A2A2A] px-3 pb-2 text-xs font-semibold text-[#9CA3AF] [grid-template-columns:64px_minmax(78px,1fr)_64px_48px_32px]">
                    <span>{t("set_editor_header_set")}</span>
                    <span>{t("set_editor_header_weight_kg")}</span>
                    <span>{t("set_editor_header_reps")}</span>
                    <span className="text-center">{t("set_editor_header_done")}</span>
                    <span />
                  </div>
                  <div className="flex flex-col gap-3">
                  {editingExercise.sets.map((set, idx) => (
                    <ExerciseSetRow
                      key={set.id}
                      set={set}
                      index1={idx + 1}
                      weightInputId={`eset-w-${set.id}`}
                      repsInputId={`eset-r-${set.id}`}
                      onDelete={() => deleteSet(editingExercise.id, set.id)}
                      onChangeWeight={(v) =>
                        updateSet(editingExercise.id, set.id, { weight: v })
                      }
                      onChangeReps={(v) =>
                        updateSet(editingExercise.id, set.id, { reps: v })
                      }
                      onToggleDone={() =>
                        toggleSetDone(editingExercise.id, set.id)
                      }
                    />
                  ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button
                    variant="editorSecondary"
                    onClick={() => addSameSet(editingExercise.id)}
                    disabled={editingExercise.sets.length === 0}
                    title={editingExercise.sets.length === 0 ? t("add_empty_set_first") : undefined}
                  >
                    {t("same_set")}
                  </Button>
                  <Button
                    variant="editorSecondary"
                    onClick={() => addEmptySet(editingExercise.id)}
                  >
                    {t("empty_set")}
                  </Button>
                </div>

                {editingExercise.sets.length >= 2 ? (
                  <Button
                    variant="editorUtility"
                    onClick={() => addSetCopyingSecondToLast(editingExercise.id)}
                  >
                    {t("copy_previous")}
                  </Button>
                ) : null}

                {lastByExerciseId[editingExercise.id] ? (
                  <Button
                    variant="editorUtility"
                    onClick={() => copyLastSets(editingExercise.id)}
                  >
                    {t("copy_last_sets")}
                  </Button>
                ) : null}
              </div>

              <div className="flex items-baseline justify-between border-t border-neutral-800/80 pt-2.5">
                <span className="text-sm text-neutral-500">{t("volume_kg")}</span>
                <span className="text-lg font-medium tabular-nums text-neutral-100">
                  {Math.round(
                    editingExercise.sets.reduce(
                      (s, set) => s + (set.volume ?? 0),
                      0,
                    ) * 100,
                  ) / 100}
                </span>
              </div>
              </Card>

              <div
                className="pt-0.5 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom,0px))]"
              >
                <Button
                  variant="editorSecondary"
                  onClick={closeExerciseEditor}
                >
                  {t("done")}
                </Button>
              </div>
            </>
          ) : (
            <>
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-400">{t("exercises")}</h2>
            {workoutExercises.map((ex) => {
              const last = lastByExerciseId[ex.id];
              return (
                <div key={ex.id} ref={setExerciseCardEl(ex.id)}>
                  <Card className="!p-0 overflow-hidden">
                    <div className="flex min-h-14 items-stretch">
                      <button
                        type="button"
                        onClick={() => setEditingExerciseId(ex.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 p-3 pr-2 text-left transition active:opacity-90"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex items-baseline justify-between gap-2 truncate text-lg font-semibold text-neutral-100">
                            <span className="truncate">{ex.name || "Exercise"}</span>
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">
                            {locale === "ru"
                              ? `${ex.sets.length} подхода`
                              : `${ex.sets.length} set${ex.sets.length === 1 ? "" : "s"} planned`}
                            {last
                              ? (() => {
                                  const lastVol =
                                    Math.round(
                                      last.sets.reduce(
                                        (s, x) => s + (x.weight ?? 0) * (x.reps ?? 0),
                                        0,
                                      ) * 100,
                                    ) / 100;
                                  return locale === "ru"
                                    ? ` • Прошлая тренировка: ${lastVol} кг`
                                    : ` • Last session: ${lastVol} kg`;
                                })()
                              : ""}
                          </p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center text-violet-400" aria-hidden>
                          <ChevronRight className="h-[22px] w-[22px]" />
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center border-l border-neutral-800/80 px-1">
                        <button
                          type="button"
                          onClick={() => deleteExerciseCard(ex.id)}
                          aria-label={t("remove_exercise")}
                          className="flex h-10 w-10 items-center justify-center text-neutral-500 transition hover:text-red-300 active:text-red-200"
                        >
                          <Trash2 className="h-5 w-5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
            {workoutExercises.length === 0 ? (
              <p className="text-sm text-neutral-400">{t("no_exercises_yet")}</p>
            ) : null}
          </div>

          <div
            ref={addExerciseFlowRef}
            className="flex flex-col space-y-3 pb-1 [padding-bottom:env(safe-area-inset-bottom,0px)]"
          >
            <div className="sticky bottom-4 z-10">
              <button
                type="button"
                className={secondaryCtaClass}
                onClick={() => {
                  setEditingExerciseId(null);
                  setPickerOpen(true);
                  setPickerQuery("");
                  setPickerCategory(null);
                  setCustomExerciseName("");
                  setRecentNames([]);
                  setRecentLoading(true);
                  void listExercises().then((rows) => setExercises(rows));
                  void getRecentExerciseNamesUsed(5)
                    .then((rows) => {
                      setRecentNames(rows);
                    })
                    .finally(() => {
                      setRecentLoading(false);
                    });
                }}
              >
                + Add exercise
              </button>
            </div>

            {pickerOpen ? (
              <Card className="space-y-3 !p-3">
                <TextField
                  label="Search"
                  placeholder="2+ characters"
                  value={pickerQuery}
                  onChange={(e) => {
                    setPickerQuery(e.target.value);
                    if (e.target.value.trim().length >= 2) {
                      setPickerCategory(null);
                    }
                  }}
                />

                {pickerQuery.trim().length >= 2 ? (
                  <div className="flex max-h-[45vh] flex-col gap-1.5 overflow-y-auto">
                    {loadingExercises ? (
                      <p className="text-sm text-neutral-500">{t("loading")}</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-sm text-neutral-500">{t("exercises_no_matches_title")}.</p>
                    ) : (
                      searchResults.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => addExerciseFromLibraryRow(e)}
                          className="min-h-10 w-full rounded-lg bg-neutral-950/50 px-3 py-2 text-left ring-1 ring-neutral-800/80 transition active:opacity-90"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 break-words text-sm font-medium text-neutral-100">
                              {e.name}
                            </span>
                            {e.muscleGroup ? (
                              <span className="shrink-0 text-xs text-neutral-500">
                                {e.muscleGroup}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
                    {pickerQuery.trim().length > 0 && pickerQuery.trim().length < 2 ? (
                      <p className="text-sm text-neutral-500">
                        {t("type_2_chars")}
                      </p>
                    ) : null}

                    {pickerCategory ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-neutral-400">
                            {MUSCLE_CATEGORIES.find((c) => c.id === pickerCategory)
                              ? t(MUSCLE_CATEGORIES.find((c) => c.id === pickerCategory)!.labelKey)
                              : t("exercises")}
                          </p>
                          <button
                            type="button"
                            onClick={() => setPickerCategory(null)}
                            className="text-sm text-primary/90"
                          >
                            {t("all")}
                          </button>
                        </div>
                        {categoryExercises.length === 0 ? (
                          <p className="text-sm text-neutral-500">{t("nothing_in_group")}</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {categoryExercises.map((e) => (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => addExerciseFromLibraryRow(e)}
                                className="min-h-10 w-full rounded-lg bg-neutral-950/50 px-3 py-2 text-left ring-1 ring-neutral-800/80 active:opacity-90"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 break-words text-sm font-medium text-neutral-100">
                                    {e.name}
                                  </span>
                                  {e.muscleGroup ? (
                                    <span className="shrink-0 text-xs text-neutral-500">
                                      {e.muscleGroup}
                                    </span>
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {favoriteExercises.length > 0 ? (
                          <div>
                            <p className="mb-1.5 text-xs text-neutral-500">{t("favorites")}</p>
                            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-0.5">
                              {favoriteExercises.map((e) => (
                                <button
                                  key={e.id}
                                  type="button"
                                  onClick={() => addExerciseFromLibraryRow(e)}
                                  className="min-h-10 w-full rounded-lg bg-amber-500/5 px-3 py-2 text-left text-sm font-medium text-neutral-100 ring-1 ring-amber-500/15 active:opacity-90"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 break-words">{e.name}</span>
                                    <span
                                      className="shrink-0 text-amber-500/60 text-xs"
                                      aria-hidden
                                    >
                                      ★
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <p className="mb-1.5 text-xs text-neutral-500">{t("recent")}</p>
                          {recentLoading ? (
                            <p className="text-sm text-neutral-500">{t("loading")}</p>
                          ) : recentNamesForPicker.length === 0 ? (
                            <p className="text-sm text-neutral-500">
                              {recentNames.length === 0
                                ? t("no_history_yet")
                                : t("no_recent_try_group")}
                            </p>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {recentNamesForPicker.map((n) => (
                                <button
                                  key={normalizeExerciseName(n)}
                                  type="button"
                                  onClick={() => addExerciseFromName(n)}
                                  className="min-h-10 w-full rounded-lg bg-neutral-950/50 px-3 py-2 text-left text-sm font-medium text-neutral-100 ring-1 ring-neutral-800/80 active:opacity-90"
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs text-neutral-500">{t("by_muscle")}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {MUSCLE_CATEGORIES.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setPickerQuery("");
                                  setPickerCategory(c.id);
                                }}
                                className="rounded-full bg-neutral-800/90 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition active:bg-neutral-800"
                              >
                                {t(c.labelKey)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 border-t border-neutral-800/80 pt-3">
                      <TextField
                        label={t("not_in_list")}
                        placeholder={t("not_in_list_ph")}
                        value={customExerciseName}
                        onChange={(e) => setCustomExerciseName(e.target.value)}
                      />
                      <div className="flex flex-col gap-1.5">
                        <Button
                          disabled={!customExerciseName.trim()}
                          onClick={() => {
                            addExerciseFromName(customExerciseName);
                            setCustomExerciseName("");
                          }}
                        >
                          {t("add")}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setPickerOpen(false);
                            setPickerCategory(null);
                            setPickerQuery("");
                            setCustomExerciseName("");
                          }}
                        >
                          {t("close")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ) : null}
          </div>
            </>
          )}

          {!editingExercise ? (
            <>
              {!startedAt ? (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStartedAt(new Date().toISOString());
                      setElapsedSec(0);
                    }}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-purple-500 active:opacity-90"
                  >
                    <Play className="h-5 w-5" aria-hidden />
                    {t("start_workout")}
                  </button>
                  <p className="text-xs text-neutral-500">
                    {t("start_workout_hint")}
                  </p>
                </div>
              ) : null}

              {startedAt && finishOpen ? (
                <Card className="!p-5 space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#FFFFFF]">{t("finish_workout")}</p>
                    <p className="text-sm text-[#9CA3AF]">{t("finish_workout_note_blurb")}</p>
                  </div>
                  <div className="rounded-[14px] border border-[#2A2A2A] bg-[#222222] px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-[#9CA3AF]">{t("sets")}</span>
                      <span className="text-base font-semibold tabular-nums text-[#FFFFFF]">
                        {totals.totalSets}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-xs text-[#9CA3AF]">{t("volume_kg")}</span>
                      <span className="text-base font-semibold tabular-nums text-[#FFFFFF]">
                        {Math.round(totals.totalVolume * 100) / 100}
                      </span>
                    </div>
                  </div>
                  <TextArea
                    label={t("notes")}
                    placeholder={t("notes_placeholder")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="!min-h-[110px]"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => void saveWorkout()}
                      disabled={saving || workoutExercises.length === 0}
                    >
                      {saving ? t("saving") : t("save_workout")}
                    </Button>
                    <Button
                      variant="editorUtility"
                      onClick={() => setFinishOpen(false)}
                      disabled={saving}
                    >
                      {t("back_to_workout")}
                    </Button>
                  </div>
                </Card>
              ) : null}

              {startedAt && !finishOpen ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-neutral-400">{t("session_stats")}</h2>
              <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/30 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-neutral-400">{t("sets")}</span>
                  <span className="text-base font-medium tabular-nums text-neutral-200">
                    {totals.totalSets}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-xs text-neutral-400">{t("volume_kg")}</span>
                  <span className="text-base font-medium tabular-nums text-neutral-200">
                    {Math.round(totals.totalVolume * 100) / 100}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Notes moved to finish screen */}

          {startedAt && !finishOpen ? (
            <div className="pt-0.5">
              <Button
                onClick={() => setFinishOpen(true)}
                disabled={saving || workoutExercises.length === 0}
              >
                {t("finish_workout")}
              </Button>
            </div>
          ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

