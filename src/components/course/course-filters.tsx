"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/ui/search-input";

/** Catalogue filters — search filters as you type, category applies on selection. */
export function CourseFilters({
  categories,
}: {
  categories: { id: string; slug: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function onCategoryChange(slug: string) {
    const params = new URLSearchParams(searchParams);
    if (slug) {
      params.set("category", slug);
    } else {
      params.delete("category");
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <SearchInput placeholder="Search courses" className="w-full max-w-xs" />
      <select
        name="category"
        value={searchParams.get("category") ?? ""}
        onChange={(event) => onCategoryChange(event.target.value)}
        aria-label="Filter by category"
        className="h-9 cursor-pointer rounded-md border bg-background px-3 text-sm"
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.id} value={category.slug}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  );
}
