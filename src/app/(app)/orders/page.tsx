import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { periodFrom, pageFrom, pageSizeFrom, sortFrom, param, paramList, type SearchParams } from "@/lib/params";
import { queryOrders, ORDER_SORTS, type OrderTab, type FulfilmentFilter, ORDER_TABS, FULFILMENT_FILTERS } from "@/lib/finance/orders-query";
import { totalsForPeriod, loadOrders, periodOrderWhere } from "@/lib/finance/aggregate";
import { previousPeriod, describePeriod } from "@/lib/finance/periods";
import type { RefundAttribution } from "@/lib/finance/types";
import { percentChange } from "@/lib/money";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { can } from "@/lib/auth/permissions";
import { OrdersToolbar } from "./orders-toolbar";
import { OrdersTable } from "./orders-table";
import { OrdersKpis } from "./orders-kpis";
import { ShoppingCart } from "lucide-react";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("orders.view");
  const params = await searchParams;

  const accounts = await prisma.ebayAccount.findMany({
    where: { workspaceId: auth.workspace.id, status: { not: "DISCONNECTED" } },
    select: { id: true, username: true },
    orderBy: { connectedAt: "asc" },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Orders"
        description="Enter the supplier buying price and every profit figure updates on its own."
        icon={ShoppingCart}
      />

      <OrdersToolbar
        accounts={accounts}
        canWriteCosts={can(auth.workspace.role, "costs.write")}
        canExport={can(auth.workspace.role, "reports.download")}
      />

      <Suspense key={JSON.stringify(params)} fallback={<OrdersSkeleton />}>
        <OrdersBody
          workspaceId={auth.workspace.id}
          currency={auth.workspace.currency}
          attribution={auth.workspace.refundAttribution as RefundAttribution}
          canWriteCosts={can(auth.workspace.role, "costs.write")}
          canSeeProfit={can(auth.workspace.role, "dashboard.view")}
          params={params}
        />
      </Suspense>
    </PageContainer>
  );
}

async function OrdersBody({
  workspaceId, currency, attribution, canWriteCosts, canSeeProfit, params,
}: {
  workspaceId: string;
  currency: string;
  attribution: RefundAttribution;
  canWriteCosts: boolean;
  canSeeProfit: boolean;
  params: SearchParams;
}) {
  const period = periodFrom(params, "last30");
  const tabParam = param(params, "tab");
  const tab: OrderTab = (ORDER_TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as OrderTab) : "all";
  const fulfilment = paramList(params, "fulfilment").filter((f): f is FulfilmentFilter =>
    (FULFILMENT_FILTERS as readonly string[]).includes(f),
  );

  const query = {
    workspaceId,
    period,
    tab,
    fulfilment,
    accountIds: paramList(params, "accounts"),
    search: param(params, "search") ?? "",
    page: pageFrom(params),
    pageSize: pageSizeFrom(params, 20),
    sort: sortFrom(params, [...ORDER_SORTS], { key: "date", direction: "desc" }),
  };

  const previous = previousPeriod(period);

  const [result, kpiOrders, previousOrders] = await Promise.all([
    queryOrders(query),
    loadOrders(periodOrderWhere(workspaceId, period, attribution)),
    previous ? loadOrders(periodOrderWhere(workspaceId, previous, attribution)) : Promise.resolve([]),
  ]);

  const totals = totalsForPeriod(kpiOrders, period, attribution, currency);
  const previousTotals = previous ? totalsForPeriod(previousOrders, previous, attribution, currency) : null;

  return (
    <>
      {canSeeProfit ? (
        <OrdersKpis
          totals={totals}
          currency={currency}
          comparedTo={previous ? describePeriod(previous) : undefined}
          deltas={
            previousTotals
              ? {
                  orders: percentChange(totals.orderCount, previousTotals.orderCount),
                  revenue: percentChange(totals.revenueMinor, previousTotals.revenueMinor),
                  profit: percentChange(totals.pricedNetProfitMinor, previousTotals.pricedNetProfitMinor),
                  aov: percentChange(totals.avgOrderValueMinor, previousTotals.avgOrderValueMinor),
                  refunds: percentChange(totals.refundLossMinor, previousTotals.refundLossMinor),
                }
              : undefined
          }
        />
      ) : null}

      <OrdersTable
        rows={result.rows}
        total={result.total}
        tabCounts={result.tabCounts}
        fulfilmentCounts={result.fulfilmentCounts}
        page={query.page}
        pageSize={query.pageSize}
        sort={query.sort}
        currency={currency}
        canWriteCosts={canWriteCosts}
        canSeeProfit={canSeeProfit}
      />
    </>
  );
}

function OrdersSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-28" />
        ))}
      </div>
      <div className="card overflow-hidden pt-4">
        <TableSkeleton rows={10} columns={7} />
      </div>
    </>
  );
}
