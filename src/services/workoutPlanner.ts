import type {
  AthleteProfile,
  PlannerInput,
  TrainingSession,
  TemplateExercise,
  TrainingPhase,
  WorkoutTemplate,
} from "@/types/training";

export type { PlannerInput };

export function normalizeExerciseLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sortedTemplateExercises(
  template: WorkoutTemplate,
): TemplateExercise[] {
  return [...template.exercises].sort((a, b) => a.order - b.order);
}

/** Deterministic template pick for a calendar date (stable ordering by name). */
export function selectTemplateForDate(
  date: string,
  templates: WorkoutTemplate[],
): WorkoutTemplate | undefined {
  if (!templates.length) return undefined;
  const sorted = [...templates].sort((a, b) => a.name.localeCompare(b.name));
  let h = 0;
  for (let i = 0; i < date.length; i++) {
    h = (Math.imul(31, h) + date.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % sorted.length;
  return sorted[idx];
}

export function buildPlannerInput(
  athleteProfile: AthleteProfile,
  recentSessions: TrainingSession[],
  workoutTemplate: WorkoutTemplate,
): PlannerInput {
  return { athleteProfile, recentSessions, workoutTemplate };
}

/** Parse leading load×reps from strings like "100×10", "100x10 @ RPE8" */
export function parseLoadReps(text: string): { load: number; reps: number } | null {
  const t = text.replace(/×/g, "x").trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)/i);
  if (!m) return null;
  return { load: parseFloat(m[1]), reps: parseInt(m[2], 10) };
}

export function formatLoadReps(load: number, reps: number): string {
  const w = Math.round(load * 4) / 4;
  const wStr = Number.isInteger(w) ? String(w) : w.toFixed(1).replace(/\.0$/, "");
  return `${wStr}×${reps}`;
}

function roundToHalfKg(load: number): number {
  return Math.round(load * 2) / 2;
}

function recentLoadsForLabel(
  label: string,
  sessions: TrainingSession[],
  take: number,
): number[] {
  const key = normalizeExerciseLabel(label);
  const loads: number[] = [];
  for (const ses of sessions) {
    for (const ex of ses.exercises) {
      if (normalizeExerciseLabel(ex.label) !== key) continue;
      const raw = (ex.actualValue ?? ex.plannedValue ?? "").trim();
      const p = parseLoadReps(raw);
      if (p) {
        loads.push(p.load);
        if (loads.length >= take) return loads;
      }
    }
  }
  return loads;
}

function baselineLoadRepsForLabel(
  label: string,
  sessions: TrainingSession[],
): { load: number; reps: number } | null {
  const key = normalizeExerciseLabel(label);
  for (const ses of sessions) {
    for (const ex of ses.exercises) {
      if (normalizeExerciseLabel(ex.label) !== key) continue;
      const raw = (ex.actualValue ?? ex.plannedValue ?? "").trim();
      const p = parseLoadReps(raw);
      if (p) return p;
    }
  }
  return null;
}

function performanceSoftened(
  label: string,
  sessions: TrainingSession[],
): boolean {
  const loads = recentLoadsForLabel(label, sessions, 2);
  if (loads.length < 2) return false;
  return loads[0] < loads[1] - 0.5;
}

function fallbackPlanned(label: string, phase: TrainingPhase): string {
  const l = normalizeExerciseLabel(label);
  if (/(raise|curl|abductor|adductor|pulldown|extension)/i.test(l)) {
    return phase === "post_cycle" ? "3×12 @ RPE 7" : "3×12 @ RPE 8";
  }
  return phase === "post_cycle" ? "50×10" : "60×10";
}

/**
 * Builds execution row planned values from template + recent logs + athlete phase.
 * Keeps exercise order and labels; does not invent movements.
 */
export function planWorkoutExecutionItems(
  profile: AthleteProfile,
  sessions: TrainingSession[],
  template: WorkoutTemplate,
): { label: string; plannedValue: string }[] {
  const phase = profile.phase ?? "natural";
  const rows: { label: string; plannedValue: string }[] = [];

  for (const ex of sortedTemplateExercises(template)) {
    let planned = ex.defaultPlannedValue?.trim();
    const base = baselineLoadRepsForLabel(ex.label, sessions);

    if (base) {
      let { load, reps } = base;
      const softened = performanceSoftened(ex.label, sessions);

      if (phase === "post_cycle") {
        load = roundToHalfKg(Math.min(load, load * 0.98));
        if (softened) load = roundToHalfKg(Math.min(load, base.load - 2.5));
      } else if (phase === "on_cycle") {
        if (!softened) load = roundToHalfKg(load + 2.5);
      } else {
        if (!softened) load = roundToHalfKg(load + 2.5);
      }

      load = Math.max(0, load);
      reps = Math.max(1, reps);
      planned = formatLoadReps(load, reps);
    }

    if (!planned) {
      planned = fallbackPlanned(ex.label, phase);
    }

    rows.push({ label: ex.label, plannedValue: planned });
  }

  return rows;
}

/** Ensure the first workout block keeps template exercise labels, order, and count. */
export function workoutExecutionMatchesTemplate(
  executionItems: { label: string }[],
  template: WorkoutTemplate,
): boolean {
  const ordered = sortedTemplateExercises(template);
  if (executionItems.length !== ordered.length) return false;
  return ordered.every(
    (ex, i) =>
      normalizeExerciseLabel(ex.label) ===
      normalizeExerciseLabel(executionItems[i].label),
  );
}
