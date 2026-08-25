import { prisma } from "@/lib/db/client";
import { subDays } from "date-fns";
import { profitOf, loadOrders } from "@/lib/finance/aggregate";
import { breakEvenPriceMinor, observedFeeRatio } from "@/lib/finance/profit";
import { formatMoney, formatPercent } from "@/lib/money";

/**
 * Automatic findings — declining margins, rising supplier costs, refund-prone
 * products. (R15)
 *
 * Each finding has a dedupe key so re-running does not stack duplicates, and a
 * dismissed insight stays dismissed until the underlying number moves.
 */

const LOOKBACK_DAYS = 60;
const RECENT_DAYS = 14;
const MIN_SALES_FOR_SIGNAL = 4;

export async function generateInsights(workspaceId: string): Promise<number> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return 0;

  const since = subDays(new Date(), LOOKBACK_DAYS);
  const orders = await loadOrders({
    workspaceId,
    orderDate: { gte: since },
    cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
  });
  if (orders.length === 0) return 0;

  const findings: Finding[] = [
    ...refundProneProducts(orders, workspace.currency),
    ...decliningMargins(orders, workspace.currency),
    ...risingSupplierCosts(orders, workspace.currency),
    ...belowBreakEven(orders, workspace.currency),
    ...unpricedBacklog(orders, workspace.currency),
    ...staleChases(orders, workspace.currency),
  ];

  let written = 0;
  for (const finding of findings) {
    await prisma.insight.upsert({
      where: { workspaceId_dedupeKey: { workspaceId, dedupeKey: finding.dedupeKey } },
      create: { workspaceId, ...finding },
      update: { title: finding.title, body: finding.body, severity: finding.severity, generatedAt: new Date() },
    });
    written += 1;
  }
  return written;
}

interface Finding {
  kind: string;
  severity: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  actionHref?: string;
  dedupeKey: string;
}

type Orders = Awaited<ReturnType<typeof loadOrders>>;

/** Products whose refund rate is high enough to be costing real money. */
function refundProneProducts(orders: Orders, currency: string): Finding[] {
  const byProduct = new Map<string, { title: string; id: string; sales: number; refunded: number; loss: number }>();

  for (const order of orders) {
    const p = profitOf(order);
    const refunded = p.refundLossMinor > 0;
    for (const item of order.items) {
      if (!item.productId) continue;
      const bucket = byProduct.get(item.productId) ?? {
        title: item.title, id: item.productId, sales: 0, refunded: 0, loss: 0,
      };
      bucket.sales += 1;
      if (refunded) {
        bucket.refunded += 1;
        bucket.loss += Math.round(p.refundLossMinor / order.items.length);
      }
      byProduct.set(item.productId, bucket);
    }
  }

  const findings: Finding[] = [];
  for (const p of byProduct.values()) {
    if (p.sales < MIN_SALES_FOR_SIGNAL) continue;
    const rate = p.refunded / p.sales;
    if (rate < 0.15) continue;
    findings.push({
      kind: "REFUND_PRONE",
      severity: rate > 0.3 ? "CRITICAL" : "WARNING",
      title: `${truncate(p.title)} is refunded often`,
      body: `${formatPercent(rate)} of its ${plural(p.sales, "sale", "sales")} ended in a refund, costing ${formatMoney(p.loss, currency)}. Check the listing description and the supplier's quality.`,
      entityType: "product",
      entityId: p.id,
      actionHref: `/products/${p.id}`,
      dedupeKey: `refund-prone-${p.id}`,
    });
  }
  return findings;
}

/** Margin in the last fortnight against the fortnight before it. */
function decliningMargins(orders: Orders, currency: string): Finding[] {
  const cutoff = subDays(new Date(), RECENT_DAYS);
  const recent = { revenue: 0, profit: 0, count: 0 };
  const earlier = { revenue: 0, profit: 0, count: 0 };

  for (const order of orders) {
    const p = profitOf(order);
    if (!p.isPriced) continue;
    const bucket = order.orderDate >= cutoff ? recent : earlier;
    bucket.revenue += p.revenueMinor;
    bucket.profit += p.netProfitMinor;
    bucket.count += 1;
  }

  if (recent.count < MIN_SALES_FOR_SIGNAL || earlier.count < MIN_SALES_FOR_SIGNAL) return [];
  if (recent.revenue === 0 || earlier.revenue === 0) return [];

  const recentMargin = recent.profit / recent.revenue;
  const earlierMargin = earlier.profit / earlier.revenue;
  const drop = earlierMargin - recentMargin;
  if (drop < 0.03) return [];

  return [{
    kind: "DECLINING_MARGIN",
    severity: drop > 0.08 ? "CRITICAL" : "WARNING",
    title: "Your margin is slipping",
    body: `Margin fell from ${formatPercent(earlierMargin)} to ${formatPercent(recentMargin)} over the last ${RECENT_DAYS} days — ${formatMoney(Math.round(drop * recent.revenue), currency)} of profit on the same revenue. Check supplier prices and eBay fees.`,
    actionHref: "/profit-and-loss",
    dedupeKey: "declining-margin",
  }];
}

/** Products whose latest buying price is meaningfully above their earlier one. */
function risingSupplierCosts(orders: Orders, currency: string): Finding[] {
  const byProduct = new Map<string, { title: string; id: string; entries: { at: Date; cost: number }[] }>();

  for (const order of orders) {
    for (const item of order.items) {
      const cost = item.costs[0];
      if (!item.productId || !cost) continue;
      const bucket = byProduct.get(item.productId) ?? { title: item.title, id: item.productId, entries: [] };
      bucket.entries.push({ at: cost.createdAt, cost: cost.unitCostMinor });
      byProduct.set(item.productId, bucket);
    }
  }

  const findings: Finding[] = [];
  for (const p of byProduct.values()) {
    if (p.entries.length < 4) continue;
    p.entries.sort((a, b) => +a.at - +b.at);
    const half = Math.floor(p.entries.length / 2);
    const before = average(p.entries.slice(0, half).map((e) => e.cost));
    const after = average(p.entries.slice(half).map((e) => e.cost));
    if (before === 0) continue;
    const rise = (after - before) / before;
    if (rise < 0.1) continue;

    findings.push({
      kind: "RISING_SUPPLIER_COST",
      severity: rise > 0.25 ? "WARNING" : "INFO",
      title: `${truncate(p.title)} costs more than it did`,
      body: `Your buying price rose ${formatPercent(rise)}, from ${formatMoney(Math.round(before), currency)} to ${formatMoney(Math.round(after), currency)} a unit. Re-price the listing or find another supplier.`,
      entityType: "product",
      entityId: p.id,
      actionHref: `/products/${p.id}`,
      dedupeKey: `rising-cost-${p.id}`,
    });
  }
  return findings;
}

/** Priced orders that sold below the price they needed to break even. (R7) */
function belowBreakEven(orders: Orders, currency: string): Finding[] {
  const losers = new Map<string, { title: string; id: string; count: number; loss: number; cost: number; price: number }>();
  let totalFees = 0;
  let totalRevenue = 0;

  for (const order of orders) {
    const p = profitOf(order);
    totalFees += p.ebayFeesMinor + p.adFeesMinor;
    totalRevenue += p.revenueMinor;
  }
  const feeRatio = observedFeeRatio(totalFees, totalRevenue);
  if (feeRatio === null) return [];

  for (const order of orders) {
    const p = profitOf(order);
    if (!p.isPriced || p.grossProfitMinor >= 0) continue;
    for (const item of order.items) {
      const cost = item.costs[0];
      if (!item.productId || !cost) continue;
      const bucket = losers.get(item.productId) ?? {
        title: item.title, id: item.productId, count: 0, loss: 0,
        cost: cost.unitCostMinor, price: item.unitPriceMinor,
      };
      bucket.count += 1;
      bucket.loss += Math.abs(p.grossProfitMinor);
      losers.set(item.productId, bucket);
    }
  }

  const findings: Finding[] = [];
  for (const l of losers.values()) {
    if (l.count < 2) continue;
    const floor = breakEvenPriceMinor(l.cost, feeRatio);
    findings.push({
      kind: "BELOW_BREAK_EVEN",
      severity: "CRITICAL",
      title: `${truncate(l.title)} sells below break-even`,
      body: floor
        ? `${plural(l.count, "order", "orders")} lost ${formatMoney(l.loss, currency)} in total. At ${formatMoney(l.cost, currency)} a unit and ${formatPercent(feeRatio)} fees it needs to sell for at least ${formatMoney(floor, currency)} — it is listed at ${formatMoney(l.price, currency)}.`
        : `${plural(l.count, "order", "orders")} lost ${formatMoney(l.loss, currency)} in total.`,
      entityType: "product",
      entityId: l.id,
      actionHref: `/products/${l.id}`,
      dedupeKey: `below-break-even-${l.id}`,
    });
  }
  return findings;
}

/** How much revenue is sitting outside the profit figure for want of a cost. (I1) */
function unpricedBacklog(orders: Orders, currency: string): Finding[] {
  let count = 0;
  let revenue = 0;
  for (const order of orders) {
    const p = profitOf(order);
    if (p.isPriced || p.isNonLossCancellation) continue;
    count += 1;
    revenue += p.revenueMinor;
  }
  if (count < 5) return [];

  return [{
    kind: "UNPRICED_BACKLOG",
    severity: count > 50 ? "WARNING" : "INFO",
    title: `${plural(count, "order", "orders")} still ${count === 1 ? "has" : "have"} no buying price`,
    body: `${formatMoney(revenue, currency)} of sales is not in your profit yet. Paste your costs in spreadsheet mode and every figure updates at once.`,
    actionHref: "/orders?tab=awaiting_cost",
    dedupeKey: "unpriced-backlog",
  }];
}

/** Supplier refunds that have gone quiet. (R5.6) */
function staleChases(orders: Orders, currency: string): Finding[] {
  const cutoff = subDays(new Date(), 21);
  let count = 0;
  let recoverable = 0;

  for (const order of orders) {
    for (const refund of order.refunds) {
      if (!["NOT_ASKED", "ASKED", "PROMISED"].includes(refund.supplierClaim)) continue;
      if (refund.refundedAt > cutoff) continue;
      count += 1;
      recoverable += Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor - refund.recoveredMinor);
    }
  }
  if (count === 0) return [];

  return [{
    kind: "STALE_CHASE",
    severity: recoverable > 5000 ? "WARNING" : "INFO",
    title: `${plural(count, "supplier refund", "supplier refunds")} ${count === 1 ? "has" : "have"} gone quiet`,
    body: `${formatMoney(recoverable, currency)} has been outstanding for more than three weeks. Chase it or write it off so your profit reflects reality.`,
    actionHref: "/profit-protection",
    dedupeKey: "stale-chase",
  }];
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * "1 supplier refunds have gone quiet" is the kind of sentence that makes a
 * reader trust the numbers less than they should.
 */
function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function truncate(text: string, length = 48): string {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}
