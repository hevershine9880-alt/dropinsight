import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { profitOf } from "@/lib/finance/aggregate";
import { can } from "@/lib/auth/permissions";
import { PageContainer } from "@/components/shell/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge, PaymentStatusBadge, SupplierClaimBadge } from "@/components/domain/status";
import { ProfitBreakdown } from "./profit-breakdown";
import { OrderLines } from "./order-lines";
import { OrderTimeline } from "./order-timeline";
import { OrderNotes } from "./order-notes";
import { RefundPanel } from "./refund-panel";
import { ArrowLeft, ExternalLink, Truck, User, Store, Clock, FlaskConical } from "lucide-react";
import { marketplaceName } from "../../dashboard/accounts-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, select: { ebayOrderId: true } });
  return { title: order ? `Order ${order.ebayOrderId}` : "Order" };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePermission("orders.view");
  const { id } = await params;

  const order = await prisma.order.findFirst({
    // Scoped by workspace: a valid id from another workspace is a 404, not a leak.
    where: { id, workspaceId: auth.workspace.id },
    include: {
      ebayAccount: true,
      items: {
        include: {
          product: { select: { id: true, title: true, sku: true } },
          costs: {
            orderBy: { createdAt: "desc" },
            include: {
              supplier: { select: { id: true, name: true } },
              createdBy: { select: { name: true } },
            },
          },
        },
      },
      refunds: { include: { supplier: { select: { id: true, name: true } } }, orderBy: { refundedAt: "desc" } },
    },
  });

  if (!order) notFound();

  const profit = profitOf(order);
  const canSeeProfit = can(auth.workspace.role, "dashboard.view");
  const canWriteCosts = can(auth.workspace.role, "costs.write");
  const canAnswerRefunds = can(auth.workspace.role, "refunds.answer");

  return (
    <PageContainer>
      <div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All orders
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="tabular text-2xl font-semibold tracking-tight">{order.ebayOrderId}</h1>
            <p className="mt-1 text-md text-ink-muted">
              Placed <time dateTime={order.orderDate.toISOString()}>{format(order.orderDate, "EEEE d MMMM yyyy 'at' HH:mm")}</time>
              {" · "}
              {formatDistanceToNow(order.orderDate, { addSuffix: true })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge
              fulfillmentStatus={order.fulfillmentStatus}
              cancelState={order.cancelState}
              paymentStatus={order.paymentStatus}
            />
            <PaymentStatusBadge status={order.paymentStatus} />
            {order.ebayAccount.isMock ? <Badge tone="info" icon={FlaskConical}>Demo data</Badge> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <OrderLines
            currency={order.currency}
            lines={order.items.map((item) => ({
              id: item.id,
              title: item.title,
              sku: item.sku,
              productId: item.product?.id ?? null,
              quantity: item.quantity,
              unitPriceMinor: item.unitPriceMinor,
              currentCostMinor: item.costs[0]?.unitCostMinor ?? null,
              supplierName: item.costs[0]?.supplier?.name ?? null,
              supplierOrderNumber: item.costs[0]?.supplierOrderNumber ?? null,
              history: item.costs.map((cost) => ({
                id: cost.id,
                unitCostMinor: cost.unitCostMinor,
                source: cost.source,
                supplierName: cost.supplier?.name ?? null,
                createdAt: cost.createdAt.toISOString(),
                createdBy: cost.createdBy?.name ?? null,
              })),
            }))}
            editable={canWriteCosts}
          />

          {order.refunds.length > 0 ? (
            <RefundPanel
              refunds={order.refunds.map((refund) => ({
                id: refund.id,
                type: refund.type,
                refundedAt: refund.refundedAt.toISOString(),
                buyerRefundMinor: refund.buyerRefundMinor,
                feeCreditMinor: refund.feeCreditMinor,
                recoveredMinor: refund.recoveredMinor,
                supplierClaim: refund.supplierClaim,
                supplierName: refund.supplier?.name ?? null,
                reason: refund.reason,
                notes: refund.notes,
                promisedByDate: refund.promisedByDate?.toISOString() ?? null,
              }))}
              currency={order.currency}
              editable={canAnswerRefunds}
            />
          ) : null}

          <OrderTimeline order={order} />
        </div>

        <div className="space-y-4">
          {canSeeProfit ? <ProfitBreakdown profit={profit} currency={order.currency} /> : null}

          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Detail icon={Store} label="eBay account">
                  <Link href="/ebay-accounts" className="font-medium text-brand hover:underline">
                    {order.ebayAccount.username}
                  </Link>
                  <span className="block text-ink-muted">{marketplaceName(order.ebayAccount.marketplaceId)}</span>
                </Detail>

                <Detail icon={User} label="Buyer">
                  <Link href={`/orders?search=${encodeURIComponent(order.buyerUsername)}`} className="font-medium text-brand hover:underline">
                    {order.buyerUsername}
                  </Link>
                  {order.buyerFeedback !== null ? (
                    <span className="tabular block text-ink-muted">{order.buyerFeedback}% feedback</span>
                  ) : null}
                  {order.shipToCity || order.shipToCountry ? (
                    <span className="block text-ink-muted">
                      {[order.shipToCity, order.shipToCountry].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                </Detail>

                <Detail icon={Truck} label="Dispatch">
                  {order.dispatchedAt ? (
                    <>
                      <span className="block">Dispatched {format(order.dispatchedAt, "d MMM yyyy")}</span>
                      {order.dispatchDeadline ? (
                        <span
                          className={
                            order.dispatchedAt > order.dispatchDeadline ? "block text-negative" : "block text-positive"
                          }
                        >
                          {order.dispatchedAt > order.dispatchDeadline ? "After" : "Within"} eBay&rsquo;s deadline
                          {" "}({format(order.dispatchDeadline, "d MMM")})
                        </span>
                      ) : null}
                    </>
                  ) : order.cancelState !== "NONE" ? (
                    <span className="text-ink-muted">Not dispatched — cancelled</span>
                  ) : (
                    <>
                      <span className="block text-caution-ink">Not dispatched yet</span>
                      {order.dispatchDeadline ? (
                        <span className="block text-ink-muted">
                          Deadline {format(order.dispatchDeadline, "d MMM yyyy")}
                        </span>
                      ) : null}
                    </>
                  )}
                  {order.trackingNumber ? (
                    <span className="tabular mt-1 block text-ink-muted">
                      {order.carrier ? `${order.carrier} · ` : ""}{order.trackingNumber}
                    </span>
                  ) : order.dispatchedAt ? (
                    <span className="mt-1 block text-caution-ink">Dispatched without tracking</span>
                  ) : null}
                </Detail>

                <Detail icon={Clock} label="Last synced">
                  <span className="text-ink-muted">
                    {formatDistanceToNow(order.lastSyncedAt, { addSuffix: true })}
                  </span>
                </Detail>

                {order.refunds.some((r) => r.supplierClaim !== "NOT_APPLICABLE") ? (
                  <Detail icon={ExternalLink} label="Supplier claim">
                    <SupplierClaimBadge claim={order.refunds[0].supplierClaim} />
                  </Detail>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          <OrderNotes orderId={order.id} notes={order.notes} editable={canWriteCosts} />
        </div>
      </div>
    </PageContainer>
  );
}

function Detail({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium tracking-wide text-ink-subtle uppercase">{label}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}
