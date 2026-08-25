"use client";

import * as React from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";
import { SegmentedControl } from "@/components/table/filter-chips";

export function RevenueProfitChart({
  data, currency, periodLabel,
}: {
  data: { label: string; revenue: number; profit: number; orders: number }[];
  currency: string;
  periodLabel: string;
}) {
  const [view, setView] = React.useState("money");

  return (
    <Card>
      <CardHeader
        title="Revenue and profit"
        description={`Day by day across ${periodLabel}. Profit here is before monthly business expenses.`}
        action={
          <SegmentedControl
            label="Chart metric"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "money", label: "Money" },
              { value: "orders", label: "Orders" },
            ]}
          />
        }
      />
      <CardBody>
        {view === "money" ? (
          <TrendChart
            data={data}
            currency={currency}
            height={300}
            series={[
              { key: "revenue", name: "Revenue", color: "var(--brand)", type: "bar", format: "money" },
              { key: "profit", name: "Profit", color: "var(--positive)", type: "line", format: "money" },
            ]}
            emptyMessage="No orders landed in this window. Try a wider date range."
          />
        ) : (
          <TrendChart
            data={data}
            currency={currency}
            height={300}
            yAxisFormat="number"
            series={[{ key: "orders", name: "Orders", color: "var(--brand)", type: "bar", format: "number" }]}
            emptyMessage="No orders landed in this window. Try a wider date range."
          />
        )}
      </CardBody>
    </Card>
  );
}
