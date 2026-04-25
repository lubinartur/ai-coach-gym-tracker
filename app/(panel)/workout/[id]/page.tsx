import { WorkoutDetailView } from "@/components/pages/WorkoutDetailView";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkoutDetailView id={id} />;
}

