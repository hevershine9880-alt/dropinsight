"use client";

import * as React from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";
import { SegmentedControl } from "@/components/table/filter-chips";

const VIEWS = {
  profit: {
    label: "Profit",
    yAxis: "money" as const,
    series: [{ key: "profit", name: "Net profit", color: "var(--positive)", type: "bar" as const, format: "money" as const }],
  },
  revenue: {
    label: "Revenue",
    yAxis: "money" as const,
    series: [{ key: "revenue", name: "Revenue", color: "var(--brand)", type: "area" as const, format: "money" as const }],
  },
  refunds: {
    label: "Refunds",
    yAxis: "money" as const,
    series: [{ key: "refunds", name: "Refund losses", color: "var(--negative)", type: "bar" as const, format: "money" as const }],
  },
  returns: {
    label: "Returns",
    yAxis: "number" as const,
    series: [{ key: "returns", name: "Refunded orders", color: "var(--caution)", type: "bar" as const, format: "number" as const }],
  },
  orders: {
    label: "Orders",
    yAxis: "number" as const,
    series: [{ key: "orders", name: "Orders", color: "var(--brand)", type: "bar" as const, format: "number" as const }],
  },
};

export function AnalyticsTrends({
  data, currency, periodLabel,
}: {
  data: { label: string; profit: number; revenue: number; refunds: number; returns: number; orders: number }[];
  currency: string;
  periodLabel: string;
}) {
  const [view, setView] = React.useState<keyof typeof VIEWS>("profit");
  const config = VIEWS[view];

  return (
    <Card>
      <CardHeader
        title="Trends"
        description={periodLabel}
        action={
          <SegmentedControl
            label="Trend metric"
            size="sm"
            value={view}
            onChange={(next) => setView(next as keyof typeof VIEWS)}
            options={Object.entries(VIEWS).map(([value, v]) => ({ value, label: v.label }))}
          />
        }
      />
      <CardBody>
        <TrendChart
          data={data}
          currency={currency}
          height={320}
          yAxisFormat={config.yAxis}
          series={config.series}
          emptyMessage="No activity in this window. Try a wider date range."
        />
      </CardBody>
    </Card>
  );
}
