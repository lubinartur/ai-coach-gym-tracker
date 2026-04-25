import { EditWorkoutView } from "@/components/pages/EditWorkoutView";

export default async function EditWorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditWorkoutView id={id} />;
}

