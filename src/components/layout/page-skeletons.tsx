import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Building blocks for the route loading.tsx files. Each one mirrors the shape of a real component
 * (CourseCard, EnrolledCourseCard, ChatShell...) so the page doesn't jump when data arrives.
 */

// Faded category spine colours (lib/category-style.ts), so a loading catalogue still reads as shelves.
const SPINES = [
  "bg-emerald-600/40",
  "bg-sky-600/40",
  "bg-fuchsia-600/40",
  "bg-amber-500/50",
  "bg-violet-600/40",
  "bg-rose-600/40",
];

/** Announces "Loading…" to screen readers once, and hides the grey bars from them. */
export function LoadingRegion({
  label = "Loading",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status">
      <span className="sr-only">{label}…</span>
      <div aria-hidden className={className}>
        {children}
      </div>
    </div>
  );
}

/** A dashboard page title, optionally with the primary action button beside it. */
export function HeadingSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-8 w-56 max-w-[60%]" />
      {action && <Skeleton className="h-8 w-32 rounded-lg" />}
    </div>
  );
}

function CardFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl bg-card p-4 ring-1 ring-foreground/10", className)}>{children}</div>;
}

export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        count === 2 ? "sm:grid-cols-2" : count === 4 ? "grid-cols-2 gap-3 lg:grid-cols-4" : "sm:grid-cols-3"
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <CardFrame key={i} className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-14" />
        </CardFrame>
      ))}
    </div>
  );
}

export function EnrolledCourseCardSkeleton() {
  return (
    <CardFrame className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-1.5 flex-1 rounded-full" />
        <Skeleton className="h-4 w-8" />
      </div>
      <Skeleton className="h-4 w-28" />
    </CardFrame>
  );
}

/** Same frame as CourseCard: spine, 16:9 thumbnail, badges, title, instructor and price. */
export function CourseCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <span className={cn("absolute inset-y-0 left-0 w-1", SPINES[index % SPINES.length])} />
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2.5 p-4 pl-5">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-4xl" />
          <Skeleton className="h-5 w-16 rounded-4xl" />
        </div>
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
        <div className="mt-auto flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  );
}

export function CourseGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <CourseCardSkeleton key={i} index={i} />
      ))}
    </div>
  );
}

export function CategoryTileSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-6 pl-7">
      <span className={cn("absolute inset-y-0 left-0 w-1", SPINES[index % SPINES.length])} />
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-9 rounded-sm" />
        <Skeleton className="size-4 rounded-sm" />
      </div>
      <Skeleton className="mt-5 h-6 w-40" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  );
}

/** Stacked cards with a title, a badge and an action, like the teacher course list or admin users. */
export function ListRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <CardFrame key={i} className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-5 w-20 rounded-4xl" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
        </CardFrame>
      ))}
    </div>
  );
}

/** ChatShell's two columns: contacts and conversations, then the message pane. */
export function ChatSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <div className="space-y-2 rounded-lg border p-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
        <div className="space-y-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 rounded-md border p-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-[420px] flex-col rounded-lg border">
        <div className="border-b p-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex-1 space-y-3 p-3">
          <Skeleton className="h-12 w-3/5 rounded-lg" />
          <Skeleton className="ml-auto h-9 w-2/5 rounded-lg" />
          <Skeleton className="h-16 w-2/3 rounded-lg" />
          <Skeleton className="ml-auto h-9 w-1/3 rounded-lg" />
        </div>
        <div className="flex gap-2 border-t p-3">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-16 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
