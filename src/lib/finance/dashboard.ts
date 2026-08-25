import { prisma } from "@/lib/db/client";
import { startOfMonth, endOfDay, differenceInHours } from "date-fns";
import {
  loadOrders, totalsForPeriod, profitOf, periodOrderWhere,
  type PeriodTotals, type LoadedOrder,
} from "./aggregate";
import { bucketsFor, previousPeriod, type Period } from "./periods";
import type { RefundAttribution } from "./types";
import type { Minor } from "@/lib/money";

/**
 * Everything the dashboard shows, assembled once.
 *
 * The two-card layout from the reference — "This month" beside a comparison
 * window — is preserved because it is genuinely the right shape: a dropshipper
 * settles by month but works by day.
 */

export interface DashboardData {
  currency: string;
  monthPeriod: Period;
  month: PeriodTotals & { label: string };
  window: PeriodTotals & { label: string };
  windowPrevious: PeriodTotals | null;
  trend: { label: string; revenue: number; profit: number; orders: number }[];
  outstanding: Outstanding;
  topProducts: TopProduct[];
  accounts: AccountRow[];
  attention: AttentionItem[];
}

export interface Outstanding {
  unpricedOrders: number;
  unpricedRevenueMinor: Minor;
  refundsNeedingAnswer: number;
  refundsRecoverableMinor: Minor;
  returnsAwaitingAction: number;
  recoveredToDateMinor: Minor;
  stillRecoverableMinor: Minor;
  ordersPastDispatchDeadline: number;
  ordersAwaitingDispatch: number;
}

export interface TopProduct {
  id: string;
  title: string;
  sku: string | null;
  unitsSold: number;
  revenueMinor: Minor;
  profitMinor: Minor;
  marginRatio: number | null;
  priced: boolean;
}

export interface AccountRow {
  id: string;
  username: string;
  marketplaceId: string;
  status: string;
  isMock: boolean;
  lastSyncAt: Date | null;
  sellerLevel: string | null;
  lateDispatchRate: number | null;
  transactionDefectRate: number | null;
  casesClosedWithoutSellerResolutionRate: number | null;
  healthNextEvaluationAt: Date | null;
  orderCount: number;
  revenueMinor: Minor;
  profitMinor: Minor;
  marginRatio: number | null;
  dispatchedOnTime: number;
  dispatchedLate: number;
  awaitingDispatch: number;
  cancellations: number;
}

export interface AttentionItem {
  key: string;
  count: number;
  label: string;
  href: string;
  tone: "caution" | "negative" | "info";
}

export async function buildDashboard(
  workspaceId: string,
  currency: string,
  attribution: RefundAttribution,
  window: Period,
): Promise<DashboardData> {
  const now = new Date();
  const month: Period = {
    key: "this_month",
    label: "This month",
    from: startOfMonth(now),
    to: endOfDay(now),
    unbounded: false,
  };
  const previous = previousPeriod(window);

  // One widened query covers the month, the window and the comparison window.
  const earliest = new Date(Math.min(+month.from, +window.from, previous ? +previous.from : +window.from));
  const orders = await loadOrders(
    periodOrderWhere(workspaceId, { ...month, from: earliest, to: endOfDay(now) }, attribution),
  );

  const [monthExpenses, windowExpenses, previousExpenses] = await Promise.all([
    sumExpenses(workspaceId, month),
    sumExpenses(workspaceId, window),
    previous ? sumExpenses(workspaceId, previous) : Promise.resolve(0),
  ]);

  const monthTotals = { ...totalsForPeriod(orders, month, attribution, currency, monthExpenses), label: "This month" };
  const windowTotals = { ...totalsForPeriod(orders, window, attribution, currency, windowExpenses), label: window.label };
  const previousTotals = previous ? totalsForPeriod(orders, previous, attribution, currency, previousExpenses) : null;

  return {
    currency,
    monthPeriod: month,
    month: monthTotals,
    window: windowTotals,
    windowPrevious: previousTotals,
    trend: buildTrend(orders, window, attribution, currency),
    outstanding: await buildOutstanding(workspaceId),
    topProducts: buildTopProducts(orders, window),
    accounts: await buildAccounts(workspaceId, orders, window),
    attention: await buildAttention(workspaceId),
  };
}

async function sumExpenses(workspaceId: string, period: Period): Promise<Minor> {
  const result = await prisma.expense.aggregate({
    where: { workspaceId, date: { gte: period.from, lte: period.to } },
    _sum: { amountMinor: true },
  });
  return result._sum.amountMinor ?? 0;
}

function buildTrend(
  orders: LoadedOrder[],
  period: Period,
  attribution: RefundAttribution,
  currency: string,
) {
  return bucketsFor(period).map((bucket) => {
    const totals = totalsForPeriod(
      orders,
      { key: "custom", label: bucket.label, from: bucket.from, to: bucket.to, unbounded: false },
      attribution,
      currency,
      0,
    );
    return {
      label: bucket.label,
      revenue: totals.revenueMinor,
      // Business expenses are monthly, so they are excluded from a daily
      // trend — spreading them would make one arbitrary day look terrible.
      profit: totals.grossProfitMinor - totals.refundLossMinor,
      orders: totals.orderCount,
    };
  });
}

async function buildOutstanding(workspaceId: string): Promise<Outstanding> {
  const now = new Date();

  const [openOrders, openRefunds, returns, settled, awaitingDispatch] = await Promise.all([
    // "Unpriced" is a property of the cost ledger, so it has to be computed
    // rather than filtered — but it is bounded to non-cancelled orders.
    loadOrders({ workspaceId, cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" } }),
    prisma.refund.findMany({
      where: { order: { workspaceId }, supplierClaim: { in: ["NOT_ASKED", "ASKED", "PROMISED"] } },
      select: { buyerRefundMinor: true, feeCreditMinor: true, recoveredMinor: true },
    }),
    prisma.refund.count({
      where: { order: { workspaceId }, type: "RETURN", returnState: { not: "CLOSED" } },
    }),
    prisma.refund.aggregate({
      where: { order: { workspaceId }, supplierClaim: { in: ["RECEIVED", "PARTIAL"] } },
      _sum: { recoveredMinor: true },
    }),
    prisma.order.findMany({
      where: { workspaceId, fulfillmentStatus: "AWAITING_DISPATCH", cancelState: "NONE" },
      select: { dispatchDeadline: true },
    }),
  ]);

  let unpricedOrders = 0;
  let unpricedRevenueMinor = 0;
  for (const order of openOrders) {
    const p = profitOf(order);
    if (p.isPriced) continue;
    unpricedOrders += 1;
    unpricedRevenueMinor += p.revenueMinor;
  }

  const stillRecoverableMinor = openRefunds.reduce(
    (sum, r) => sum + Math.max(0, r.buyerRefundMinor - r.feeCreditMinor - r.recoveredMinor),
    0,
  );

  return {
    unpricedOrders,
    unpricedRevenueMinor,
    refundsNeedingAnswer: openRefunds.length,
    refundsRecoverableMinor: stillRecoverableMinor,
    returnsAwaitingAction: returns,
    recoveredToDateMinor: settled._sum.recoveredMinor ?? 0,
    stillRecoverableMinor,
    ordersPastDispatchDeadline: awaitingDispatch.filter(
      (o) => o.dispatchDeadline && o.dispatchDeadline < now,
    ).length,
    ordersAwaitingDispatch: awaitingDispatch.length,
  };
}

function buildTopProducts(orders: LoadedOrder[], period: Period): TopProduct[] {
  const map = new Map<string, TopProduct & { revenueForMargin: number }>();

  for (const order of orders) {
    if (order.orderDate < period.from || order.orderDate > period.to) continue;
    if (order.cancelState === "CANCELLED_BEFORE_FULFILMENT") continue;

    const p = profitOf(order);
    const lineCount = order.items.length || 1;

    for (const item of order.items) {
      const key = item.productId ?? item.title;
      const existing = map.get(key) ?? {
        id: item.productId ?? key,
        title: item.title,
        sku: item.sku,
        unitsSold: 0,
        revenueMinor: 0,
        profitMinor: 0,
        marginRatio: null,
        priced: true,
        revenueForMargin: 0,
      };
      existing.unitsSold += item.quantity;
      existing.revenueMinor += item.unitPriceMinor * item.quantity;
      // Order-level profit is shared evenly across its lines; most orders have
      // one line, and apportioning fees per line would imply a precision the
      // marketplace data does not have.
      existing.profitMinor += Math.round(p.netProfitMinor / lineCount);
      existing.revenueForMargin += item.unitPriceMinor * item.quantity;
      if (!p.isPriced) existing.priced = false;
      map.set(key, existing);
    }
  }

  return [...map.values()]
    .map((p) => ({
      ...p,
      marginRatio: p.revenueForMargin > 0 ? p.profitMinor / p.revenueForMargin : null,
    }))
    .sort((a, b) => b.profitMinor - a.profitMinor)
    .slice(0, 6);
}

async function buildAccounts(
  workspaceId: string,
  orders: LoadedOrder[],
  period: Period,
): Promise<AccountRow[]> {
  const accounts = await prisma.ebayAccount.findMany({
    where: { workspaceId, status: { not: "DISCONNECTED" } },
    orderBy: { connectedAt: "asc" },
  });

  return accounts.map((account) => {
    const own = orders.filter(
      (o) => o.ebayAccountId === account.id && o.orderDate >= period.from && o.orderDate <= period.to,
    );
    const live = own.filter((o) => o.cancelState !== "CANCELLED_BEFORE_FULFILMENT");

    let revenueMinor = 0;
    let profitMinor = 0;
    for (const order of live) {
      const p = profitOf(order);
      revenueMinor += p.revenueMinor;
      profitMinor += p.netProfitMinor;
    }

    const dispatched = live.filter((o) => o.dispatchedAt);
    const dispatchedLate = dispatched.filter(
      (o) => o.dispatchDeadline && o.dispatchedAt && o.dispatchedAt > o.dispatchDeadline,
    ).length;

    return {
      id: account.id,
      username: account.username,
      marketplaceId: account.marketplaceId,
      status: account.status,
      isMock: account.isMock,
      lastSyncAt: account.lastSyncAt,
      sellerLevel: account.sellerLevel,
      lateDispatchRate: account.lateDispatchRate,
      transactionDefectRate: account.transactionDefectRate,
      casesClosedWithoutSellerResolutionRate: account.casesClosedWithoutSellerResolutionRate,
      healthNextEvaluationAt: account.healthNextEvaluationAt,
      orderCount: live.length,
      revenueMinor,
      profitMinor,
      marginRatio: revenueMinor > 0 ? profitMinor / revenueMinor : null,
      dispatchedOnTime: dispatched.length - dispatchedLate,
      dispatchedLate,
      awaitingDispatch: live.filter((o) => o.fulfillmentStatus === "AWAITING_DISPATCH").length,
      cancellations: own.filter((o) => o.cancelState !== "NONE").length,
    };
  });
}

async function buildAttention(workspaceId: string): Promise<AttentionItem[]> {
  const now = new Date();

  const [notAsked, promisedOverdue, returnsOpen, brokenAccounts, dispatchLate] = await Promise.all([
    prisma.refund.count({ where: { order: { workspaceId }, supplierClaim: "NOT_ASKED" } }),
    prisma.refund.count({
      where: { order: { workspaceId }, supplierClaim: "PROMISED", promisedByDate: { lt: now } },
    }),
    prisma.refund.count({
      where: { order: { workspaceId }, type: "RETURN", returnState: { not: "CLOSED" } },
    }),
    prisma.ebayAccount.count({
      where: { workspaceId, status: { notIn: ["CONNECTED", "DISCONNECTED"] } },
    }),
    prisma.order.count({
      where: {
        workspaceId, fulfillmentStatus: "AWAITING_DISPATCH", cancelState: "NONE",
        dispatchDeadline: { lt: now },
      },
    }),
  ]);

  const items: AttentionItem[] = [
    { key: "not-asked", count: notAsked, label: "supplier refunds not asked for", href: "/profit-protection", tone: "caution" },
    { key: "promised-overdue", count: promisedOverdue, label: "promised refunds now overdue", href: "/profit-protection?tab=promised", tone: "negative" },
    { key: "returns", count: returnsOpen, label: "returns awaiting your action", href: "/returns?tab=returns", tone: "caution" },
    { key: "accounts", count: brokenAccounts, label: "eBay accounts need attention", href: "/ebay-accounts", tone: "negative" },
    { key: "dispatch", count: dispatchLate, label: "orders past their dispatch deadline", href: "/orders?fulfilment=past_deadline", tone: "negative" },
  ];

  return items.filter((item) => item.count > 0);
}

/** Hours until eBay's dispatch deadline, for the orders table. */
export function hoursToDeadline(deadline: Date | null): number | null {
  return deadline ? differenceInHours(deadline, new Date()) : null;
}
