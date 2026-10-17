import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** "Nothing here yet" panel: an icon, one line on what will appear here, and the next step to take. */
function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  /** Actions, usually one primary Button and at most one outline Button. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center sm:py-16",
        className
      )}
    >
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-amber/20 text-amber-foreground ring-1 ring-amber/50 dark:text-amber">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

export { EmptyState }
