"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { setVolumeFor } from "@/lib/workoutSetQuick";
import { getOrCreateSettings } from "@/db/settings";
import { listExercises } from "@/db/exercises";
import {
  listWorkoutSessions,
  saveWorkoutSessionDraft,
  setWorkoutSessionAiReview,
} from "@/db/workoutSessions";
import { buildWorkoutReviewRequestPayload } from "@/services/workoutReviewContext";
import type { WorkoutAiReview } from "@/types/aiCoach";
import {
  formatWorkoutLastPerformed,
  muscleLineForSession,
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

type WorkoutMode = "idle" | "active";

const MUSCLE_CATEGORIES = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "legs", label: "Legs" },
  { id: "shoulders", label: "Shoulders" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "core", label: "Core" },
  { id: "glutes", label: "Glutes" },
  { id: "full_body", label: "Full Body" },
] as const;

const TEMPLATE_CARD_CLASS =
  "flex min-h-[5.5rem] w-full flex-col items-stretch justify-center rounded-2xl border border-neutral-800/90 bg-neutral-950/60 px-4 py-3.5 text-left shadow-sm transition hover:border-neutral-600/50 hover:bg-neutral-900/70 active:scale-[0.99] active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500/50";
const TEMPLATE_TITLE_CLASS = "text-lg font-semibold leading-snug tracking-tight text-neutral-100";
const TEMPLATE_SUBLINE_CLASS = "mt-1.5 break-words text-sm leading-snug text-neutral-500";
const TEMPLATE_META_CLASS = "mt-1 text-xs tabular-nums text-neutral-600";

export function WorkoutView() {
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
          (s, set) => s + Math.max(0, set.weight || 0) * Math.max(0, set.reps || 0),
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

  const quickStartMuscleLine = useMemo(
    () =>
      mostRecentSession
        ? muscleLineForSession(mostRecentSession, exercises)
        : "",
    [mostRecentSession, exercises],
  );

  const quickStartLastText = useMemo(
    () =>
      mostRecentSession
        ? formatWorkoutLastPerformed(mostRecentSession.date)
        : "",
    [mostRecentSession],
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
      const volume = setVolumeFor(weight, reps);
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
      const volume = setVolumeFor(weight, reps);
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

  async function hydrateLastTime(localExerciseId: string, name: string) {
    const perf = await getLastExercisePerformance(name);
    if (!perf) return;
    setLastByExerciseId((prev) => ({
      ...prev,
      [localExerciseId]: {
        date: perf.date,
        sets: perf.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
      },
    }));
  }

  /** Apply AI suggestion from Progress (sessionStorage) once catalog is ready. */
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
    if (!data.exercises?.length) return;
    aiDraftAppliedRef.current = true;
    const catalog = exercises;
    const titleTrim = data.title?.trim() || "Workout";
    queueMicrotask(() => {
      setFinishSummary(null);
      setMode("active");
      setTitle(titleTrim);
      setNotes("");
      const wex: WorkoutExercise[] = data.exercises.map((ex) => {
        const k = normalizeExerciseName(ex.name);
        const match = catalog.find((e) => normalizeExerciseName(e.name) === k);
        return {
          id: createId(),
          ...(match ? { exerciseId: match.id } : {}),
          name: ex.name,
          sets: (ex.sets ?? []).map((s) => {
            const setId = createId();
            const w = Math.max(0, Number(s.weight) || 0);
            const r = Math.max(0, Math.round(Number(s.reps) || 0));
            return {
              id: setId,
              weight: w,
              reps: r,
              volume: setVolumeFor(w, r),
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
      setStartedAt(new Date().toISOString());
      setElapsedSec(0);
      setEditingExerciseId(null);
      for (const ex of wex) {
        void hydrateLastTime(ex.id, ex.name);
      }
    });
  }, [loadingExercises, exercises]);

  function startWorkoutFromTemplate(t: WorkoutQuickTemplate) {
    setFinishSummary(null);
    setMode("active");
    setTitle(t.label);
    setNotes("");
    const wex: WorkoutExercise[] = t.exercises.map((name) => ({
      id: createId(),
      name,
      sets: [],
    }));
    setWorkoutExercises(wex);
    setPickerOpen(false);
    setPickerQuery("");
    setPickerCategory(null);
    setCustomExerciseName("");
    setLastByExerciseId({});
    setStartedAt(new Date().toISOString());
    setElapsedSec(0);
    setEditingExerciseId(null);
    for (const ex of wex) {
      void hydrateLastTime(ex.id, ex.name);
    }
  }

  function startFromRecentSession(s: WorkoutSession) {
    setFinishSummary(null);
    setMode("active");
    setTitle(s.title.trim() || "Workout");
    setNotes("");
    const wex: WorkoutExercise[] = s.exercises.map((ex) => ({
      id: createId(),
      ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
      name: ex.name,
      sets: [],
    }));
    setWorkoutExercises(wex);
    setPickerOpen(false);
    setPickerQuery("");
    setPickerCategory(null);
    setCustomExerciseName("");
    setLastByExerciseId({});
    setStartedAt(new Date().toISOString());
    setElapsedSec(0);
    setEditingExerciseId(null);
    for (const ex of wex) {
      void hydrateLastTime(ex.id, ex.name);
    }
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
    const k = normalizeExerciseName(trimmed);
    const match = exercises.find(
      (x) => normalizeExerciseName(x.name) === k,
    );
    if (match) {
      addExerciseFromLibraryRow(match);
      return;
    }
    const localId = createId();
    setWorkoutExercises((prev) => [
      ...prev,
      { id: localId, name: trimmed, sets: [] },
    ]);
    closePickerAfterAdd();
    void hydrateLastTime(localId, trimmed);
    scrollToExerciseCard(localId);
  }

  function copyLastSets(localExerciseId: string) {
    const last = lastByExerciseId[localExerciseId];
    if (!last || last.sets.length === 0) return;
    setWorkoutExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== localExerciseId) return ex;
        return {
          ...ex,
          sets: last.sets.map((s) => ({
            id: createId(),
            weight: s.weight,
            reps: s.reps,
            volume: Math.max(0, s.weight) * Math.max(0, s.reps),
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
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (s.id !== setId) return s;
            const weight =
              patch.weight !== undefined ? patch.weight : s.weight ?? 0;
            const reps = patch.reps !== undefined ? patch.reps : s.reps ?? 0;
            const volume = Math.max(0, weight || 0) * Math.max(0, reps || 0);
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
      const volume = Math.max(0, weight) * Math.max(0, reps);
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
            setWorkoutReviewError("Could not generate review.");
            return;
          }
          const review = data as WorkoutAiReview;
          await setWorkoutSessionAiReview(savedId, review);
          setFinishSummary((prev) =>
            prev && prev.id === savedId ? { ...prev, aiReview: review } : prev,
          );
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

  const secondaryCtaClass =
    "w-full min-h-11 rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-center text-base font-medium text-neutral-200 transition active:opacity-90";

  return (
    <main className="flex flex-col space-y-6">
      {mode === "idle" ? (
        <div className="mx-auto flex w-full min-w-0 max-w-full flex-col space-y-6">
          <header>
            <h1 className="text-2xl font-semibold leading-tight text-neutral-50">
              Workout
            </h1>
          </header>

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

          {!lastSessionLoading && mostRecentSession ? (
            <section className="min-w-0">
              <h2 className="text-sm font-medium text-neutral-400">Quick start</h2>
              <div className="mt-2 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
                <p className="text-base font-semibold text-neutral-100">
                  {mostRecentSession.title.trim() || "Workout"}
                </p>
                <p className="mt-0.5 break-words text-sm text-neutral-500">
                  {quickStartMuscleLine}
                </p>
                {quickStartLastText ? (
                  <p className="mt-1 text-sm text-neutral-500">
                    Last time: {quickStartLastText}
                  </p>
                ) : null}
                <div className="mt-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => startFromRecentSession(mostRecentSession)}
                    className={secondaryCtaClass}
                  >
                    Start workout
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="min-w-0">
            <h2 className="text-sm font-medium text-neutral-400">Templates</h2>
            <div className="mt-2 grid min-w-0 grid-cols-2 gap-3">
              {QUICK_WORKOUT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => startWorkoutFromTemplate(t)}
                  className={TEMPLATE_CARD_CLASS}
                >
                  <p className={TEMPLATE_TITLE_CLASS}>{t.label}</p>
                  <p className={TEMPLATE_SUBLINE_CLASS}>{t.muscleLine}</p>
                  <p className={TEMPLATE_META_CLASS}>
                    {t.exercises.length} exercise
                    {t.exercises.length === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
              <button
                type="button"
                onClick={createWorkoutDraft}
                className={TEMPLATE_CARD_CLASS}
              >
                <p className={TEMPLATE_TITLE_CLASS}>Custom</p>
                <p className={TEMPLATE_SUBLINE_CLASS}>
                  Add exercises and sets as you go
                </p>
                <p className={TEMPLATE_META_CLASS}>Empty session</p>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {mode === "active" && !editingExercise ? (
        <div className="rounded-xl bg-neutral-900 px-4 py-3">
          <h1 className="text-2xl font-semibold leading-tight text-neutral-50">
            Workout
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            <span className="font-medium tabular-nums text-neutral-200">
              {formatMMSS(elapsedSec)}
            </span>{" "}
            elapsed
          </p>
          <div className="mt-3">
            <TextField
              label="Title"
              placeholder="e.g. Push A"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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
                  Back
                </button>
                <h1 className="line-clamp-2 min-w-0 flex-1 break-words text-center text-2xl font-semibold leading-tight text-neutral-100">
                  {editingExercise?.name?.trim()
                    ? editingExercise.name
                    : "Exercise"}
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
              {lastByExerciseId[editingExercise.id] ? (
                <div className="space-y-2.5">
                  <p className="text-sm leading-snug text-neutral-400">
                    <span className="text-neutral-500">
                      {lastByExerciseId[editingExercise.id]!.date}
                    </span>
                    <br />
                    {lastByExerciseId[editingExercise.id]!.sets
                      .slice(0, 8)
                      .map((s) => `${s.weight}×${s.reps}`)
                      .join(" · ")}
                    {lastByExerciseId[editingExercise.id]!.sets.length > 8
                      ? "…"
                      : ""}
                  </p>
                  <Button
                    variant="editorSecondary"
                    onClick={() => copyLastSets(editingExercise.id)}
                  >
                    Copy last sets
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">No last session in log.</p>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button
                    variant="editorSecondary"
                    onClick={() => addSameSet(editingExercise.id)}
                  >
                    + Same set
                  </Button>
                  <Button
                    variant="editorSecondary"
                    onClick={() => addEmptySet(editingExercise.id)}
                  >
                    + Empty set
                  </Button>
                </div>
                <Button
                  variant="editorUtility"
                  onClick={() => addSetCopyingSecondToLast(editingExercise.id)}
                >
                  Copy previous
                </Button>
              </div>

              {editingExercise.sets.length === 0 ? (
                <p className="text-sm text-neutral-400">No sets yet.</p>
              ) : (
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
              )}

              <div className="flex items-baseline justify-between border-t border-neutral-800/80 pt-2.5">
                <span className="text-sm text-neutral-500">Volume (kg)</span>
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
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-400">Exercises</h2>
            {workoutExercises.map((ex) => {
              const exVolume = ex.sets.reduce(
                (s, set) => s + (set.volume ?? 0),
                0,
              );
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
                            <span
                              className="shrink-0 text-primary/80"
                              aria-hidden
                            >
                              ›
                            </span>
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">
                            {ex.sets.length} set{ex.sets.length === 1 ? "" : "s"}{" "}
                            · {Math.round(exVolume * 100) / 100} kg
                            {last
                              ? ` · ${last.date} · ${last.sets
                                  .slice(0, 2)
                                  .map((s) => `${s.weight}×${s.reps}`)
                                  .join(" ")}${
                                  last.sets.length > 2 ? "…" : ""
                                }`
                              : ""}
                          </p>
                        </div>
                      </button>
                      <div className="flex shrink-0 border-l border-neutral-800/80">
                        <button
                          type="button"
                          onClick={() => deleteExerciseCard(ex.id)}
                          className="flex h-full min-h-11 min-w-[3.25rem] items-center justify-center px-1 text-sm text-neutral-500 transition active:text-neutral-400"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
            {workoutExercises.length === 0 ? (
              <p className="text-sm text-neutral-400">No exercises yet. Add one below.</p>
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
                      <p className="text-sm text-neutral-500">Loading…</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-sm text-neutral-500">No matches.</p>
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
                        Type 2+ characters
                      </p>
                    ) : null}

                    {pickerCategory ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-neutral-400">
                            {MUSCLE_CATEGORIES.find((c) => c.id === pickerCategory)
                              ?.label ?? "Exercises"}
                          </p>
                          <button
                            type="button"
                            onClick={() => setPickerCategory(null)}
                            className="text-sm text-primary/90"
                          >
                            All
                          </button>
                        </div>
                        {categoryExercises.length === 0 ? (
                          <p className="text-sm text-neutral-500">Nothing in this group.</p>
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
                            <p className="mb-1.5 text-xs text-neutral-500">Favorites</p>
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
                          <p className="mb-1.5 text-xs text-neutral-500">Recent</p>
                          {recentLoading ? (
                            <p className="text-sm text-neutral-500">Loading…</p>
                          ) : recentNamesForPicker.length === 0 ? (
                            <p className="text-sm text-neutral-500">
                              {recentNames.length === 0
                                ? "No history yet."
                                : "No recent — try a group below."}
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
                          <p className="mb-1.5 text-xs text-neutral-500">By muscle</p>
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
                                {c.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 border-t border-neutral-800/80 pt-3">
                      <TextField
                        label="Not in list"
                        placeholder="e.g. Landmine press"
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
                          Add
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
                          Close
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
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-neutral-400">Session stats</h2>
            <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/30 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-neutral-400">Sets</span>
              <span className="text-base font-medium tabular-nums text-neutral-200">
                {totals.totalSets}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs text-neutral-400">Volume (kg)</span>
              <span className="text-base font-medium tabular-nums text-neutral-200">
                {Math.round(totals.totalVolume * 100) / 100}
              </span>
            </div>
            </div>
          </div>

          <div>
            <TextArea
              label="Notes"
              placeholder="How did the session feel?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="!min-h-[100px]"
            />
          </div>

          <div className="pt-0.5">
            <Button
              onClick={() => void saveWorkout()}
              disabled={saving || workoutExercises.length === 0}
              className="!rounded-xl !bg-purple-600 !py-3 !font-medium !text-white hover:!bg-purple-500"
            >
              {saving ? "Saving…" : "Finish workout"}
            </Button>
          </div>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

