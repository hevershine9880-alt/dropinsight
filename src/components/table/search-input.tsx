"use client";

import { Search, X } from "lucide-react";
import { useDebouncedQueryValue } from "@/lib/use-query-state";

export function TableSearch({
  placeholder = "Search…", queryKey = "search", label,
}: {
  placeholder?: string;
  queryKey?: string;
  label: string;
}) {
  const [value, setValue] = useDebouncedQueryValue(queryKey);

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 w-full rounded-lg border border-line bg-surface pr-9 pl-9 text-base transition-colors hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-subtle hover:bg-surface-hover hover:text-ink"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
