"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Search box that filters as you type: keeps the query in the URL (so results
 * stay shareable and server-rendered) and debounces navigation while typing.
 */
export function SearchInput({
  paramKey = "q",
  placeholder,
  className,
  debounceMs = 300,
}: {
  paramKey?: string;
  placeholder: string;
  className?: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(paramKey) ?? "");
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cancel a queued navigation when the component unmounts mid-typing.
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function onChange(next: string) {
    setValue(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (next.trim()) {
        params.set(paramKey, next.trim());
      } else {
        params.delete(paramKey);
      }
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    }, debounceMs);
  }

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-8"
      />
      {isPending && (
        <Loader2
          className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  );
}
