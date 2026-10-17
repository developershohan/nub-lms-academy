import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { studioHref, type ChecklistItem, type CourseChecklist } from "@/lib/studio";
import { cn } from "@/lib/utils";

function Item({ courseId, item }: { courseId: string; item: ChecklistItem }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {item.done ? (
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" aria-hidden />
          <span className="sr-only">Done:</span>
        </span>
      ) : (
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          <Circle className="size-4" aria-hidden />
          <span className="sr-only">To do:</span>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", item.done && "text-muted-foreground line-through decoration-1")}>
          {item.label}
        </p>
        {!item.done && <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>}
      </div>
      {!item.done && (
        <Link
          href={studioHref(courseId, item.section)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Fix<span className="sr-only">: {item.label}</span>
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      )}
    </li>
  );
}

/** Required steps with a progress bar, then the recommendations - each open item links to its studio page. */
export function PublishChecklist({ courseId, checklist }: { courseId: string; checklist: CourseChecklist }) {
  const required = checklist.items.filter((i) => i.required);
  const recommended = checklist.items.filter((i) => !i.required);
  const percent = Math.round((checklist.requiredDone / checklist.requiredTotal) * 100);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">
            {checklist.ready ? "Ready to submit" : `${checklist.requiredDone} of ${checklist.requiredTotal} required steps done`}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Required steps done"
          aria-valuemin={0}
          aria-valuemax={checklist.requiredTotal}
          aria-valuenow={checklist.requiredDone}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div>
        <h3 className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Required</h3>
        <ul className="divide-y">
          {required.map((item) => (
            <Item key={item.key} courseId={courseId} item={item} />
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Recommended</h3>
        <ul className="divide-y">
          {recommended.map((item) => (
            <Item key={item.key} courseId={courseId} item={item} />
          ))}
        </ul>
      </div>
    </div>
  );
}
