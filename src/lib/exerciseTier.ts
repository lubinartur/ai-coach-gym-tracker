import { normalizeExerciseName } from "@/lib/exerciseName";

export type ExerciseTier = 1 | 2 | 3;

const TIER1_PATTERNS: RegExp[] = [
  // Chest
  /\bbench press\b/,
  /\bincline dumbbell press\b/,
  /\bmachine chest press\b/,
  /\bcable fly\b|\bcable chest fly\b|\bchest fly\b|\bpec deck\b/,
  // Back
  /\bpull-?up\b|\bassisted pull-?up\b|\bchin-?up\b/,
  /\blat pulldown\b/,
  /\bseated row\b|\bcable row\b|\bchest supported row\b|\bchest-supported row\b|\bbarbell row\b/,
  // Legs
  /\bback squat\b|\bsquat\b/,
  /\bleg press\b/,
  /\bromanian deadlift\b|\brdl\b/,
  /\bhip thrust\b/,
  /\bleg curl\b/,
  /\bleg extension\b/,
  // Shoulders
  /\boverhead press\b/,
  /\bdumbbell shoulder press\b|\bshoulder press\b/,
  /\bdumbbell lateral raise\b|\blateral raise\b/,
  /\brear delt fly\b|\brear deltoid fly\b|\breverse pec deck\b/,
  /\bface pull\b/,
  // Arms
  /\bbarbell curl\b/,
  /\bdumbbell curl\b/,
  /\bincline dumbbell curl\b/,
  /\bhammer curl\b/,
  /\bcable curl\b/,
  /\btricep pushdown\b|\btriceps pushdown\b/,
  /\boverhead tricep extension\b|\boverhead triceps extension\b/,
  /\bclose grip bench press\b|\bclose-grip bench press\b/,
  /\bcable tricep extension\b|\bcable triceps extension\b/,
  // Core
  /\bplank\b/,
  /\bhanging leg raise\b/,
  /\bcable crunch\b/,
  /\bab wheel\b|\bab-?wheel\b/,
];

const TIER2_PATTERNS: RegExp[] = [
  /\bpreacher curl\b/,
  /\bcable lateral raise\b/,
  /\bdumbbell rear delt fly\b/,
  /\bglute bridge\b/,
  /\bhack squat\b/,
  /\bmachine row\b/,
  /\bsmith\b/,
];

const TIER3_PATTERNS: RegExp[] = [
  /\banderson\b/,
  /\bb-?stance\b/,
  /\b21s\b/,
  /\bpartial\b/,
  /\bprotocol\b/,
  /\battachment\b/,
  /\bhandle\b|\bbar attachment\b/,
];

const nichePatterns = [
  "anderson",
  "protocol",
  "21s",
  "partial",
  "behind",
  "attachment",
  "b-stance",
  "anchor",
  "banded",
] as const;

const NICHE_PATTERN_REGEX = new RegExp(
  // Handle both "b-stance" and "b stance".
  `\\b(?:${nichePatterns
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\-/, "[-\\s]?"))
    .join("|")})\\b`,
  "i",
);

export function getExerciseTier(name: string): ExerciseTier {
  const n = normalizeExerciseName(name) || String(name ?? "").trim().toLowerCase();
  if (!n) return 2;
  if (TIER1_PATTERNS.some((r) => r.test(n))) return 1;
  if (TIER3_PATTERNS.some((r) => r.test(n))) return 3;
  if (TIER2_PATTERNS.some((r) => r.test(n))) return 2;
  // Default to 2: acceptable accessory.
  return 2;
}

export function tierSelectionScore(name: string): { tier: ExerciseTier; score: number; reason: string } {
  const tier = getExerciseTier(name);
  if (tier === 1) return { tier, score: 22, reason: "tier1_base" };
  if (tier === 2) return { tier, score: 6, reason: "tier2_accessory" };
  return { tier, score: -70, reason: "tier3_niche" };
}

export function nameSpecificityPenalty(name: string): { score: number; reasonCodes: string[] } {
  const raw = String(name ?? "");
  const reasonCodes: string[] = [];
  let score = 0;

  // Strong penalties for obviously niche patterns.
  if (NICHE_PATTERN_REGEX.test(raw)) {
    score -= 60;
    reasonCodes.push("name_niche_pattern");
  }

  // Prefer simpler names.
  if (raw.length > 40) {
    score -= 26;
    reasonCodes.push("name_very_long");
  } else if (raw.length >= 34) {
    score -= 18;
    reasonCodes.push("name_long");
  }

  // Parenthesized setup/equipment hints tend to be overly specific.
  // Example: "Cable Curl (rope attachment)" / "Row (chest supported)".
  if (/\([^)]{2,}\)/.test(raw)) {
    score -= 22;
    reasonCodes.push("name_parentheses");
  }
  const n = (normalizeExerciseName(raw) || raw.trim().toLowerCase()) ?? "";
  if (/\bvariation\b|\bcomplex\b|\btempo\b|\bpaused\b/.test(n)) {
    score -= 10;
    reasonCodes.push("name_variation");
  }
  if (TIER3_PATTERNS.some((r) => r.test(n))) {
    score -= 22;
    reasonCodes.push("name_niche");
  }
  return { score, reasonCodes };
}

