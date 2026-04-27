import { notFound } from "next/navigation";
import { AiTracesDevView } from "@/components/dev/AiTracesDevView";

/** Per-request `NODE_ENV` check (avoids prerendering this in production at build time). */
export const dynamic = "force-dynamic";

/**
 * Development-only: inspect persisted `aiDecisionTraces` in Dexie.
 * In production, this route returns 404.
 */
export default function DevAiTracesPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <AiTracesDevView />;
}
