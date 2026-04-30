import { describe, expect, it } from "vitest";
import { buildAutoProgressionTargetsFromCompletedSession } from "@/services/autoProgressionEngine";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";

function session(input: {
  title?: string;
  durationMin?: number;
  exercises: Array<{
    name: string;
    exerciseId?: string;
    sets: Array<{ weight: number; reps: number; isDone?: boolean }>;
  }>;
}): WorkoutSession {
  const totalSets = input.exercises.reduce((s, e) => s + e.sets.length, 0);
  const totalVolume = input.exercises.reduce(
    (sum, e) =>
      sum +
      e.sets.reduce((ss, st) => ss + Math.max(0, st.weight) * Math.max(0, st.reps), 0),
    0,
  );
  return {
    id: "s",
    date: "2026-05-01",
    title: input.title ?? "Workout",
    durationMin: input.durationMin,
    exercises: input.exercises.map((e, idx) => ({
      id: String(idx + 1),
      exerciseId: e.exerciseId,
      name: e.name,
      sets: e.sets.map((st, j) => ({
        id: `${idx + 1}-${j + 1}`,
        weight: st.weight,
        reps: st.reps,
        volume: st.weight * st.reps,
        isDone: st.isDone,
      })),
    })),
    totalSets,
    totalVolume,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    performedAt: new Date().toISOString(),
  };
}

const catalogRow = (input: Partial<Exercise> & { name: string; id: string }): Exercise =>
  ({
    normalizedName: input.name.toLowerCase(),
    primaryMuscle: "chest",
    equipmentTags: [],
    movementPattern: "push_horizontal",
    roleCompatibility: [],
    contraindications: [],
    substitutions: [],
    source: "metadata",
    isFavorite: false,
    createdAt: "",
    updatedAt: "",
    ...input,
  }) as Exercise;

describe("autoProgressionEngine", () => {
  it("completed 100×8×3 -> target 100×9×3 (increase reps)", () => {
    const completed = session({
      durationMin: 45,
      exercises: [
        {
          name: "Bench Press",
          sets: [
            { weight: 100, reps: 8, isDone: true },
            { weight: 100, reps: 8, isDone: true },
            { weight: 100, reps: 8, isDone: true },
          ],
        },
      ],
    });
    const catalog = [catalogRow({ id: "b", name: "Bench Press", equipmentTags: ["barbell"] })];
    const targets = buildAutoProgressionTargetsFromCompletedSession({
      completed,
      priorSessions: [],
      catalog,
      workoutGoal: "hypertrophy",
    });
    expect(targets[0]!.action).toBe("increase_reps");
    expect(targets[0]!.nextTarget).toContain("100 kg × 9 × 3");
  });

  it("completed 100×12×3 -> target 102.5×8–12×3 (increase weight)", () => {
    const completed = session({
      durationMin: 45,
      exercises: [
        {
          name: "Barbell Bench Press",
          sets: [
            { weight: 100, reps: 12, isDone: true },
            { weight: 100, reps: 12, isDone: true },
            { weight: 100, reps: 12, isDone: true },
          ],
        },
      ],
    });
    const catalog = [catalogRow({ id: "bbp", name: "Barbell Bench Press", equipmentTags: ["barbell"] })];
    const targets = buildAutoProgressionTargetsFromCompletedSession({
      completed,
      priorSessions: [],
      catalog,
      workoutGoal: "hypertrophy",
    });
    expect(targets[0]!.action).toBe("increase_weight");
    expect(targets[0]!.nextTarget).toContain("102.5 kg");
  });

  it("dumbbell 20×12×3 -> target 21×8–12×3 (per dumbbell step)", () => {
    const completed = session({
      durationMin: 45,
      exercises: [
        {
          name: "Dumbbell Curl",
          sets: [
            { weight: 20, reps: 12, isDone: true },
            { weight: 20, reps: 12, isDone: true },
            { weight: 20, reps: 12, isDone: true },
          ],
        },
      ],
    });
    const catalog = [catalogRow({ id: "dbc", name: "Dumbbell Curl", equipmentTags: ["dumbbell"], movementPattern: "isolation" })];
    const targets = buildAutoProgressionTargetsFromCompletedSession({
      completed,
      priorSessions: [],
      catalog,
      workoutGoal: "hypertrophy",
    });
    expect(targets[0]!.action).toBe("increase_weight");
    expect(targets[0]!.nextTarget).toContain("21 kg");
  });

  it("failed sets -> reduce weight", () => {
    const completed = session({
      durationMin: 45,
      exercises: [
        {
          name: "Bench Press",
          sets: [
            { weight: 100, reps: 8, isDone: true },
            { weight: 100, reps: 6, isDone: false },
            { weight: 100, reps: 5, isDone: false },
          ],
        },
      ],
    });
    const catalog = [catalogRow({ id: "b", name: "Bench Press", equipmentTags: ["barbell"] })];
    const targets = buildAutoProgressionTargetsFromCompletedSession({
      completed,
      priorSessions: [],
      catalog,
      workoutGoal: "hypertrophy",
    });
    expect(targets[0]!.action).toBe("reduce_weight");
  });

  it("machine 70×12×3 -> target 75×8–12×3 (increase weight)", () => {
    const completed = session({
      durationMin: 45,
      exercises: [
        {
          name: "Lat Pulldown",
          sets: [
            { weight: 70, reps: 12, isDone: true },
            { weight: 70, reps: 12, isDone: true },
            { weight: 70, reps: 12, isDone: true },
          ],
        },
      ],
    });
    const catalog = [catalogRow({ id: "lp", name: "Lat Pulldown", equipmentTags: ["machine"], movementPattern: "pull_vertical", primaryMuscle: "back" })];
    const targets = buildAutoProgressionTargetsFromCompletedSession({
      completed,
      priorSessions: [],
      catalog,
      workoutGoal: "hypertrophy",
    });
    expect(targets[0]!.action).toBe("increase_weight");
    expect(targets[0]!.nextTarget).toContain("75 kg");
  });
});

