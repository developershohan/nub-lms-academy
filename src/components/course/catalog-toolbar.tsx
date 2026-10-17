"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CatalogFilters, useCatalogNavigation } from "@/components/course/catalog-filters";
import { SORTS, type CatalogParams, type SortKey } from "@/lib/catalog";
import type { CatalogFacets } from "@/server/services/catalog-service";

export function CatalogSort({ value }: { value: SortKey }) {
  const { go } = useCatalogNavigation();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted-foreground sm:inline">Sort by</span>
      <select
        value={value}
        onChange={(event) => go({ sort: event.target.value === "recommended" ? null : event.target.value })}
        className="h-9 cursor-pointer rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Sort courses"
      >
        {Object.entries(SORTS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Phones and tablets: the filter sidebar moves into a drawer. */
export function CatalogFilterDrawer({
  facets,
  params,
  activeCount,
}: {
  facets: CatalogFacets;
  params: CatalogParams;
  activeCount: number;
}) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" className="h-9 lg:hidden" />}>
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters{activeCount > 0 && ` (${activeCount})`}
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter courses</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <CatalogFilters facets={facets} params={params} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
