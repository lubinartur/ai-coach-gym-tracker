"use client";

import { ActionCard } from "@/components/ActionCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/Button";
import { useTodayPlan } from "@/hooks/useTodayPlan";

function formatHeaderDate(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function TodayView() {
  const { date, plan, actions, loading, generating, error, generate } =
    useTodayPlan();

  return (
    <main className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Life Execution Panel
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Today
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {loading ? "Loading calendar…" : formatHeaderDate(date)}
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <Button
          onClick={() => void generate()}
          disabled={loading || generating}
          className="!min-h-[52px]"
        >
          {generating ? "Generating…" : "Generate today plan"}
        </Button>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Plan → do → log → learn → next plan. History informs the next generation
          once the server model is connected.
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading today&apos;s panel…</p>
      ) : !plan || actions.length === 0 ? (
        <EmptyState
          title="No plan for today"
          body="Generate a plan to see concrete execution blocks. Each block is meant to be run, not checked off."
        />
      ) : (
        <section className="flex flex-col gap-4">
          {plan.note ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
              {plan.note}
            </div>
          ) : null}
          <div className="flex flex-col gap-3">
            {actions.map((a) => (
              <ActionCard key={a.id} action={a} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
