"use client";

import * as React from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";
import { SegmentedControl } from "@/components/table/filter-chips";
import { cn } from "@/lib/cn";

export function PnlTrend({
  data, currency, className,
}: {
  data: { label: string; profit: number; revenue: number; margin: number }[];
  currency: string;
  className?: string;
}) {
  const [view, setView] = React.useState("profit");

  return (
    <Card className={cn(className)}>
      <CardHeader
        title="Profit trend"
        description="Profit per day, before monthly business expenses."
        action={
          <SegmentedControl
            label="Trend metric"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "profit", label: "Profit" },
              { value: "margin", label: "Margin" },
              { value: "revenue", label: "Revenue" },
            ]}
          />
        }
      />
      <CardBody>
        {view === "profit" ? (
          <TrendChart
            data={data}
            currency={currency}
            height={300}
            series={[{ key: "profit", name: "Net profit", color: "var(--positive)", type: "bar", format: "money" }]}
          />
        ) : view === "margin" ? (
          <TrendChart
            data={data}
            currency={currency}
            height={300}
            series={[
              { key: "profit", name: "Net profit", color: "var(--positive)", type: "bar", format: "money" },
              { key: "margin", name: "Margin", color: "var(--brand)", type: "line", format: "percent", axis: "right" },
            ]}
          />
        ) : (
          <TrendChart
            data={data}
            currency={currency}
            height={300}
            series={[
              { key: "revenue", name: "Revenue", color: "var(--brand)", type: "area", format: "money" },
              { key: "profit", name: "Net profit", color: "var(--positive)", type: "line", format: "money" },
            ]}
          />
        )}
      </CardBody>
    </Card>
  );
}
