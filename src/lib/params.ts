import { resolvePeriod, isPeriodKey, type Period, type PeriodKey } from "@/lib/finance/periods";

/**
 * Reading query parameters on the server.
 *
 * Every value is validated. A hand-edited `?pageSize=100000` is clamped rather
 * than allowed to pull the whole table into memory.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export function paramList(searchParams: SearchParams, key: string): string[] {
  const value = param(searchParams, key);
  return value ? value.split(",").filter(Boolean) : [];
}

export function periodFrom(searchParams: SearchParams, fallback: PeriodKey = "last7"): Period {
  const raw = param(searchParams, "period");
  const key: PeriodKey = isPeriodKey(raw) ? raw : fallback;
  const from = param(searchParams, "from");
  const to = param(searchParams, "to");
  return resolvePeriod(key, new Date(), {
    from: from ? new Date(from) : null,
    to: to ? new Date(to) : null,
  });
}

export function pageFrom(searchParams: SearchParams): number {
  const value = Number(param(searchParams, "page") ?? 1);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

const ALLOWED_PAGE_SIZES = [20, 50, 100];

export function pageSizeFrom(searchParams: SearchParams, fallback = 20): number {
  const value = Number(param(searchParams, "pageSize") ?? fallback);
  return ALLOWED_PAGE_SIZES.includes(value) ? value : fallback;
}

/** Only sorts the caller declares are safe reach the database. */
export function sortFrom(
  searchParams: SearchParams,
  allowed: string[],
  fallback: { key: string; direction: "asc" | "desc" },
): { key: string; direction: "asc" | "desc" } {
  const raw = param(searchParams, "sort");
  if (!raw) return fallback;
  const [key, direction] = raw.split(":");
  if (!allowed.includes(key)) return fallback;
  return { key, direction: direction === "asc" ? "asc" : "desc" };
}
