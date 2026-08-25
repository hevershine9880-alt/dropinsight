import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { breakEvenPriceMinor, observedFeeRatio } from "@/lib/finance/profit";
import { PageContainer } from "@/components/shell/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { KpiCard } from "@/components/domain/kpi-card";
import { Money, Percent } from "@/components/domain/money";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CostHistoryChart } from "./cost-history-chart";
import { ArrowLeft, Package, TrendingUp, RotateCcw, Coins, AlertTriangle, Check } from "lucide-react";
import { formatMoney } from "@/lib/money";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, select: { title: true } });
  return { title: product?.title ?? "Product" };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePermission("orders.view");
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, workspaceId: auth.workspace.id },
    include: {
      items: {
        include: {
          order: {
            select: {
              id: true, ebayOrderId: true, orderDate: true, currency: true, cancelState: true,
              itemSubtotalMinor: true, shippingChargedMinor: true, ebayFeesMinor: true, adFeesMinor: true,
              items: { select: { id: true } },
              refunds: { select: { buyerRefundMinor: true, feeCreditMinor: true, recoveredMinor: true } },
            },
          },
          costs: {
            orderBy: { createdAt: "desc" },
            include: { supplier: { select: { id: true, name: true } } },
          },
        },
        orderBy: { order: { orderDate: "desc" } },
      },
    },
  });

  if (!product) notFound();

  const currency = auth.workspace.currency;
  const live = product.items.filter((i) => i.order.cancelState !== "CANCELLED_BEFORE_FULFILMENT");

  let unitsSold = 0;
  let revenueMinor = 0;
  let profitMinor = 0;
  let refundCount = 0;
  let unpriced = 0;
  let feesMinor = 0;

  for (const item of live) {
    const order = item.order;

    // Order-level amounts are apportioned evenly across the order's lines, the
    // same way the dashboard and P&L do it, so the same product shows the same
    // profit wherever it appears.
    const lineCount = order.items.length || 1;
    const lineFeesMinor = Math.round((order.ebayFeesMinor + order.adFeesMinor) / lineCount);
    const orderRefundLossMinor = order.refunds.reduce(
      (sum, refund) => sum + Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor - refund.recoveredMinor),
      0,
    );
    const lineRefundLossMinor = Math.round(orderRefundLossMinor / lineCount);
    const unitCostMinor = item.costs[0]?.unitCostMinor ?? null;
    const lineRevenueMinor = item.unitPriceMinor * item.quantity;

    unitsSold += item.quantity;
    revenueMinor += lineRevenueMinor;
    feesMinor += lineFeesMinor;

    if (unitCostMinor === null) {
      unpriced += 1;
    } else {
      profitMinor += lineRevenueMinor - unitCostMinor * item.quantity - lineFeesMinor - lineRefundLossMinor;
    }

    if (orderRefundLossMinor > 0) refundCount += 1;
  }

  const costEntries = product.items
    .flatMap((item) =>
      item.costs.map((cost) => ({
        id: cost.id,
        unitCostMinor: cost.unitCostMinor,
        createdAt: cost.createdAt,
        supplierName: cost.supplier?.name ?? null,
        source: cost.source,
        orderId: item.order.id,
        ebayOrderId: item.order.ebayOrderId,
      })),
    )
    .sort((a, b) => +b.createdAt - +a.createdAt);

  const latestCost = costEntries[0] ?? null;
  const feeRatio = observedFeeRatio(feesMinor, revenueMinor);
  const breakEven = latestCost && feeRatio !== null ? breakEvenPriceMinor(latestCost.unitCostMinor, feeRatio) : null;
  const currentPrice = live[0]?.unitPriceMinor ?? 0;
  const marginRatio = revenueMinor > 0 ? profitMinor / revenueMinor : null;
  const orderCount = new Set(live.map((i) => i.order.id)).size;

  return (
    <PageContainer>
      <div>
        <Link href="/products" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden />
          All products
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{product.title}</h1>
            <p className="mt-1 text-md text-ink-muted">
              {product.sku ? <span className="tabular">{product.sku}</span> : "No SKU"}
              {product.ebayItemId ? <> · eBay item <span className="tabular">{product.ebayItemId}</span></> : null}
            </p>
          </div>
          {unpriced > 0 ? (
            <Badge tone="caution" icon={AlertTriangle}>{unpriced} order lines still need a cost</Badge>
          ) : (
            <Badge tone="positive" icon={Check}>Fully costed</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Units sold" icon={Package} value={<span className="tabular">{unitsSold.toLocaleString()}</span>} footer={`${orderCount} orders`} />
        <KpiCard label="Revenue" icon={Coins} tone="brand" value={<Money minor={revenueMinor} currency={currency} />} />
        <KpiCard
          label="Total profit"
          icon={TrendingUp}
          tone={profitMinor >= 0 ? "positive" : "negative"}
          value={<Money minor={profitMinor} currency={currency} signed />}
          coverage={{ priced: live.length - unpriced, total: live.length }}
          footer={<>Margin <Percent ratio={marginRatio} /></>}
        />
        <KpiCard
          label="Refunds"
          icon={RotateCcw}
          tone={refundCount > 0 ? "negative" : "neutral"}
          value={<span className="tabular">{refundCount}</span>}
          footer={orderCount > 0 ? `${((refundCount / orderCount) * 100).toFixed(0)}% of its orders` : undefined}
        />
        <KpiCard
          label="Break-even price"
          icon={AlertTriangle}
          tone={breakEven !== null && currentPrice < breakEven ? "negative" : "neutral"}
          value={breakEven === null ? <span className="text-ink-subtle">—</span> : <Money minor={breakEven} currency={currency} />}
          footer={
            breakEven === null
              ? "needs a buying price"
              : currentPrice < breakEven
                ? `listed at ${formatMoney(currentPrice, currency)} — below break-even`
                : `listed at ${formatMoney(currentPrice, currency)}`
          }
          explain={
            feeRatio !== null
              ? `The lowest price this can sell at and still cover its cost plus the ${(feeRatio * 100).toFixed(1)}% fee rate your orders actually paid.`
              : undefined
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Cost history"
            description="Every buying price you have entered for this product. The most recent one drives the suggestion on new orders."
          />
          <CardBody>
            {costEntries.length === 0 ? (
              <EmptyState
                icon={Coins}
                title="No buying prices yet"
                description="Enter a cost on any order of this product and it will appear here — and be suggested next time."
                className="py-8"
                action={
                  <Link href="/orders?tab=awaiting_cost" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover">
                    Enter buying prices
                  </Link>
                }
              />
            ) : (
              <CostHistoryChart
                entries={costEntries.map((e) => ({
                  label: format(e.createdAt, "d MMM"),
                  cost: e.unitCostMinor,
                })).reverse()}
                currency={currency}
              />
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Recent orders" />
          {live.length === 0 ? (
            <EmptyState icon={Package} title="No sales in range" description="This product has not sold recently." className="py-8" />
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto border-t border-line">
              {live.slice(0, 20).map((item) => (
                <li key={item.id}>
                  <Link href={`/orders/${item.order.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-surface-hover">
                    <span className="min-w-0">
                      <span className="tabular block truncate text-sm font-medium text-brand">{item.order.ebayOrderId}</span>
                      <span className="block text-xs text-ink-muted">
                        {format(item.order.orderDate, "d MMM yyyy")} · {item.quantity} ×{" "}
                        {formatMoney(item.unitPriceMinor, currency)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      {item.costs[0] ? (
                        <span className="tabular text-ink-muted">{formatMoney(item.costs[0].unitCostMinor, currency)}</span>
                      ) : (
                        <span className="text-caution-ink">no cost</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
