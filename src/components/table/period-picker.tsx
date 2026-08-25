"use client";

import * as React from "react";
import { Calendar, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useQueryState } from "@/lib/use-query-state";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/finance/periods";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

/**
 * The date-window control used on every page that has one.
 * "Custom" opens a pair of native date inputs — they are keyboard accessible,
 * localised and understood by every user, which a bespoke calendar rarely is.
 */
export function PeriodPicker({
  options = ["today", "last7", "last14", "this_month", "last_month", "all_time"],
  defaultPeriod = "last7",
}: {
  options?: PeriodKey[];
  defaultPeriod?: PeriodKey;
}) {
  const { get, set } = useQueryState();
  const active = (get("period") || defaultPeriod) as PeriodKey;
  const [customOpen, setCustomOpen] = React.useState(active === "custom");
  const from = get("from");
  const to = get("to");

  const applyCustom = (nextFrom: string, nextTo: string) => {
    if (!nextFrom || !nextTo) return;
    set({ period: "custom", from: nextFrom, to: nextTo });
  };

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto">
      {/* The group scrolls sideways on a narrow screen rather than forcing the
          whole page to scroll horizontally. */}
      <div className="scroll-fade-x -mx-1 w-full min-w-0 overflow-x-auto px-1 sm:w-auto">
        <div
          className="inline-flex items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5"
          role="group"
          aria-label="Date range"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => { setCustomOpen(false); set({ period: option, from: null, to: null }); }}
              aria-pressed={active === option}
              className={cn(
                "h-8 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                active === option ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {PERIOD_LABELS[option]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            aria-pressed={active === "custom"}
            aria-expanded={customOpen}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active === "custom" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            )}
          >
            <Calendar className="size-3.5" aria-hidden />
          {active === "custom" && from && to
            ? `${format(new Date(from), "d MMM")} – ${format(new Date(to), "d MMM")}`
            : "Custom"}
          </button>
        </div>
      </div>

      {customOpen ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-2 shadow-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">From</span>
            <input
              type="date"
              defaultValue={from}
              max={to || undefined}
              onChange={(e) => applyCustom(e.target.value, to || e.target.value)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">To</span>
            <input
              type="date"
              defaultValue={to}
              min={from || undefined}
              onChange={(e) => applyCustom(from || e.target.value, e.target.value)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <Button size="sm" variant="ghost" onClick={() => setCustomOpen(false)} aria-label="Close custom date range">
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
