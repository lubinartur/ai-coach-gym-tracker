import type { ExerciseDecision } from "@/types/aiCoach";

export function inferDecisionFromReason(reason: string): ExerciseDecision {
  const l = reason.toLowerCase();
  if (
    /reduce|deload|lighter|back\s*off|ease\s*off|drop|lower\s*weight|fatigue/i.test(
      l,
    )
  ) {
    return "reduce";
  }
  if (
    /technique|tempo|pause|form|slow|quality|rpe\s*\d{1,2}.*easy/i.test(l)
  ) {
    return "technique";
  }
  if (/more sets|extra set|volume|add sets|accumulat/i.test(l)) {
    return "volume";
  }
  if (
    /maintain|hold|keep|same\s*weight|no progression|hold steady/i.test(l)
  ) {
    return "maintain";
  }
  if (/[+]\s*\d|increase|heavier|bump|progress|add weight/i.test(l)) {
    return "increase";
  }
  return "increase";
}
