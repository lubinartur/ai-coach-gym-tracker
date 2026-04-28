"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getOrCreateAthleteProfile, saveAthleteProfile } from "@/db/athleteProfile";
import { getOrCreateSettings } from "@/db/settings";
import type {
  AthleteEquipment,
  AthleteExperience,
  AthleteProfile,
  AthleteTrainingGoal,
} from "@/types/athleteProfile";
import type { AppLanguage } from "@/i18n/language";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator";
import { SelectableCard } from "@/components/onboarding/SelectableCard";
import { StepHeader } from "@/components/onboarding/StepHeader";
import { AiCoachAnalysisCard } from "@/components/onboarding/AiCoachAnalysisCard";
import { buildAiCoachInsight } from "@/lib/onboarding/aiCoachInsight";
import { AI_WORKOUT_DRAFT_KEY, type AiWorkoutDraftPayload } from "@/lib/aiWorkoutDraftStorage";
import { Dumbbell, Flame, Heart, Repeat2, Trophy } from "lucide-react";
import { useI18n } from "@/i18n/LocaleContext";

const MAIN_STEPS = 5;
const GENERATING_STEP = 7;
const READY_STEP = 8;

const goals: {
  value: AthleteTrainingGoal;
  titleKey:
    | "goal_build_muscle"
    | "goal_lose_fat"
    | "goal_recomposition"
    | "goal_strength"
    | "goal_general_fitness";
  subtitleKey:
    | "goal_build_muscle_sub"
    | "goal_lose_fat_sub"
    | "goal_recomposition_sub"
    | "goal_strength_sub"
    | "goal_general_fitness_sub";
}[] = [
  { value: "build_muscle", titleKey: "goal_build_muscle", subtitleKey: "goal_build_muscle_sub" },
  { value: "lose_fat", titleKey: "goal_lose_fat", subtitleKey: "goal_lose_fat_sub" },
  { value: "recomposition", titleKey: "goal_recomposition", subtitleKey: "goal_recomposition_sub" },
  { value: "strength", titleKey: "goal_strength", subtitleKey: "goal_strength_sub" },
  { value: "general_fitness", titleKey: "goal_general_fitness", subtitleKey: "goal_general_fitness_sub" },
];

const experienceOpts: { value: AthleteExperience; labelKey: "level_beginner" | "level_intermediate" | "level_advanced" }[] =
  [
    { value: "beginner", labelKey: "level_beginner" },
    { value: "intermediate", labelKey: "level_intermediate" },
    { value: "advanced", labelKey: "level_advanced" },
  ];

const freqOpts: { value: number; titleKey: string; subtitleKey: "per_week" }[] = [
  { value: 2, titleKey: "freq_2_days", subtitleKey: "per_week" },
  { value: 3, titleKey: "freq_3_days", subtitleKey: "per_week" },
  { value: 4, titleKey: "freq_4_days", subtitleKey: "per_week" },
  { value: 5, titleKey: "freq_5p_days", subtitleKey: "per_week" },
];

const equipmentOpts: { value: AthleteEquipment; titleKey: string; subtitleKey?: string }[] = [
  { value: "commercial_gym", titleKey: "equipment_commercial_gym" },
  { value: "home_gym", titleKey: "equipment_home_gym" },
  { value: "bodyweight", titleKey: "equipment_bodyweight_only" },
];

const limOpts = [
  { id: "lower_back", labelKey: "lim_lower_back" },
  { id: "shoulders", labelKey: "lim_shoulders" },
  { id: "knees", labelKey: "lim_knees" },
  { id: "elbows", labelKey: "lim_elbows" },
  { id: "none", labelKey: "lim_none" },
] as const;

const stickyBarClass =
  "sticky bottom-0 -mx-4 mt-auto border-t border-neutral-900/80 bg-neutral-950/70 px-4 " +
  "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-4 backdrop-blur";

const chipClass = (on: boolean) =>
  [
    "min-h-10 rounded-full border px-3 text-sm font-semibold transition",
    on
      ? "border-violet-500/50 bg-violet-500/15 text-neutral-100"
      : "border-neutral-800/90 bg-neutral-950/60 text-neutral-300 hover:border-neutral-700 active:opacity-90",
  ].join(" ");

export function OnboardingView() {
  const router = useRouter();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const edit = searchParams.get("edit") === "true";
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [lang, setLang] = useState<AppLanguage>("en");
  const [genChecks, setGenChecks] = useState(0);

  const [sex, setSex] = useState<"male" | "female" | "other" | "">("");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [goal, setGoal] = useState<AthleteTrainingGoal | "">("");
  const [experience, setExperience] = useState<AthleteExperience | "">("");
  const [days, setDays] = useState<number | "">("");
  const [equipment, setEquipment] = useState<AthleteEquipment | "">("");
  const [limitations, setLimitations] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const [benchWeight, setBenchWeight] = useState("");
  const [benchReps, setBenchReps] = useState("10");
  const [squatWeight, setSquatWeight] = useState("");
  const [squatReps, setSquatReps] = useState("10");
  const [deadliftWeight, setDeadliftWeight] = useState("");
  const [deadliftReps, setDeadliftReps] = useState("10");
  const [latWeight, setLatWeight] = useState("");
  const [latReps, setLatReps] = useState("");
  const [pressWeight, setPressWeight] = useState("");
  const [pressReps, setPressReps] = useState("");

  const [benchCustomOpen, setBenchCustomOpen] = useState(false);
  const [squatCustomOpen, setSquatCustomOpen] = useState(false);
  const [deadliftCustomOpen, setDeadliftCustomOpen] = useState(false);
  const [prefsTouched, setPrefsTouched] = useState(false);

  const loadLanguage = useCallback(async () => {
    try {
      const s = await getOrCreateSettings();
      setLang(s.language === "ru" ? "ru" : "en");
    } catch {
      setLang("en");
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const p: AthleteProfile = await getOrCreateAthleteProfile();
      if (p.sex) setSex(p.sex);
      if (typeof p.age === "number") setAge(String(p.age));
      if (typeof p.heightCm === "number") setHeightCm(String(p.heightCm));
      if (typeof p.weightKg === "number") setWeightKg(String(p.weightKg));
      if (p.goal) setGoal(p.goal);
      if (p.experience) setExperience(p.experience);
      if (typeof p.trainingDaysPerWeek === "number") setDays(p.trainingDaysPerWeek);
      if (p.equipment) setEquipment(p.equipment);
      if (p.limitations?.length) setLimitations(p.limitations);
      if (p.equipment) setPrefsTouched(true);
      if (p.notes) setNotes(p.notes);
      const sc = p.strengthCalibration;
      if (sc?.benchPress) {
        setBenchWeight(String(sc.benchPress.weight));
        setBenchReps(String(sc.benchPress.reps));
      }
      if (sc?.squatOrLegPress) {
        setSquatWeight(String(sc.squatOrLegPress.weight));
        setSquatReps(String(sc.squatOrLegPress.reps));
      }
      if (sc?.deadliftOrRdl) {
        setDeadliftWeight(String(sc.deadliftOrRdl.weight));
        setDeadliftReps(String(sc.deadliftOrRdl.reps));
      }
      if (sc?.latPulldownOrPullup) {
        setLatWeight(String(sc.latPulldownOrPullup.weight));
        setLatReps(String(sc.latPulldownOrPullup.reps));
      }
      if (sc?.shoulderPress) {
        setPressWeight(String(sc.shoulderPress.weight));
        setPressReps(String(sc.shoulderPress.reps));
      }
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load profile");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadLanguage();
    });
    if (!edit) return;
    queueMicrotask(() => {
      void loadProfile();
    });
  }, [edit, loadLanguage, loadProfile]);

  function toggleLimit(id: string) {
    setPrefsTouched(true);
    if (id === "none") {
      setLimitations([]);
      return;
    }
    setLimitations((prev) => {
      const next = new Set(prev.filter((x) => x !== "none"));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return [...next];
    });
  }

  const limSelected = (id: string) =>
    id === "none" ? limitations.length === 0 : limitations.includes(id);

  const analysisGoalDone = Boolean(goal);
  const analysisTrainingLevelDone = Boolean(experience);
  const analysisTrainingFreqDone = days !== "";
  const analysisEquipmentDone = Boolean(equipment);
  const analysisPrefsDone = prefsTouched;

  const analysisPercent =
    (analysisGoalDone ? 20 : 0) +
    (analysisTrainingLevelDone ? 20 : 0) +
    (analysisTrainingFreqDone ? 20 : 0) +
    (analysisEquipmentDone ? 20 : 0) +
    (analysisPrefsDone ? 20 : 0);

  const coachInsight = buildAiCoachInsight({
    goal: goal || null,
    trainingLevel: experience || null,
    trainingFrequencyDays: days === "" ? null : (days as number),
  });

  const environmentInsight =
    equipment === "commercial_gym"
      ? t("environment_insight_commercial_gym")
      : equipment === "home_gym"
        ? t("environment_insight_home_gym")
        : equipment === "bodyweight"
          ? t("environment_insight_bodyweight")
          : null;

  const uiStep = step <= MAIN_STEPS ? step : MAIN_STEPS;
  const progressStep = Math.max(1, uiStep);

  function goalIcon(goalValue: AthleteTrainingGoal) {
    const cls = "h-4 w-4 text-purple-300";
    return goalValue === "build_muscle" ? (
      <Dumbbell className={cls} strokeWidth={2} />
    ) : goalValue === "lose_fat" ? (
      <Flame className={cls} strokeWidth={2} />
    ) : goalValue === "recomposition" ? (
      <Repeat2 className={cls} strokeWidth={2} />
    ) : goalValue === "strength" ? (
      <Trophy className={cls} strokeWidth={2} />
    ) : (
      <Heart className={cls} strokeWidth={2} />
    );
  }

  const analysisInsight =
    analysisPercent >= 100
      ? t("training_profile_ready")
      : step === 1
        ? !sex
          ? t("analysis_step1_missing_sex")
          : !age.trim() || !heightCm.trim() || !weightKg.trim()
            ? t("analysis_step1_missing_stats")
            : t("analysis_step1_done")
        : step === 2
          ? coachInsight
          : step === 3
            ? coachInsight
            : step === 4
              ? environmentInsight ??
                t("analysis_step4_missing_environment")
              : t("analysis_default");

  useEffect(() => {
    if (step !== GENERATING_STEP) return;
    let cancelled = false;
    const timers: number[] = [];
    queueMicrotask(() => {
      if (cancelled) return;
      setGenChecks(0);
      const schedule = [250, 560, 900, 1250, 1600];
      for (const [idx, ms] of schedule.entries()) {
        timers.push(window.setTimeout(() => setGenChecks(idx + 1), ms));
      }
    });
    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [step]);

  async function finish() {
    setStep(GENERATING_STEP);
    setSaving(true);
    try {
      const startedAt = Date.now();
      const now = new Date().toISOString();
      const ageN = age.trim() ? Math.max(0, Math.round(Number(age))) : undefined;
      const h = heightCm.trim() ? Math.max(0, Number(heightCm)) : undefined;
      const w = weightKg.trim() ? Math.max(0, Number(weightKg)) : undefined;

      const parseEntry = (weight: string, reps: string) => {
        const ww = Number(weight);
        const rr = Number(reps || "10");
        if (!Number.isFinite(ww) || ww <= 0) return undefined;
        if (!Number.isFinite(rr) || rr <= 0) return undefined;
        return { weight: ww, reps: Math.round(rr) };
      };
      const strengthCalibration = {
        benchPress: parseEntry(benchWeight, benchReps),
        squatOrLegPress: parseEntry(squatWeight, squatReps),
        deadliftOrRdl: parseEntry(deadliftWeight, deadliftReps),
        latPulldownOrPullup: parseEntry(latWeight, latReps),
        shoulderPress: parseEntry(pressWeight, pressReps),
      };
      const anyCalibration =
        strengthCalibration.benchPress ||
        strengthCalibration.squatOrLegPress ||
        strengthCalibration.deadliftOrRdl ||
        strengthCalibration.latPulldownOrPullup ||
        strengthCalibration.shoulderPress;

      await saveAthleteProfile({
        sex: sex || undefined,
        age: ageN !== undefined && Number.isFinite(ageN) ? ageN : undefined,
        heightCm: h !== undefined && Number.isFinite(h) ? h : undefined,
        weightKg: w !== undefined && Number.isFinite(w) ? w : undefined,
        goal: goal || undefined,
        experience: experience || undefined,
        trainingDaysPerWeek:
          days === "" ? undefined : (days as number),
        equipment: equipment || undefined,
        limitations: limitations.length ? limitations : undefined,
        notes: notes.trim() || undefined,
        strengthCalibration: anyCalibration ? strengthCalibration : undefined,
        onboardingCompleted: true,
        updatedAt: now,
      });
      const minMs = 1800;
      const elapsed = Date.now() - startedAt;
      if (elapsed < minMs) {
        await new Promise((r) => window.setTimeout(r, minMs - elapsed));
      }
      setStep(READY_STEP);
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await saveAthleteProfile({
        goal: "general_fitness",
        experience: "intermediate",
        trainingDaysPerWeek: 3,
        equipment: "commercial_gym",
        onboardingCompleted: true,
        updatedAt: now,
      });
      router.replace("/");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function buildOnboardingFirstWorkoutDraft(): AiWorkoutDraftPayload {
    const makeSets = (n: number, reps: number) =>
      Array.from({ length: n }, () => ({ weight: 0, reps }));

    const isDefaultCalib =
      goal === "build_muscle" &&
      experience === "intermediate" &&
      days === 4 &&
      equipment === "commercial_gym";

    return isDefaultCalib
      ? {
          title: "Push calibration workout",
          exercises: [
            { name: "Bench press", sets: makeSets(3, 9) }, // 8–10
            { name: "Incline dumbbell press", sets: makeSets(3, 9) }, // 8–10
            { name: "Lat pulldown", sets: makeSets(3, 10) }, // OR seated row
            { name: "Lateral raises", sets: makeSets(2, 12) }, // 12–15
            { name: "Triceps pushdown", sets: makeSets(2, 11) }, // 10–12
            { name: "Cable row", sets: makeSets(2, 11) }, // optional
          ],
        }
      : {
          title: "Calibration workout",
          exercises: [
            { name: "Bench press", sets: makeSets(3, 8) },
            { name: "Seated row", sets: makeSets(3, 10) },
            { name: "Leg press", sets: makeSets(3, 10) },
            { name: "Lateral raises", sets: makeSets(2, 12) },
            { name: "Biceps curl", sets: makeSets(2, 11) },
          ],
        };
  }

  async function startWorkoutFromReadyScreen() {
    if (typeof window === "undefined") return;

    const draft = buildOnboardingFirstWorkoutDraft();

    const existing = sessionStorage.getItem(AI_WORKOUT_DRAFT_KEY);
    if (existing) {
      const resume = window.confirm("Resume your current workout?");
      if (resume) {
        router.replace("/");
        router.refresh();
        return;
      }
      const discard = window.confirm("Discard it and start a new workout?");
      if (!discard) return;
    }

    sessionStorage.setItem(AI_WORKOUT_DRAFT_KEY, JSON.stringify(draft));
    router.replace("/");
    router.refresh();
  }

  if (loadErr) {
    return (
      <main className="mx-auto flex min-h-dvh w-full min-w-0 max-w-full flex-col justify-center py-4">
        <p className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
          {loadErr}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full min-w-0 max-w-full flex-col gap-10 pb-2">
      {step !== 0 && step !== GENERATING_STEP && step !== READY_STEP ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="mt-[1px] inline-flex size-10 items-center justify-center rounded-xl border border-neutral-900 bg-transparent text-neutral-400 transition hover:bg-neutral-900/30 hover:text-neutral-200 active:opacity-90"
                  aria-label={t("back")}
                >
                  <span className="text-lg leading-none" aria-hidden="true">
                    ←
                  </span>
                </button>
              ) : null}

              <div className="min-w-0 flex-1">
                <ProgressIndicator
                  step={progressStep}
                  total={MAIN_STEPS}
                  label={step === 6 ? t("optional") : undefined}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {step === 0 && (
        <section className="space-y-10 pt-6">
          <StepHeader
            title={t("onboarding_intro_title")}
            subtitle={t("onboarding_intro_subtitle")}
          />

          <ul className="space-y-3 text-sm text-neutral-200">
            <li className="flex gap-3">
              <span className="text-neutral-400" aria-hidden="true">
                ✔
              </span>
              <span>{t("onboarding_intro_bullet_goal")}</span>
            </li>
            <li className="flex gap-3">
              <span className="text-neutral-400" aria-hidden="true">
                ✔
              </span>
              <span>{t("onboarding_intro_bullet_level")}</span>
            </li>
            <li className="flex gap-3">
              <span className="text-neutral-400" aria-hidden="true">
                ✔
              </span>
              <span>{t("onboarding_intro_bullet_equipment")}</span>
            </li>
            <li className="flex gap-3">
              <span className="text-neutral-400" aria-hidden="true">
                ✔
              </span>
              <span>{t("onboarding_intro_bullet_strength")}</span>
            </li>
          </ul>

          <p className="text-sm text-neutral-500">{t("onboarding_intro_takes_30s")}</p>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-10">
          <StepHeader title={t("onboarding_profile_title")} />
          <AiCoachAnalysisCard
            key={`${analysisPercent}-${analysisInsight}`}
            percent={analysisPercent}
            insight={analysisInsight}
            showBasedOnLabel={analysisPercent > 0}
            title={t("ai_coach")}
            basedOnLabel={t("based_on_your_answers")}
          />

          <div className="space-y-4">
            <p className="text-sm font-semibold text-neutral-200">{t("onboarding_sex")}</p>
            <div className="space-y-3">
              {(["male", "female", "other"] as const).map((s) => (
                <SelectableCard
                  key={s}
                  title={
                    s === "male" ? t("sex_male") : s === "female" ? t("sex_female") : t("sex_other")
                  }
                  selected={sex === s}
                  onSelect={() => setSex(s)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <TextField
              label={t("onboarding_age")}
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={t("onboarding_years")}
            />
            <TextField
              label={t("onboarding_height_cm")}
              inputMode="decimal"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="cm"
            />
            <TextField
              label={t("onboarding_weight_kg")}
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="kg"
            />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-10">
          <StepHeader title={t("onboarding_goal_title")} />
          <AiCoachAnalysisCard
            key={`${analysisPercent}-${analysisInsight}`}
            percent={analysisPercent}
            insight={analysisInsight}
            showBasedOnLabel={analysisGoalDone}
            title={t("ai_coach")}
            basedOnLabel={t("based_on_your_answers")}
          />
          <div className="space-y-3">
            {goals.map((g) => (
              <SelectableCard
                key={g.value}
                title={t(g.titleKey)}
                subtitle={t(g.subtitleKey)}
                left={
                  <span
                    className="mt-[1px] inline-flex size-9 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/60"
                    aria-hidden="true"
                  >
                    {goalIcon(g.value)}
                  </span>
                }
                selected={goal === g.value}
                onSelect={() => {
                  setGoal(g.value);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-10">
          <StepHeader title={t("onboarding_training_title")} />
          <AiCoachAnalysisCard
            key={`${analysisPercent}-${analysisInsight}`}
            percent={analysisPercent}
            insight={analysisInsight}
            showBasedOnLabel={analysisTrainingLevelDone || analysisTrainingFreqDone}
            title={t("ai_coach")}
            basedOnLabel={t("based_on_your_answers")}
          />

          <div className="space-y-4">
            <p className="text-sm font-semibold text-neutral-200">{t("onboarding_training_level")}</p>
            <div className="space-y-3">
              {experienceOpts.map((e) => (
                <SelectableCard
                  key={e.value}
                  title={t(e.labelKey)}
                  selected={experience === e.value}
                  onSelect={() => setExperience(e.value)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold text-neutral-200">{t("onboarding_training_frequency")}</p>
            <div className="space-y-3">
              {freqOpts.map((f) => (
                <SelectableCard
                  key={f.value}
                  title={t(f.titleKey as never)}
                  subtitle={t(f.subtitleKey as never)}
                  selected={days === f.value}
                  onSelect={() => setDays(f.value)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-10">
          <StepHeader title={t("onboarding_environment_title")} />
          <AiCoachAnalysisCard
            key={`${analysisPercent}-${analysisInsight}`}
            percent={analysisPercent}
            insight={analysisInsight}
            showBasedOnLabel={analysisEquipmentDone}
            title={t("ai_coach")}
            basedOnLabel={t("based_on_your_answers")}
          />

          <div className="space-y-4">
            <p className="text-sm font-semibold text-neutral-200">{t("onboarding_where_train")}</p>
            <div className="space-y-3">
              {equipmentOpts.map((e) => (
                <SelectableCard
                  key={e.value}
                  title={t(e.titleKey as never)}
                  subtitle={e.subtitleKey ? t(e.subtitleKey as never) : undefined}
                  selected={equipment === e.value}
                  onSelect={() => setEquipment(e.value)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold text-neutral-200">
              {t("onboarding_limitations_multiselect")}
            </p>
            <div className="space-y-3">
              {limOpts.map((l) => (
                <SelectableCard
                  key={l.id}
                  title={t(l.labelKey as never)}
                  selected={limSelected(l.id)}
                  onSelect={() => toggleLimit(l.id)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-10">
          <StepHeader
            title={t("onboarding_strength_title_optional")}
            subtitle={
              lang === "ru"
                ? t("onboarding_strength_subtitle")
                : t("onboarding_strength_subtitle")
            }
          />

          <div className="space-y-4">
            <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-neutral-200">{t("lift_bench_press")}</p>
              <p className="mb-3 text-sm text-neutral-500">
                {t("onboarding_strength_helper_10reps")}
              </p>
              {!benchCustomOpen ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[40, 60, 80, 100, 120].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          setBenchWeight(String(w));
                          if (!benchReps) setBenchReps("10");
                        }}
                        className={chipClass(benchWeight === String(w))}
                      >
                        {w} kg
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setBenchCustomOpen(true)}
                    className="min-h-10 text-sm text-neutral-500 transition hover:text-neutral-300"
                  >
                    {t("enter_custom_weight")}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <TextField
                    label={t("set_editor_header_weight_kg")}
                    inputMode="decimal"
                    value={benchWeight}
                    onChange={(e) => {
                      setBenchWeight(e.target.value.replace(/[^\d.]/g, ""));
                      if (!benchReps) setBenchReps("10");
                    }}
                    placeholder="100"
                  />
                  <button
                    type="button"
                    onClick={() => setBenchCustomOpen(false)}
                    className="min-h-10 text-sm text-neutral-500 transition hover:text-neutral-300"
                  >
                    {t("choose_quick_weights")}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-neutral-200">
                {t("lift_squat_or_leg_press")}
              </p>
              <p className="mb-3 text-sm text-neutral-500">
                {lang === "ru"
                  ? "Введи вес, который ты можешь поднять примерно на 10 повторений."
                  : "Enter a weight you can lift for about 10 reps."}
              </p>
              {!squatCustomOpen ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[60, 100, 140, 180, 220].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          setSquatWeight(String(w));
                          if (!squatReps) setSquatReps("10");
                        }}
                        className={chipClass(squatWeight === String(w))}
                      >
                        {w} kg
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSquatCustomOpen(true)}
                    className="min-h-10 text-sm text-neutral-500 transition hover:text-neutral-300"
                  >
                    {t("enter_custom_weight")}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <TextField
                    label={t("set_editor_header_weight_kg")}
                    inputMode="decimal"
                    value={squatWeight}
                    onChange={(e) => {
                      setSquatWeight(e.target.value.replace(/[^\d.]/g, ""));
                      if (!squatReps) setSquatReps("10");
                    }}
                    placeholder="140"
                  />
                  <button
                    type="button"
                    onClick={() => setSquatCustomOpen(false)}
                    className="min-h-10 text-sm text-neutral-500 transition hover:text-neutral-300"
                  >
                    {t("choose_quick_weights")}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-neutral-200">
                {t("lift_deadlift_or_rdl")}
              </p>
              <p className="mb-3 text-sm text-neutral-500">
                {lang === "ru"
                  ? "Введи вес, который ты можешь поднять примерно на 10 повторений."
                  : "Enter a weight you can lift for about 10 reps."}
              </p>
              {!deadliftCustomOpen ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[80, 120, 160, 200, 240].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          setDeadliftWeight(String(w));
                          if (!deadliftReps) setDeadliftReps("10");
                        }}
                        className={chipClass(deadliftWeight === String(w))}
                      >
                        {w} kg
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeadliftCustomOpen(true)}
                    className="min-h-10 text-sm text-neutral-500 transition hover:text-neutral-300"
                  >
                    {t("enter_custom_weight")}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <TextField
                    label={t("set_editor_header_weight_kg")}
                    inputMode="decimal"
                    value={deadliftWeight}
                    onChange={(e) => {
                      setDeadliftWeight(e.target.value.replace(/[^\d.]/g, ""));
                      if (!deadliftReps) setDeadliftReps("10");
                    }}
                    placeholder="160"
                  />
                  <button
                    type="button"
                    onClick={() => setDeadliftCustomOpen(false)}
                    className="min-h-10 text-sm text-neutral-500 transition hover:text-neutral-300"
                  >
                    {t("choose_quick_weights")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {step === 6 && (
        <section className="space-y-10">
          <StepHeader title={t("onboarding_notes_title")} />
          <TextArea
            label={t("onboarding_notes_optional")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("optional")}
            rows={5}
          />
        </section>
      )}

      {step === GENERATING_STEP && (
        <section className="flex flex-1 flex-col justify-center space-y-10 py-10">
          <StepHeader
            title={t("onboarding_generating_title")}
            subtitle={t("onboarding_generating_subtitle")}
          />

          <div className="space-y-4">
            {(
              [
                "Analyzing your goals",
                "Calculating strength baselines",
                "Balancing muscle groups",
                "Optimizing progression",
                "Finalizing your program",
              ] as const
            ).map((label, idx) => {
              const done = genChecks > idx;
              const visible = genChecks > idx;
              if (!visible) return null;
              return (
                <div key={label} className="flex items-start gap-3">
                  <span
                    className={[
                      "mt-[2px] inline-flex size-5 items-center justify-center rounded-full border text-xs",
                      done
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                        : "border-neutral-800 bg-neutral-950/60 text-neutral-500",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {done ? "✓" : "•"}
                  </span>
                  <p
                    className={[
                      "text-sm leading-relaxed transition",
                      done ? "text-neutral-200" : "text-neutral-500",
                    ].join(" ")}
                  >
                    {label}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="h-1 w-full rounded-full bg-neutral-800/70">
              <div
                className="h-1 rounded-full bg-purple-500 transition-[width]"
                style={{
                  width: `${Math.min(100, Math.round((genChecks / 5) * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-neutral-500">
              {saving ? "Generating…" : "Almost ready…"}
            </p>
          </div>
        </section>
      )}

      {step === READY_STEP && (
        <section className="flex flex-1 flex-col justify-center space-y-10 py-10">
          <StepHeader
            title={t("onboarding_ready_title")}
            subtitle={t("onboarding_ready_subtitle")}
          />

          {(() => {
            const preview = buildOnboardingFirstWorkoutDraft();
            const durationMin = preview.exercises.length >= 6 ? 50 : 45;
            return (
              <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-neutral-100">{preview.title}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  {t("estimated_duration")}: {durationMin} {t("minutes")}
                </p>
              </div>
              <div
                className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs font-semibold text-neutral-300"
                aria-hidden="true"
              >
                {t("preview")}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {t("exercises")}
              </p>
              <ul className="mt-2 space-y-2 text-sm text-neutral-200">
                {preview.exercises.map((ex) => (
                  <li key={ex.name}>{ex.name}</li>
                ))}
              </ul>
            </div>
          </div>
            );
          })()}
        </section>
      )}

      <div className={stickyBarClass}>
        <div className="flex flex-col gap-2">
          {step === 0 ? (
            <Button
              type="button"
              onClick={() => setStep(1)}
              className="!min-h-[52px] w-full"
            >
              {t("onboarding_start_setup")}
            </Button>
          ) : step === 5 ? (
            <>
              <Button
                type="button"
                onClick={() => void finish()}
                disabled={saving}
                className="!min-h-[52px] w-full"
              >
                {saving ? t("saving") : t("finish_workout_btn")}
              </Button>
              <button
                type="button"
                onClick={() => setStep(6)}
                className="min-h-11 text-sm text-neutral-500 transition hover:text-neutral-300"
              >
                {t("onboarding_add_notes_optional")}
              </button>
            </>
          ) : step === 6 ? (
            <Button
              type="button"
              onClick={() => void finish()}
              disabled={saving}
              className="!min-h-[52px] w-full"
            >
              {saving ? t("saving") : t("finish_workout_btn")}
            </Button>
          ) : step === GENERATING_STEP ? (
            <Button type="button" disabled className="!min-h-[52px] w-full">
              {t("building")}
            </Button>
          ) : step === READY_STEP ? (
            <>
              <Button
                type="button"
                onClick={() => {
                  if (edit) {
                    router.replace("/settings");
                    router.refresh();
                    return;
                  }
                  void startWorkoutFromReadyScreen();
                }}
                className="!min-h-[52px] w-full"
              >
                {edit ? t("back_to_settings") : t("start_workout_btn")}
              </Button>
              {!edit ? (
                <button
                  type="button"
                  onClick={() => {
                    router.replace("/");
                    router.refresh();
                  }}
                  className="min-h-10 text-sm text-neutral-500 transition hover:text-neutral-300"
                >
                  {t("view_full_program")}
                </button>
              ) : null}
            </>
          ) : (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="!min-h-[52px] w-full"
            >
              {t("next")}
            </Button>
          )}

          {step >= 1 && step <= 4 ? (
            <button
              type="button"
              onClick={() => void skip()}
              disabled={saving}
              className="min-h-10 text-sm text-neutral-500 transition hover:text-neutral-300"
            >
              Skip for now
            </button>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="min-h-11" />
            {step === 6 ? (
              <button
                type="button"
                onClick={() => void finish()}
                disabled={saving}
                className="min-h-11 text-sm text-neutral-500 transition hover:text-neutral-300"
              >
                Skip notes
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
