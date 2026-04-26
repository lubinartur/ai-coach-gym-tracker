import { normalizeExerciseName } from "@/lib/exerciseName";
import { getExerciseMuscleGroup, mapCatalogMuscleToPrimary, type PrimaryMuscleGroup } from "@/lib/exerciseMuscleGroup";
import { SLOT_EXERCISES, type SkeletonSlot, type WorkoutSplit } from "@/lib/workoutSkeleton";
import { listMatchingSlotsForName } from "@/lib/workoutRoleRepair";
import type { AiDecisionContext } from "@/types/aiCoach";
import type { Exercise } from "@/types/trainingDiary";
import { buildEngineRuntimeContext } from "@/services/buildEngineRuntimeContext";
import type { EngineRuntimeContext } from "@/types/engineRuntimeContext";
import { addTrace } from "@/services/decisionTrace";
import { getExerciseMetadata } from "@/data/exerciseMetadata";

export type ExerciseSelectionConstraints = {
  /** If set, only exercises with equipment in this set (or unknown equipment) are allowed. */
  allowedEquipment?: Set<string>;
  /** Normalized exercise names the user dislikes (hard block). */
  dislikedExercises?: Set<string>;
  /**
   * Injury tags (hard block). Current catalog does not yet have contraindication metadata,
   * so this is reserved for a future enrichment layer.
   */
  injuries?: Set<string>;
  /** "beginner" biases to simpler / machine-friendly picks when possible. */
  experienceLevel?: "beginner" | "intermediate" | "advanced";
  /** Rotation window for penalizing repeats in `recentWorkouts`. Default: 2 sessions. */
  rotationWindowSessions?: number;
};

export type SelectedWorkoutStructure = {
  split: "Push" | "Pull" | "Legs" | "Full";
  exercises: Array<{
    tier: 1 | 2 | 3;
    role: SkeletonSlot;
    exerciseId?: string;
    exercise: string;
    primaryMuscle: PrimaryMuscleGroup;
    movementPattern: "push" | "pull" | "squat" | "hinge" | "core" | "isolation";
    selectionScore: number;
    reasonCodes: string[];
  }>;
  excluded: Array<{ role: SkeletonSlot; candidate: string; reasonCodes: string[] }>;
};

type SlotPlanItem = {
  role: SkeletonSlot;
  tier: 1 | 2 | 3;
  movementPattern: SelectedWorkoutStructure["exercises"][number]["movementPattern"];
  targetMuscle: PrimaryMuscleGroup;
};

function toWorkoutSplit(split: SelectedWorkoutStructure["split"]): WorkoutSplit | null {
  if (split === "Pull") return "Pull";
  if (split === "Push") return "Push";
  if (split === "Legs") return "Legs";
  return null;
}

function determineSplit(context: AiDecisionContext): SelectedWorkoutStructure["split"] {
  const r = context.splitSelection?.recommendedSplit;
  if (r === "Push" || r === "Pull" || r === "Legs" || r === "Full") return r;
  const pref = context.splitContinuityGuard?.preferredNextSplits?.[0];
  if (pref === "Push" || pref === "Pull" || pref === "Legs" || pref === "Full") return pref;
  return "Full";
}

function slotPlanFor(split: SelectedWorkoutStructure["split"]): SlotPlanItem[] {
  if (split === "Push") {
    return [
      { role: "chest_press", tier: 1, movementPattern: "push", targetMuscle: "chest" },
      { role: "shoulder_press", tier: 2, movementPattern: "push", targetMuscle: "shoulders" },
      { role: "secondary_chest", tier: 2, movementPattern: "push", targetMuscle: "chest" },
      { role: "lateral_raise", tier: 3, movementPattern: "isolation", targetMuscle: "shoulders" },
      { role: "triceps", tier: 3, movementPattern: "isolation", targetMuscle: "triceps" },
      { role: "core", tier: 3, movementPattern: "core", targetMuscle: "core" },
    ];
  }
  if (split === "Pull") {
    return [
      { role: "vertical_pull", tier: 1, movementPattern: "pull", targetMuscle: "back" },
      { role: "horizontal_pull", tier: 1, movementPattern: "pull", targetMuscle: "back" },
      { role: "secondary_back", tier: 2, movementPattern: "pull", targetMuscle: "back" },
      { role: "rear_delt", tier: 3, movementPattern: "isolation", targetMuscle: "shoulders" },
      { role: "biceps", tier: 3, movementPattern: "isolation", targetMuscle: "biceps" },
      { role: "core", tier: 3, movementPattern: "core", targetMuscle: "core" },
    ];
  }
  if (split === "Legs") {
    return [
      { role: "quad_compound", tier: 1, movementPattern: "squat", targetMuscle: "legs" },
      { role: "hinge", tier: 1, movementPattern: "hinge", targetMuscle: "hamstrings" },
      { role: "single_leg", tier: 2, movementPattern: "squat", targetMuscle: "legs" },
      { role: "hamstrings", tier: 2, movementPattern: "hinge", targetMuscle: "hamstrings" },
      { role: "calves", tier: 3, movementPattern: "isolation", targetMuscle: "calves" },
      { role: "core", tier: 3, movementPattern: "core", targetMuscle: "core" },
    ];
  }
  // Full: use a conservative mixed plan (still uses existing roles).
  return [
    { role: "chest_press", tier: 1, movementPattern: "push", targetMuscle: "chest" },
    { role: "horizontal_pull", tier: 1, movementPattern: "pull", targetMuscle: "back" },
    { role: "hinge", tier: 2, movementPattern: "hinge", targetMuscle: "hamstrings" },
    { role: "quad_compound", tier: 2, movementPattern: "squat", targetMuscle: "legs" },
    { role: "lateral_raise", tier: 3, movementPattern: "isolation", targetMuscle: "shoulders" },
    { role: "core", tier: 3, movementPattern: "core", targetMuscle: "core" },
  ];
}

function normSetFromRecentWorkouts(context: AiDecisionContext, takeSessions: number): Set<string> {
  const used = new Set<string>();
  for (const w of (context.recentWorkouts ?? []).slice(0, Math.max(0, takeSessions))) {
    for (const ex of w.exercises ?? []) {
      const k = normalizeExerciseName(ex.name);
      if (k) used.add(k);
    }
  }
  return used;
}

function primaryMuscleForExercise(ex: Pick<Exercise, "name" | "muscleGroup">): PrimaryMuscleGroup {
  const m = mapCatalogMuscleToPrimary(ex.muscleGroup);
  if (m) return m;
  return getExerciseMuscleGroup(ex.name);
}

function equipmentKey(raw: string | undefined): string | null {
  const s = raw?.trim().toLowerCase();
  if (!s) return null;
  // Keep it loose; catalog uses small tokens (barbell/dumbbell/cable/machine/bodyweight/…).
  return s;
}

function equipmentFlagsFromMetadata(name: string): {
  hasMetadata: boolean;
  tags: string[];
  machine: boolean;
  cable: boolean;
  smith: boolean;
  barbell: boolean;
} | null {
  const m = getExerciseMetadata(name);
  if (!m) return null;
  const tags = m.equipmentTags as unknown as string[];
  return {
    hasMetadata: true,
    tags,
    machine: tags.includes("machine"),
    cable: tags.includes("cable"),
    smith: tags.includes("smith"),
    barbell: tags.includes("barbell"),
  };
}

function hasHistory(context: AiDecisionContext, name: string): boolean {
  const k = normalizeExerciseName(name);
  if (!k) return false;
  if ((context.exerciseHistory ?? []).some((h) => normalizeExerciseName(h.name) === k)) return true;
  return (context.progressionRecommendations?.exerciseProgression ?? []).some(
    (p) => normalizeExerciseName(p.name) === k,
  );
}

function stimulusFor(context: AiDecisionContext, name: string): number | null {
  const k = normalizeExerciseName(name);
  if (!k) return null;
  const row = (context.stimulusScores ?? []).find((s) => normalizeExerciseName(s.name) === k);
  return row ? row.stimulusScore : null;
}

function isAllowedByConstraints(ex: Exercise, constraints: ExerciseSelectionConstraints): { ok: boolean; reasonCodes: string[] } {
  const reasons: string[] = [];

  const dislike = constraints.dislikedExercises;
  const k = normalizeExerciseName(ex.name);
  if (dislike && k && dislike.has(k)) {
    reasons.push("blocked_disliked");
    return { ok: false, reasonCodes: reasons };
  }

  const allowedEq = constraints.allowedEquipment;
  if (allowedEq) {
    const metaEq = equipmentFlagsFromMetadata(ex.name);
    if (metaEq) {
      reasons.push("metadata_equipment");
      // If we know the tags and none are allowed, block. If tags are empty, treat as unknown (allow).
      if (metaEq.tags.length && !metaEq.tags.some((t) => allowedEq.has(t))) {
        reasons.push("blocked_equipment");
        return { ok: false, reasonCodes: reasons };
      }
    } else {
      reasons.push("metadata_missing_fallback");
      const eq = equipmentKey(ex.equipment);
      if (eq && !allowedEq.has(eq)) {
        reasons.push("blocked_equipment");
        return { ok: false, reasonCodes: reasons };
      }
    }
  }

  // Injury constraints are reserved for future catalog enrichment. Keep the gate for API completeness.
  if (constraints.injuries?.size) {
    // No-op currently (unknown contraindications).
    reasons.push("injury_constraints_unenforced");
  }

  return { ok: true, reasonCodes: reasons };
}

function rolesForExerciseName(name: string, split: WorkoutSplit): SkeletonSlot[] {
  // Uses current role repair matcher; aligns exercise selection with the existing skeleton system.
  return listMatchingSlotsForName(name, split);
}

function matchesRoleWithMetadataOrFallback(input: {
  name: string;
  role: SkeletonSlot;
  splitForFallback: WorkoutSplit;
}): boolean {
  const meta = getExerciseMetadata(input.name);
  if (meta) return meta.roleCompatibility.includes(input.role);
  return rolesForExerciseName(input.name, input.splitForFallback).includes(input.role);
}

function movementPatternKeyForSelection(
  name: string,
  role: SkeletonSlot,
): string | null {
  const meta = getExerciseMetadata(name);
  if (meta?.movementPattern) return meta.movementPattern;
  // Fallback: only disambiguate key compound patterns; keep it conservative.
  if (role === "horizontal_pull" || role === "secondary_back") return "pull_horizontal";
  if (role === "vertical_pull") return "pull_vertical";
  if (role === "chest_press" || role === "secondary_chest") return "push_horizontal";
  if (role === "shoulder_press") return "push_vertical";
  if (role === "quad_compound" || role === "single_leg") return "squat";
  if (role === "hinge" || role === "hamstrings") return "hinge";
  if (role === "core") return "core";
  return null;
}

function scoreCandidate(input: {
  runtime: EngineRuntimeContext;
  constraints: ExerciseSelectionConstraints;
  slot: SlotPlanItem;
  ex: Exercise;
  usedNorm: Set<string>;
  recentNorm: Set<string>;
  substitutionBoosts?: Map<string, { delta: number; reasonCodes: string[] }>;
  selectedMovementPatternsTier12?: Set<string>;
}): { score: number; reasonCodes: string[] } {
  const {
    runtime,
    slot,
    ex,
    usedNorm,
    recentNorm,
    substitutionBoosts,
    selectedMovementPatternsTier12,
  } = input;
  const context = runtime.decision;
  const recovery = runtime.recovery;
  const reasonCodes: string[] = [];
  let score = 0;

  const meta = getExerciseMetadata(ex.name);
  if (meta) {
    if (meta.roleCompatibility.includes(slot.role)) {
      reasonCodes.push("metadata_role_match");
    }
    // Metadata-driven stress bias: only applies when metadata exists.
    // Deload bias is stronger and takes precedence over high-fatigue bias.
    if (recovery.deloadRecommended) {
      if (meta.stressLevel === "low") score += 16;
      else if (meta.stressLevel === "medium") score -= 4;
      else score -= 28;
      reasonCodes.push("stress_bias_deload");
    } else if (recovery.globalFatigueLevel === "high") {
      if (meta.stressLevel === "low") score += 12;
      else if (meta.stressLevel === "medium") score += 2;
      else score -= 18;
      reasonCodes.push("stress_bias_high_fatigue");
    }
  } else {
    reasonCodes.push("metadata_missing_fallback");
  }

  // Base: favorites.
  if (ex.isFavorite) {
    score += 18;
    reasonCodes.push("favorite");
  }

  // History + stimulus.
  if (hasHistory(context, ex.name)) {
    score += 16;
    reasonCodes.push("has_history");
  } else {
    score -= 6;
    reasonCodes.push("low_history");
  }

  const stim = stimulusFor(context, ex.name);
  if (stim != null) {
    // Center around ~6.
    score += Math.round((stim - 6) * 3);
    reasonCodes.push(`stimulus_${Math.round(stim)}`);
  } else {
    reasonCodes.push("stimulus_unknown");
  }

  // Recovery / volume constraints.
  const mState = recovery.muscles[slot.targetMuscle];
  const recScore = mState?.recoveryScore ?? 0;
  const recStatus = mState?.status ?? "unknown";
  reasonCodes.push(`recovery_${recStatus}`);
  reasonCodes.push(`recoveryScore_${Math.round(recScore)}`);

  // Prefer higher recovery scores; Tier 1 is much more sensitive.
  if (recScore >= recovery.rules.compoundMinRecoveryScore) score += 14;
  else if (recScore >= recovery.rules.isolationMinRecoveryScore) score += 6;
  else if (recScore > 0) score -= slot.tier === 1 ? 120 : 24;
  else score -= 2;

  if (recovery.volumeCappedMuscles.includes(slot.targetMuscle)) {
    score -= slot.tier === 1 ? 90 : 35;
    reasonCodes.push("weekly_volume_max");
  }

  // Avoid redundant movement patterns in the same workout for Tier 1/2 when alternatives exist.
  if (slot.tier === 1 || slot.tier === 2) {
    const key = movementPatternKeyForSelection(ex.name, slot.role);
    if (key && selectedMovementPatternsTier12?.has(key)) {
      score -= 20;
      reasonCodes.push("movement_pattern_redundancy");
    }
  }

  // Rotation / duplicates.
  const exNorm = normalizeExerciseName(ex.name);
  if (exNorm && usedNorm.has(exNorm)) {
    score -= 200;
    reasonCodes.push("duplicate_in_workout");
  }
  const rotationPenalty =
    exNorm && recentNorm.has(exNorm) ? (slot.tier === 1 ? 55 : 18) : 0;
  if (rotationPenalty) {
    score -= rotationPenalty;
    reasonCodes.push("recently_used");
  }

  // Phase compatibility: deload prefers simpler / machine-like patterns.
  const phase = context.trainingPhase?.phase ?? "unknown";
  const metaEq = equipmentFlagsFromMetadata(ex.name);
  if (metaEq) reasonCodes.push("metadata_equipment");
  const eq = metaEq ? null : equipmentKey(ex.equipment);
  if (phase === "deload") {
    if (slot.tier === 1) score -= 22;
    const lowStressEq = metaEq
      ? metaEq.machine || metaEq.cable || metaEq.smith
      : Boolean(eq && (eq.includes("machine") || eq.includes("cable") || eq.includes("smith")));
    if (lowStressEq) {
      score += 10;
      reasonCodes.push("deload_machine_bias");
    }
  } else if (phase === "build") {
    if (slot.tier === 1) score += 8;
  }
  reasonCodes.push(`phase_${phase}`);

  // Experience: beginners bias toward machine/cable + away from barbell when possible.
  const exp = input.constraints.experienceLevel ?? "intermediate";
  if (exp === "beginner") {
    const isMachineOrCable = metaEq
      ? metaEq.machine || metaEq.cable
      : Boolean(eq && (eq.includes("machine") || eq.includes("cable")));
    const isBarbell = metaEq ? metaEq.barbell : Boolean(eq && eq.includes("barbell"));
    if (isMachineOrCable) score += 8;
    if (isBarbell) score -= 10;
    reasonCodes.push("beginner_bias");
  }

  // Deterministic minor preference: if equipment is unknown, small penalty (still selectable).
  if (!metaEq && !eq) {
    score -= 4;
    reasonCodes.push("equipment_unknown");
  }

  // Metadata-driven substitution preference (soft bias only).
  const boost = exNorm ? substitutionBoosts?.get(exNorm) : undefined;
  if (boost && Number.isFinite(boost.delta) && boost.delta !== 0) {
    score += boost.delta;
    reasonCodes.push(...boost.reasonCodes);
  }

  return { score, reasonCodes };
}

function buildSubstitutionBoostsForSlot(input: {
  slot: SlotPlanItem;
  filtered: Exercise[];
  wkSplit: WorkoutSplit | null;
  recentNorm: Set<string>;
  recovery: EngineRuntimeContext["recovery"];
}): Map<string, { delta: number; reasonCodes: string[] }> {
  const out = new Map<string, { delta: number; reasonCodes: string[] }>();

  const byNorm = new Map<string, Exercise>();
  for (const ex of input.filtered) {
    const k = normalizeExerciseName(ex.name);
    if (k && !byNorm.has(k)) byNorm.set(k, ex);
  }

  const mState = input.recovery.muscles[input.slot.targetMuscle];
  const recScore = mState?.recoveryScore ?? 0;
  const atMax = input.recovery.volumeCappedMuscles.includes(input.slot.targetMuscle);
  const heavyBlocked =
    input.recovery.blockedMuscles.includes(input.slot.targetMuscle) ||
    recScore < input.recovery.rules.compoundMinRecoveryScore;
  const slotPenaltyActive =
    atMax ||
    heavyBlocked ||
    input.recovery.deloadRecommended ||
    input.recovery.globalFatigueLevel === "high";

  for (const source of input.filtered) {
    const sourceMeta = getExerciseMetadata(source.name);
    if (!sourceMeta || !sourceMeta.substitutions?.length) continue;
    const sourceNorm = normalizeExerciseName(source.name);
    const sourceRecentlyUsed = Boolean(sourceNorm && input.recentNorm.has(sourceNorm));

    // Only consider substitutions when the "source" would be penalized by rotation or fatigue/recovery state.
    if (!slotPenaltyActive && !sourceRecentlyUsed) continue;

    for (const subName of sourceMeta.substitutions) {
      const subNorm = normalizeExerciseName(subName);
      if (!subNorm) continue;
      const subEx = byNorm.get(subNorm);
      if (!subEx) continue; // only boost if substitution is actually in the candidate pool

      // Ensure role match: metadata if present, otherwise fallback matcher.
      const roleOk = (() => {
        const subMeta = getExerciseMetadata(subEx.name);
        if (subMeta) return subMeta.roleCompatibility.includes(input.slot.role);
        if (!input.wkSplit) return true;
        return rolesForExerciseName(subEx.name, input.wkSplit).includes(input.slot.role);
      })();
      if (!roleOk) continue;

      const add: { delta: number; codes: string[] } = { delta: 0, codes: [] };
      add.delta += 14;
      add.codes.push("substitution_preferred");

      if (sourceRecentlyUsed) {
        add.delta += 10;
        add.codes.push("rotation_substitution");
      }

      if (
        (input.recovery.deloadRecommended || input.recovery.globalFatigueLevel === "high") &&
        (() => {
          const subMeta = getExerciseMetadata(subEx.name);
          return subMeta ? subMeta.stressLevel === "low" || subMeta.stressLevel === "medium" : false;
        })()
      ) {
        add.delta += 8;
        add.codes.push("fatigue_substitution");
      }

      const existing = out.get(subNorm);
      if (!existing) {
        out.set(subNorm, { delta: add.delta, reasonCodes: add.codes });
      } else {
        // Combine deltas; dedupe reason codes.
        const mergedCodes = [...new Set([...existing.reasonCodes, ...add.codes])];
        out.set(subNorm, { delta: existing.delta + add.delta, reasonCodes: mergedCodes });
      }
    }
  }

  return out;
}

/**
 * Deterministically select a workout structure (exercise names per skeleton role) before LLM generation.
 * This engine does not create sets/reps/weights — it only chooses exercises and logs selection reasons.
 */
export function selectWorkoutStructure(input: {
  /** Back-compat: pass `context` directly (engine will build runtime). Prefer `runtime` when available. */
  context?: AiDecisionContext;
  /** Preferred: precomputed shared runtime context for the pipeline. */
  runtime?: EngineRuntimeContext;
  catalog: Exercise[];
  constraints?: ExerciseSelectionConstraints;
}): SelectedWorkoutStructure {
  const constraints: ExerciseSelectionConstraints = input.constraints ?? {};
  const runtime =
    input.runtime ??
    (input.context ? buildEngineRuntimeContext(input.context) : null);
  if (!runtime) {
    throw new Error("exerciseSelectionEngine.selectWorkoutStructure: missing runtime/context");
  }
  const recovery = runtime.recovery;
  const split = determineSplit(runtime.decision);
  const plan = slotPlanFor(split);

  const usedNorm = new Set<string>();
  const rotationWindow = Math.max(0, Math.floor(constraints.rotationWindowSessions ?? 2));
  const recentNorm = normSetFromRecentWorkouts(runtime.decision, rotationWindow);

  const wkSplit = toWorkoutSplit(split);
  const excluded: SelectedWorkoutStructure["excluded"] = [];
  const out: SelectedWorkoutStructure["exercises"] = [];
  const selectedMovementPatternsTier12 = new Set<string>();

  // Catalog index by normalized name (used for skeleton fallback).
  const byNorm = new Map<string, Exercise>();
  for (const ex of input.catalog) {
    const k = normalizeExerciseName(ex.name);
    if (k && !byNorm.has(k)) byNorm.set(k, ex);
  }

  for (const slot of plan) {
    // Candidate pool: prefer catalog exercises that match the role within the current split.
    let candidates: Exercise[] = [];
    if (wkSplit) {
      candidates = input.catalog.filter((ex) =>
        matchesRoleWithMetadataOrFallback({
          name: ex.name,
          role: slot.role,
          splitForFallback: wkSplit,
        }),
      );
    } else {
      // Full split: allow candidates that match the role in any split skeleton (best-effort).
      candidates = input.catalog.filter((ex) => {
        const meta = getExerciseMetadata(ex.name);
        if (meta) return meta.roleCompatibility.includes(slot.role);
        const r1 = rolesForExerciseName(ex.name, "Push").includes(slot.role);
        const r2 = rolesForExerciseName(ex.name, "Pull").includes(slot.role);
        const r3 = rolesForExerciseName(ex.name, "Legs").includes(slot.role);
        return r1 || r2 || r3;
      });
    }

    // Hard filtering by constraints.
    const filtered: Exercise[] = [];
    for (const ex of candidates) {
      const gate = isAllowedByConstraints(ex, constraints);
      if (!gate.ok) {
        excluded.push({ role: slot.role, candidate: ex.name, reasonCodes: gate.reasonCodes });
        addTrace(runtime, {
          engine: "ExerciseSelectionEngine",
          entity: ex.name,
          decision: "rejected",
          reasons: [...gate.reasonCodes, `role_${slot.role}`],
        });
        continue;
      }
      filtered.push(ex);
    }

    // Signal blockers (hard gates) for Tier 1.
    const mState = recovery.muscles[slot.targetMuscle];
    const recScore = mState?.recoveryScore ?? 0;
    const atMax = recovery.volumeCappedMuscles.includes(slot.targetMuscle);
    const heavyBlocked = recovery.blockedMuscles.includes(slot.targetMuscle) || recScore < recovery.rules.compoundMinRecoveryScore;
    const hardBlockedTier1 = slot.tier === 1 && (heavyBlocked || atMax);

    const substitutionBoosts = buildSubstitutionBoostsForSlot({
      slot,
      filtered,
      wkSplit,
      recentNorm,
      recovery,
    });

    // Score + sort deterministically.
    const scored = filtered
      .map((ex) => {
        const { score, reasonCodes } = scoreCandidate({
          runtime,
          constraints,
          slot,
          ex,
          usedNorm,
          recentNorm,
          substitutionBoosts,
          selectedMovementPatternsTier12,
        });
        return { ex, score, reasonCodes };
      })
      .filter((row) => {
        if (!hardBlockedTier1) return true;
        // Tier1 hard block: still allow only very low-stress variants if they exist (machine/cable)
        // by requiring non-barbell equipment (best-effort heuristic).
        const metaEq = equipmentFlagsFromMetadata(row.ex.name);
        const eq = metaEq ? "" : equipmentKey(row.ex.equipment) ?? "";
        const lowStress = metaEq
          ? metaEq.machine || metaEq.cable || metaEq.smith
          : eq.includes("machine") || eq.includes("cable") || eq.includes("smith");
        if (!lowStress) {
          excluded.push({
            role: slot.role,
            candidate: row.ex.name,
            reasonCodes: ["blocked_tier1_by_recovery_state"],
          });
          addTrace(runtime, {
            engine: "ExerciseSelectionEngine",
            entity: row.ex.name,
            decision: "rejected",
            reasons: ["blocked_tier1_by_recovery_state", `role_${slot.role}`],
            score: row.score,
          });
        }
        return lowStress;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const na = normalizeExerciseName(a.ex.name);
        const nb = normalizeExerciseName(b.ex.name);
        return na.localeCompare(nb);
      });

    // Pick first not already used; if none, try skeleton pool names as fallback.
    const chosen = scored.find((row) => {
      const k = normalizeExerciseName(row.ex.name);
      return !k || !usedNorm.has(k);
    });

    if (chosen) {
      const k = normalizeExerciseName(chosen.ex.name);
      if (k) usedNorm.add(k);
      if (slot.tier === 1 || slot.tier === 2) {
        const mp = movementPatternKeyForSelection(chosen.ex.name, slot.role);
        if (mp) selectedMovementPatternsTier12.add(mp);
      }
      out.push({
        tier: slot.tier,
        role: slot.role,
        exerciseId: chosen.ex.id,
        exercise: chosen.ex.name,
        primaryMuscle: primaryMuscleForExercise(chosen.ex),
        movementPattern: slot.movementPattern,
        selectionScore: chosen.score,
        reasonCodes: chosen.reasonCodes,
      });
      addTrace(runtime, {
        engine: "ExerciseSelectionEngine",
        entity: chosen.ex.name,
        decision: "selected",
        reasons: [...chosen.reasonCodes, `role_${slot.role}`, `tier_${slot.tier}`],
        score: chosen.score,
      });
      continue;
    }

    // Fallback: try canonical slot pool names (may or may not be in catalog).
    const pool = SLOT_EXERCISES[slot.role] ?? [];
    let fallbackPicked: Exercise | null = null;
    for (const name of pool) {
      const k = normalizeExerciseName(name);
      if (k && usedNorm.has(k)) continue;
      const inCatalog = k ? byNorm.get(k) : undefined;
      const ex: Exercise =
        inCatalog ??
        ({
          id: "",
          name,
          muscleGroup: undefined,
          equipment: undefined,
          createdAt: "",
          updatedAt: "",
        } as unknown as Exercise);
      const gate = isAllowedByConstraints(ex, constraints);
      if (!gate.ok) {
        excluded.push({ role: slot.role, candidate: name, reasonCodes: ["fallback_blocked", ...gate.reasonCodes] });
        addTrace(runtime, {
          engine: "ExerciseSelectionEngine",
          entity: name,
          decision: "rejected_fallback",
          reasons: ["fallback_blocked", ...gate.reasonCodes, `role_${slot.role}`],
        });
        continue;
      }
      fallbackPicked = ex;
      break;
    }

    if (fallbackPicked) {
      const k = normalizeExerciseName(fallbackPicked.name);
      if (k) usedNorm.add(k);
      if (slot.tier === 1 || slot.tier === 2) {
        const mp = movementPatternKeyForSelection(fallbackPicked.name, slot.role);
        if (mp) selectedMovementPatternsTier12.add(mp);
      }
      const { score, reasonCodes } = scoreCandidate({
        runtime,
        constraints,
        slot,
        ex: fallbackPicked,
        usedNorm: new Set<string>(), // avoid "duplicate_in_workout" for fallback (we already enforced)
        recentNorm,
        substitutionBoosts: undefined,
        selectedMovementPatternsTier12,
      });
      out.push({
        tier: slot.tier,
        role: slot.role,
        exerciseId: fallbackPicked.id || undefined,
        exercise: fallbackPicked.name,
        primaryMuscle: primaryMuscleForExercise(fallbackPicked),
        movementPattern: slot.movementPattern,
        selectionScore: score,
        reasonCodes: ["fallback_slot_pool", ...reasonCodes],
      });
      addTrace(runtime, {
        engine: "ExerciseSelectionEngine",
        entity: fallbackPicked.name,
        decision: "selected_fallback",
        reasons: ["fallback_slot_pool", ...reasonCodes, `role_${slot.role}`, `tier_${slot.tier}`],
        score,
      });
      continue;
    }

    // Skip slot if we truly cannot fill it.
    excluded.push({ role: slot.role, candidate: "—", reasonCodes: ["no_candidate"] });
    addTrace(runtime, {
      engine: "ExerciseSelectionEngine",
      entity: slot.role,
      decision: "skipped_slot",
      reasons: ["no_candidate", `tier_${slot.tier}`],
    });
  }

  return { split, exercises: out, excluded };
}

