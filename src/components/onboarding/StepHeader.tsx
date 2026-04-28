type Props = {
  title: string;
  subtitle?: string;
};

export function StepHeader({ title, subtitle }: Props) {
  return (
    <header className="space-y-2">
      <h1 className="text-[28px] font-bold leading-tight text-neutral-50">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-sm leading-relaxed text-neutral-500">{subtitle}</p>
      ) : null}
    </header>
  );
}

