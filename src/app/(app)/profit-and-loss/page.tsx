import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/guard";
import { buildPnl } from "@/lib/finance/pnl";
import { periodFrom, type SearchParams } from "@/lib/params";
import { describePeriod } from "@/lib/finance/periods";
import { percentChange } from "@/lib/money";
import { can } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PeriodPicker } from "@/components/table/period-picker";
import { KpiCard } from "@/components/domain/kpi-card";
import { Money, Percent } from "@/components/domain/money";
import { PnlStatement } from "./pnl-statement";
import { PnlBreakdown } from "./pnl-breakdown";
import { PnlTrend } from "./pnl-trend";
import { TopSkus } from "./top-skus";
import { TrendingUp, Banknote, Receipt, Percent as PercentIcon, ShoppingCart, Download } from "lucide-react";

export const metadata: Metadata = { title: "Profit & loss" };

export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("dashboard.view");
  const params = await searchParams;

  return (
    <PageContainer>
      <PageHeader
        title="Profit & loss"
        description="Where the money went, line by line — and every line traces back to a stored amount."
        icon={TrendingUp}
        actions={
          <>
            <PeriodPicker
              options={["last7", "last30", "this_month", "last_month", "all_time"]}
              defaultPeriod="this_month"
            />
            {can(auth.workspace.role, "reports.download") ? (
              <Link
                href="/reports"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-base font-medium shadow-sm transition-colors hover:bg-surface-hover"
              >
                <Download className="size-4" aria-hidden />
                Export
              </Link>
            ) : null}
          </>
        }
      />

      <Suspense key={JSON.stringify(params)} fallback={<PnlSkeleton />}>
        <PnlBody
          workspaceId={auth.workspace.id}
          currency={auth.workspace.currency}
          attribution={auth.workspace.refundAttribution as never}
          params={params}
        />
      </Suspense>
    </PageContainer>
  );
}

async function PnlBody({
  workspaceId, currency, attribution, params,
}: {
  workspaceId: string;
  currency: string;
  attribution: never;
  params: SearchParams;
}) {
  const period = periodFrom(params, "this_month");
  const data = await buildPnl(workspaceId, currency, attribution, period);
  const { totals, previousTotals } = data;
  const comparedTo = data.previous ? describePeriod(data.previous) : undefined;
  const incomplete = data.basis === "priced";

  // These three KPIs sit side by side, so a reader will subtract them. They
  // must therefore be the two sides of the statement and its bottom line —
  // income (not just sales) minus costs equals net profit, exactly.
  const totalIncomeMinor = data.incomeLines.reduce((sum, line) => sum + line.currentMinor, 0);
  const previousIncomeMinor = data.incomeLines.reduce((sum, line) => sum + line.previousMinor, 0);
  const totalCostsMinor = data.expenseLines.reduce((sum, line) => sum + line.currentMinor, 0);
  const previousCostsMinor = data.expenseLines.reduce((sum, line) => sum + line.previousMinor, 0);
  const statementOrderCount = incomplete ? totals.pricedOrderCount : totals.orderCount;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Net profit"
          icon={TrendingUp}
          tone={data.netProfitMinor >= 0 ? "positive" : "negative"}
          value={<Money minor={data.netProfitMinor} currency={currency} signed />}
          delta={previousTotals ? percentChange(totals.pricedNetProfitMinor, previousTotals.pricedNetProfitMinor) : undefined}
          comparedTo={comparedTo}
          coverage={{ priced: totals.pricedOrderCount, total: totals.orderCount }}
          explain="Everything that came in, minus everything that went out, in this period."
        />
        <KpiCard
          label="Total income"
          icon={Banknote}
          tone="brand"
          value={<Money minor={totalIncomeMinor} currency={currency} />}
          delta={previousIncomeMinor ? percentChange(totalIncomeMinor, previousIncomeMinor) : undefined}
          comparedTo={comparedTo}
          footer={<>of which sales <Money minor={data.revenueMinor} currency={currency} /></>}
          explain="Everything that came in: product sales, postage charged, eBay's fee credits on refunds, and money your suppliers paid back."
        />
        <KpiCard
          label="Total costs"
          icon={Receipt}
          tone="negative"
          value={<Money minor={totalCostsMinor} currency={currency} />}
          delta={previousTotals ? percentChange(totalCostsMinor, previousCostsMinor) : undefined}
          comparedTo={comparedTo}
          invertDelta
          explain="Everything that went out: supplier costs, eBay fees, ad fees, refunds to buyers and business expenses."
          footer="income less costs is your net profit"
        />
        <KpiCard
          label="Profit margin"
          icon={PercentIcon}
          value={<Percent ratio={data.marginRatio} />}
          delta={
            previousTotals && totals.pricedMarginRatio !== null && previousTotals.pricedMarginRatio !== null
              ? percentChange(totals.pricedMarginRatio, previousTotals.pricedMarginRatio)
              : undefined
          }
          comparedTo={comparedTo}
        />
        <KpiCard
          label="Orders"
          icon={ShoppingCart}
          value={<span className="tabular">{statementOrderCount.toLocaleString()}</span>}
          delta={previousTotals ? percentChange(totals.orderCount, previousTotals.orderCount) : undefined}
          comparedTo={comparedTo}
          footer={incomplete ? `of ${totals.orderCount.toLocaleString()} placed` : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <PnlTrend data={data.trend} currency={currency} className="xl:col-span-2" />
        <PnlBreakdown slices={data.breakdown} netProfitMinor={data.netProfitMinor} currency={currency} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <PnlStatement
          incomeLines={data.incomeLines}
          expenseLines={data.expenseLines}
          totals={totals}
          previousTotals={previousTotals}
          basis={data.basis}
          excludedOrderCount={data.excludedOrderCount}
          excludedRevenueMinor={data.excludedRevenueMinor}
          currency={currency}
          periodLabel={describePeriod(period)}
          previousLabel={comparedTo}
          className="xl:col-span-2"
        />
        <TopSkus skus={data.topSkus} currency={currency} />
      </div>
    </>
  );
}

function PnlSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="card h-28" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card h-80 xl:col-span-2" />
        <div className="card h-80" />
      </div>
    </>
  );
}
