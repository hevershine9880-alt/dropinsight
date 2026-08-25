import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, subMonths,
  differenceInCalendarDays, addDays, format, eachDayOfInterval, eachMonthOfInterval,
} from "date-fns";

/**
 * Named date windows, shared by the dashboard, orders, analytics and reports so
 * that "Last 7 days" means exactly the same span everywhere.
 */
export const PERIOD_KEYS = [
  "today",
  "last7",
  "last14",
  "last30",
  "this_month",
  "last_month",
  "all_time",
  "custom",
] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Today",
  last7: "Last 7 days",
  last14: "Last 14 days",
  last30: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  all_time: "All time",
  custom: "Custom",
};

export interface Period {
  key: PeriodKey;
  label: string;
  from: Date;
  to: Date;
  /** All-time has no meaningful start, so comparisons and trends are suppressed. */
  unbounded: boolean;
}

/** Far enough back to precede any real eBay account. */
const DAWN = new Date("2000-01-01T00:00:00.000Z");

export function resolvePeriod(
  key: PeriodKey,
  now: Date = new Date(),
  custom?: { from?: Date | null; to?: Date | null },
): Period {
  const label = PERIOD_LABELS[key];
  switch (key) {
    case "today":
      return { key, label, from: startOfDay(now), to: endOfDay(now), unbounded: false };
    case "last7":
      return { key, label, from: startOfDay(subDays(now, 6)), to: endOfDay(now), unbounded: false };
    case "last14":
      return { key, label, from: startOfDay(subDays(now, 13)), to: endOfDay(now), unbounded: false };
    case "last30":
      return { key, label, from: startOfDay(subDays(now, 29)), to: endOfDay(now), unbounded: false };
    case "this_month":
      return { key, label, from: startOfMonth(now), to: endOfDay(now), unbounded: false };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { key, label, from: startOfMonth(prev), to: endOfMonth(prev), unbounded: false };
    }
    case "all_time":
      return { key, label, from: DAWN, to: endOfDay(now), unbounded: true };
    case "custom": {
      const from = custom?.from ? startOfDay(custom.from) : startOfDay(subDays(now, 6));
      const to = custom?.to ? endOfDay(custom.to) : endOfDay(now);
      return { key, label, from, to: to < from ? endOfDay(from) : to, unbounded: false };
    }
  }
}

/**
 * The window immediately before this one, of the same length. Comparisons are
 * meaningless for all-time, so it returns null rather than inventing a span.
 */
export function previousPeriod(period: Period): Period | null {
  if (period.unbounded) return null;
  if (period.key === "last_month") {
    const prev = subMonths(period.from, 1);
    return {
      key: "custom",
      label: "Previous month",
      from: startOfMonth(prev),
      to: endOfMonth(prev),
      unbounded: false,
    };
  }
  if (period.key === "this_month") {
    const prev = subMonths(period.from, 1);
    // Compare like for like: the same number of days into the previous month.
    const daysIn = differenceInCalendarDays(period.to, period.from);
    const from = startOfMonth(prev);
    const to = endOfDay(Math.min(+addDays(from, daysIn), +endOfMonth(prev)));
    return { key: "custom", label: "Previous month", from, to, unbounded: false };
  }
  const days = differenceInCalendarDays(period.to, period.from) + 1;
  const to = endOfDay(subDays(period.from, 1));
  const from = startOfDay(subDays(to, days - 1));
  return { key: "custom", label: "Previous period", from, to, unbounded: false };
}

export function describePeriod(period: Period): string {
  if (period.unbounded) return "All time";
  const sameYear = period.from.getFullYear() === period.to.getFullYear();
  const left = format(period.from, sameYear ? "d MMM" : "d MMM yyyy");
  const right = format(period.to, "d MMM yyyy");
  return left === right.slice(0, left.length) && differenceInCalendarDays(period.to, period.from) === 0
    ? right
    : `${left} – ${right}`;
}

/** Day or month buckets for a trend chart, chosen by how long the window is. */
export function bucketsFor(period: Period): { key: string; label: string; from: Date; to: Date }[] {
  const days = differenceInCalendarDays(period.to, period.from) + 1;
  if (days > 92) {
    return eachMonthOfInterval({ start: period.from, end: period.to }).map((d) => ({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM yyyy"),
      from: startOfMonth(d),
      to: endOfMonth(d),
    }));
  }
  return eachDayOfInterval({ start: period.from, end: period.to }).map((d) => ({
    key: format(d, "yyyy-MM-dd"),
    label: format(d, days > 31 ? "d MMM" : "EEE d"),
    from: startOfDay(d),
    to: endOfDay(d),
  }));
}

export function isPeriodKey(v: string | null | undefined): v is PeriodKey {
  return !!v && (PERIOD_KEYS as readonly string[]).includes(v);
}
