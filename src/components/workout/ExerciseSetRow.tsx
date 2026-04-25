"use client";

import type { WorkoutSession } from "@/types/trainingDiary";

type SetT = WorkoutSession["exercises"][number]["sets"][number];

const inputSet =
  "min-h-[44px] w-full min-w-0 max-w-[6rem] rounded-xl " +
  "bg-neutral-950/60 px-2.5 py-2 text-right text-lg font-medium tabular-nums " +
  "text-neutral-100 outline-none ring-1 ring-inset ring-neutral-800 " +
  "focus:ring-purple-500/50 " +
  "placeholder:text-neutral-600 [color-scheme:dark]";

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
  const done = set.isDone === true;

  return (
    <div
      className={`rounded-xl bg-neutral-900 px-4 py-3 ${
        done ? "ring-1 ring-emerald-500/35" : ""
      }`}
      data-set-row
    >
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-neutral-500">
          Set {index1}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-[8.5rem]">
          <span className="sr-only" id={`${weightInputId}-lb`}>
            Weight (kg)
          </span>
          <input
            id={weightInputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={inputSet + " w-full"}
            aria-labelledby={`${weightInputId}-lb`}
            value={set.weight === 0 ? "" : String(set.weight ?? 0)}
            onChange={(e) => onChangeWeight(Number(e.target.value || 0))}
            placeholder="0"
          />
          <span
            className="shrink-0 text-sm text-neutral-500"
            aria-hidden
          >
            kg
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-[7rem]">
          <span className="sr-only" id={`${repsInputId}-lb`}>
            Reps
          </span>
          <input
            id={repsInputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={inputSet + " w-full max-w-[4.25rem]"}
            aria-labelledby={`${repsInputId}-lb`}
            value={set.reps === 0 ? "" : String(set.reps ?? 0)}
            onChange={(e) => onChangeReps(Number(e.target.value || 0))}
            placeholder="0"
          />
          <span
            className="shrink-0 text-sm text-neutral-500"
            aria-hidden
          >
            reps
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleDone}
          className={`flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border text-base font-semibold transition active:opacity-90 ${
            done
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
              : "border-neutral-700 bg-neutral-950/60 text-neutral-500"
          }`}
          title={done ? "Mark not done" : "Mark done"}
          aria-label={done ? "Mark set not done" : "Mark set done"}
          aria-pressed={done}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex h-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-xl text-neutral-500 transition active:text-red-400/80 sm:ml-0"
          title="Delete set"
          aria-label="Delete set"
        >
          ×
        </button>
      </div>
    </div>
  );
}
