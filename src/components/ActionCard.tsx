import Link from "next/link";
import type { Action } from "@/types";
import { Card } from "./ui/Card";

function statusLabel(s: Action["status"]): string {
  switch (s) {
    case "planned":
      return "Planned";
    case "done":
      return "Done";
    case "partial":
      return "Partial";
    case "skipped":
      return "Skipped";
  }
}

export function ActionCard({ action }: { action: Action }) {
  const preview =
    action.type === "workout" && action.executionItems?.length
      ? action.executionItems.slice(0, 5)
      : [];

  return (
    <Link href={`/action/${action.id}`} className="block active:opacity-90">
      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-lg font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
            {action.title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              {action.type}
            </span>
            <span className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium dark:border-neutral-700">
              {statusLabel(action.status)}
            </span>
          </div>
        </div>

        {preview.length > 0 ? (
          <ul className="space-y-1.5 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
            {preview.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-neutral-800 dark:text-neutral-200"
              >
                <span className="min-w-0 flex-1 font-medium leading-snug">
                  {row.label}
                </span>
                <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
                  {row.plannedValue}
                </span>
              </li>
            ))}
            {action.executionItems.length > preview.length ? (
              <li className="text-xs text-neutral-500 dark:text-neutral-500">
                +{action.executionItems.length - preview.length} more…
              </li>
            ) : null}
          </ul>
        ) : null}

        <span className="flex min-h-[52px] w-full items-center justify-center rounded-lg bg-neutral-900 text-base font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
          Open execution block
        </span>
      </Card>
    </Link>
  );
}
