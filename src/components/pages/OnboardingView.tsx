"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getOrCreateAthleteProfile, saveAthleteProfile } from "@/db/athleteProfile";
import type {
  AthleteEquipment,
  AthleteExperience,
  AthleteProfile,
  AthleteTrainingGoal,
} from "@/types/athleteProfile";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";

const TOTAL_STEPS = 8;

const goals: { value: AthleteTrainingGoal; label: string }[] = [
  { value: "build_muscle", label: "Build muscle" },
  { value: "lose_fat", label: "Lose fat" },
  { value: "recomposition", label: "Recomposition" },
  { value: "strength", label: "Strength" },
  { value: "general_fitness", label: "General fitness" },
];

const experienceOpts: { value: AthleteExperience; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const freqOpts: { value: number; label: string }[] = [
  { value: 2, label: "2 days / week" },
  { value: 3, label: "3 days / week" },
  { value: 4, label: "4 days / week" },
  { value: 5, label: "5+ days / week" },
];

const equipmentOpts: { value: AthleteEquipment; label: string }[] = [
  { value: "commercial_gym", label: "Commercial gym" },
  { value: "home_gym", label: "Home gym" },
  { value: "bodyweight", label: "Bodyweight" },
];

const limOpts = [
  { id: "lower_back", label: "Lower back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "knees", label: "Knees" },
  { id: "elbows", label: "Elbows" },
  { id: "none", label: "None" },
] as const;

const pickClass = (on: boolean) =>
  "min-h-[48px] w-full rounded-2xl border px-3 text-left text-sm font-medium transition " +
  (on
    ? "border-violet-500/50 bg-violet-500/15 text-neutral-100 shadow-sm"
    : "border-neutral-800/90 bg-neutral-950/60 text-neutral-300 active:opacity-90");

export function OnboardingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const edit = searchParams.get("edit") === "true";
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

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
      if (p.notes) setNotes(p.notes);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load profile");
    }
  }, []);

  useEffect(() => {
    if (!edit) return;
    queueMicrotask(() => {
      void loadProfile();
    });
  }, [edit, loadProfile]);

  function toggleLimit(id: string) {
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

  async function finish() {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const ageN = age.trim() ? Math.max(0, Math.round(Number(age))) : undefined;
      const h = heightCm.trim() ? Math.max(0, Number(heightCm)) : undefined;
      const w = weightKg.trim() ? Math.max(0, Number(weightKg)) : undefined;
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
        onboardingCompleted: true,
        updatedAt: now,
      });
      router.replace(edit ? "/settings" : "/");
      router.refresh();
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
    <main className="mx-auto flex w-full min-w-0 max-w-full min-h-dvh flex-col space-y-6 pb-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Step {step}/{TOTAL_STEPS}
        </p>
        <button
          type="button"
          onClick={() => void skip()}
          disabled={saving}
          className="shrink-0 text-sm text-neutral-500 underline-offset-2 transition hover:text-neutral-300"
        >
          Skip for now
        </button>
      </div>

      {step === 1 && (
        <section className="space-y-3">
          <h1 className="text-[28px] font-bold leading-tight text-neutral-50">Sex</h1>
          {(["male", "female", "other"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={pickClass(sex === s)}
            >
              {s === "male" ? "Male" : s === "female" ? "Female" : "Other"}
            </button>
          ))}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h1 className="text-[28px] font-bold leading-tight text-neutral-50">Body</h1>
          <TextField
            label="Age"
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Years"
          />
          <TextField
            label="Height (cm)"
            inputMode="decimal"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="cm"
          />
          <TextField
            label="Weight (kg)"
            inputMode="decimal"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="kg"
          />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <h1 className="text-[28px] font-bold leading-tight text-neutral-50">Goal</h1>
          {goals.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGoal(g.value)}
              className={pickClass(goal === g.value)}
            >
              {g.label}
            </button>
          ))}
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3">
          <h1 className="text-[28px] font-bold leading-tight text-neutral-50">Experience</h1>
          {experienceOpts.map((e) => (
            <button
              key={e.value}
              type="button"
              onClick={() => setExperience(e.value)}
              className={pickClass(experience === e.value)}
            >
              {e.label}
            </button>
          ))}
        </section>
      )}

      {step === 5 && (
        <section className="space-y-3">
          <h1 className="text-[28px] font-bold leading-tight text-neutral-50">
            Training frequency
          </h1>
          {freqOpts.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setDays(f.value)}
              className={pickClass(days === f.value)}
            >
              {f.label}
            </button>
          ))}
        </section>
      )}

      {step === 6 && (
        <section className="space-y-3">
          <h1 className="text-[28px] font-bold leading-tight text-neutral-50">Equipment</h1>
          {equipmentOpts.map((e) => (
            <button
              key={e.value}
              type="button"
              onClick={() => setEquipment(e.value)}
              className={pickClass(equipment === e.value)}
            >
              {e.label}
            </button>
          ))}
        </section>
      )}

      {step === 7 && (
        <section className="space-y-3">
          <h1 className="text-[28px] font-bold leading-tight text-neutral-50">Limitations</h1>
          <p className="text-sm text-neutral-500">Select all that apply.</p>
          {limOpts.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => toggleLimit(l.id)}
              className={pickClass(limSelected(l.id))}
            >
              {l.label}
            </button>
          ))}
        </section>
      )}

      {step === 8 && (
        <section className="space-y-3">
          <h1 className="text-[28px] font-bold leading-tight text-neutral-50">Notes</h1>
          <p className="text-sm text-neutral-500">Anything AI should know?</p>
          <TextArea
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={4}
          />
        </section>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {step < TOTAL_STEPS ? (
          <Button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="!min-h-[52px] w-full"
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void finish()}
            disabled={saving}
            className="!min-h-[52px] w-full"
          >
            {saving ? "Saving…" : "Finish"}
          </Button>
        )}
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="min-h-11 text-sm text-neutral-500 transition hover:text-neutral-300"
          >
            Back
          </button>
        )}
      </div>
    </main>
  );
}
