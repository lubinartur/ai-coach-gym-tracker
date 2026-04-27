import Dexie, { type Table } from "dexie";
import { createId } from "@/lib/id";
import {
  normalizeExecutionItems,
  type IncomingExecutionItem,
} from "@/lib/planFactory";
import type { Action, ActionLog, DailyPlan, ExecutionItem, UserSettings } from "@/types";
import type { AthleteProfile } from "@/types/training";
import type { WorkoutTemplate } from "@/types/training";
import { SEED_WORKOUT_TEMPLATES } from "./workoutTemplateSeeds";
import type { Exercise, WorkoutSession } from "@/types/trainingDiary";
import { EXERCISE_LIBRARY } from "@/data/exerciseLibrary";
import { normalizeExerciseName } from "@/lib/exerciseName";
import type { CoachMemoryRow } from "@/db/coachMemory";
import type { AiDecisionTraceRow } from "@/db/aiDecisionTrace";

export const SETTINGS_SINGLE_ID = "default" as const;

const DEFAULT_ATHLETE_ID = "default";

export class LifeExecutionDB extends Dexie {
  dailyPlans!: Table<DailyPlan>;
  actions!: Table<Action>;
  actionLogs!: Table<ActionLog>;
  userSettings!: Table<UserSettings>;
  athleteProfiles!: Table<AthleteProfile>;
  workoutTemplates!: Table<WorkoutTemplate>;
  exercises!: Table<Exercise>;
  workoutSessions!: Table<WorkoutSession>;
  coachMemory!: Table<CoachMemoryRow>;
  aiDecisionTraces!: Table<AiDecisionTraceRow>;

  constructor() {
    super("lifeExecutionPanel");
    this.version(1).stores({
      dailyPlans: "id, date, createdAt",
      actions: "id, planId, date, type, status, order",
      actionLogs: "id, actionId, date, createdAt",
      userSettings: "id",
    });
    this.version(2)
      .stores({
        dailyPlans: "id, date, createdAt",
        actions: "id, planId, date, type, status, order",
        actionLogs: "id, actionId, date, createdAt",
        userSettings: "id",
      })
      .upgrade(async (tx) => {
        const actionTable = tx.table<Action, string>("actions");
        const rows = await actionTable.toArray();
        const ts = new Date().toISOString();
        for (const row of rows) {
          const raw = row as Action & {
            executionItems?: IncomingExecutionItem[] | unknown;
          };
          const items = Array.isArray(raw.executionItems)
            ? (raw.executionItems as IncomingExecutionItem[])
            : undefined;
          const executionItems = normalizeExecutionItems(
            items,
            raw.type,
            raw.title,
          );
          await actionTable.update(raw.id, {
            executionItems,
            updatedAt: ts,
          } as Action);
        }

        const logTable = tx.table<ActionLog, string>("actionLogs");
        const logs = await logTable.toArray();
        for (const log of logs) {
          const l = log as ActionLog & {
            executionItems?: unknown;
          };
          if (!Array.isArray(l.executionItems)) continue;
          const normalized: ExecutionItem[] = (
            l.executionItems as IncomingExecutionItem[]
          ).map((e) => ({
            id: e.id && String(e.id).trim() ? String(e.id) : createId(),
            label: String(e.label ?? "").trim() || "Row",
            plannedValue: String(e.plannedValue ?? "").trim() || "—",
            actualValue: e.actualValue?.trim() || undefined,
          }));
          await logTable.update(l.id, {
            executionItems: normalized,
          } as ActionLog);
        }
      });
    this.version(3)
      .stores({
        dailyPlans: "id, date, createdAt",
        actions: "id, planId, date, type, status, order",
        actionLogs: "id, actionId, date, createdAt",
        userSettings: "id",
        athleteProfiles: "id",
        workoutTemplates: "id, dayType, name",
      })
      .upgrade(async (tx) => {
        const tplCount = await tx.table("workoutTemplates").count();
        if (tplCount === 0) {
          await tx.table("workoutTemplates").bulkPut(SEED_WORKOUT_TEMPLATES);
        }
        const apCount = await tx.table("athleteProfiles").count();
        if (apCount === 0) {
          await tx.table("athleteProfiles").put({
            id: DEFAULT_ATHLETE_ID,
            phase: "natural",
          });
        }
      });
    this.version(4)
      .stores({
        dailyPlans: "id, date, createdAt",
        actions: "id, planId, date, type, status, order",
        actionLogs: "id, actionId, date, createdAt",
        userSettings: "id",
        athleteProfiles: "id",
        workoutTemplates: "id, dayType, name",
      })
      .upgrade(async (tx) => {
        await tx.table("workoutTemplates").clear();
        await tx.table("workoutTemplates").bulkPut(SEED_WORKOUT_TEMPLATES);
        const ap = await tx.table("athleteProfiles").get(DEFAULT_ATHLETE_ID);
        if (
          ap &&
          ap.phase === "natural" &&
          !(ap.goal && ap.goal.trim()) &&
          !(ap.notes && ap.notes.trim()) &&
          !ap.offCycleDate
        ) {
          await tx.table("athleteProfiles").put({
            ...ap,
            phase: "post_cycle",
            offCycleDate: "2026-04-13",
            goal: "maintain strength and recover",
            notes: "avoid aggressive progression for several weeks",
          });
        }
      });

    // Gym diary MVP tables
    this.version(5)
      .stores({
        dailyPlans: "id, date, createdAt",
        actions: "id, planId, date, type, status, order",
        actionLogs: "id, actionId, date, createdAt",
        userSettings: "id",
        athleteProfiles: "id",
        workoutTemplates: "id, dayType, name",
        exercises: "id, name, muscleGroup, equipment, createdAt, updatedAt",
        workoutSessions: "id, date, createdAt, updatedAt",
      })
      .upgrade(async (tx) => {
        const exerciseTable = tx.table<Exercise, string>("exercises");
        const count = await exerciseTable.count();
        if (count === 0) {
          const now = new Date().toISOString();
          await exerciseTable.bulkPut(
            EXERCISE_LIBRARY.map((e) => ({
              id: createId(),
              name: e.name,
              normalizedName:
                normalizeExerciseName(e.name) ||
                String(e.name ?? "").trim().toLowerCase() ||
                createId(),
              primaryMuscle: "other",
              equipmentTags: e.equipment ? [e.equipment as unknown as never] : [],
              movementPattern: "unknown",
              roleCompatibility: [],
              contraindications: [],
              substitutions: [],
              muscleGroup: e.muscleGroup,
              equipment: e.equipment,
              source: "library" as const,
              isFavorite: false,
              createdAt: now,
              updatedAt: now,
            })),
          );
        }
      });

    this.version(6).stores({
      dailyPlans: "id, date, createdAt",
      actions: "id, planId, date, type, status, order",
      actionLogs: "id, actionId, date, createdAt",
      userSettings: "id",
      athleteProfiles: "id",
      workoutTemplates: "id, dayType, name",
      exercises: "id, name, muscleGroup, equipment, createdAt, updatedAt",
      workoutSessions: "id, date, createdAt, updatedAt",
    });

    this.version(7)
      .stores({
        dailyPlans: "id, date, createdAt",
        actions: "id, planId, date, type, status, order",
        actionLogs: "id, actionId, date, createdAt",
        userSettings: "id",
        athleteProfiles: "id",
        workoutTemplates: "id, dayType, name",
        exercises: "id, name, muscleGroup, equipment, createdAt, updatedAt",
        workoutSessions: "id, date, createdAt, updatedAt",
      })
      .upgrade(async (tx) => {
        const t = tx.table("userSettings");
        const row = (await t.get(SETTINGS_SINGLE_ID)) as
          | import("@/types").UserSettings
          | undefined;
        if (row && (row as { language?: string }).language === undefined) {
          await t.put({ ...row, language: "en" });
        }
      });

    // Phase 1 — Unify Exercise Catalog (canonical required fields + normalizedName index)
    this.version(8)
      .stores({
        dailyPlans: "id, date, createdAt",
        actions: "id, planId, date, type, status, order",
        actionLogs: "id, actionId, date, createdAt",
        userSettings: "id",
        athleteProfiles: "id",
        workoutTemplates: "id, dayType, name",
        exercises:
          "id, normalizedName, name, muscleGroup, equipment, createdAt, updatedAt",
        workoutSessions: "id, date, createdAt, updatedAt",
      })
      .upgrade(async (tx) => {
        const exerciseTable = tx.table<Exercise, string>("exercises");
        const rows = await exerciseTable.toArray();
        const now = new Date().toISOString();

        for (const ex of rows) {
          const normalizedName =
            ex.normalizedName?.trim() ||
            normalizeExerciseName(ex.name) ||
            String(ex.name ?? "").trim().toLowerCase() ||
            String(ex.id ?? "").trim() ||
            "exercise";

          await exerciseTable.update(ex.id, {
            normalizedName,
            primaryMuscle: ex.primaryMuscle ?? "other",
            equipmentTags: Array.isArray(ex.equipmentTags) ? ex.equipmentTags : [],
            movementPattern: ex.movementPattern ?? "unknown",
            roleCompatibility: Array.isArray(ex.roleCompatibility)
              ? ex.roleCompatibility
              : [],
            contraindications: Array.isArray(ex.contraindications)
              ? ex.contraindications
              : [],
            substitutions: Array.isArray(ex.substitutions) ? ex.substitutions : [],
            source: ex.source ?? "library",
            isFavorite: ex.isFavorite ?? false,
            // Do not clobber timestamps; only ensure updatedAt exists.
            updatedAt: ex.updatedAt?.trim() ? ex.updatedAt : now,
            createdAt: ex.createdAt?.trim() ? ex.createdAt : now,
          } as Exercise);
        }
      });

    // Phase 1 — Task 2: Durable AI Memory in Dexie (coachMemory table)
    this.version(9).stores({
      dailyPlans: "id, date, createdAt",
      actions: "id, planId, date, type, status, order",
      actionLogs: "id, actionId, date, createdAt",
      userSettings: "id",
      athleteProfiles: "id",
      workoutTemplates: "id, dayType, name",
      exercises:
        "id, normalizedName, name, muscleGroup, equipment, createdAt, updatedAt",
      workoutSessions: "id, date, createdAt, updatedAt",
      coachMemory:
        "id, createdAt, sessionId, exerciseId, normalizedExerciseName, [exerciseId+createdAt], [normalizedExerciseName+createdAt], [sessionId+createdAt]",
    });

    // Phase 1 — Improve Decision Trace Logging (persist minimal AI debug traces)
    this.version(10).stores({
      dailyPlans: "id, date, createdAt",
      actions: "id, planId, date, type, status, order",
      actionLogs: "id, actionId, date, createdAt",
      userSettings: "id",
      athleteProfiles: "id",
      workoutTemplates: "id, dayType, name",
      exercises:
        "id, normalizedName, name, muscleGroup, equipment, createdAt, updatedAt",
      workoutSessions: "id, date, createdAt, updatedAt",
      coachMemory:
        "id, createdAt, sessionId, exerciseId, normalizedExerciseName, [exerciseId+createdAt], [normalizedExerciseName+createdAt], [sessionId+createdAt]",
      aiDecisionTraces: "id, createdAt, mode, generationSource",
    });
  }
}

export const db = new LifeExecutionDB();
