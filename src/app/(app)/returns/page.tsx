import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { periodFrom, pageFrom, pageSizeFrom, param, paramList, type SearchParams } from "@/lib/params";
import {
  queryRefunds, refundTotals, topRefundReasons,
  REFUND_TABS, CLAIM_TABS, type RefundTab, type ClaimTab,
} from "@/lib/finance/refunds-query";
import { previousPeriod, describePeriod } from "@/lib/finance/periods";
import { percentChange } from "@/lib/money";
import { can } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PeriodPicker } from "@/components/table/period-picker";
import { TableSkeleton } from "@/components/ui/skeleton";
import { RefundsKpis } from "./refunds-kpis";
import { RefundsTable } from "./refunds-table";
import { NeedsAnswerCards } from "./needs-answer-cards";
import { LossOverview } from "./loss-overview";
import { RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "Returns & refunds" };

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("orders.view");
  const params = await searchParams;

  return (
    <PageContainer>
      <PageHeader
        title="Returns & refunds"
        description="Track buyer refunds, the supplier money owed back to you, and return outcomes."
        icon={RotateCcw}
        actions={
          <>
            <PeriodPicker
              options={["last7", "last30", "this_month", "last_month", "all_time"]}
              defaultPeriod="last30"
            />
            <Link
              href="/profit-protection"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-base font-medium text-white transition-colors hover:bg-brand-hover"
            >
              <ShieldCheck className="size-4" aria-hidden />
              Profit protection
            </Link>
          </>
        }
      />

      <Suspense key={JSON.stringify(params)} fallback={<ReturnsSkeleton />}>
        <ReturnsBody
          workspaceId={auth.workspace.id}
          currency={auth.workspace.currency}
          canAnswer={can(auth.workspace.role, "refunds.answer")}
          params={params}
        />
      </Suspense>
    </PageContainer>
  );
}

async function ReturnsBody({
  workspaceId, currency, canAnswer, params,
}: {
  workspaceId: string;
  currency: string;
  canAnswer: boolean;
  params: SearchParams;
}) {
  const period = periodFrom(params, "last30");
  const previous = previousPeriod(period);

  const tabParam = param(params, "tab");
  const tab: RefundTab = (REFUND_TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as RefundTab) : "refunds";
  const claimParam = param(params, "claim");
  const claimTab: ClaimTab = (CLAIM_TABS as readonly string[]).includes(claimParam ?? "") ? (claimParam as ClaimTab) : "all";

  const query = {
    workspaceId,
    period,
    tab,
    claimTab,
    accountIds: paramList(params, "accounts"),
    reasons: paramList(params, "reason"),
    search: param(params, "search") ?? "",
    page: pageFrom(params),
    pageSize: pageSizeFrom(params, 20),
  };

  const [result, totals, previousTotals, reasons, needsAnswer] = await Promise.all([
    queryRefunds(query),
    refundTotals(workspaceId, period, currency),
    previous ? refundTotals(workspaceId, previous, currency) : Promise.resolve(null),
    topRefundReasons(workspaceId, period),
    // The two oldest unanswered refunds, surfaced as cards at the top.
    prisma.refund.findMany({
      where: { order: { workspaceId }, supplierClaim: "NOT_ASKED", type: { in: ["REFUND", "RETURN"] } },
      include: {
        order: { select: { id: true, ebayOrderId: true, orderDate: true, items: { select: { title: true }, take: 1 } } },
      },
      orderBy: { refundedAt: "asc" },
      take: 2,
    }),
  ]);

  return (
    <>
      <RefundsKpis
        totals={totals}
        currency={currency}
        comparedTo={previous ? describePeriod(previous) : undefined}
        deltas={
          previousTotals
            ? {
                refunded: percentChange(totals.totalRefundedMinor, previousTotals.totalRefundedMinor),
                count: percentChange(totals.refundCount, previousTotals.refundCount),
                recovered: percentChange(totals.recoveredMinor, previousTotals.recoveredMinor),
                loss: percentChange(totals.netLossMinor, previousTotals.netLossMinor),
              }
            : undefined
        }
      />

      {canAnswer && needsAnswer.length > 0 ? (
        <NeedsAnswerCards
          refunds={needsAnswer.map((r) => ({
            id: r.id,
            ebayOrderId: r.order.ebayOrderId,
            orderId: r.order.id,
            productTitle: r.order.items[0]?.title ?? "—",
            orderedAt: r.order.orderDate.toISOString(),
            buyerRefundMinor: r.buyerRefundMinor,
            feeCreditMinor: r.feeCreditMinor,
            recoveredMinor: r.recoveredMinor,
            supplierClaim: r.supplierClaim,
          }))}
          currency={currency}
          totalNeedingAnswer={totals.needsAnswerCount}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <RefundsTable
          rows={result.rows}
          total={result.total}
          tabCounts={result.tabCounts}
          claimCounts={result.claimCounts}
          page={query.page}
          pageSize={query.pageSize}
          currency={currency}
          canAnswer={canAnswer}
        />
        <LossOverview totals={totals} reasons={reasons} currency={currency} periodLabel={describePeriod(period)} />
      </div>
    </>
  );
}

function ReturnsSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="card h-28" />)}
      </div>
      <div className="card overflow-hidden pt-4">
        <TableSkeleton rows={8} columns={7} />
      </div>
    </>
  );
}
