import { normalizeExerciseName } from "@/lib/exerciseName";
import {
  SLOT_EXERCISES,
  getWorkoutSkeleton,
  pickExerciseForSlot,
  type SkeletonSlot,
  type WorkoutSplit,
} from "@/lib/workoutSkeleton";
import type { SuggestNextWorkoutAiExercise } from "@/types/aiCoach";

function slotIndexInSplit(sk: WorkoutSplit, slot: SkeletonSlot): number {
  return getWorkoutSkeleton(sk).indexOf(slot);
}

/** Token overlap: exercise name vs canonical catalog name. */
function nameMatchesPoolExercise(exerciseName: string, canonical: string): boolean {
  const n = normalizeExerciseName(exerciseName);
  const c = normalizeExerciseName(canonical);
  if (!n.length || !c.length) return false;
  if (n === c) return true;
  if (n.includes(c) || c.includes(n)) return true;
  const nt = n.split(/[^a-z0-9]+/i).filter((x) => x.length > 2);
  const ct = c.split(/[^a-z0-9]+/i).filter((x) => x.length > 2);
  if (ct.every((t) => n.includes(t))) return true;
  if (ct.some((t) => nt.includes(t)) && ct.length >= 2) return true;
  return false;
}

export function matchExerciseToSlot(
  exerciseName: string,
  slot: SkeletonSlot,
): boolean {
  const pool = SLOT_EXERCISES[slot] ?? [];
  return pool.some((c) => nameMatchesPoolExercise(exerciseName, c));
}

export function listMatchingSlotsForName(
  exerciseName: string,
  split: WorkoutSplit,
): SkeletonSlot[] {
  const order = getWorkoutSkeleton(split);
  const out: SkeletonSlot[] = [];
  for (const slot of order) {
    if (matchExerciseToSlot(exerciseName, slot)) out.push(slot);
  }
  return out;
}

function sortSlotsBySkeletonOrder(slots: SkeletonSlot[], split: WorkoutSplit): SkeletonSlot[] {
  return [...slots].sort(
    (a, b) => slotIndexInSplit(split, a) - slotIndexInSplit(split, b),
  );
}

function usedHasNorm(used: Set<string>, name: string): boolean {
  return used.has(normalizeExerciseName(name));
}

function addUsed(used: Set<string>, name: string) {
  used.add(normalizeExerciseName(name));
}

/**
 * Ordered candidate names for a slot; prefers alternatives when the same pattern
 * is already used (e.g. second vertical → pull-up; second biceps curl → hammer).
 */
function orderedNamesForSlot(slot: SkeletonSlot, usedNorm: Set<string>): string[] {
  const pool = [...(SLOT_EXERCISES[slot] ?? [])];
  const anyNorm = (pred: (u: string) => boolean) => {
    for (const u of usedNorm) {
      if (pred(u)) return true;
    }
    return false;
  };

  if (slot === "vertical_pull") {
    const hasLat = anyNorm(
      (u) => (u.includes("lat") && u.includes("pulldown")) || u.includes("lat pulldown"),
    );
    const hasPullUp = anyNorm((u) => u.includes("pull-up") || u.includes("pull up") || u === "chin-ups" || u.includes("chin-up") || u.includes("chin up"));
    if (hasLat) return ["Pull-ups", "Chin-ups", "Lat Pulldown"].filter(Boolean);
    if (hasPullUp) return ["Lat Pulldown", "Chin-ups", "Pull-ups"].filter(Boolean);
    return pool;
  }
  if (slot === "horizontal_pull") {
    if (anyNorm((u) => u.includes("seated") && u.includes("row")))
      return ["Chest Supported Row", "Cable Row", "Seated Row"];
    if (anyNorm((u) => u.includes("cable") && u.includes("row")))
      return ["Seated Row", "Chest Supported Row", "Cable Row"];
    return pool;
  }
  if (slot === "biceps") {
    if (anyNorm((u) => u.includes("cable") && u.includes("curl")))
      return ["Hammer Curl", "Dumbbell Curl", "Cable Curl"];
    if (anyNorm((u) => u.includes("hammer") && u.includes("curl")))
      return ["Cable Curl", "Dumbbell Curl", "Hammer Curl"];
    return pool;
  }
  if (slot === "rear_delt") {
    return ["Face Pull", "Reverse Pec Deck", "Rear Delt Fly"];
  }
  return pool;
}

function firstAvailableName(
  ordered: string[],
  usedNorm: Set<string>,
  slot: SkeletonSlot,
  usedExact: Set<string>,
): string {
  for (const name of ordered) {
    if (!usedNorm.has(normalizeExerciseName(name))) return name;
  }
  return pickExerciseForSlot(slot, usedExact);
}

const AUTO_RU = "Автоподбор: убраны дубли и выровнены роли.";
const AUTO_EN = "Auto-fixed: removed duplicates and balanced movement roles.";

function autoReason(lang: string | undefined, prev: string | undefined): string {
  const base = lang === "ru" ? AUTO_RU : AUTO_EN;
  if (prev && prev.trim()) return `${base} ${prev}`.trim();
  return base;
}

export function repairWorkoutBySkeleton(params: {
  exercises: SuggestNextWorkoutAiExercise[];
  split: WorkoutSplit;
  language: string | undefined;
  buildDefaultSets: (name: string) => { weight: number; reps: number }[];
}): { exercises: SuggestNextWorkoutAiExercise[]; didFix: boolean; warning?: string } {
  const { exercises, split, language, buildDefaultSets } = params;
  const slotOrder = getWorkoutSkeleton(split);
  const usedNorm = new Set<string>();
  const slotToExercise = new Map<SkeletonSlot, SuggestNextWorkoutAiExercise>();
  const unassigned: SuggestNextWorkoutAiExercise[] = [];

  for (const ex of exercises) {
    const matches = sortSlotsBySkeletonOrder(listMatchingSlotsForName(ex.name, split), split);
    let placed = false;
    for (const slot of matches) {
      if (!slotToExercise.has(slot)) {
        slotToExercise.set(slot, ex);
        placed = true;
        break;
      }
    }
    if (!placed) unassigned.push(ex);
  }

  for (const ex of unassigned) {
    const matches = sortSlotsBySkeletonOrder(listMatchingSlotsForName(ex.name, split), split);
    for (const slot of matches) {
      if (!slotToExercise.has(slot)) {
        slotToExercise.set(slot, ex);
        break;
      }
    }
  }

  const out: SuggestNextWorkoutAiExercise[] = [];
  let didFix = exercises.length !== slotOrder.length;
  const usedExact = new Set<string>();

  for (const slot of slotOrder) {
    const base = slotToExercise.get(slot) ?? null;
    if (!base) {
      const name = firstAvailableName(
        orderedNamesForSlot(slot, usedNorm),
        usedNorm,
        slot,
        usedExact,
      );
      addUsed(usedNorm, name);
      usedExact.add(name);
      out.push({
        name,
        sets: buildDefaultSets(name),
        decision: "maintain",
        decision_label: language === "ru" ? "Стабильная нагрузка" : "Maintain",
        reason: autoReason(language, undefined),
      });
      didFix = true;
      continue;
    }

    let name = base.name;
    let needFix = !matchExerciseToSlot(name, slot);
    if (needFix) {
      name = firstAvailableName(orderedNamesForSlot(slot, usedNorm), usedNorm, slot, usedExact);
    }
    if (usedHasNorm(usedNorm, name)) {
      const repl = firstAvailableName(orderedNamesForSlot(slot, usedNorm), usedNorm, slot, usedExact);
      if (normalizeExerciseName(repl) !== normalizeExerciseName(name)) needFix = true;
      name = repl;
    }
    if (needFix) didFix = true;

    addUsed(usedNorm, name);
    usedExact.add(name);
    out.push({
      ...base,
      name,
      reason: needFix ? autoReason(language, base.reason) : base.reason,
      sets: base.sets.map((s) => ({ ...s })),
    });
  }

  const warn: string | undefined = didFix
    ? language === "ru"
      ? "План подправлен: убраны дубли и восстановлен баланс движений."
      : "Workout auto-adjusted: duplicates removed and movement roles balanced."
    : undefined;

  return { exercises: out, didFix, warning: warn };
}

/**
 * Deduplicate by normalized name; replace subsequent duplicates with the next
 * available alternative from the same slot pool (inferred from the name), or
 * a distinct pick from the global skeleton walk.
 */
export function dedupeExercisesGeneric(
  exercises: SuggestNextWorkoutAiExercise[],
  language: string | undefined,
  buildDefaultSets: (name: string) => { weight: number; reps: number }[],
): { exercises: SuggestNextWorkoutAiExercise[]; didFix: boolean; warning?: string } {
  const used = new Set<string>();
  const out: SuggestNextWorkoutAiExercise[] = [];
  let didFix = false;
  const allSlots: SkeletonSlot[] = [
    "chest_press",
    "vertical_pull",
    "hinge",
    "quad_compound",
    "core",
    "biceps",
    "triceps",
  ];

  for (const ex of exercises) {
    const n = normalizeExerciseName(ex.name);
    if (!used.has(n)) {
      used.add(n);
      out.push(ex);
      continue;
    }
    didFix = true;
    let replaced = false;
    for (const slot of allSlots) {
      for (const cand of SLOT_EXERCISES[slot] ?? []) {
        if (!used.has(normalizeExerciseName(cand))) {
          used.add(normalizeExerciseName(cand));
          out.push({
            ...ex,
            name: cand,
            reason: autoReason(language, ex.reason),
            sets: ex.sets.map((s) => ({ ...s })),
          });
          replaced = true;
          break;
        }
      }
      if (replaced) break;
    }
    if (!replaced) {
      const usedExact = new Set(out.map((e) => e.name));
      const fresh = pickExerciseForSlot("core", usedExact);
      used.add(normalizeExerciseName(fresh));
      out.push({
        ...ex,
        name: fresh,
        reason: autoReason(language, ex.reason),
        sets: ex.sets.length ? ex.sets.map((s) => ({ ...s })) : buildDefaultSets(fresh),
      });
    }
  }

  const warn: string | undefined = didFix
    ? language === "ru"
      ? "План подправлен: убраны дубли упражнений."
      : "Workout auto-adjusted: removed duplicate exercise names."
    : undefined;

  return { exercises: out, didFix, warning: warn };
}
