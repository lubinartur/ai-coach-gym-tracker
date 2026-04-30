import { normalizeExerciseName } from "@/lib/exerciseName";
import type { WorkoutReviewRequestPayload } from "@/types/aiCoach";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";

export type AutoProgressionAction =
  | "increase_reps"
  | "increase_weight"
  | "maintain"
  | "reduce_weight"
  | "reduce_sets";

export type AutoProgressionTarget = {
  exerciseName: string;
  action: AutoProgressionAction;
  lastPerformance: string;
  nextTarget: string;
  reason: string;
};

type RepRange = { min: number; max: number };
type WorkingScheme = { w: number; r: number; n: number };

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function formatKg(n: number): string {
  const v = Math.round(n * 10) / 10;
  if (Number.isInteger(v)) return String(v);
  return String(v);
}

function schemeLine(input: { w: number; r: number; n: number; range?: RepRange }): string {
  const w = formatKg(input.w);
  if (input.range) {
    return `${w} kg × ${input.range.min}–${input.range.max} × ${input.n}`;
  }
  return `${w} kg × ${input.r} × ${input.n}`;
}

function inferRangeFromGoal(goal: WorkoutReviewRequestPayload["workoutGoal"]): RepRange {
  if (goal === "strength") return { min: 3, max: 6 };
  if (goal === "hypertrophy") return { min: 8, max: 12 };
  if (goal === "fat_loss") return { min: 10, max: 15 };
  return { min: 12, max: 15 };
}

function inferRangeFromReps(avg: number): RepRange {
  if (avg <= 6) return { min: 3, max: 6 };
  if (avg <= 9) return { min: 6, max: 10 };
  if (avg <= 12) return { min: 8, max: 12 };
  if (avg <= 15) return { min: 10, max: 15 };
  return { min: 12, max: 15 };
}

function repDrop(sets: { reps: number; isDone?: boolean }[]): number {
  const done = sets.filter((s) => s.isDone !== false);
  if (done.length < 2) return 0;
  return Math.max(0, done[0]!.reps - done[done.length - 1]!.reps);
}

function anyFailed(sets: { reps: number; isDone?: boolean }[]): boolean {
  return (sets ?? []).some((s) => s.isDone === false);
}

function allDone(sets: { reps: number; isDone?: boolean }[]): boolean {
  const list = sets ?? [];
  if (!list.length) return false;
  return list.every((s) => s.isDone !== false);
}

function avgRepsDone(sets: { reps: number; isDone?: boolean }[]): number {
  const done = (sets ?? []).filter((s) => s.isDone !== false);
  if (!done.length) return 0;
  return done.reduce((a, s) => a + Math.max(0, Math.round(s.reps)), 0) / done.length;
}

function isProbablyDumbbell(exName: string, row: Exercise | null): boolean {
  if (row?.equipmentTags?.includes("dumbbell")) return true;
  const n = (exName ?? "").toLowerCase();
  return n.includes("dumbbell") || /\bdb\b/.test(n);
}

function isProbablyBarbell(exName: string, row: Exercise | null): boolean {
  if (row?.equipmentTags?.includes("barbell") || row?.equipmentTags?.includes("ez_bar") || row?.equipmentTags?.includes("trap_bar")) {
    return true;
  }
  const n = (exName ?? "").toLowerCase();
  return n.includes("barbell");
}

function isProbablyMachineOrCable(exName: string, row: Exercise | null): boolean {
  if (row?.equipmentTags?.includes("machine") || row?.equipmentTags?.includes("cable") || row?.equipmentTags?.includes("smith")) return true;
  const n = (exName ?? "").toLowerCase();
  return n.includes("machine") || n.includes("cable");
}

function isIsolation(row: Exercise | null): boolean {
  const mp = row?.movementPattern ?? "unknown";
  return mp === "isolation" || mp === "core";
}

function isCompound(row: Exercise | null): boolean {
  if (typeof row?.isCompound === "boolean") return row.isCompound;
  const mp = row?.movementPattern ?? "unknown";
  return mp === "squat" || mp === "hinge" || mp === "push_horizontal" || mp === "push_vertical" || mp === "pull_horizontal" || mp === "pull_vertical";
}

function stepFor(exName: string, row: Exercise | null): number {
  if (isProbablyDumbbell(exName, row)) {
    // Per dumbbell: conservative +1kg for lighter DBs, +2kg for heavier.
    return 1;
  }
  if (isProbablyBarbell(exName, row)) return 2.5;
  if (isProbablyMachineOrCable(exName, row)) return 5;
  return 2.5;
}

function lookupCatalogRow(exName: string, catalog: Exercise[]): Exercise | null {
  const k = normalizeExerciseName(exName);
  if (!k) return null;
  return catalog.find((e) => normalizeExerciseName(e.name) === k || e.normalizedName === k) ?? null;
}

function lastWorkingSchemeFromCompleted(ex: WorkoutSession["exercises"][0]): { w: number; r: number; n: number } | null {
  const done = (ex.sets ?? []).filter((s) => s.isDone !== false);
  if (!done.length) return null;
  // Representative: take first done set's weight, median reps-ish; assume same set count.
  const w = roundHalf(Math.max(0, Number(done[0]!.weight) || 0));
  const reps = done.map((s) => Math.max(0, Math.round(s.reps)));
  const avg = reps.reduce((a, b) => a + b, 0) / Math.max(1, reps.length);
  const r = Math.max(0, Math.round(avg));
  const n = done.length;
  if (!(w > 0 && r > 0 && n > 0)) return null;
  return { w, r, n };
}

function computeNextFromLastScheme(input: {
  name: string;
  last: WorkingScheme;
  catalogRow: Exercise | null;
  goal: WorkoutReviewRequestPayload["workoutGoal"];
}): Pick<AutoProgressionTarget, "action" | "nextTarget" | "reason"> {
  const targetRange = inferRangeFromGoal(input.goal);
  const topReached = input.last.r >= targetRange.max;
  const preferReps = isIsolation(input.catalogRow) || !isCompound(input.catalogRow);

  if (!topReached) {
    return {
      action: "increase_reps",
      nextTarget: `Target: ${schemeLine({ w: input.last.w, r: input.last.r + 1, n: input.last.n })}`,
      reason: "Progress by reps first while staying in range.",
    };
  }

  let nextW = input.last.w + stepFor(input.name, input.catalogRow);
  if (isProbablyDumbbell(input.name, input.catalogRow)) {
    nextW = input.last.w + (input.last.w >= 22 ? 2 : 1);
  }
  const nextRange: RepRange = preferReps
    ? { min: Math.max(targetRange.min, targetRange.max - 2), max: targetRange.max }
    : targetRange;
  return {
    action: "increase_weight",
    nextTarget: `Target: ${schemeLine({
      w: nextW,
      r: nextRange.min,
      n: input.last.n,
      range: { min: nextRange.min, max: nextRange.max },
    })}`,
    reason: "Top of range reached; add a small load step and restart the range.",
  };
}

export function buildAutoProgressionTargetsFromCompletedSession(input: {
  completed: WorkoutSession;
  priorSessions: WorkoutSession[];
  catalog: Exercise[];
  workoutGoal?: WorkoutReviewRequestPayload["workoutGoal"];
  fatigueLevel?: "low" | "moderate" | "high" | "unknown";
}): AutoProgressionTarget[] {
  const goal = input.workoutGoal ?? "general_fitness";
  const hardNoIncrease =
    input.fatigueLevel === "high" ||
    (typeof input.completed.durationMin === "number" && input.completed.durationMin > 0 && input.completed.durationMin < 5);

  const out: AutoProgressionTarget[] = [];
  for (const ex of input.completed.exercises) {
    const name = ex.name;
    const scheme = lastWorkingSchemeFromCompleted(ex);
    if (!scheme) continue;

    const row = lookupCatalogRow(name, input.catalog);
    const range = inferRangeFromGoal(goal);
    const avg = avgRepsDone(ex.sets);
    const inferredRange = avg > 0 ? inferRangeFromReps(avg) : range;
    const targetRange = goal ? range : inferredRange;

    const failed = anyFailed(ex.sets);
    const drop = repDrop(ex.sets);
    const done = allDone(ex.sets);

    const lastPerformance = `Last: ${schemeLine({ ...scheme })}`;

    // Safety first.
    if (hardNoIncrease || failed || drop > 3) {
      const action: AutoProgressionAction = failed ? "reduce_weight" : "maintain";
      const nextW = action === "reduce_weight" ? Math.max(0, scheme.w - stepFor(name, row)) : scheme.w;
      const nextTarget =
        action === "reduce_weight"
          ? `Today: ${schemeLine({ w: nextW, r: targetRange.min, n: scheme.n })}`
          : "Today: keep the same load";
      const reason = hardNoIncrease
        ? "Conservative day (short or high-fatigue signal); keep loads stable."
        : failed
          ? "Some sets were not completed; reduce load to stay in control."
          : "Reps dropped across sets; avoid increasing load today.";
      out.push({ exerciseName: name, action, lastPerformance, nextTarget, reason });
      continue;
    }

    if (!done) {
      const nextW = Math.max(0, scheme.w - stepFor(name, row));
      out.push({
        exerciseName: name,
        action: "reduce_weight",
        lastPerformance,
        nextTarget: `Today: ${schemeLine({ w: nextW, r: targetRange.min, n: scheme.n })}`,
        reason: "Execution was incomplete; slightly reduce load and rebuild consistency.",
      });
      continue;
    }

    const topReached = scheme.r >= targetRange.max;
    const preferReps = isIsolation(row) || !isCompound(row);

    if (!topReached) {
      out.push({
        exerciseName: name,
        action: "increase_reps",
        lastPerformance,
        nextTarget: `Today: ${schemeLine({ w: scheme.w, r: scheme.r + 1, n: scheme.n })}`,
        reason: "All sets were completed; add one rep while staying in range.",
      });
      continue;
    }

    // Top of range reached: increase weight (if appropriate) and drop reps to bottom of range.
    const step = stepFor(name, row);
    let nextW = scheme.w + step;
    if (isProbablyDumbbell(name, row)) {
      // If DB weight is heavy-ish, allow +2 per dumbbell.
      nextW = scheme.w + (scheme.w >= 22 ? 2 : 1);
    }

    const nextRange: RepRange = preferReps ? { min: Math.max(targetRange.min, targetRange.max - 2), max: targetRange.max } : targetRange;
    out.push({
      exerciseName: name,
      action: "increase_weight",
      lastPerformance,
      nextTarget: `Today: ${schemeLine({ w: nextW, r: nextRange.min, n: scheme.n, range: { min: nextRange.min, max: nextRange.max } })}`,
      reason: "Top of the rep range reached; add a small load step and restart the range.",
    });
  }
  return out.slice(0, 24);
}

export function buildAutoProgressionTargetsFromBaselines(input: {
  suggested: Array<{ name: string; sets: Array<{ weight: number; reps: number }> }>;
  exerciseBaselines: Array<{ name: string; latestSets: { weight: number; reps: number }[] }>;
  catalog: Exercise[];
  workoutGoal?: WorkoutReviewRequestPayload["workoutGoal"];
}): AutoProgressionTarget[] {
  const goal = input.workoutGoal ?? "general_fitness";
  const byNorm = new Map<string, { name: string; latestSets: { weight: number; reps: number }[] }>();
  for (const b of input.exerciseBaselines ?? []) {
    const k = normalizeExerciseName(b.name);
    if (!k) continue;
    byNorm.set(k, { name: b.name, latestSets: b.latestSets ?? [] });
  }

  const out: AutoProgressionTarget[] = [];
  for (const ex of input.suggested ?? []) {
    const k = normalizeExerciseName(ex.name);
    if (!k) continue;
    const base = byNorm.get(k);
    if (!base?.latestSets?.length) continue;

    const lastW = roundHalf(Math.max(0, Number(base.latestSets[0]!.weight) || 0));
    const lastR = Math.round(Math.max(0, Number(base.latestSets[0]!.reps) || 0));
    const lastN = Math.max(1, base.latestSets.length);
    if (!(lastW > 0 && lastR > 0 && lastN > 0)) continue;
    const last: WorkingScheme = { w: lastW, r: lastR, n: lastN };

    const row = lookupCatalogRow(ex.name, input.catalog);
    const next = computeNextFromLastScheme({ name: ex.name, last, catalogRow: row, goal });
    out.push({
      exerciseName: ex.name,
      action: next.action,
      lastPerformance: `Last: ${schemeLine(last)}`,
      nextTarget: next.nextTarget,
      reason: next.reason,
    });
  }
  return out.slice(0, 24);
}

