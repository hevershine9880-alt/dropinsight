"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Money, Percent } from "@/components/domain/money";
import { formatMoney } from "@/lib/money";
import { EmptyState } from "@/components/ui/empty-state";
import { PieChart as PieIcon } from "lucide-react";
import type { PnlBreakdownSlice } from "@/lib/finance/pnl";

/**
 * The doughnut splits income from costs by magnitude, with the net profit in
 * the centre. Every slice is also listed as a row with its exact amount,
 * because a ring cannot be read to the penny.
 */
export function PnlBreakdown({
  slices, netProfitMinor, currency,
}: {
  slices: PnlBreakdownSlice[];
  netProfitMinor: number;
  currency: string;
}) {
  const chartData = slices.map((s) => ({ ...s, magnitude: Math.abs(s.minor) }));
  const hasData = chartData.some((s) => s.magnitude > 0);

  return (
    <Card aria-label="Profit breakdown" className="flex flex-col">
      <CardHeader
        title="Profit breakdown"
        description="What made and what took your profit, by size. Percentages are each line's share of total income."
      />
      <CardBody className="flex-1">
        {!hasData ? (
          <EmptyState
            icon={PieIcon}
            title="Nothing to break down"
            description="No orders landed in this period."
            className="py-8"
          />
        ) : (
          <>
            <div className="relative h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="magnitude"
                    nameKey="label"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((slice) => (
                      <Cell key={slice.key} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={((props: { active?: boolean; payload?: { payload?: PnlBreakdownSlice }[] }) => {
                      const slice = props.payload?.[0]?.payload;
                      if (!props.active || !slice) return null;
                      return (
                        <div className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm shadow-overlay">
                          <p className="flex items-center gap-2 font-medium">
                            <span className="size-2 rounded-full" style={{ background: slice.color }} aria-hidden />
                            {slice.label}
                          </p>
                          <p className="tabular mt-0.5 text-ink-muted">{formatMoney(slice.minor, currency)}</p>
                        </div>
                      );
                    }) as never}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-xl font-semibold">
                    <Money minor={netProfitMinor} currency={currency} signed />
                  </p>
                  <p className="text-xs text-ink-muted">Net profit</p>
                </div>
              </div>
            </div>

            <table className="mt-4 w-full text-left text-sm">
              <caption className="sr-only">Profit breakdown by category</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Share of total income</th>
                </tr>
              </thead>
              <tbody>
                {slices.map((slice) => (
                  <tr key={slice.key}>
                    <th scope="row" className="py-1 pr-2 text-left font-normal">
                      <span className="flex items-center gap-2 text-ink-muted">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: slice.color }} aria-hidden />
                        <span className="truncate">{slice.label}</span>
                      </span>
                    </th>
                    <td className="py-1 text-right">
                      <Money minor={slice.minor} currency={currency} signed />
                    </td>
                    <td className="py-1 pl-3 text-right text-ink-muted">
                      <Percent ratio={slice.shareOfIncome} digits={0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardBody>
    </Card>
  );
}
