import { KpiCard } from "@/components/domain/kpi-card";
import { Money, Percent } from "@/components/domain/money";
import { HandCoins, Wallet, Clock, CircleSlash } from "lucide-react";
import type { RefundTotals } from "@/lib/finance/refunds-query";

export function ProtectionKpis({ totals, currency }: { totals: RefundTotals; currency: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Recovered to date"
        icon={HandCoins}
        tone="positive"
        value={<Money minor={totals.recoveredMinor} currency={currency} />}
        footer={<>Recovery rate <Percent ratio={totals.recoveryRatio} /></>}
        explain="Everything your suppliers have paid back, across all time."
      />
      <KpiCard
        label="Still recoverable"
        icon={Wallet}
        tone={totals.stillRecoverableMinor > 0 ? "caution" : "positive"}
        value={<Money minor={totals.stillRecoverableMinor} currency={currency} />}
        footer={`across ${totals.needsAnswerCount + totals.overdueCount} open claims`}
        explain="What suppliers owe you on refunds you have not yet settled."
      />
      <KpiCard
        label="Overdue from suppliers"
        icon={Clock}
        tone={totals.overdueCount > 0 ? "negative" : "positive"}
        value={<span className="tabular">{totals.overdueCount.toLocaleString()}</span>}
        footer={<>promised but not received · <Money minor={totals.overdueMinor} currency={currency} /></>}
        explain="Claims where the supplier agreed to refund you and the date they promised has passed."
      />
      <KpiCard
        label="Written off"
        icon={CircleSlash}
        tone={totals.writtenOffMinor > 0 ? "negative" : "neutral"}
        value={<Money minor={totals.writtenOffMinor} currency={currency} />}
        footer="you marked as not coming back"
      />
    </div>
  );
}
