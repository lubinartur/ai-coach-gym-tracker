"use client";

import { HistoryView } from "@/components/pages/HistoryView";

/** Progress screen: analytics-first (history list is hidden). */
export function ProgressView() {
  return <HistoryView mode="progress" />;
}

