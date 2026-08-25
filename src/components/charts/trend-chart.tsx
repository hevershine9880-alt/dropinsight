"use client";

import * as React from "react";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { formatMoney } from "@/lib/money";
import { ChartTooltip, type TooltipSeries } from "./tooltip";
import { AXIS_STYLE, GRID_STYLE } from "./chart-theme";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart as LineChartIcon } from "lucide-react";

/** The subset of Recharts' tooltip props this chart actually reads. */
interface RechartsTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: unknown }[];
}

export interface TrendSeries {
  key: string;
  name: string;
  color: string;
  type: "line" | "bar" | "area";
  format: "money" | "number" | "percent";
  /** Plot against the right-hand axis — used for margin next to money. */
  axis?: "left" | "right";
}

/**
 * The trend chart used by the dashboard, P&L and Analytics.
 *
 * A chart of nothing is worse than no chart, so an empty dataset renders an
 * explanation instead of an empty grid. A table alternative sits behind a
 * details element for anyone who cannot read the SVG.
 */
export function TrendChart<T extends Record<string, unknown> & { label: string }>({
  data, series, currency, height = 280, emptyMessage = "No activity in this period.",
  showLegend = true, yAxisFormat = "money", stacked = false,
}: {
  data: T[];
  series: TrendSeries[];
  currency: string;
  height?: number;
  emptyMessage?: string;
  showLegend?: boolean;
  yAxisFormat?: "money" | "number";
  stacked?: boolean;
}) {
  const hasData = data.length > 0 && data.some((row) => series.some((s) => Number(row[s.key]) !== 0));

  if (!hasData) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="Nothing to chart yet"
        description={emptyMessage}
        className="py-10"
      />
    );
  }

  const usesRightAxis = series.some((s) => s.axis === "right");

  return (
    <>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: usesRightAxis ? 4 : 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis
              dataKey="label"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              minTickGap={24}
            />
            <YAxis
              yAxisId="left"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) =>
                yAxisFormat === "money"
                  ? formatMoney(value, currency, { compact: true })
                  : value.toLocaleString()
              }
            />
            {usesRightAxis ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={AXIS_STYLE}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
              />
            ) : null}

            <Tooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={((props: RechartsTooltipProps) => {
                const rows: TooltipSeries[] = series.map((s) => {
                  const point = props.payload?.find((p) => p.dataKey === s.key);
                  return { name: s.name, value: Number(point?.value ?? 0), color: s.color, format: s.format };
                });
                return (
                  <ChartTooltip
                    active={props.active}
                    label={props.label === undefined ? undefined : String(props.label)}
                    series={rows}
                    currency={currency}
                  />
                );
              }) as never}
            />

            {showLegend ? (
              <Legend
                verticalAlign="top"
                align="left"
                height={28}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => <span className="text-sm text-ink-muted">{value}</span>}
              />
            ) : null}

            {series.map((s) => {
              const axisId = s.axis ?? "left";
              if (s.type === "bar") {
                return (
                  <Bar
                    key={s.key} yAxisId={axisId} dataKey={s.key} name={s.name} fill={s.color}
                    radius={[4, 4, 0, 0]} maxBarSize={44} stackId={stacked ? "stack" : undefined}
                  />
                );
              }
              if (s.type === "area") {
                return (
                  <Area
                    key={s.key} yAxisId={axisId} dataKey={s.key} name={s.name}
                    stroke={s.color} fill={s.color} fillOpacity={0.14} strokeWidth={2}
                    type="monotone" dot={false} activeDot={{ r: 4 }}
                  />
                );
              }
              return (
                <Line
                  key={s.key} yAxisId={axisId} dataKey={s.key} name={s.name}
                  stroke={s.color} strokeWidth={2} type="monotone"
                  dot={false} activeDot={{ r: 4 }}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">View this chart as a table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Chart data</caption>
            <thead className="bg-surface-sunken">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-xs font-semibold text-ink-muted">Period</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-1.5 text-right text-xs font-semibold text-ink-muted">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink-muted">{row.label}</th>
                  {series.map((s) => (
                    <td key={s.key} className="tabular px-3 py-1.5 text-right">
                      {s.format === "money"
                        ? formatMoney(Number(row[s.key]), currency)
                        : s.format === "percent"
                          ? `${(Number(row[s.key]) * 100).toFixed(1)}%`
                          : Number(row[s.key]).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
