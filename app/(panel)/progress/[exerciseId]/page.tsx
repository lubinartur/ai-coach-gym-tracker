import { ExerciseProgressView } from "@/components/pages/ExerciseProgressView";

export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId: raw } = await params;
  const exerciseId = decodeURIComponent(raw);
  return <ExerciseProgressView exerciseId={exerciseId} />;
}
