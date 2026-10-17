/** Title and one-line purpose at the top of each studio page. */
export function StudioSectionHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  /** A summary or action on the right, e.g. the curriculum totals. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div className="space-y-1">
        <h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
