"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useActionDetail } from "@/hooks/useAction";
import type { Action, ActionLog, ExecutionItem, LogStatus } from "@/types";
import {
  persistExecutionActuals,
  saveActionLogAndStatus,
} from "@/services/actionLog";
import {
  bumpLoadInLoadRepsString,
  bumpRepsInLoadRepsString,
  copyPlanned,
} from "@/lib/executionActualText";

const statuses: LogStatus[] = ["done", "partial", "skipped"];

const executionInputClass =
  "min-h-[52px] w-full rounded-lg border px-3 py-3 text-base outline-none transition " +
  "border-neutral-700 bg-neutral-900 text-white caret-white placeholder:text-neutral-500 " +
  "focus:border-neutral-500 focus:ring-2 focus:ring-neutral-600 " +
  "dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:caret-white dark:placeholder:text-neutral-500 " +
  "[color-scheme:dark] autofill:shadow-[inset_0_0_0px_1000px_rgb(23_23_23)] autofill:text-white";

const quickBtnClass =
  "min-h-[44px] rounded-lg border border-neutral-600 bg-neutral-900 px-2 text-sm font-semibold text-white " +
  "active:opacity-90 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white";

function cloneRows(rows: ExecutionItem[]): ExecutionItem[] {
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    plannedValue: r.plannedValue,
    actualValue: r.actualValue,
  }));
}

function actualsSignature(items: ExecutionItem[]): string {
  return items.map((r) => `${r.id}:${(r.actualValue ?? "").trim()}`).join("|");
}

function ActionExecutionForm({
  action,
  latestLog,
}: {
  action: Action;
  latestLog?: ActionLog;
}) {
  const router = useRouter();
  const [executionItems, setExecutionItems] = useState<ExecutionItem[]>(() =>
    cloneRows(action.executionItems),
  );
  const actionRef = useRef(action);
  const itemsRef = useRef(executionItems);
  const lastPersistedActuals = useRef(
    actualsSignature(cloneRows(action.executionItems)),
  );

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  useEffect(() => {
    itemsRef.current = executionItems;
  }, [executionItems]);

  const [status, setStatus] = useState<LogStatus>(
    () => latestLog?.status ?? "done",
  );
  const [resultText, setResultText] = useState(
    () => latestLog?.resultText ?? "",
  );
  const [durationMin, setDurationMin] = useState(() =>
    typeof latestLog?.durationMin === "number"
      ? String(latestLog.durationMin)
      : "",
  );
  const [value, setValue] = useState(() =>
    typeof latestLog?.value === "number" ? String(latestLog.value) : "",
  );
  const [unit, setUnit] = useState(() => latestLog?.unit ?? "");
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5 | undefined>(
    () => latestLog?.energy,
  );
  const [difficulty, setDifficulty] = useState<
    1 | 2 | 3 | 4 | 5 | undefined
  >(() => latestLog?.difficulty);
  const [saving, setSaving] = useState(false);

  async function persistWithItems(next: ExecutionItem[]) {
    const sig = actualsSignature(next);
    if (sig === lastPersistedActuals.current) return;
    await persistExecutionActuals(actionRef.current, next);
    lastPersistedActuals.current = sig;
  }

  function setActual(id: string, actual: string) {
    setExecutionItems((rows) => {
      const next = rows.map((row) =>
        row.id === id
          ? {
              ...row,
              actualValue: actual === "" ? undefined : actual,
            }
          : row,
      );
      queueMicrotask(() => {
        itemsRef.current = next;
        void persistWithItems(next);
      });
      return next;
    });
  }

  function applyQuick(row: ExecutionItem, op: "copy" | "clear" | "rep+" | "rep-" | "kg+" | "kg-") {
    const planned = row.plannedValue;
    const cur = row.actualValue ?? "";
    const base = cur.trim() ? cur : planned;
    let nextText = cur;
    switch (op) {
      case "copy":
        nextText = copyPlanned(planned);
        break;
      case "clear":
        nextText = "";
        break;
      case "rep+":
        nextText = bumpRepsInLoadRepsString(base, 1);
        break;
      case "rep-":
        nextText = bumpRepsInLoadRepsString(base, -1);
        break;
      case "kg+":
        nextText = bumpLoadInLoadRepsString(base, 2.5);
        break;
      case "kg-":
        nextText = bumpLoadInLoadRepsString(base, -2.5);
        break;
    }
    setActual(row.id, nextText);
  }

  async function flushActualsToDexie() {
    await persistWithItems(itemsRef.current);
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await flushActualsToDexie();
          await saveActionLogAndStatus(actionRef.current, {
            status,
            executionItems: itemsRef.current,
            resultText,
            durationMin: durationMin ? Number(durationMin) : undefined,
            value: value ? Number(value) : undefined,
            unit: unit || undefined,
            energy,
            difficulty,
          });
          router.push("/");
        } finally {
          setSaving(false);
        }
      }}
    >
      <section className="flex flex-col gap-4" aria-label="Execution sheet">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Execution sheet
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Planned rows first. Tap quick actions or type actuals after each set.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {executionItems.length === 0 ? (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
              No execution rows for this block. You can still save session
              notes below.
            </p>
          ) : null}
          {executionItems.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-neutral-200 border-l-[4px] border-l-neutral-800 bg-white p-4 dark:border-neutral-700 dark:border-l-neutral-200 dark:bg-neutral-950"
            >
              <h3 className="text-lg font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
                {row.label}
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                <span className="font-medium text-neutral-600 dark:text-neutral-300">
                  planned:
                </span>{" "}
                <span className="text-neutral-900 dark:text-neutral-100">
                  {row.plannedValue}
                </span>
              </p>
              <label className="mt-4 flex flex-col gap-2">
                <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  actual:
                </span>
                <input
                  className={executionInputClass}
                  value={row.actualValue ?? ""}
                  placeholder="e.g. 100×9"
                  autoComplete="off"
                  onChange={(e) => setActual(row.id, e.target.value)}
                  onBlur={() => {
                    void flushActualsToDexie();
                  }}
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  className={quickBtnClass}
                  onClick={() => applyQuick(row, "copy")}
                >
                  Copy planned
                </button>
                <button
                  type="button"
                  className={quickBtnClass}
                  onClick={() => applyQuick(row, "clear")}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className={quickBtnClass}
                  onClick={() => applyQuick(row, "rep+")}
                >
                  +1 rep
                </button>
                <button
                  type="button"
                  className={quickBtnClass}
                  onClick={() => applyQuick(row, "rep-")}
                >
                  −1 rep
                </button>
                <button
                  type="button"
                  className={quickBtnClass}
                  onClick={() => applyQuick(row, "kg+")}
                >
                  +2.5 kg
                </button>
                <button
                  type="button"
                  className={quickBtnClass}
                  onClick={() => applyQuick(row, "kg-")}
                >
                  −2.5 kg
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div
        className="border-t border-neutral-200 dark:border-neutral-800"
        aria-hidden
      />

      <section className="flex flex-col gap-4" aria-label="Session record">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Session record
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Outcome and notes after the sheet above.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Status
          </span>
          <div className="grid grid-cols-1 gap-2">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`min-h-[52px] rounded-lg border text-base font-semibold capitalize ${
                  status === s
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <TextArea
          label="Notes"
          value={resultText}
          onChange={(e) => setResultText(e.target.value)}
          placeholder="Optional context for the whole block."
        />

        <TextField
          label="Duration (minutes)"
          inputMode="numeric"
          value={durationMin}
          onChange={(e) => setDurationMin(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Numeric value (optional)"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <TextField
            label="Unit (optional)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="km, pages, reps…"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Energy (1–5)
          </span>
          <div className="grid grid-cols-5 gap-2">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEnergy((cur) => (cur === n ? undefined : n))}
                className={`min-h-[48px] rounded-lg border text-sm font-semibold ${
                  energy === n
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Difficulty (1–5)
          </span>
          <div className="grid grid-cols-5 gap-2">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() =>
                  setDifficulty((cur) => (cur === n ? undefined : n))
                }
                className={`min-h-[48px] rounded-lg border text-sm font-semibold ${
                  difficulty === n
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Button type="submit" disabled={saving} className="!min-h-[56px] text-lg">
        {saving ? "Saving…" : "Save session"}
      </Button>
    </form>
  );
}

type Props = { id: string };

export function ActionDetailView({ id }: Props) {
  const router = useRouter();
  const { action, latestLog, loading, error } = useActionDetail(id);

  if (loading) {
    return (
      <main>
        <p className="text-sm text-neutral-500">Loading block…</p>
      </main>
    );
  }

  if (!action) {
    return (
      <main className="space-y-4">
        <p className="text-sm text-red-700 dark:text-red-300">
          {error ?? "Missing action."}
        </p>
        <Button variant="ghost" onClick={() => router.push("/")}>
          Back to Today
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          className="!w-auto px-3"
          onClick={() => router.back()}
        >
          ← Back
        </Button>
      </div>

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Execution block
        </p>
        <h1 className="text-2xl font-bold leading-snug text-neutral-900 dark:text-neutral-50">
          {action.title}
        </h1>
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          <span>{action.type}</span>
          <span>·</span>
          <span>{action.status}</span>
        </div>
      </header>

      <section
        className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/40"
        aria-label="Block plan"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Plan
        </h2>
        {action.description ? (
          <p className="mt-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
            {action.description}
          </p>
        ) : (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            No extra plan copy for this block.
          </p>
        )}
        {action.goal ? (
          <p className="mt-3 text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Goal: {action.goal}
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <ActionExecutionForm
        key={`${action.id}-${action.updatedAt}`}
        action={action}
        latestLog={latestLog}
      />
    </main>
  );
}
