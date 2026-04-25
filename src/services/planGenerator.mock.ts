import type { ActionType, DailyPlan, UserSettings } from "@/types";
import { formatAthleteGoalForPlan } from "@/lib/athleteProfileLabels";
import type { DraftActionInput } from "@/lib/planFactory";
import type {
  AthleteProfile,
  TrainingSession,
  WorkoutTemplate,
} from "@/types/training";
import { planWorkoutExecutionItems } from "@/services/workoutPlanner";

type Block = Omit<DraftActionInput, "status" | "type"> & {
  status?: DraftActionInput["status"];
};

const BLOCKS: Record<ActionType, Block[]> = {
  workout: [
    {
      title: "Upper body strength",
      description: "Warm up with empty bar. Stop sets with 1–2 reps in reserve unless noted.",
      goal: "Quality reps over total volume.",
      executionItems: [
        { label: "Bench press", plannedValue: "100×10" },
        { label: "Bench press", plannedValue: "100×10" },
        { label: "Incline dumbbell press", plannedValue: "30×10" },
      ],
    },
    {
      title: "Mobility — hips + T-spine",
      description: "Slow reps, full exhale at end range.",
      goal: "Measurable ROM gain vs start.",
      executionItems: [
        { label: "90/90 hip flow", plannedValue: "2×30s each side" },
        { label: "Cat-camel", plannedValue: "10 slow reps" },
        { label: "Thoracic rotations", plannedValue: "8 each side" },
      ],
    },
  ],
  run: [
    {
      title: "Zone 2 aerobic",
      description: "Flat route. Hold conversational pace.",
      goal: "Time on feet, not pace.",
      executionItems: [
        { label: "Duration", plannedValue: "20 min" },
        { label: "Optional stride count", plannedValue: "0 (easy day)" },
      ],
    },
    {
      title: "Tempo repeats",
      description: "6×2:00 strong / 2:00 easy. Same line each rep.",
      goal: "Even splits across intervals.",
      executionItems: [
        { label: "Warmup jog", plannedValue: "10 min" },
        { label: "Main set", plannedValue: "6×2 min / 2 min" },
      ],
    },
  ],
  reading: [
    {
      title: "Deep read — one chapter",
      description: "No inbox. Pen only for short marginal marks.",
      goal: "Finish the chapter with 3 written takeaways.",
      executionItems: [
        { label: "Pages", plannedValue: "20" },
        { label: "Notes checkpoint", plannedValue: "3 bullets" },
      ],
    },
    {
      title: "Source triage",
      description: "Scan headings + conclusions. Decide keep vs discard.",
      goal: "Max five sources touched; each has a next action.",
      executionItems: [
        { label: "Sources reviewed", plannedValue: "5" },
        { label: "Follow-ups captured", plannedValue: "1 list" },
      ],
    },
  ],
  project: [
    {
      title: "Vertical slice — routing",
      description: "Implement the smallest path that proves navigation + one screen.",
      goal: "Demo without caveats.",
      executionItems: [
        { label: "Task", plannedValue: "App shell + route table — 45 min" },
        { label: "Task", plannedValue: "Smoke test checklist — 15 min" },
      ],
    },
    {
      title: "Decision pass",
      description: "Close threads. Each blocker gets an owner + date.",
      goal: "Zero unknown “what next” items.",
      executionItems: [
        { label: "Task", plannedValue: "Blocker list → decisions — 30 min" },
        { label: "Task", plannedValue: "Schedule follow-ups — 15 min" },
      ],
    },
  ],
};

function countForStyle(style: UserSettings["planningStyle"]): number {
  if (style === "light") return 2;
  if (style === "intense") return 5;
  return 3;
}

export type OpenAiFillerAction = {
  type: "run" | "reading" | "project";
  title: string;
  description?: string;
  goal?: string;
  executionItems: { label: string; plannedValue: string }[];
};

/** Non-workout blocks for OpenAI-shaped daily plans (3–4 actions total). */
export function buildNonWorkoutDraftActionsForOpenAi(
  count: number,
  _settings: UserSettings,
): OpenAiFillerAction[] {
  void _settings;
  const rotation = ["run", "reading", "project"] as const;
  const out: OpenAiFillerAction[] = [];
  for (let j = 0; j < count; j++) {
    const type = rotation[j % rotation.length];
    const pool = BLOCKS[type];
    const block = pool[j % pool.length];
    out.push({
      type,
      title: block.title,
      description: block.description,
      goal: block.goal,
      executionItems: (block.executionItems ?? []).map((e) => ({
        label: e.label,
        plannedValue: e.plannedValue,
      })),
    });
  }
  return out;
}

function buildWorkoutFromTemplate(
  tpl: WorkoutTemplate,
  profile: AthleteProfile,
  sessions: TrainingSession[],
): DraftActionInput {
  const rows = planWorkoutExecutionItems(profile, sessions, tpl);
  const phaseNote =
    profile.phase === "post_cycle"
      ? "Recovery bias: conservative loads from recent logs."
      : profile.phase === "on_cycle"
        ? "Small progression when prior reps were clean."
        : "Gradual progression.";

  return {
    type: "workout",
    title: `${tpl.name}`,
    description: [
      `Template (${tpl.dayType}) — ${tpl.exercises.length} exercises.`,
      profile.notes?.trim() || null,
      phaseNote,
    ]
      .filter(Boolean)
      .join(" "),
    goal:
      formatAthleteGoalForPlan(profile) ||
      "Match template; log actuals per row after each set.",
    status: "planned",
    executionItems: rows,
  };
}

export type MockPlanContext = {
  athleteProfile?: AthleteProfile;
  workoutTemplate?: WorkoutTemplate;
  recentSessions?: TrainingSession[];
};

/** Local-only mocked plan body before IDs are assigned in the DB layer */
export function mockPlanPayloadForDate(
  date: string,
  settings: UserSettings,
  ctx?: MockPlanContext,
): {
  plan: Pick<DailyPlan, "source" | "note">;
  actions: DraftActionInput[];
} {
  const types =
    settings.preferredActionTypes.length > 0
      ? settings.preferredActionTypes
      : (["workout", "run", "reading", "project"] as ActionType[]);

  const n = Math.min(countForStyle(settings.planningStyle), 6);
  const actions: DraftActionInput[] = [];

  const tpl = ctx?.workoutTemplate;
  const profile = ctx?.athleteProfile;
  const sessions = ctx?.recentSessions ?? [];
  const useTemplateWorkout =
    !!tpl &&
    !!profile &&
    settings.preferredActionTypes.includes("workout");

  if (useTemplateWorkout && tpl && profile) {
    actions.push(buildWorkoutFromTemplate(tpl, profile, sessions));
  }

  const fillerTypes = types.filter((t) => t !== "workout");
  const rotation =
    fillerTypes.length > 0 ? fillerTypes : (["run", "reading", "project"] as const);

  let i = 0;
  while (actions.length < n) {
    const type = rotation[i % rotation.length] as ActionType;
    i += 1;
    const pool = BLOCKS[type];
    const block = pool[(actions.length + i) % pool.length];
    actions.push({
      type,
      title: block.title,
      description: block.description,
      goal: block.goal,
      status: "planned",
      executionItems: block.executionItems,
    });
  }

  const name = settings.userName?.trim();
  const note = [
    `Execution panel for ${date}.`,
    name ? `Operator: ${name}.` : null,
    `Style: ${settings.planningStyle}.`,
    useTemplateWorkout && tpl
      ? `Workout from template "${tpl.name}" with planned loads from history + phase.`
      : "Each block includes execution rows (planned vs actual on save).",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plan: { source: "ai", note },
    actions,
  };
}
