"use client";

import { ActionCard } from "@/components/ActionCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/Button";
import { useTodayPlan } from "@/hooks/useTodayPlan";
import { useI18n } from "@/i18n/LocaleContext";

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
  const { t } = useI18n();
  const { date, plan, actions, loading, generating, error, generate } =
    useTodayPlan();

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col space-y-6 pb-32">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("life_panel_brand")}
        </p>
        <h1 className="text-[28px] font-bold leading-tight text-neutral-50">
          {t("today")}
        </h1>
        <p className="text-sm text-neutral-500">
          {loading ? t("today_loading_calendar") : formatHeaderDate(date)}
        </p>
      </header>

      {error ? (
        <p className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <Button
          onClick={() => void generate()}
          disabled={loading || generating}
          className="!min-h-[52px]"
        >
          {generating ? t("generating") : t("today_generate_plan")}
        </Button>
        <p className="text-xs text-neutral-500">
          {t("today_hint")}
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("today_loading_panel")}</p>
      ) : !plan || actions.length === 0 ? (
        <EmptyState
          title={t("today_empty_title")}
          body={t("today_empty_body")}
        />
      ) : (
        <section className="flex flex-col gap-4">
          {plan.note ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-4 text-sm text-neutral-200">
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
