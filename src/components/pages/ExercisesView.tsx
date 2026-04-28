"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addExercise, listExercises, updateExercise } from "@/db/exercises";
import type { Exercise } from "@/types/trainingDiary";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useI18n } from "@/i18n/LocaleContext";

const muscleGroupOptions = [
  { value: "all", labelKey: "all_muscle_groups" },
  { value: "chest", labelKey: "muscle_chest" },
  { value: "back", labelKey: "muscle_back" },
  { value: "shoulders", labelKey: "muscle_shoulders" },
  { value: "biceps", labelKey: "muscle_biceps" },
  { value: "triceps", labelKey: "muscle_triceps" },
  { value: "legs", labelKey: "muscle_legs" },
  { value: "glutes", labelKey: "muscle_glutes" },
  { value: "hamstrings", labelKey: "muscle_hamstrings" },
  { value: "quads", labelKey: "muscle_quads" },
  { value: "calves", labelKey: "muscle_calves" },
  { value: "abs", labelKey: "muscle_abs" },
  { value: "cardio", labelKey: "muscle_cardio" },
] as const;

const equipmentOptions = [
  { value: "all", labelKey: "all_equipment" },
  { value: "barbell", labelKey: "equipment_barbell" },
  { value: "dumbbell", labelKey: "equipment_dumbbell" },
  { value: "cable", labelKey: "equipment_cable" },
  { value: "machine", labelKey: "equipment_machine" },
  { value: "bodyweight", labelKey: "equipment_bodyweight" },
  { value: "kettlebell", labelKey: "equipment_kettlebell" },
  { value: "cardio", labelKey: "equipment_cardio" },
] as const;

export function ExercisesView() {
  const { t } = useI18n();
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [query, setQuery] = useState("");
  const [filterMuscle, setFilterMuscle] =
    useState<(typeof muscleGroupOptions)[number]["value"]>("all");
  const [filterEquipment, setFilterEquipment] =
    useState<(typeof equipmentOptions)[number]["value"]>("all");

  const filtered = items.filter((e) => {
    const q = query.trim().toLowerCase();
    if (q) {
      const hay = `${e.name} ${e.muscleGroup ?? ""} ${e.equipment ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filterMuscle !== "all" && e.muscleGroup !== filterMuscle) return false;
    if (filterEquipment !== "all" && e.equipment !== filterEquipment) return false;
    return true;
  });

  async function refresh() {
    const rows = await listExercises();
    setItems(rows);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await listExercises();
        if (mounted) setItems(rows);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function submit() {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    try {
      await addExercise({
        name: n,
        muscleGroup: muscleGroup.trim() || undefined,
        equipment: equipment.trim() || undefined,
      });
      setName("");
      setMuscleGroup("");
      setEquipment("");
      setOpen(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col space-y-6 pb-32">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("life_panel_brand")}
        </p>
        <h1 className="text-[28px] font-bold leading-tight text-neutral-50">
          {t("exercises_title")}
        </h1>
        <p className="text-sm text-neutral-500">{t("exercise_library")}</p>
      </header>

      <section className="flex flex-col gap-3">
        <Button className="!min-h-[52px]" onClick={() => setOpen((v) => !v)}>
          + {t("add_exercise")}
        </Button>
      </section>

      {open ? (
        <Card className="!p-5 space-y-4">
          <TextField
            label={t("exercises_form_name")}
            placeholder={t("exercises_form_name_ph")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-3">
            <TextField
              label={t("exercises_form_muscle_optional")}
              placeholder={t("exercises_form_muscle_ph")}
              value={muscleGroup}
              onChange={(e) => setMuscleGroup(e.target.value)}
            />
            <TextField
              label={t("exercises_form_equipment_optional")}
              placeholder={t("exercises_form_equipment_ph")}
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
            />
          </div>
          <Button onClick={() => void submit()} disabled={saving || !name.trim()}>
            {saving ? t("saving") : t("save_exercise")}
          </Button>
        </Card>
      ) : null}

      <Card className="!p-5 space-y-4">
        <TextField
          label={t("search")}
          placeholder={t("search_exercises_ph")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-3">
          <Select
            label={t("muscle_group")}
            options={muscleGroupOptions.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            value={filterMuscle}
            onChange={(e) =>
              setFilterMuscle(
                e.target.value as (typeof muscleGroupOptions)[number]["value"],
              )
            }
          />
          <Select
            label={t("equipment")}
            options={equipmentOptions.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            value={filterEquipment}
            onChange={(e) =>
              setFilterEquipment(
                e.target.value as (typeof equipmentOptions)[number]["value"],
              )
            }
          />
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-neutral-500">{t("exercises_loading")}</p>
        ) : items.length === 0 ? (
          <Card className="!p-5 space-y-1">
            <p className="text-sm font-semibold text-neutral-50">
              {t("exercises_none_title")}
            </p>
            <p className="text-sm text-neutral-500">
              {t("exercises_none_body")}
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((e) => (
              <Card
                key={e.id}
                className="flex items-center gap-2 !p-4"
              >
                <Link
                  href={`/exercises/${e.id}`}
                  className="min-w-0 flex-1 space-y-1"
                >
                  <p className="text-base font-semibold text-neutral-50">
                    {e.name}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {(e.muscleGroup ?? "—") + " · " + (e.equipment ?? "—")}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      await updateExercise(e.id, { isFavorite: !e.isFavorite });
                      await refresh();
                    })();
                  }}
                  className="shrink-0 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-2 text-xs font-semibold text-amber-900 active:opacity-90 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100"
                >
                  {e.isFavorite ? `★ ${t("favorite")}` : `☆ ${t("favorite")}`}
                </button>
              </Card>
            ))}
            {filtered.length === 0 ? (
              <Card className="!p-5 space-y-1">
                <p className="text-sm font-semibold text-neutral-50">
                  {t("exercises_no_matches_title")}
                </p>
                <p className="text-sm text-neutral-500">
                  {t("exercises_no_matches_body")}
                </p>
              </Card>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}

