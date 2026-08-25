import { KpiCard } from "@/components/domain/kpi-card";
import { Money, Percent } from "@/components/domain/money";
import { RotateCcw, Package, Clock, HandCoins, TrendingDown } from "lucide-react";
import type { RefundTotals } from "@/lib/finance/refunds-query";

export function RefundsKpis({
  totals, currency, comparedTo, deltas,
}: {
  totals: RefundTotals;
  currency: string;
  comparedTo?: string;
  deltas?: { refunded: number | null; count: number | null; recovered: number | null; loss: number | null };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        label="Total refunded"
        icon={RotateCcw}
        tone="negative"
        value={<Money minor={totals.totalRefundedMinor} currency={currency} />}
        delta={deltas?.refunded}
        comparedTo={comparedTo}
        invertDelta
        explain="What buyers got back in this period, before eBay's fee credit and any supplier recovery."
      />
      <KpiCard
        label="Refunded orders"
        icon={Package}
        value={<span className="tabular">{totals.refundCount.toLocaleString()}</span>}
        delta={deltas?.count}
        comparedTo={comparedTo}
        invertDelta
      />
      <KpiCard
        label="Pending from supplier"
        icon={Clock}
        tone={totals.stillRecoverableMinor > 0 ? "caution" : "positive"}
        value={<span className="tabular">{totals.needsAnswerCount.toLocaleString()}</span>}
        footer={<>worth <Money minor={totals.stillRecoverableMinor} currency={currency} /></>}
        explain="Refunds where you have not yet recorded whether the supplier paid you back."
      />
      <KpiCard
        label="Recovered"
        icon={HandCoins}
        tone="positive"
        value={<Money minor={totals.recoveredMinor} currency={currency} />}
        delta={deltas?.recovered}
        comparedTo={comparedTo}
        footer={<>Recovery rate <Percent ratio={totals.recoveryRatio} /></>}
      />
      <KpiCard
        label="Net loss"
        icon={TrendingDown}
        tone={totals.netLossMinor > 0 ? "negative" : "positive"}
        value={<Money minor={totals.netLossMinor} currency={currency} />}
        delta={deltas?.loss}
        comparedTo={comparedTo}
        invertDelta
        explain="What refunds have really cost you: still owed by suppliers, plus anything written off."
      />
    </div>
  );
}
