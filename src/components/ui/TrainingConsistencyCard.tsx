import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { ConsistencyStatus } from "@/lib/analytics/consistency";
import type { MessageKey } from "@/i18n/dictionary";

type Props = {
  title: string;
  score: number;
  status: ConsistencyStatus;
  currentStreakWeeks: number;
  daysSinceLastWorkout: number | null;
  workoutsLast7Days: number;
  t: (key: MessageKey) => string;
};

function statusKey(s: ConsistencyStatus): MessageKey {
  switch (s) {
    case "excellent":
      return "progress_consistency_status_excellent";
    case "good":
      return "progress_consistency_status_good";
    case "moderate":
      return "progress_consistency_status_moderate";
    case "low":
    default:
      return "progress_consistency_status_low";
  }
}

export function TrainingConsistencyCard({
  title,
  score,
  status,
  currentStreakWeeks,
  daysSinceLastWorkout,
  workoutsLast7Days,
  t,
}: Props) {
  const scoreTone =
    score >= 90 ? "text-[#A855F7]" : score >= 80 ? "text-[#22C55E]" : score >= 70 ? "text-[#F59E0B]" : "text-[#EF4444]";
  return (
    <section className="min-w-0 space-y-2">
      <SectionHeader title={title} />
      <Card className="!p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">
              {t("progress_consistency_score_label")}
            </p>
            <p className={"mt-1 text-3xl font-bold tabular-nums " + scoreTone}>
              {score}
              <span className="ml-0.5 text-lg font-semibold text-[#9CA3AF]">/100</span>
            </p>
            <p className="mt-1.5 text-sm font-semibold text-[#D4D4D4]">
              {t(statusKey(status))}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[14px] border border-[#2A2A2A] bg-[#222222] px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {t("progress_consistency_workouts_7d_label")}
            </dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-[#FFFFFF]">
              {workoutsLast7Days}
            </dd>
          </div>
          <div className="rounded-[14px] border border-[#2A2A2A] bg-[#222222] px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {t("progress_consistency_streak_label")}
            </dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-[#FFFFFF]">
              {t("progress_consistency_streak_value").replace(
                "{{n}}",
                String(currentStreakWeeks),
              )}
            </dd>
          </div>
          <div className="rounded-[14px] border border-[#2A2A2A] bg-[#222222] px-3 py-2.5 sm:col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              {t("progress_consistency_days_since_label")}
            </dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-[#FFFFFF]">
              {daysSinceLastWorkout == null
                ? t("em_dash")
                : daysSinceLastWorkout === 0
                  ? t("progress_consistency_days_since_today")
                  : t("progress_consistency_days_since_value").replace(
                      "{{n}}",
                      String(daysSinceLastWorkout),
                    )}
            </dd>
          </div>
        </dl>
      </Card>
    </section>
  );
}
