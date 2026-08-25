import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Money, Percent, Delta } from "@/components/domain/money";
import { InfoTip } from "@/components/ui/tooltip";
import type { PeriodTotals } from "@/lib/finance/aggregate";
import { formatMoney } from "@/lib/money";

/**
 * One of the two headline cards.
 *
 * The unpriced-orders banner is the honest version of the reference product's
 * biggest weakness: it showed −£65.57 and 0.0% margin with no explanation that
 * 175 orders simply had no cost entered.
 */
export function PeriodCard({
  title, subtitle, totals, currency, comparison,
}: {
  title: string;
  subtitle: string;
  totals: PeriodTotals & { label: string };
  currency: string;
  comparison?: {
    comparedTo: string;
    netProfit: number | null;
    revenue: number | null;
    orders: number | null;
    refunds: number | null;
  };
}) {
  const incomplete = totals.unpricedOrderCount > 0;

  // While a costing backlog exists, the profit shown is the one computed over
  // orders that actually have a buying price. Reporting the all-orders figure
  // would count revenue and fees without the cost that sits between them.
  const netProfitMinor = incomplete ? totals.pricedNetProfitMinor : totals.netProfitMinor;
  const marginRatio = incomplete ? totals.pricedMarginRatio : totals.marginRatio;
  const profitOrderCount = incomplete ? totals.pricedOrderCount : totals.orderCount;

  return (
    <section className="card flex flex-col p-5" aria-label={`${title} summary`}>
      <header>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1">
            <p className="text-sm text-ink-muted">Net profit</p>
            <InfoTip label="net profit">
              Revenue minus your supplier costs, eBay&rsquo;s fees, ad spend, refund losses
              and business expenses in this period.
              {incomplete ? (
                <>
                  {" "}Right now this covers the {totals.pricedOrderCount.toLocaleString()} of{" "}
                  {totals.orderCount.toLocaleString()} orders that have a buying price — the rest
                  cannot be costed yet.
                </>
              ) : null}
            </InfoTip>
          </div>
          <p className="mt-1 text-3xl font-semibold tracking-tight">
            <Money minor={netProfitMinor} currency={currency} signed />
          </p>
          {incomplete ? (
            <p className="mt-1 text-xs text-caution-ink">
              across {totals.pricedOrderCount.toLocaleString()} of {totals.orderCount.toLocaleString()} orders
            </p>
          ) : comparison ? (
            <div className="mt-1">
              <Delta ratio={comparison.netProfit} comparedTo={comparison.comparedTo} />
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex items-center gap-1">
            <p className="text-sm text-ink-muted">Revenue</p>
            <InfoTip label="revenue">
              Gross sales including the postage you charged. Tax is excluded — eBay collects
              and remits it.
            </InfoTip>
          </div>
          <p className="mt-1 text-3xl font-semibold tracking-tight">
            <Money minor={totals.revenueMinor} currency={currency} />
          </p>
          {comparison ? (
            <div className="mt-1">
              <Delta ratio={comparison.revenue} comparedTo={comparison.comparedTo} showLabel={false} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-subtle">gross sales incl. postage</p>
          )}
        </div>
      </div>

      {incomplete ? (
        <Link
          href="/orders?tab=awaiting_cost"
          className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-caution-soft px-3 py-2.5 text-sm transition-colors hover:brightness-97"
        >
          <span className="min-w-0 text-caution-ink">
            <span className="font-semibold">{totals.unpricedOrderCount.toLocaleString()} orders awaiting a buying price</span>
            <span className="hidden sm:inline"> · {formatMoney(totals.unpricedRevenueMinor, currency)} of sales not in this profit yet</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-caution-ink" aria-hidden />
        </Link>
      ) : totals.orderCount > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-positive-soft px-3 py-2.5 text-sm text-positive-ink">
          <TrendingUp className="size-4 shrink-0" aria-hidden />
          Every order in this period has a buying price — this profit is complete.
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-line pt-4">
        <div>
          <dt className="text-sm text-ink-muted">Profit margin</dt>
          <dd className="mt-0.5 text-xl font-semibold">
            <Percent ratio={marginRatio} />
          </dd>
          <p className="text-xs text-ink-subtle">
            {profitOrderCount > 0
              ? `avg ${formatMoney(Math.round(netProfitMinor / profitOrderCount), currency)} per order`
              : "no priced orders yet"}
          </p>
        </div>

        <div>
          <dt className="text-sm text-ink-muted">Orders</dt>
          <dd className="tabular mt-0.5 text-xl font-semibold">{totals.orderCount.toLocaleString()}</dd>
          {comparison ? (
            <Delta ratio={comparison.orders} showLabel={false} />
          ) : (
            <Link href="/orders" className="text-xs font-medium text-brand hover:underline">View orders →</Link>
          )}
        </div>

        <div>
          <dt className="text-sm text-ink-muted">Refund losses</dt>
          <dd className="mt-0.5 text-xl font-semibold">
            <Money minor={totals.refundLossMinor} currency={currency} muteZero />
          </dd>
          {comparison ? (
            <Delta ratio={comparison.refunds} invert showLabel={false} />
          ) : (
            <Link href="/returns" className="text-xs font-medium text-brand hover:underline">View refunds →</Link>
          )}
        </div>
      </dl>
    </section>
  );
}
