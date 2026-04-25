import type { Action, DailyPlan, UserSettings } from "./index";
import type { StrengthProfile } from "@/services/strengthProfile";
import type {
  AthleteProfile,
  TrainingSession,
  WorkoutTemplate,
} from "./training";

/**
 * Mock API contract: POST /api/generate-plan
 *
 * Request body:
 * {
 *   date: string;              // YYYY-MM-DD (client’s “today” in user timezone)
 *   settings: UserSettings;    // planningStyle, preferredActionTypes, userName, timezone
 *   historySummary?: {         // optional; real OpenAI backend should use richer history
 *     date: string;
 *     entries: { title: string; type: string; status: string; resultText?: string }[];
 *   }[];
 * }
 *
 * Response body:
 * {
 *   plan: Omit<DailyPlan, "actionIds"> & { actionIds?: string[] }; // server may omit ids; client assigns
 *   actions: Omit<Action, "id" | "planId" | "date" | "createdAt" | "updatedAt" | "order" | "executionItems">[]
 *        & { executionItems?: { label: string; plannedValue: string; actualValue?: string; id?: string }[] }
 *        | Action[]; // each action may include execution rows (ids reassigned client-side when normalized)
 * }
 */
export type GeneratePlanRequest = {
  date: string;
  settings: UserSettings;
  historySummary?: {
    date: string;
    entries: {
      title: string;
      type: string;
      status: string;
      resultText?: string;
    }[];
  }[];
  /** Training-aware planning (optional; client loads from Dexie) */
  athleteProfile?: AthleteProfile;
  workoutTemplates?: WorkoutTemplate[];
  recentSessions?: TrainingSession[];
  /** Recent lift actuals derived client-side from workout logs (optional) */
  strengthProfile?: StrengthProfile;
};

export type GeneratePlanResponse = {
  plan: DailyPlan;
  actions: Action[];
};
