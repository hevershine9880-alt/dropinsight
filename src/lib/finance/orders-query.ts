import { prisma } from "@/lib/db/client";
import { profitOf, type LoadedOrder } from "./aggregate";
import type { Period } from "./periods";
import type { OrderProfit } from "./types";
import type { Prisma } from "@/generated/prisma";

/**
 * Orders list querying.
 *
 * Filtering and pagination are done in the database wherever the predicate is
 * expressible in SQL. Two are not — "awaiting cost" and "made a loss" both
 * depend on the cost ledger and on computed profit — so those are resolved by
 * first narrowing to candidate ids with a cheap query, then filtering. That is
 * still bounded work, and it is honest about the cost rather than pulling the
 * whole table into memory and calling it a filter.
 */

export const ORDER_TABS = ["all", "awaiting_cost", "refunded", "returned", "cancelled", "made_a_loss"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export const FULFILMENT_FILTERS = [
  "awaiting_dispatch", "past_deadline", "dispatched_on_time", "dispatched_late",
  "in_transit", "delivered", "no_tracking",
] as const;
export type FulfilmentFilter = (typeof FULFILMENT_FILTERS)[number];

export const ORDER_SORTS = ["date", "amount", "profit", "margin", "buyer"] as const;

export interface OrdersQuery {
  workspaceId: string;
  period: Period;
  tab: OrderTab;
  fulfilment: FulfilmentFilter[];
  accountIds: string[];
  search: string;
  page: number;
  pageSize: number;
  sort: { key: string; direction: "asc" | "desc" };
}

export interface OrderRow {
  id: string;
  ebayOrderId: string;
  orderDate: Date;
  buyerUsername: string;
  buyerFeedback: number | null;
  accountId: string;
  accountUsername: string;
  currency: string;
  itemCount: number;
  firstItemTitle: string;
  firstItemSku: string | null;
  /** Line ids and current costs, so the table can cost a row without another query. */
  lines: { id: string; title: string; quantity: number; unitCostMinor: number | null }[];
  fulfillmentStatus: string;
  paymentStatus: string;
  cancelState: string;
  dispatchDeadline: Date | null;
  dispatchedAt: Date | null;
  trackingNumber: string | null;
  profit: OrderProfit;
}

export interface OrdersResult {
  rows: OrderRow[];
  total: number;
  tabCounts: Record<OrderTab, number>;
  fulfilmentCounts: Record<FulfilmentFilter, number>;
}

/** The SQL-expressible part of the filter. */
function baseWhere(query: OrdersQuery): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    workspaceId: query.workspaceId,
  };

  if (!query.period.unbounded) {
    where.orderDate = { gte: query.period.from, lte: query.period.to };
  }

  if (query.accountIds.length > 0) {
    where.ebayAccountId = { in: query.accountIds };
  }

  if (query.search.trim()) {
    const term = query.search.trim();
    where.OR = [
      { ebayOrderId: { contains: term } },
      { legacyOrderId: { contains: term } },
      { buyerUsername: { contains: term } },
      { trackingNumber: { contains: term } },
      { items: { some: { OR: [{ sku: { contains: term } }, { title: { contains: term } }] } } },
    ];
  }

  const tabWhere = whereForTab(query.tab);
  return tabWhere ? { AND: [where, tabWhere] } : where;
}

function whereForTab(tab: OrderTab): Prisma.OrderWhereInput | null {
  switch (tab) {
    case "refunded":
      return { paymentStatus: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] }, cancelState: "NONE" };
    case "returned":
      return { refunds: { some: { type: "RETURN" } } };
    case "cancelled":
      return { cancelState: { not: "NONE" } };
    default:
      return null;
  }
}

const now = () => new Date();

function whereForFulfilment(filters: FulfilmentFilter[]): Prisma.OrderWhereInput | null {
  if (filters.length === 0) return null;

  const clauses: Prisma.OrderWhereInput[] = filters.map((filter) => {
    switch (filter) {
      case "awaiting_dispatch":
        return { fulfillmentStatus: "AWAITING_DISPATCH", cancelState: "NONE" };
      case "past_deadline":
        return { fulfillmentStatus: "AWAITING_DISPATCH", cancelState: "NONE", dispatchDeadline: { lt: now() } };
      case "dispatched_on_time":
        // Prisma cannot compare two columns, so "on time" is expressed as
        // "dispatched, and not in the late set" by the caller's exclusion below.
        return { dispatchedAt: { not: null } };
      case "dispatched_late":
        return { dispatchedAt: { not: null } };
      case "in_transit":
        return { fulfillmentStatus: "IN_TRANSIT" };
      case "delivered":
        return { fulfillmentStatus: "DELIVERED" };
      case "no_tracking":
        return { dispatchedAt: { not: null }, trackingNumber: null };
    }
  });

  return { OR: clauses };
}

/** Filters that cannot be expressed in SQL and must be applied to loaded rows. */
function needsComputedPass(query: OrdersQuery): boolean {
  return (
    query.tab === "awaiting_cost" ||
    query.tab === "made_a_loss" ||
    query.fulfilment.includes("dispatched_on_time") ||
    query.fulfilment.includes("dispatched_late") ||
    ["profit", "margin"].includes(query.sort.key)
  );
}

const ORDER_BY: Record<string, (d: "asc" | "desc") => Prisma.OrderOrderByWithRelationInput> = {
  date: (d) => ({ orderDate: d }),
  amount: (d) => ({ totalMinor: d }),
  buyer: (d) => ({ buyerUsername: d }),
};

export async function queryOrders(query: OrdersQuery): Promise<OrdersResult> {
  const where = baseWhere(query);
  const fulfilmentWhere = whereForFulfilment(query.fulfilment);
  const combined: Prisma.OrderWhereInput = fulfilmentWhere ? { AND: [where, fulfilmentWhere] } : where;

  const include = {
    ebayAccount: { select: { id: true, username: true } },
    items: { include: { costs: { orderBy: { createdAt: "desc" as const }, take: 1 } } },
    refunds: true,
  };

  let rows: OrderRow[];
  let total: number;

  if (needsComputedPass(query)) {
    // Load the candidate set, apply the computed predicate, then page.
    // Bounded by the period and the other filters already applied.
    const candidates = await prisma.order.findMany({
      where: combined,
      include,
      orderBy: { orderDate: "desc" },
      take: 5000,
    });

    const filtered = candidates.filter((order) => matchesComputed(order, query));
    total = filtered.length;

    const sorted = sortComputed(filtered, query.sort);
    rows = sorted
      .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      .map(toRow);
  } else {
    const orderBy = (ORDER_BY[query.sort.key] ?? ORDER_BY.date)(query.sort.direction);
    const [found, count] = await Promise.all([
      prisma.order.findMany({
        where: combined,
        include,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.order.count({ where: combined }),
    ]);
    rows = found.map(toRow);
    total = count;
  }

  const [tabCounts, fulfilmentCounts] = await Promise.all([
    countTabs(query),
    countFulfilment(query),
  ]);

  return { rows, total, tabCounts, fulfilmentCounts };
}

type FullOrder = LoadedOrder & {
  ebayAccount: { id: string; username: string };
};

function matchesComputed(order: FullOrder, query: OrdersQuery): boolean {
  const p = profitOf(order);

  if (query.tab === "awaiting_cost" && (p.isPriced || p.isNonLossCancellation)) return false;
  if (query.tab === "made_a_loss" && !(p.isPriced && p.netProfitMinor < 0)) return false;

  const late = !!(order.dispatchDeadline && order.dispatchedAt && order.dispatchedAt > order.dispatchDeadline);
  if (query.fulfilment.includes("dispatched_late") && !late) {
    // Only exclude when "late" was the sole dispatch-timing filter selected.
    if (!query.fulfilment.includes("dispatched_on_time")) return false;
  }
  if (query.fulfilment.includes("dispatched_on_time") && late) {
    if (!query.fulfilment.includes("dispatched_late")) return false;
  }

  return true;
}

function sortComputed(orders: FullOrder[], sort: { key: string; direction: "asc" | "desc" }): FullOrder[] {
  const sign = sort.direction === "asc" ? 1 : -1;

  if (sort.key === "profit" || sort.key === "margin") {
    const value = (o: FullOrder) => {
      const p = profitOf(o);
      if (sort.key === "margin") return p.marginRatio ?? -Infinity;
      return p.netProfitMinor;
    };
    return [...orders].sort((a, b) => (value(a) - value(b)) * sign);
  }

  if (sort.key === "amount") return [...orders].sort((a, b) => (a.totalMinor - b.totalMinor) * sign);
  if (sort.key === "buyer") return [...orders].sort((a, b) => a.buyerUsername.localeCompare(b.buyerUsername) * sign);
  return [...orders].sort((a, b) => (+a.orderDate - +b.orderDate) * sign);
}

function toRow(order: FullOrder): OrderRow {
  return {
    id: order.id,
    ebayOrderId: order.ebayOrderId,
    orderDate: order.orderDate,
    buyerUsername: order.buyerUsername,
    buyerFeedback: order.buyerFeedback,
    accountId: order.ebayAccount.id,
    accountUsername: order.ebayAccount.username,
    currency: order.currency,
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    firstItemTitle: order.items[0]?.title ?? "—",
    firstItemSku: order.items[0]?.sku ?? null,
    lines: order.items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unitCostMinor: item.costs[0]?.unitCostMinor ?? null,
    })),
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    cancelState: order.cancelState,
    dispatchDeadline: order.dispatchDeadline,
    dispatchedAt: order.dispatchedAt,
    trackingNumber: order.trackingNumber,
    profit: profitOf(order),
  };
}

/** Tab counts ignore the tab itself but respect every other active filter. */
async function countTabs(query: OrdersQuery): Promise<Record<OrderTab, number>> {
  const scope = baseWhere({ ...query, tab: "all" });

  const [all, refunded, returned, cancelled, forComputed] = await Promise.all([
    prisma.order.count({ where: scope }),
    prisma.order.count({ where: { AND: [scope, whereForTab("refunded")!] } }),
    prisma.order.count({ where: { AND: [scope, whereForTab("returned")!] } }),
    prisma.order.count({ where: { AND: [scope, whereForTab("cancelled")!] } }),
    prisma.order.findMany({
      where: { AND: [scope, { cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" } }] },
      include: { items: { include: { costs: { orderBy: { createdAt: "desc" }, take: 1 } } }, refunds: true },
      take: 5000,
    }),
  ]);

  let awaitingCost = 0;
  let madeALoss = 0;
  for (const order of forComputed) {
    const p = profitOf(order as LoadedOrder);
    if (!p.isPriced) awaitingCost += 1;
    else if (p.netProfitMinor < 0) madeALoss += 1;
  }

  return { all, awaiting_cost: awaitingCost, refunded, returned, cancelled, made_a_loss: madeALoss };
}

async function countFulfilment(query: OrdersQuery): Promise<Record<FulfilmentFilter, number>> {
  const scope = baseWhere({ ...query, tab: "all" });
  const current = now();

  const [awaiting, pastDeadline, inTransit, delivered, dispatched] = await Promise.all([
    prisma.order.count({ where: { AND: [scope, { fulfillmentStatus: "AWAITING_DISPATCH", cancelState: "NONE" }] } }),
    prisma.order.count({
      where: { AND: [scope, { fulfillmentStatus: "AWAITING_DISPATCH", cancelState: "NONE", dispatchDeadline: { lt: current } }] },
    }),
    prisma.order.count({ where: { AND: [scope, { fulfillmentStatus: "IN_TRANSIT" }] } }),
    prisma.order.count({ where: { AND: [scope, { fulfillmentStatus: "DELIVERED" }] } }),
    prisma.order.findMany({
      where: { AND: [scope, { dispatchedAt: { not: null } }] },
      select: { dispatchedAt: true, dispatchDeadline: true, trackingNumber: true },
      take: 10000,
    }),
  ]);

  let onTime = 0;
  let late = 0;
  let noTracking = 0;
  for (const order of dispatched) {
    if (order.dispatchDeadline && order.dispatchedAt && order.dispatchedAt > order.dispatchDeadline) late += 1;
    else onTime += 1;
    if (!order.trackingNumber) noTracking += 1;
  }

  return {
    awaiting_dispatch: awaiting,
    past_deadline: pastDeadline,
    dispatched_on_time: onTime,
    dispatched_late: late,
    in_transit: inTransit,
    delivered,
    no_tracking: noTracking,
  };
}
