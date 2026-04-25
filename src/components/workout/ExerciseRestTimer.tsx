"use client";

import { formatMMSS } from "@/lib/formatMMSS";

export type ExerciseRestState =
  | { status: "idle" }
  | { status: "running"; left: number }
  | { status: "complete" };

type Props = {
  state: ExerciseRestState;
  onAdd30: () => void;
  onSub30: () => void;
  onStop: () => void;
};

export function ExerciseRestTimer({ state, onAdd30, onSub30, onStop }: Props) {
  if (state.status === "idle") return null;

  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-900/90 px-4 py-3"
      role="status"
      aria-live="polite"
    >
      {state.status === "running" ? (
        <p className="text-center text-lg font-medium tabular-nums text-neutral-100">
          Rest {formatMMSS(state.left)}
        </p>
      ) : (
        <p className="text-center text-lg font-medium text-emerald-400/90">
          Rest complete
        </p>
      )}

      <div
        className={`mt-3 flex flex-wrap items-center justify-center gap-2 ${
          state.status === "complete" ? "justify-center" : ""
        }`}
      >
        {state.status === "running" ? (
          <>
            <button
              type="button"
              onClick={onSub30}
              className="min-h-[44px] min-w-[4.5rem] rounded-xl border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-200 transition active:bg-neutral-700/80"
            >
              −30 sec
            </button>
            <button
              type="button"
              onClick={onAdd30}
              className="min-h-[44px] min-w-[4.5rem] rounded-xl border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-200 transition active:bg-neutral-700/80"
            >
              +30 sec
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={onStop}
          className="min-h-[44px] rounded-xl border border-neutral-800 bg-transparent px-4 text-sm font-medium text-neutral-400 transition active:bg-neutral-800/50"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
