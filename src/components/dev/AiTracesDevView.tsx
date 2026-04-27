"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  clearAiDecisionTraces,
  listAiDecisionTraces,
  type AiDecisionTraceRow,
} from "@/db/aiDecisionTrace";
import { useI18n } from "@/i18n/LocaleContext";

function formatWhen(ms: number, locale: string): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function boolCell(v: boolean): string {
  return v ? "yes" : "no";
}

export function AiTracesDevView() {
  const { locale } = useI18n();
  const loc = locale === "ru" ? "ru-RU" : "en-US";
  const [rows, setRows] = useState<AiDecisionTraceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AiDecisionTraceRow | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAiDecisionTraces(100);
      setRows(list);
      setSelected((cur) => {
        if (list.length === 0) return null;
        if (cur && list.some((r) => r.id === cur.id)) return cur;
        return list[0] ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onClear = async () => {
    if (
      !window.confirm(
        "Clear all AI decision traces from this device? This cannot be undone.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await clearAiDecisionTraces();
      setSelected(null);
      await load();
    } finally {
      setClearing(false);
    }
  };

  return (
    <main className="mx-auto w-full min-w-0 max-w-full space-y-4 pb-32">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-500/90">
          Development only
        </p>
        <h1 className="text-2xl font-bold leading-tight text-neutral-50">AI decision traces</h1>
        <p className="text-sm text-neutral-500">
          Local Dexie table <code className="text-xs text-neutral-400">aiDecisionTraces</code> (
          {rows.length} rows)
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 active:opacity-90 disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={clearing || rows.length === 0}
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200/95 active:opacity-90 disabled:opacity-50"
        >
          Clear traces
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="!p-5">
          <p className="text-sm text-neutral-400">No traces yet. Run a suggest-next in dev to record.</p>
        </Card>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="!p-0 overflow-hidden">
            <div className="max-h-[min(60vh,480px)] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950/60 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2 pl-4">Trace ID</th>
                    <th className="px-2 py-2">Created</th>
                    <th className="px-2 py-2">Mode</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Split</th>
                    <th className="px-3 py-2 pr-4">QC</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isSel = selected?.id === r.id;
                    return (
                      <tr
                        key={r.id}
                        className={
                          "cursor-pointer border-b border-neutral-800/80 last:border-0 " +
                          (isSel
                            ? "bg-violet-500/15"
                            : "hover:bg-neutral-900/60 active:bg-neutral-900/80")
                        }
                        onClick={() => setSelected(r)}
                      >
                        <td className="max-w-[120px] truncate px-3 py-2 pl-4 font-mono text-xs text-neutral-300">
                          {r.id}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-neutral-400">
                          {formatWhen(r.createdAt, loc)}
                        </td>
                        <td className="px-2 py-2 text-neutral-200">{r.mode}</td>
                        <td className="max-w-[100px] truncate px-2 py-2 text-neutral-300">
                          {r.generationSource}
                        </td>
                        <td className="max-w-[100px] truncate px-2 py-2 text-neutral-300">
                          {r.split || "—"}
                        </td>
                        <td className="px-3 py-2 pr-4 text-neutral-300">
                          {r.qualityCheckPassed ? (
                            <span className="text-emerald-400/90">pass</span>
                          ) : (
                            <span className="text-amber-400/90">fail</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="min-w-0 space-y-2">
            <SectionHeader title="Detail" />
            {selected ? (
              <Card className="!p-4">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Trace ID
                    </dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-neutral-200">
                      {selected.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      strengthCalibrationUsed
                    </dt>
                    <dd className="mt-0.5 text-neutral-200">
                      {boolCell(selected.strengthCalibrationUsed)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      payloadHasCalibration
                    </dt>
                    <dd className="mt-0.5 text-neutral-200">
                      {boolCell(selected.payloadHasCalibration)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      decisionContextHasCalibration
                    </dt>
                    <dd className="mt-0.5 text-neutral-200">
                      {boolCell(selected.decisionContextHasCalibration)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Exercise names
                    </dt>
                    <dd className="mt-0.5">
                      {selected.exerciseNames.length === 0 ? (
                        <span className="text-neutral-500">—</span>
                      ) : (
                        <ul className="list-inside list-disc text-neutral-200">
                          {selected.exerciseNames.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Load sources
                    </dt>
                    <dd className="mt-0.5">
                      {selected.exerciseLoadSources.length === 0 ? (
                        <span className="text-neutral-500">—</span>
                      ) : (
                        <ul className="space-y-1.5 text-neutral-200">
                          {selected.exerciseLoadSources.map((e, i) => (
                            <li
                              key={`${e.exercise}-${i}`}
                              className="break-words border-b border-neutral-800/50 pb-1.5 last:border-0"
                            >
                              <span className="font-medium text-neutral-100">{e.exercise}</span>
                              <span className="text-neutral-500"> · </span>
                              <code className="text-xs text-violet-300/90">{e.source}</code>
                              {typeof e.finalWeight === "number" ? (
                                <span className="text-neutral-500">
                                  {" "}
                                  ({e.finalWeight} kg)
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>
            ) : (
              <Card className="!p-4">
                <p className="text-sm text-neutral-500">Select a row to inspect.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
