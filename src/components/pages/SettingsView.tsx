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
  { value: "light", labelKey: "planning_light" },
  { value: "normal", labelKey: "planning_normal" },
  { value: "intense", labelKey: "planning_intense" },
] as const;

const phaseOptions: { value: TrainingPhase; labelKey: "phase_natural" | "phase_on_cycle" | "phase_post_cycle" }[] = [
  { value: "natural", labelKey: "phase_natural" },
  { value: "on_cycle", labelKey: "phase_on_cycle" },
  { value: "post_cycle", labelKey: "phase_post_cycle" },
];

const allTypes: ActionType[] = ["workout", "run", "reading", "project"];

const profileLinkClass =
  "flex min-h-11 w-full items-center justify-center rounded-2xl border border-neutral-800/90 bg-neutral-950/60 py-3 text-center text-base font-medium text-neutral-200 shadow-sm transition hover:border-neutral-600/50 active:opacity-90";

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
      <main className="mx-auto flex min-h-[30vh] w-full min-w-0 max-w-full flex-col justify-center pb-32">
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
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col space-y-6 pb-32">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("life_panel_brand")}
        </p>
        <h1 className="text-[28px] font-bold leading-tight text-neutral-50">
          {t("settings_title")}
        </h1>
        <p className="text-sm text-neutral-500">
          {t("settings_subtitle")}
        </p>
      </header>

      {error ? (
        <p className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
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
            label={t("settings_display_name")}
            value={merged.userName ?? ""}
            placeholder={t("optional")}
            onChange={(e) =>
              setOverrides((o) => ({ ...o, userName: e.target.value }))
            }
          />
          <TextField
            label={t("settings_timezone")}
            value={merged.timezone}
            onChange={(e) =>
              setOverrides((o) => ({ ...o, timezone: e.target.value }))
            }
          />
          <TextField
            label={t("settings_default_rest")}
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
            label={t("settings_planning_style")}
            options={planningOptions.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            value={merged.planningStyle}
            onChange={(e) =>
              setOverrides((o) => ({
                ...o,
                planningStyle: e.target.value as PlanningStyle,
              }))
            }
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-neutral-200">
              {t("settings_preferred_action_types")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {allTypes.map((t) => {
                const on = preferred.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`min-h-[48px] rounded-2xl border text-sm font-semibold capitalize ${
                      on
                        ? "border-violet-500/50 bg-violet-500/15 text-neutral-100"
                        : "border-neutral-800 bg-neutral-950/40 text-neutral-300 active:opacity-90"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-neutral-800 pt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Athlete profile
          </h2>
          <p className="text-sm text-neutral-500">
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
          <p className="text-xs text-neutral-500">
            {t("recovery_capacity_hint")}
          </p>
          <div className="rounded-2xl border border-neutral-800/90 bg-neutral-950/50 px-4 py-3 text-sm text-neutral-300">
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

        <section className="flex flex-col gap-5 border-t border-neutral-800 pt-8">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Training context
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Used when generating daily plans: PCT and notes inform the
              template-based planner.
            </p>
          </div>
          <Select
            label={t("training_phase")}
            options={phaseOptions.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
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
            label={t("off_cycle_date_optional")}
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
            label={t("athlete_notes_optional")}
            value={mergedAthlete.notes ?? ""}
            placeholder="e.g. avoid aggressive progression for several weeks"
            onChange={(e) =>
              setAthleteOverrides((o) => ({ ...o, notes: e.target.value }))
            }
          />
        </section>

        <section className="flex flex-col gap-5 border-t border-neutral-800 pt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("settings_api_section")}
          </h2>
          <TextField
            label={t("backend_base_url_optional")}
            placeholder="https://your-api.example.com"
            value={merged.backendUrl ?? ""}
            onChange={(e) =>
              setOverrides((o) => ({ ...o, backendUrl: e.target.value }))
            }
          />
          <p className="text-xs text-neutral-500">
            {t("backend_base_url_help_prefix")}{" "}
            <code className="rounded-md border border-neutral-800 bg-neutral-950/80 px-1.5 py-0.5 text-[11px] text-neutral-300">
              {"{base}"}/api/generate-plan
            </code>
            . {t("backend_base_url_help_suffix")}
          </p>
        </section>

        <Button type="submit" disabled={saving} className="!min-h-[52px]">
          {saving ? t("saving") : t("save_settings")}
        </Button>
      </form>

      <section className="mt-2 flex flex-col gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-red-300/90">
          {t("danger_zone")}
        </h2>
        <p className="text-sm text-red-200/90">
          {t("danger_zone_clear_workouts_body")}
        </p>
        <button
          type="button"
          disabled={clearingWorkouts}
          onClick={async () => {
            if (
              !window.confirm(
                t("confirm_delete_all_workouts"),
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
                text: t("workout_history_cleared"),
              });
            } catch {
              setWorkoutClearFeedback({
                ok: false,
                text: t("workout_history_clear_failed"),
              });
            } finally {
              setClearingWorkouts(false);
            }
          }}
          className="w-full min-h-11 rounded-2xl border border-red-500/50 bg-red-500/5 px-4 py-2.5 text-sm font-medium text-red-300 transition active:opacity-80 disabled:opacity-50"
        >
          {clearingWorkouts ? t("clearing") : t("clear_workout_history")}
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
