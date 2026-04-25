import { ExerciseDetailView } from "@/components/pages/ExerciseDetailView";

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExerciseDetailView id={id} />;
}

