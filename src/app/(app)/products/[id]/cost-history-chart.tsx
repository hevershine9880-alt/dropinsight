"use client";

import { TrendChart } from "@/components/charts/trend-chart";

export function CostHistoryChart({
  entries, currency,
}: {
  entries: { label: string; cost: number }[];
  currency: string;
}) {
  return (
    <TrendChart
      data={entries}
      currency={currency}
      height={240}
      showLegend={false}
      series={[{ key: "cost", name: "Buying price / unit", color: "var(--brand)", type: "line", format: "money" }]}
      emptyMessage="No buying prices recorded for this product yet."
    />
  );
}
