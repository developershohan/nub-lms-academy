import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One headline number with its label - teacher dashboard and studio overview. */
export function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-card p-4 ring-1 ring-foreground/10", className)}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {label}
      </p>
      <p className="mt-2 font-heading text-2xl font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
