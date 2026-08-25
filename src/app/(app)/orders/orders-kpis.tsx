import { KpiCard } from "@/components/domain/kpi-card";
import { Money, Percent } from "@/components/domain/money";
import { ShoppingCart, Banknote, TrendingUp, Calculator, RotateCcw } from "lucide-react";
import type { PeriodTotals } from "@/lib/finance/aggregate";

export function OrdersKpis({
  totals, currency, comparedTo, deltas,
}: {
  totals: PeriodTotals;
  currency: string;
  comparedTo?: string;
  deltas?: {
    orders: number | null;
    revenue: number | null;
    profit: number | null;
    aov: number | null;
    refunds: number | null;
  };
}) {
  const incomplete = totals.unpricedOrderCount > 0;
  const coverage = { priced: totals.pricedOrderCount, total: totals.orderCount };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        label="Orders"
        icon={ShoppingCart}
        tone="brand"
        value={<span className="tabular">{totals.orderCount.toLocaleString()}</span>}
        delta={deltas?.orders}
        comparedTo={comparedTo}
        footer={totals.cancelledCount > 0 ? `${totals.cancelledCount} cancelled, not counted` : undefined}
      />
      <KpiCard
        label="Total sales"
        icon={Banknote}
        tone="positive"
        value={<Money minor={totals.revenueMinor} currency={currency} />}
        delta={deltas?.revenue}
        comparedTo={comparedTo}
        explain="Gross sales including the postage you charged. Tax is excluded — eBay collects and remits it."
      />
      <KpiCard
        label="Total profit"
        icon={TrendingUp}
        tone={totals.pricedNetProfitMinor >= 0 ? "positive" : "negative"}
        value={<Money minor={incomplete ? totals.pricedNetProfitMinor : totals.netProfitMinor} currency={currency} signed />}
        delta={deltas?.profit}
        comparedTo={comparedTo}
        coverage={coverage}
        explain="Sales minus supplier costs, eBay fees, ad fees and refund losses. Business expenses are applied on the Profit & loss page."
        footer={<>Margin <Percent ratio={incomplete ? totals.pricedMarginRatio : totals.marginRatio} /></>}
      />
      <KpiCard
        label="Avg. order value"
        icon={Calculator}
        value={<Money minor={totals.avgOrderValueMinor} currency={currency} />}
        delta={deltas?.aov}
        comparedTo={comparedTo}
      />
      <KpiCard
        label="Refund losses"
        icon={RotateCcw}
        tone={totals.refundLossMinor > 0 ? "negative" : "neutral"}
        value={<Money minor={totals.refundLossMinor} currency={currency} />}
        delta={deltas?.refunds}
        comparedTo={comparedTo}
        invertDelta
        explain="What refunds actually cost you, after eBay's fee credit and anything your supplier paid back."
        footer={totals.recoveredMinor > 0 ? <>Recovered <Money minor={totals.recoveredMinor} currency={currency} /></> : undefined}
      />
    </div>
  );
}
