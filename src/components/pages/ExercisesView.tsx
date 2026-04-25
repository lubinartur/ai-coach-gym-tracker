"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addExercise, listExercises, updateExercise } from "@/db/exercises";
import type { Exercise } from "@/types/trainingDiary";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";

const muscleGroupOptions = [
  { value: "all", label: "All muscle groups" },
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "legs", label: "Legs" },
  { value: "glutes", label: "Glutes" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "quads", label: "Quads" },
  { value: "calves", label: "Calves" },
  { value: "abs", label: "Abs" },
  { value: "cardio", label: "Cardio" },
] as const;

const equipmentOptions = [
  { value: "all", label: "All equipment" },
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "cable", label: "Cable" },
  { value: "machine", label: "Machine" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "cardio", label: "Cardio" },
] as const;

export function ExercisesView() {
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
    <main className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Life Execution Panel
        </p>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Exercises
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Saved exercise library
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <Button className="!min-h-[52px]" onClick={() => setOpen((v) => !v)}>
          + Add exercise
        </Button>
      </section>

      {open ? (
        <Card className="space-y-4">
          <TextField
            label="Name"
            placeholder="e.g. Cable Lateral Raise"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-3">
            <TextField
              label="Muscle group (optional)"
              placeholder="e.g. shoulders"
              value={muscleGroup}
              onChange={(e) => setMuscleGroup(e.target.value)}
            />
            <TextField
              label="Equipment (optional)"
              placeholder="e.g. cable"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
            />
          </div>
          <Button onClick={() => void submit()} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save exercise"}
          </Button>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <TextField
          label="Search"
          placeholder="Search exercises…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-3">
          <Select
            label="Muscle group"
            options={[...muscleGroupOptions]}
            value={filterMuscle}
            onChange={(e) =>
              setFilterMuscle(
                e.target.value as (typeof muscleGroupOptions)[number]["value"],
              )
            }
          />
          <Select
            label="Equipment"
            options={[...equipmentOptions]}
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
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Loading exercises…
          </p>
        ) : items.length === 0 ? (
          <Card className="space-y-1">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              No exercises yet
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Add an exercise to build your library.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((e) => (
              <Card
                key={e.id}
                className="flex items-center gap-2 !p-3"
              >
                <Link
                  href={`/exercises/${e.id}`}
                  className="min-w-0 flex-1 space-y-1"
                >
                  <p className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                    {e.name}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
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
                  {e.isFavorite ? "★ Favorite" : "☆ Favorite"}
                </button>
              </Card>
            ))}
            {filtered.length === 0 ? (
              <Card className="space-y-1">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                  No matches
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Try a different search or clear filters.
                </p>
              </Card>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}

