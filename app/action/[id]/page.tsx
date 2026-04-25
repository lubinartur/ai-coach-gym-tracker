import { ActionDetailView } from "@/components/pages/ActionDetailView";

export default async function ActionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[420px] px-4 pb-10 pt-4">
      <ActionDetailView id={id} />
    </div>
  );
}
