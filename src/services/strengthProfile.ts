import { db } from "@/db/database";
import { parseLoadReps } from "@/lib/loadRepsParser";
import { normalizeExerciseLabel } from "@/services/workoutPlanner";

const WORKOUT_LOG_WINDOW = 10;
const MAX_EXERCISES = 15;

export type StrengthProfile = {
  exercises: {
    label: string;
    bestLoadReps?: string;
    recentAverage?: string;
    lastPerformed?: string;
  }[];
};

function formatLoadRepsLowerX(load: number, reps: number): string {
  const w = Math.round(load * 4) / 4;
  const wStr = Number.isInteger(w)
    ? String(w)
    : w.toFixed(1).replace(/\.0$/, "");
  const r = Math.round(reps);
  return `${wStr}x${r}`;
}

type ParseEntry = { load: number; reps: number; raw: string; createdAt: string };

type Agg = {
  displayLabel: string;
  /** Chronological actual strings with log timestamp */
  entries: { createdAt: string; raw: string }[];
  parses: ParseEntry[];
};

/**
 * Derive recent strength signals from workout action logs (IndexedDB).
 * Intended to run on the client before POST /api/generate-plan.
 */
export async function buildStrengthProfile(): Promise<StrengthProfile> {
  const actions = await db.actions.toArray();
  const workoutActionIds = new Set(
    actions.filter((a) => a.type === "workout").map((a) => a.id),
  );

  const workoutLogs = (await db.actionLogs.orderBy("createdAt").reverse().toArray())
    .filter((l) => workoutActionIds.has(l.actionId))
    .slice(0, WORKOUT_LOG_WINDOW);

  const chronological = [...workoutLogs].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const aggs = new Map<string, Agg>();

  for (const log of chronological) {
    const items = log.executionItems;
    if (!items?.length) continue;
    for (const row of items) {
      const raw = row.actualValue?.trim();
      if (!raw) continue;
      const key = normalizeExerciseLabel(row.label);
      if (!key) continue;

      let agg = aggs.get(key);
      if (!agg) {
        agg = { displayLabel: row.label.trim(), entries: [], parses: [] };
        aggs.set(key, agg);
      }
      agg.displayLabel = row.label.trim();
      agg.entries.push({ createdAt: log.createdAt, raw });

      const parsed = parseLoadReps(raw);
      if (parsed) {
        agg.parses.push({
          load: parsed.load,
          reps: parsed.reps,
          raw,
          createdAt: log.createdAt,
        });
      }
    }
  }

  const scored = [...aggs.entries()].map(([, agg]) => ({
    agg,
    score: agg.entries.length,
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_EXERCISES);

  const exercises = top.map(({ agg }) => {
    const last = agg.entries.reduce((prev, cur) =>
      cur.createdAt.localeCompare(prev.createdAt) > 0 ? cur : prev,
    );

    let bestLoadReps: string | undefined;
    if (agg.parses.length > 0) {
      let best = agg.parses[0]!;
      let bestMetric = best.load * best.reps;
      for (const p of agg.parses) {
        const m = p.load * p.reps;
        if (m > bestMetric || (m === bestMetric && p.load > best.load)) {
          best = p;
          bestMetric = m;
        }
      }
      bestLoadReps = formatLoadRepsLowerX(best.load, best.reps);
    }

    let recentAverage: string | undefined;
    if (agg.parses.length > 0) {
      const n = agg.parses.length;
      const avgLoad =
        agg.parses.reduce((s, p) => s + p.load, 0) / n;
      const avgReps =
        agg.parses.reduce((s, p) => s + p.reps, 0) / n;
      recentAverage = formatLoadRepsLowerX(avgLoad, avgReps);
    }

    const row: StrengthProfile["exercises"][number] = {
      label: agg.displayLabel,
      lastPerformed: last.raw,
    };
    if (bestLoadReps !== undefined) row.bestLoadReps = bestLoadReps;
    if (recentAverage !== undefined) row.recentAverage = recentAverage;
    return row;
  });

  return { exercises };
}
