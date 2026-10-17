import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Course progress as a small ring with the percentage inside; a trophy once the course is done. */
export function ProgressRing({ percent, complete, className }: { percent: number; complete: boolean; className?: string }) {
  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = complete ? 100 : Math.min(100, Math.max(0, percent));

  return (
    <span
      role="img"
      aria-label={complete ? "Course complete" : `${value}% complete`}
      className={cn("relative inline-flex size-9 shrink-0", className)}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          className={cn("transition-[stroke-dashoffset] duration-500", complete ? "stroke-amber" : "stroke-primary")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        {complete ? (
          <Trophy className="size-4 text-amber-foreground dark:text-amber" />
        ) : (
          <span className="font-mono text-[10px] font-medium tabular-nums">{value}</span>
        )}
      </span>
    </span>
  );
}
