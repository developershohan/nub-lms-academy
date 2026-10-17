"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { RatingStars } from "@/components/course/rating-stars";
import { DURATIONS, catalogHref, type CatalogParams } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import type { CatalogFacets } from "@/server/services/catalog-service";

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

/** Navigates to the catalogue with some filters changed. Shared by the sidebar, the sort control
 * and the phone filter drawer; the results re-render on the server from the new URL. */
export function useCatalogNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const go = (changes: Record<string, string | string[] | null>) =>
    startTransition(() => router.replace(catalogHref(searchParams, changes, pathname), { scroll: false }));
  return { go, pending };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b pb-4 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

function Option({
  label,
  checked,
  disabled,
  onChange,
  count,
  children,
}: {
  /** Spoken name, e.g. "Beginner" - the visible children may be stars or other markup. */
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 text-sm", disabled && "cursor-default opacity-50")}>
      {/* Native input: the wrapping <label> names it for screen readers, and accent-color themes it. */}
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={`${label} (${count} ${count === 1 ? "course" : "courses"})`}
        className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-default"
      />
      <span className="flex flex-1 items-center gap-1.5">{children}</span>
      <span className="font-mono text-xs text-muted-foreground">{count}</span>
    </label>
  );
}

export function CatalogFilters({ facets, params }: { facets: CatalogFacets; params: CatalogParams }) {
  const { go, pending } = useCatalogNavigation();
  const toggle = (key: string, current: readonly string[], value: string) =>
    go({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });

  return (
    <div className={cn("space-y-4 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <div className="flex h-5 items-center gap-2 text-xs text-muted-foreground">
        {pending && (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Updating results...
          </>
        )}
      </div>

      <Group title="Rating">
        {facets.ratings.map(({ value, count }) => {
          const selected = params.minRating === value;
          return (
            <Option
              key={value}
              label={`${value.toFixed(1)} stars and up`}
              checked={selected}
              disabled={!selected && count === 0}
              onChange={() => go({ rating: selected ? null : String(value) })}
              count={count}
            >
              <RatingStars value={value} />
              <span>{value.toFixed(1)} & up</span>
            </Option>
          );
        })}
      </Group>

      <Group title="Video length">
        {facets.durations.map(({ value, count }) => {
          const selected = params.durations.includes(value);
          return (
            <Option
              key={value}
              checked={selected}
              disabled={!selected && count === 0}
              label={DURATIONS[value].label}
              onChange={() => toggle("duration", params.durations, value)}
              count={count}
            >
              {DURATIONS[value].label}
            </Option>
          );
        })}
      </Group>

      <Group title="Level">
        {facets.levels.map(({ value, count }) => {
          const selected = params.levels.includes(value);
          return (
            <Option
              key={value}
              checked={selected}
              disabled={!selected && count === 0}
              label={LEVEL_LABELS[value]}
              onChange={() => toggle("level", params.levels, value)}
              count={count}
            >
              {LEVEL_LABELS[value]}
            </Option>
          );
        })}
      </Group>

      <Group title="Price">
        {facets.prices.map(({ value, count }) => {
          const selected = params.prices.includes(value);
          return (
            <Option
              key={value}
              checked={selected}
              disabled={!selected && count === 0}
              label={value === "free" ? "Free" : "Paid"}
              onChange={() => toggle("price", params.prices, value)}
              count={count}
            >
              {value === "free" ? "Free" : "Paid"}
            </Option>
          );
        })}
      </Group>

      {facets.categories.length > 0 && (
        <Group title="Category">
          {facets.categories.map(({ value, label, count }) => {
            const selected = params.categories.includes(value);
            return (
              <Option
                key={value}
                checked={selected}
                disabled={!selected && count === 0}
                label={label}
                onChange={() => toggle("category", params.categories, value)}
                count={count}
              >
                {label}
              </Option>
            );
          })}
        </Group>
      )}

      {facets.languages.length > 1 && (
        <Group title="Language">
          {facets.languages.map(({ value, count }) => {
            const selected = params.languages.includes(value);
            return (
              <Option
                key={value}
                checked={selected}
                disabled={!selected && count === 0}
                label={value}
                onChange={() => toggle("language", params.languages, value)}
                count={count}
              >
                {value}
              </Option>
            );
          })}
        </Group>
      )}
    </div>
  );
}
