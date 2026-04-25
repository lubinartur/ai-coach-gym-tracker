type Props = {
  title: string;
  body: string;
};

export function EmptyState({ title, body }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
      <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</p>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{body}</p>
    </div>
  );
}
