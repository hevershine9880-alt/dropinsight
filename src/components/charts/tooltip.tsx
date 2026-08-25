"use client";

import { formatMoney, formatPercent } from "@/lib/money";

export interface TooltipSeries {
  name: string;
  value: number;
  color: string;
  format: "money" | "number" | "percent";
}

/**
 * One tooltip for every chart. Recharts' default renders raw numbers; a profit
 * chart showing "3481.73" instead of "£3,481.73" is worse than no tooltip.
 */
export function ChartTooltip({
  active, label, series, currency,
}: {
  active?: boolean;
  label?: string;
  series: TooltipSeries[];
  currency: string;
}) {
  if (!active || series.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm shadow-overlay">
      {label ? <p className="mb-1.5 font-medium text-ink">{label}</p> : null}
      <ul className="space-y-1">
        {series.map((item) => (
          <li key={item.name} className="flex items-center gap-2 whitespace-nowrap">
            <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
            <span className="text-ink-muted">{item.name}</span>
            <span className="tabular ml-auto pl-3 font-medium text-ink">
              {item.format === "money"
                ? formatMoney(item.value, currency)
                : item.format === "percent"
                  ? formatPercent(item.value)
                  : item.value.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
