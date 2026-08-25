import * as React from "react";
import { cn } from "@/lib/cn";
import { Delta } from "./money";
import { InfoTip } from "@/components/ui/tooltip";
import { Sparkline } from "@/components/charts/sparkline";

/**
 * The KPI card used across Dashboard, Orders, P&L and Returns.
 *
 * `coverage` is the piece the reference product does not have: when profit
 * rests on orders that have no buying price yet, the card says so instead of
 * presenting an incomplete number as a complete one.
 */
export function KpiCard({
  label, value, tone = "neutral", icon: Icon, delta, comparedTo, invertDelta,
  explain, trend, coverage, footer, className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "brand" | "positive" | "negative" | "caution";
  icon?: React.ComponentType<{ className?: string }>;
  delta?: number | null;
  comparedTo?: string;
  invertDelta?: boolean;
  explain?: React.ReactNode;
  trend?: number[];
  coverage?: { priced: number; total: number };
  footer?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: { chip: "bg-surface-sunken text-ink-muted", line: "var(--ink-subtle)" },
    brand: { chip: "bg-brand-soft text-brand", line: "var(--brand)" },
    positive: { chip: "bg-positive-soft text-positive", line: "var(--positive)" },
    negative: { chip: "bg-negative-soft text-negative", line: "var(--negative)" },
    caution: { chip: "bg-caution-soft text-caution", line: "var(--caution)" },
  }[tone];

  const incomplete = coverage && coverage.total > 0 && coverage.priced < coverage.total;

  return (
    // A labelled region, so a screen-reader user can jump between KPIs by name
    // rather than hearing an undifferentiated run of numbers.
    <section aria-label={label} className={cn("card flex flex-col p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tones.chip)}>
              <Icon className="size-4" aria-hidden />
            </span>
          ) : null}
          {/* The label wraps rather than truncating: "Pending from supplier"
              cut to "Pending from sup…" is worse than two short lines. The tip
              sits inside the paragraph so a card that has one lines up with a
              card that does not — a row of KPIs must share a baseline. */}
          {/* Two lines are always reserved: a row of KPIs where one label wraps
              and the others do not would otherwise put its number 6px lower
              than its neighbours, and the eye reads that as a mistake. */}
          <p className="flex min-h-[2.25rem] min-w-0 items-center text-sm leading-snug font-medium text-balance text-ink-muted">
            {label}
            {explain ? (
              <InfoTip label={label} className="ml-1 h-[1em] translate-y-[0.15em] align-baseline">
                {explain}
              </InfoTip>
            ) : null}
          </p>
        </div>
      </div>

      <p className="mt-2.5 text-2xl font-semibold tracking-tight">{value}</p>

      {delta !== undefined ? (
        <div className="mt-1.5">
          <Delta ratio={delta ?? null} comparedTo={comparedTo} invert={invertDelta} />
        </div>
      ) : null}

      {incomplete ? (
        <p className="mt-2 text-xs text-caution-ink">
          Based on {coverage.priced} of {coverage.total} orders — the rest have no buying price yet.
        </p>
      ) : null}

      {footer ? <div className="mt-2 text-xs text-ink-muted">{footer}</div> : null}

      {trend && trend.length > 1 ? (
        <div className="mt-3 -mb-1">
          <Sparkline values={trend} color={tones.line} />
        </div>
      ) : null}
    </section>
  );
}
