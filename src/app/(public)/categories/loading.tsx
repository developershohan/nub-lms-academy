import { Skeleton } from "@/components/ui/skeleton";
import { CategoryTileSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

export default function CategoriesLoading() {
  return (
    <LoadingRegion label="Loading categories" className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Catalogue</p>
      <p className="mt-2 font-heading text-4xl font-semibold tracking-tight">Browse by category</p>
      <div className="mt-3 max-w-xl space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CategoryTileSkeleton key={i} index={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}
