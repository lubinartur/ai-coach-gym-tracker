"use client";

import type { WorkoutSession } from "@/types/trainingDiary";
import { useI18n } from "@/i18n/LocaleContext";

type SetT = WorkoutSession["exercises"][number]["sets"][number];

const inputSet =
  "min-h-[44px] w-full min-w-0 max-w-[7.5rem] rounded-[14px] " +
  "bg-[#1A1A1A] px-3 py-2 text-center text-lg font-semibold tabular-nums " +
  "text-[#FFFFFF] outline-none ring-1 ring-inset ring-[#2A2A2A] " +
  "focus:ring-[#A855F7]/40 focus:ring-2 " +
  "placeholder:text-[#9CA3AF] [color-scheme:dark]";

const weightInputClass = "min-w-[72px] max-w-[90px]";
const repsInputClass = "min-w-[56px] max-w-[72px]";

const rowGrid =
  "grid items-center gap-2 " +
  "[grid-template-columns:64px_minmax(78px,1fr)_64px_48px_32px]";

type Props = {
  set: SetT;
  index1: number;
  onDelete: () => void;
  onChangeWeight: (v: number) => void;
  onChangeReps: (v: number) => void;
  onToggleDone: () => void;
  weightInputId: string;
  repsInputId: string;
};

export function ExerciseSetRow({
  set,
  index1,
  onDelete,
  onChangeWeight,
  onChangeReps,
  onToggleDone,
  weightInputId,
  repsInputId,
}: Props) {
  const { t } = useI18n();
  const done = set.isDone === true;

  return (
    <div
      className={`rounded-[14px] bg-[#222222] px-3 py-2.5 ${
        done ? "ring-1 ring-[#22C55E]/35" : "ring-1 ring-[#2A2A2A]"
      }`}
      data-set-row
    >
      <div className={rowGrid}>
        <span className="text-sm font-semibold tabular-nums text-[#9CA3AF]">
          {t("set")} {index1}
        </span>
        <div className="min-w-0">
          <span className="sr-only" id={`${weightInputId}-lb`}>
            {t("set_editor_header_weight_kg")}
          </span>
          <input
            id={weightInputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={inputSet + " " + weightInputClass}
            aria-labelledby={`${weightInputId}-lb`}
            value={set.weight === 0 ? "" : String(set.weight ?? 0)}
            onChange={(e) => onChangeWeight(Number(e.target.value || 0))}
            placeholder="0"
          />
        </div>
        <div className="min-w-0">
          <span className="sr-only" id={`${repsInputId}-lb`}>
            {t("reps")}
          </span>
          <input
            id={repsInputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={inputSet + " " + repsInputClass}
            aria-labelledby={`${repsInputId}-lb`}
            value={set.reps === 0 ? "" : String(set.reps ?? 0)}
            onChange={(e) => onChangeReps(Number(e.target.value || 0))}
            placeholder="0"
          />
        </div>
        <button
          type="button"
          onClick={onToggleDone}
          className={`flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border text-base font-semibold transition active:opacity-90 ${
            done
              ? "border-[#22C55E]/50 bg-[rgba(34,197,94,0.15)] text-[#22C55E]"
              : "border-[#2A2A2A] bg-[#1A1A1A] text-[#9CA3AF]"
          }`}
          title={done ? t("mark_not_done") : t("mark_done")}
          aria-label={done ? t("mark_set_not_done") : t("mark_set_done")}
          aria-pressed={done}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-10 min-h-[44px] min-w-[32px] items-center justify-center text-xl text-[#9CA3AF] transition active:text-[#EF4444]/80"
          title={t("delete_set")}
          aria-label={t("delete_set")}
        >
          ×
        </button>
      </div>
    </div>
  );
}
