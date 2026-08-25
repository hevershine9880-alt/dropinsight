"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Table state lives in the URL.
 *
 * That is what makes a filtered view shareable, bookmarkable, and survivable
 * across a back button — the three things that make the reference product's
 * tables frustrating to use. Updates are batched into one replace() so changing
 * three filters is one navigation, not three.
 */
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const get = React.useCallback(
    (key: string, fallback = "") => searchParams.get(key) ?? fallback,
    [searchParams],
  );

  const getAll = React.useCallback(
    (key: string): string[] => {
      const raw = searchParams.get(key);
      return raw ? raw.split(",").filter(Boolean) : [];
    },
    [searchParams],
  );

  const set = React.useCallback(
    (updates: Record<string, string | string[] | null | undefined>, options?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else {
          next.set(key, Array.isArray(value) ? value.join(",") : value);
        }
      }

      // Any change to what is being filtered invalidates the page number.
      if (options?.resetPage !== false && !("page" in updates)) next.delete("page");

      startTransition(() => {
        router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const clear = React.useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams();
      for (const key of keep) {
        const value = searchParams.get(key);
        if (value) next.set(key, value);
      }
      startTransition(() => {
        router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return { get, getAll, set, clear, pending, searchParams };
}

/**
 * Debounced text input bound to a query parameter. Typing feels immediate; the
 * server only hears about it once the user pauses.
 */
export function useDebouncedQueryValue(key: string, delay = 300) {
  const { get, set } = useQueryState();
  const urlValue = get(key);
  const [value, setValue] = React.useState(urlValue);
  const isFirst = React.useRef(true);

  // Keep in step when the URL changes from elsewhere (back button, clear all).
  React.useEffect(() => { setValue(urlValue); }, [urlValue]);

  React.useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (value === urlValue) return;
    const timer = setTimeout(() => set({ [key]: value || null }), delay);
    return () => clearTimeout(timer);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue] as const;
}
