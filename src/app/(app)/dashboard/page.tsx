import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/guard";
import { buildDashboard } from "@/lib/finance/dashboard";
import { periodFrom, type SearchParams } from "@/lib/params";
import { describePeriod, previousPeriod } from "@/lib/finance/periods";
import type { RefundAttribution } from "@/lib/finance/types";
import { percentChange } from "@/lib/money";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PeriodPicker } from "@/components/table/period-picker";
import { CardSkeleton } from "@/components/ui/skeleton";
import { PeriodCard } from "./period-card";
import { OutstandingRow } from "./outstanding-row";
import { RevenueProfitChart } from "./revenue-profit-chart";
import { AccountsPanel } from "./accounts-panel";
import { TopProductsPanel } from "./top-products-panel";
import { AttentionPanel } from "./attention-panel";
import { AccountHealthPanel } from "./account-health-panel";
import { RefundAttributionPrompt } from "./refund-attribution-prompt";
import { prisma } from "@/lib/db/client";
import { RefreshCw } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("dashboard.view");
  const params = await searchParams;
  return (
    <PageContainer>
      <PageHeader
        title={`Good ${greeting()}, ${auth.user.name.split(" ")[0]}`}
        description="Your profit at a glance — this month, and any window beside it."
        actions={
          <>
            <PeriodPicker options={["today", "last7", "last14", "last_month"]} defaultPeriod="last7" />
            <Link
              href="/ebay-accounts?action=sync-all"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-base font-medium shadow-sm transition-colors hover:bg-surface-hover"
            >
              <RefreshCw className="size-4" aria-hidden />
              Sync now
            </Link>
          </>
        }
      />

      <RefundAttributionPrompt
        workspaceId={auth.workspace.id}
        current={auth.workspace.refundAttribution as RefundAttribution}
      />

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody
          workspaceId={auth.workspace.id}
          currency={auth.workspace.currency}
          attribution={auth.workspace.refundAttribution as RefundAttribution}
          params={params}
        />
      </Suspense>
    </PageContainer>
  );
}

async function DashboardBody({
  workspaceId, currency, attribution, params,
}: {
  workspaceId: string;
  currency: string;
  attribution: RefundAttribution;
  params: SearchParams;
}) {
  const window = periodFrom(params, "last7");
  const previous = previousPeriod(window);

  const [data, hasAccounts] = await Promise.all([
    buildDashboard(workspaceId, currency, attribution, window),
    prisma.ebayAccount.count({ where: { workspaceId, status: { not: "DISCONNECTED" } } }),
  ]);

  if (hasAccounts === 0) {
    return <NoAccountsYet />;
  }

  const comparedTo = previous ? describePeriod(previous) : undefined;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <PeriodCard
          title="This month"
          subtitle={describePeriod(data.monthPeriod)}
          totals={data.month}
          currency={currency}
        />
        <PeriodCard
          title={data.window.label}
          subtitle={`Compare any window against the month · ${describePeriod(window)}`}
          totals={data.window}
          currency={currency}
          comparison={
            data.windowPrevious
              ? {
                  comparedTo: comparedTo ?? "previous period",
                  netProfit: percentChange(
                    data.window.pricedNetProfitMinor,
                    data.windowPrevious.pricedNetProfitMinor,
                  ),
                  revenue: percentChange(data.window.revenueMinor, data.windowPrevious.revenueMinor),
                  orders: percentChange(data.window.orderCount, data.windowPrevious.orderCount),
                  refunds: percentChange(data.window.refundLossMinor, data.windowPrevious.refundLossMinor),
                }
              : undefined
          }
        />
      </div>

      <OutstandingRow outstanding={data.outstanding} currency={currency} />

      <RevenueProfitChart data={data.trend} currency={currency} periodLabel={describePeriod(window)} />

      <div className="grid gap-4 xl:grid-cols-3">
        <AccountsPanel accounts={data.accounts} currency={currency} className="xl:col-span-2" />
        <AttentionPanel items={data.attention} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AccountHealthPanel accounts={data.accounts} />
        <TopProductsPanel products={data.topProducts} currency={currency} />
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card h-64" />
        <div className="card h-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <CardSkeleton /><CardSkeleton /><CardSkeleton />
      </div>
      <div className="card h-80" />
    </div>
  );
}

function NoAccountsYet() {
  return (
    <div className="card px-6 py-16 text-center">
      <h2 className="text-xl font-semibold">No eBay account connected yet</h2>
      <p className="mx-auto mt-2 max-w-md text-md text-ink-muted">
        Everything on this page comes from your eBay orders. Connect a store and your
        first six months of history import automatically.
      </p>
      <Link
        href="/connect"
        className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand px-5 font-medium text-white hover:bg-brand-hover"
      >
        Connect your eBay account
      </Link>
    </div>
  );
}
