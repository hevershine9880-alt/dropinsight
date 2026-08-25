import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { param, type SearchParams } from "@/lib/params";
import { chaseQueue, refundTotals, recoverableOf } from "@/lib/finance/refunds-query";
import { resolvePeriod } from "@/lib/finance/periods";
import { breakEvenPriceMinor, observedFeeRatio } from "@/lib/finance/profit";
import { loadOrders, profitOf } from "@/lib/finance/aggregate";
import { can } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ChaseQueue } from "./chase-queue";
import { ProtectionKpis } from "./protection-kpis";
import { PriceFloorPanel } from "./price-floor-panel";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Profit protection" };

export default async function ProfitProtectionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("orders.view");
  const params = await searchParams;

  return (
    <PageContainer>
      <PageHeader
        title="Profit protection"
        description="Money your suppliers still owe you, what you have already recovered, and the prices your products can't afford to drop below."
        icon={ShieldCheck}
      />

      <Suspense key={JSON.stringify(params)} fallback={<ProtectionSkeleton />}>
        <ProtectionBody
          workspaceId={auth.workspace.id}
          currency={auth.workspace.currency}
          canAnswer={can(auth.workspace.role, "refunds.answer")}
          params={params}
        />
      </Suspense>
    </PageContainer>
  );
}

async function ProtectionBody({
  workspaceId, currency, canAnswer, params,
}: {
  workspaceId: string;
  currency: string;
  canAnswer: boolean;
  params: SearchParams;
}) {
  const allTime = resolvePeriod("all_time");
  const search = param(params, "search") ?? "";
  const tab = param(params, "tab") ?? "open";

  const claimFilter =
    tab === "promised" ? ["PROMISED"] :
    tab === "not_asked" ? ["NOT_ASKED"] :
    ["NOT_ASKED", "ASKED", "PROMISED"];

  const [queue, totals, priceFloors] = await Promise.all([
    chaseQueue(workspaceId, { search, claim: claimFilter }),
    refundTotals(workspaceId, allTime, currency),
    buildPriceFloors(workspaceId, currency),
  ]);

  const counts = await prisma.refund.groupBy({
    by: ["supplierClaim"],
    where: { order: { workspaceId }, type: { in: ["REFUND", "RETURN"] } },
    _count: true,
  });
  const countFor = (claim: string) => counts.find((c) => c.supplierClaim === claim)?._count ?? 0;

  return (
    <>
      <ProtectionKpis totals={totals} currency={currency} />

      <ChaseQueue
        rows={queue}
        currency={currency}
        canAnswer={canAnswer}
        counts={{
          open: countFor("NOT_ASKED") + countFor("ASKED") + countFor("PROMISED"),
          not_asked: countFor("NOT_ASKED"),
          promised: countFor("PROMISED"),
        }}
      />

      <PriceFloorPanel products={priceFloors} currency={currency} />
    </>
  );
}

/**
 * The break-even price for each product that is selling. (R7)
 *
 * The fee rate is observed from this workspace's own orders rather than assumed,
 * so the floor reflects the categories they actually sell in.
 */
async function buildPriceFloors(workspaceId: string, currency: string) {
  void currency;
  const orders = await loadOrders({
    workspaceId,
    cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
    orderDate: { gte: new Date(Date.now() - 90 * 86_400_000) },
  });

  let feesMinor = 0;
  let revenueMinor = 0;
  for (const order of orders) {
    const p = profitOf(order);
    feesMinor += p.ebayFeesMinor + p.adFeesMinor;
    revenueMinor += p.revenueMinor;
  }
  const feeRatio = observedFeeRatio(feesMinor, revenueMinor);
  if (feeRatio === null) return [];

  const byProduct = new Map<string, {
    id: string; title: string; sku: string | null;
    latestCostMinor: number; currentPriceMinor: number; unitsSold: number; profitMinor: number;
  }>();

  for (const order of orders) {
    const p = profitOf(order);
    for (const item of order.items) {
      if (!item.productId) continue;
      const cost = item.costs[0]?.unitCostMinor;
      if (cost === undefined) continue;

      const existing = byProduct.get(item.productId) ?? {
        id: item.productId, title: item.title, sku: item.sku,
        latestCostMinor: cost, currentPriceMinor: item.unitPriceMinor,
        unitsSold: 0, profitMinor: 0,
      };
      existing.unitsSold += item.quantity;
      existing.profitMinor += Math.round(p.netProfitMinor / order.items.length);
      // The most recent order wins for both price and cost.
      existing.currentPriceMinor = item.unitPriceMinor;
      existing.latestCostMinor = cost;
      byProduct.set(item.productId, existing);
    }
  }

  return [...byProduct.values()]
    .map((product) => {
      const floorMinor = breakEvenPriceMinor(product.latestCostMinor, feeRatio);
      return {
        ...product,
        feeRatio,
        floorMinor,
        headroomMinor: floorMinor === null ? null : product.currentPriceMinor - floorMinor,
      };
    })
    .filter((p) => p.headroomMinor !== null)
    .sort((a, b) => (a.headroomMinor ?? 0) - (b.headroomMinor ?? 0))
    .slice(0, 10);
}

export type PriceFloorRow = Awaited<ReturnType<typeof buildPriceFloors>>[number];

function ProtectionSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-28" />)}
      </div>
      <div className="card overflow-hidden pt-4">
        <TableSkeleton rows={8} columns={6} />
      </div>
    </>
  );
}

export { recoverableOf };
