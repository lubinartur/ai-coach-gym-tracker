"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/LocaleContext";
import type { AppLanguage } from "@/i18n/language";
import { parseAppLanguage } from "@/i18n/language";
import {
  formatEquipmentLabel,
  formatExperienceLabel,
  formatTrainingGoalLabel,
} from "@/lib/athleteProfileLabels";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { clearAllWorkoutSessions } from "@/db/workoutSessions";
import { useAthleteProfile } from "@/hooks/useAthleteProfile";
import { useSettings } from "@/hooks/useSettings";
import type { ActionType, PlanningStyle, UserSettings } from "@/types";
import type { AthleteProfile } from "@/types/athleteProfile";
import type { TrainingPhase } from "@/types/training";

const planningOptions = [
  { value: "light", label: "Light" },
  { value: "normal", label: "Normal" },
  { value: "intense", label: "Intense" },
] as const;

const phaseOptions: { value: TrainingPhase; label: string }[] = [
  { value: "natural", label: "Natural" },
  { value: "on_cycle", label: "On cycle" },
  { value: "post_cycle", label: "Post cycle" },
];

const allTypes: ActionType[] = ["workout", "run", "reading", "project"];

const profileLinkClass =
  "flex min-h-11 w-full items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-center text-base font-medium text-neutral-200 transition active:opacity-90";

const languageOptions: { value: AppLanguage; key: "lang_en" | "lang_ru" }[] = [
  { value: "en", key: "lang_en" },
  { value: "ru", key: "lang_ru" },
];

export function SettingsView() {
  const { t, setLocale } = useI18n();
  const { settings, loading: stLoading, saving: stSaving, error: stError, save } =
    useSettings();
  const {
    profile,
    loading: apLoading,
    saving: apSaving,
    error: apError,
    save: saveAthlete,
  } = useAthleteProfile();
  const [overrides, setOverrides] = useState<Partial<UserSettings>>({});
  const [athleteOverrides, setAthleteOverrides] = useState<
    Partial<AthleteProfile>
  >({});

  const [clearingWorkouts, setClearingWorkouts] = useState(false);
  const [workoutClearFeedback, setWorkoutClearFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const loading = stLoading || apLoading;
  const saving = stSaving || apSaving;
  const error = stError ?? apError;

  if (loading || !settings || !profile) {
    return (
      <main>
        <p className="text-sm text-neutral-500">{t("loading_settings")}</p>
      </main>
    );
  }

  const merged: UserSettings = {
    ...settings,
    defaultRestSec: settings.defaultRestSec ?? 90,
    language: settings.language ?? "en",
    ...overrides,
  };
  const preferred = merged.preferredActionTypes;
  const mergedAthlete: AthleteProfile = { ...profile, ...athleteOverrides };

  function toggleType(t: ActionType) {
    const set = new Set(preferred);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    const next = allTypes.filter((x) => set.has(x));
    setOverrides((o) => ({
      ...o,
      preferredActionTypes: next.length ? next : ["workout"],
    }));
  }

  return (
    <main className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Life Execution Panel
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          {t("settings_title")}
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {t("settings_subtitle")}
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-8"
        onSubmit={async (e) => {
          e.preventDefault();
          await save({
            userName: merged.userName,
            timezone: merged.timezone,
            planningStyle: merged.planningStyle,
            preferredActionTypes: merged.preferredActionTypes,
            backendUrl: merged.backendUrl?.trim() || undefined,
            defaultRestSec:
              typeof merged.defaultRestSec === "number" &&
              merged.defaultRestSec > 0 &&
              Number.isFinite(merged.defaultRestSec)
                ? Math.round(merged.defaultRestSec)
                : 90,
            language: parseAppLanguage(merged.language),
          });
          await saveAthlete({
            phase: mergedAthlete.phase,
            offCycleDate: mergedAthlete.offCycleDate,
            notes: mergedAthlete.notes,
            recoveryCapacity: mergedAthlete.recoveryCapacity ?? "normal",
          });
          setOverrides({});
          setAthleteOverrides({});
        }}
      >
        <section className="flex flex-col gap-5">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("general_section")}
          </h2>
          <Select
            label={t("settings_language")}
            options={languageOptions.map((o) => ({
              value: o.value,
              label: t(o.key),
            }))}
            value={parseAppLanguage(merged.language)}
            onChange={(e) => {
              const v = parseAppLanguage(e.target.value);
              setOverrides((o) => ({ ...o, language: v }));
              setLocale(v);
            }}
          />
          <TextField
            label="Display name"
            value={merged.userName ?? ""}
            placeholder="Optional"
            onChange={(e) =>
              setOverrides((o) => ({ ...o, userName: e.target.value }))
            }
          />
          <TextField
            label="Timezone (IANA)"
            value={merged.timezone}
            onChange={(e) =>
              setOverrides((o) => ({ ...o, timezone: e.target.value }))
            }
          />
          <TextField
            label="Default rest between sets (seconds)"
            inputMode="numeric"
            value={String(merged.defaultRestSec ?? 90)}
            placeholder="90"
            onChange={(e) => {
              const raw = e.target.value.trim();
              const n = parseInt(raw, 10);
              setOverrides((o) => ({
                ...o,
                defaultRestSec:
                  raw === "" || !Number.isFinite(n) || n <= 0 ? 90 : n,
              }));
            }}
          />
          <Select
            label="Planning style"
            options={[...planningOptions]}
            value={merged.planningStyle}
            onChange={(e) =>
              setOverrides((o) => ({
                ...o,
                planningStyle: e.target.value as PlanningStyle,
              }))
            }
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Preferred action types
            </span>
            <div className="grid grid-cols-2 gap-2">
              {allTypes.map((t) => {
                const on = preferred.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`min-h-[48px] rounded-lg border text-sm font-semibold capitalize ${
                      on
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                        : "border-neutral-300 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Athlete profile
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Used for AI workout suggestions. Edit anytime.
          </p>
          <Select
            label={t("recovery_capacity_label")}
            options={[
              { value: "normal", label: t("recovery_capacity_normal") },
              { value: "high", label: t("recovery_capacity_high") },
            ]}
            value={mergedAthlete.recoveryCapacity ?? "normal"}
            onChange={(e) =>
              setAthleteOverrides((o) => ({
                ...o,
                recoveryCapacity: e.target.value as "normal" | "high",
              }))
            }
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("recovery_capacity_hint")}
          </p>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-3 text-sm text-neutral-300">
            <p>Goal: {formatTrainingGoalLabel(mergedAthlete.goal)}</p>
            <p className="mt-1">
              Experience: {formatExperienceLabel(mergedAthlete.experience)}
            </p>
            <p className="mt-1">
              Training:{" "}
              {typeof mergedAthlete.trainingDaysPerWeek === "number"
                ? `${mergedAthlete.trainingDaysPerWeek}${
                    mergedAthlete.trainingDaysPerWeek === 5 ? "+" : ""
                  } days / week`
                : "—"}
            </p>
            <p className="mt-1">
              Equipment: {formatEquipmentLabel(mergedAthlete.equipment)}
            </p>
          </div>
          <Link href="/onboarding?edit=true" className={profileLinkClass}>
            Edit profile
          </Link>
        </section>

        <section className="flex flex-col gap-5 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Training context
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Used when generating daily plans: PCT and notes inform the
              template-based planner.
            </p>
          </div>
          <Select
            label="Training phase"
            options={phaseOptions.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            value={mergedAthlete.phase ?? "natural"}
            onChange={(e) =>
              setAthleteOverrides((o) => ({
                ...o,
                phase: e.target.value as TrainingPhase,
              }))
            }
          />
          <TextField
            label="Off-cycle date (optional)"
            type="date"
            value={mergedAthlete.offCycleDate ?? ""}
            onChange={(e) =>
              setAthleteOverrides((o) => ({
                ...o,
                offCycleDate: e.target.value || undefined,
              }))
            }
          />
          <TextArea
            label="Notes (optional)"
            value={mergedAthlete.notes ?? ""}
            placeholder="e.g. avoid aggressive progression for several weeks"
            onChange={(e) =>
              setAthleteOverrides((o) => ({ ...o, notes: e.target.value }))
            }
          />
        </section>

        <section className="flex flex-col gap-5 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            API
          </h2>
          <TextField
            label="Backend base URL (optional)"
            placeholder="https://your-api.example.com"
            value={merged.backendUrl ?? ""}
            onChange={(e) =>
              setOverrides((o) => ({ ...o, backendUrl: e.target.value }))
            }
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            When set, plan generation POSTs to{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5 text-[11px] dark:bg-neutral-900">
              {"{base}"}/api/generate-plan
            </code>
            . Leave empty to use this app&apos;s Next route.
          </p>
        </section>

        <Button type="submit" disabled={saving} className="!min-h-[52px]">
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <section className="mt-2 flex flex-col gap-3 rounded-xl border-2 border-red-600/40 bg-red-500/[0.04] p-4 dark:border-red-500/50 dark:bg-red-950/20">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">
          Danger zone
        </h2>
        <p className="text-sm text-red-800/90 dark:text-red-200/90">
          Permanently removes all saved workout sessions on this device. Exercises
          (including favorites) and app settings are not changed.
        </p>
        <button
          type="button"
          disabled={clearingWorkouts}
          onClick={async () => {
            if (
              !window.confirm(
                "Delete all workout history on this device? This cannot be undone.",
              )
            ) {
              return;
            }
            setWorkoutClearFeedback(null);
            setClearingWorkouts(true);
            try {
              await clearAllWorkoutSessions();
              setWorkoutClearFeedback({
                ok: true,
                text: "Workout history cleared. Progress will show 0 workouts and exercise stats reset to none.",
              });
            } catch {
              setWorkoutClearFeedback({
                ok: false,
                text: "Could not clear workout history. Try again.",
              });
            } finally {
              setClearingWorkouts(false);
            }
          }}
          className="w-full min-h-11 rounded-xl border-2 border-red-600 bg-transparent px-4 py-2.5 text-sm font-medium text-red-600 transition active:opacity-80 disabled:opacity-50 dark:border-red-500 dark:text-red-400"
        >
          {clearingWorkouts ? "Clearing…" : "Clear workout history"}
        </button>
        {workoutClearFeedback ? (
          <p
            className={
              workoutClearFeedback.ok
                ? "text-sm text-emerald-800 dark:text-emerald-200/90"
                : "text-sm text-red-800 dark:text-red-200/90"
            }
          >
            {workoutClearFeedback.text}
          </p>
        ) : null}
      </section>
    </main>
  );
}
