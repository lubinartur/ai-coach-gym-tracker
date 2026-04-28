"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExerciseSetRow } from "@/components/workout/ExerciseSetRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { createId } from "@/lib/id";
import { setVolumeForWithMultiplier } from "@/lib/workoutSetQuick";
import { db } from "@/db/database";
import {
  datetimeLocalValueToIso,
  isoToDatetimeLocalValue,
  localDateStringFromDatetimeLocal,
} from "@/lib/workoutChronology";
import { getWorkoutSessionById, saveWorkoutSessionDraft } from "@/db/workoutSessions";
import type { WorkoutExercise, WorkoutSession } from "@/types/trainingDiary";
import { useI18n } from "@/i18n/LocaleContext";

export function EditWorkoutView({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);

  const [title, setTitle] = useState("");
  const [durationMinText, setDurationMinText] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState<string>("");
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [dumbbellIds, setDumbbellIds] = useState<Set<string>>(new Set());
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [workoutDetailsOpen, setWorkoutDetailsOpen] = useState(false);
  const [performedAtLocal, setPerformedAtLocal] = useState("");
  const performedAtInitialRef = useRef<string>("");
  const pendingSetFocusRef = useRef<{
    exerciseId: string;
    setId: string;
    weight: number;
    reps: number;
  } | null>(null);

  const editingExercise = useMemo(
    () => workoutExercises.find((e) => e.id === editingExerciseId) ?? null,
    [workoutExercises, editingExerciseId],
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const row = await getWorkoutSessionById(id);
        if (!mounted) return;
        if (!row) {
          setMissing(true);
          return;
        }
        setDate(row.date);
        const performedSource =
          row.performedAt ||
          row.createdAt ||
          (row.date ? `${row.date}T12:00:00` : new Date().toISOString());
        const pLocal = isoToDatetimeLocalValue(performedSource);
        setPerformedAtLocal(pLocal);
        performedAtInitialRef.current = pLocal;
        setTitle(row.title);
        setDurationMinText(
          typeof row.durationMin === "number" ? String(row.durationMin) : "",
        );
        setNotes(row.notes ?? "");
        // Deep-ish clone so we don't mutate the Dexie object.
        setWorkoutExercises(
          row.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets.map((s) => ({ ...s })),
          })),
        );

        const ids = row.exercises.map((e) => e.exerciseId).filter(Boolean) as string[];
        if (ids.length) {
          const rows = await db.exercises.bulkGet(ids);
          const next = new Set<string>();
          for (const r of rows) {
            if (r?.equipmentTags?.includes("dumbbell")) next.add(r.id);
          }
          if (mounted) setDumbbellIds(next);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

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

  function volumeMultiplierForExercise(ex: WorkoutExercise): number {
    const id = ex.exerciseId?.trim();
    if (id && dumbbellIds.has(id)) return 2;
    const s = (ex.name ?? "").toLowerCase();
    if (s.includes("dumbbell")) return 2;
    return 1;
  }

  function updateExercise(exerciseId: string, patch: Partial<WorkoutExercise>) {
    setWorkoutExercises((prev) =>
      prev.map((ex) => (ex.id === exerciseId ? { ...ex, ...patch } : ex)),
    );
  }

  function addExercise() {
    const newId = createId();
    setWorkoutExercises((prev) => [...prev, { id: newId, name: "", sets: [] }]);
    setEditingExerciseId(newId);
  }

  function deleteExercise(exerciseId: string) {
    setWorkoutExercises((prev) => prev.filter((ex) => ex.id !== exerciseId));
    if (editingExerciseId === exerciseId) {
      setEditingExerciseId(null);
    }
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
      const volume = setVolumeForWithMultiplier(weight, reps, volumeMultiplierForExercise(ex));
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
      const volume = setVolumeForWithMultiplier(weight, reps, volumeMultiplierForExercise(ex));
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

  function updateSet(
    exerciseId: string,
    setId: string,
    patch: Partial<WorkoutSession["exercises"][number]["sets"][number]>,
  ) {
    setWorkoutExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const mult = volumeMultiplierForExercise(ex);
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (s.id !== setId) return s;
            const weight = patch.weight !== undefined ? patch.weight : s.weight ?? 0;
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
      const volume = setVolumeForWithMultiplier(weight, reps, volumeMultiplierForExercise(ex));
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
      return prev.map((e) => (e.id === exerciseId ? { ...e, sets: nextSets } : e));
    });
  }

  function closeExerciseEditor() {
    setEditingExerciseId(null);
  }

  async function save() {
    setSaving(true);
    try {
      const durationMin = durationMinText.trim()
        ? Number(durationMinText)
        : undefined;
      const performedChanged = performedAtLocal !== performedAtInitialRef.current;
      const nextDate =
        performedChanged && performedAtLocal
          ? localDateStringFromDatetimeLocal(performedAtLocal)
          : date || new Date().toISOString().slice(0, 10);
      await saveWorkoutSessionDraft({
        id,
        date: nextDate,
        performedAt: performedChanged
          ? datetimeLocalValueToIso(performedAtLocal)
          : undefined,
        title: title.trim() || t("workout_default_title"),
        durationMin:
          typeof durationMin === "number" && Number.isFinite(durationMin)
            ? durationMin
            : undefined,
        notes: notes.trim() || undefined,
        exercises: workoutExercises,
      });
      router.push(`/workout/${id}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-col gap-6">
        <header className="space-y-2">
          <Link
            href={`/workout/${id}`}
            className="text-sm text-neutral-500"
          >
            {t("exercise_progress_back").replace("← ", "")}
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-100">{t("edit_workout")}</h1>
        </header>
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      </main>
    );
  }

  if (missing) {
    return (
      <main className="flex flex-col gap-6">
        <header className="space-y-2">
          <Link
            href="/history"
            className="text-sm text-neutral-500"
          >
            {t("exercise_progress_back").replace("← ", "")}
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-100">{t("edit_workout")}</h1>
        </header>
        <Card className="space-y-1">
          <p className="text-sm font-semibold text-neutral-200">{t("not_found")}</p>
          <p className="text-sm text-neutral-500">
            {t("workout_not_found")}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      {editingExercise ? (
        <>
          <header className="flex min-h-11 items-center justify-between border-b border-neutral-800/80 pb-2">
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center text-sm text-neutral-500 transition hover:text-neutral-300"
              onClick={closeExerciseEditor}
            >
              {t("exercise_progress_back").replace("← ", "")}
            </button>
            <h1 className="line-clamp-2 min-w-0 flex-1 break-words px-2 text-center text-2xl font-semibold leading-tight text-neutral-100">
              {editingExercise?.name?.trim()
                ? editingExercise.name
                : t("exercise")}
            </h1>
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center justify-end text-sm font-medium text-primary"
              onClick={closeExerciseEditor}
            >
              {t("done")}
            </button>
          </header>

        <Card className="!mt-0 !space-y-3 !p-4">
          <TextField
            label={t("exercises_form_name")}
            placeholder={t("exercise_name")}
            value={editingExercise.name}
            onChange={(e) => updateExercise(editingExercise.id, { name: e.target.value })}
          />

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                variant="editorSecondary"
                onClick={() => addSameSet(editingExercise.id)}
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
            <Button
              variant="editorUtility"
              onClick={() => addSetCopyingSecondToLast(editingExercise.id)}
            >
              {t("copy_previous")}
            </Button>
          </div>

          {editingExercise.sets.length === 0 ? (
            <p className="text-sm text-neutral-500">{t("no_sets_yet")}</p>
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
        </>
      ) : (
        <>
          <header className="space-y-0.5">
            <Link
              href={`/workout/${id}`}
              className="text-sm text-neutral-500 transition hover:text-neutral-300"
            >
              {t("exercise_progress_back").replace("← ", "")}
            </Link>
            <h1 className="text-2xl font-semibold leading-tight text-neutral-100">
              {t("edit_workout")}
            </h1>
          </header>

          <TextField
            label={t("title")}
            placeholder="e.g. Upper A"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="space-y-3">
            {workoutExercises.map((ex) => {
              const exVolume = ex.sets.reduce(
                (s, set) => s + (set.volume ?? 0),
                0,
              );
              return (
                <Card key={ex.id} className="!p-0 overflow-hidden">
                  <div className="flex min-h-14 items-stretch">
                    <button
                      type="button"
                      onClick={() => setEditingExerciseId(ex.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 p-3 pr-2 text-left transition active:opacity-90"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline justify-between gap-2 truncate text-lg font-semibold text-neutral-100">
                          <span className="truncate">{ex.name || t("exercise")}</span>
                          <span
                            className="shrink-0 text-primary/80"
                            aria-hidden
                          >
                            ›
                          </span>
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-500">
                          {ex.sets.length} {t("label_sets")}{" "}
                          · {Math.round(exVolume * 100) / 100} kg
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 border-l border-neutral-800/80">
                      <button
                        type="button"
                        onClick={() => deleteExercise(ex.id)}
                        className="flex h-full min-h-11 min-w-[3.25rem] items-center justify-center px-1 text-sm text-neutral-500 transition active:text-neutral-400"
                      >
                        {t("remove")}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
            {workoutExercises.length === 0 ? (
              <p className="text-sm text-neutral-400">{t("no_exercises_yet_add_below")}</p>
            ) : null}
          </div>

          <div>
            <Button onClick={addExercise}>+ {t("add_exercise")}</Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
            <button
              type="button"
              id="edit-workout-details-toggle"
              aria-expanded={workoutDetailsOpen}
              aria-controls="edit-workout-details-panel"
              onClick={() => setWorkoutDetailsOpen((o) => !o)}
              className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-neutral-200 transition active:opacity-90"
            >
              <span>{t("workout_details")}</span>
              <span
                className="shrink-0 text-xs text-neutral-500"
                aria-hidden
              >
                {workoutDetailsOpen ? "▲" : "▼"}
              </span>
            </button>
            <div
              id="edit-workout-details-panel"
              className={
                "overflow-hidden transition-[max-height] duration-300 ease-out " +
                (workoutDetailsOpen
                  ? "max-h-96 border-t border-neutral-800/80"
                  : "max-h-0")
              }
            >
              <div className="space-y-3 p-4 pt-3">
                <TextField
                  label={t("performed_at")}
                  type="datetime-local"
                  value={performedAtLocal}
                  onChange={(e) => setPerformedAtLocal(e.target.value)}
                />
                <TextField
                  label={t("duration_min")}
                  inputMode="numeric"
                  placeholder="e.g. 60"
                  value={durationMinText}
                  onChange={(e) => setDurationMinText(e.target.value)}
                />
                <TextArea
                  label={t("notes")}
                  placeholder={t("optional")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <Card className="!py-3 !space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-500">{t("sets")}</span>
          <span className="text-lg font-medium tabular-nums text-neutral-100">
            {totals.totalSets}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-500">{t("volume_kg")}</span>
          <span className="text-lg font-medium tabular-nums text-neutral-100">
            {Math.round(totals.totalVolume * 100) / 100}
          </span>
        </div>
      </Card>

      <div className="space-y-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? t("saving") : t("save_changes")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push(`/workout/${id}`)}
          disabled={saving}
        >
          {t("cancel")}
        </Button>
      </div>
    </main>
  );
}

