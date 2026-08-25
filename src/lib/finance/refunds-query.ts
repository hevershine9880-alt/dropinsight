import { prisma } from "@/lib/db/client";
import { differenceInDays } from "date-fns";
import type { Period } from "./periods";
import type { Minor } from "@/lib/money";
import type { Prisma } from "@/generated/prisma";

/**
 * Refunds, returns and the supplier chase queue.
 *
 * "Recoverable" is defined once, here: what the buyer got back, less what eBay
 * credited, less what the supplier has already repaid. It is what the reference
 * product calls "still recoverable" and it is the number the whole Profit
 * Protection page turns on.
 */

export const REFUND_TABS = ["refunds", "returns", "cancelled"] as const;
export type RefundTab = (typeof REFUND_TABS)[number];

export const CLAIM_TABS = ["needs_answer", "expecting", "settled", "all"] as const;
export type ClaimTab = (typeof CLAIM_TABS)[number];

export interface RefundRow {
  id: string;
  orderId: string;
  ebayOrderId: string;
  accountUsername: string;
  buyerUsername: string;
  productTitle: string;
  productSku: string | null;
  type: string;
  reason: string | null;
  returnState: string | null;
  refundedAt: Date;
  orderedAt: Date;
  currency: string;
  buyerRefundMinor: Minor;
  feeCreditMinor: Minor;
  recoveredMinor: Minor;
  recoverableMinor: Minor;
  netLossMinor: Minor;
  supplierClaim: string;
  supplierName: string | null;
  promisedByDate: Date | null;
  notes: string | null;
  ageDays: number;
  orderProfitMinor: Minor | null;
}

export interface RefundTotals {
  currency: string;
  totalRefundedMinor: Minor;
  refundCount: number;
  recoveredMinor: Minor;
  stillRecoverableMinor: Minor;
  writtenOffMinor: Minor;
  netLossMinor: Minor;
  overdueCount: number;
  overdueMinor: Minor;
  needsAnswerCount: number;
  recoveryRatio: number | null;
}

export interface RefundReasonRow {
  reason: string;
  count: number;
  share: number;
  lossMinor: Minor;
}

/** Recoverable can never be negative — a fee credit larger than the refund is a correction. */
export function recoverableOf(r: { buyerRefundMinor: number; feeCreditMinor: number; recoveredMinor: number }): Minor {
  return Math.max(0, r.buyerRefundMinor - r.feeCreditMinor - r.recoveredMinor);
}

const REFUND_INCLUDE = {
  supplier: { select: { name: true } },
  order: {
    select: {
      id: true, ebayOrderId: true, orderDate: true, buyerUsername: true, currency: true,
      itemSubtotalMinor: true, shippingChargedMinor: true, ebayFeesMinor: true, adFeesMinor: true,
      cancelState: true,
      ebayAccount: { select: { username: true } },
      items: {
        select: {
          title: true, sku: true, quantity: true, unitPriceMinor: true,
          costs: { orderBy: { createdAt: "desc" as const }, take: 1 },
        },
      },
    },
  },
} as const;

export interface RefundsQuery {
  workspaceId: string;
  period: Period;
  tab: RefundTab;
  claimTab: ClaimTab;
  accountIds: string[];
  reasons: string[];
  search: string;
  page: number;
  pageSize: number;
}

function whereFor(query: RefundsQuery): Prisma.RefundWhereInput {
  const where: Prisma.RefundWhereInput = {
    order: {
      workspaceId: query.workspaceId,
      ...(query.accountIds.length > 0 ? { ebayAccountId: { in: query.accountIds } } : {}),
    },
  };

  if (!query.period.unbounded) {
    where.refundedAt = { gte: query.period.from, lte: query.period.to };
  }

  if (query.tab === "returns") where.type = "RETURN";
  else if (query.tab === "cancelled") where.type = "CANCELLATION";
  else where.type = { in: ["REFUND", "RETURN"] };

  if (query.claimTab === "needs_answer") where.supplierClaim = { in: ["NOT_ASKED", "ASKED"] };
  else if (query.claimTab === "expecting") where.supplierClaim = "PROMISED";
  else if (query.claimTab === "settled") where.supplierClaim = { in: ["RECEIVED", "PARTIAL", "WRITTEN_OFF", "NOT_APPLICABLE"] };

  if (query.reasons.length > 0) where.reason = { in: query.reasons };

  if (query.search.trim()) {
    const term = query.search.trim();
    where.order = {
      ...(where.order as object),
      OR: [
        { ebayOrderId: { contains: term } },
        { buyerUsername: { contains: term } },
        { items: { some: { OR: [{ title: { contains: term } }, { sku: { contains: term } }] } } },
      ],
    };
  }

  return where;
}

export async function queryRefunds(query: RefundsQuery): Promise<{
  rows: RefundRow[];
  total: number;
  tabCounts: Record<RefundTab, number>;
  claimCounts: Record<ClaimTab, number>;
}> {
  const where = whereFor(query);

  const [found, total, tabCounts, claimCounts] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: REFUND_INCLUDE,
      orderBy: { refundedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.refund.count({ where }),
    countTabs(query),
    countClaims(query),
  ]);

  return { rows: found.map(toRow), total, tabCounts, claimCounts };
}

type LoadedRefund = Awaited<ReturnType<typeof prisma.refund.findMany<{ include: typeof REFUND_INCLUDE }>>>[number];

function toRow(refund: LoadedRefund): RefundRow {
  const recoverableMinor = recoverableOf(refund);
  const item = refund.order.items[0];

  // Order profit is recomputed rather than read, so the figure in the refunds
  // table is the same one the order page shows.
  const revenue = refund.order.itemSubtotalMinor + refund.order.shippingChargedMinor;
  const allPriced = refund.order.items.every((i) => i.costs.length > 0);
  const cogs = refund.order.items.reduce((sum, i) => sum + (i.costs[0]?.unitCostMinor ?? 0) * i.quantity, 0);
  const orderProfitMinor = allPriced
    ? revenue - cogs - refund.order.ebayFeesMinor - refund.order.adFeesMinor - recoverableMinor
    : null;

  return {
    id: refund.id,
    orderId: refund.order.id,
    ebayOrderId: refund.order.ebayOrderId,
    accountUsername: refund.order.ebayAccount.username,
    buyerUsername: refund.order.buyerUsername,
    productTitle: item?.title ?? "—",
    productSku: item?.sku ?? null,
    type: refund.type,
    reason: refund.reason,
    returnState: refund.returnState,
    refundedAt: refund.refundedAt,
    orderedAt: refund.order.orderDate,
    currency: refund.currency,
    buyerRefundMinor: refund.buyerRefundMinor,
    feeCreditMinor: refund.feeCreditMinor,
    recoveredMinor: refund.recoveredMinor,
    recoverableMinor,
    netLossMinor: recoverableMinor,
    supplierClaim: refund.supplierClaim,
    supplierName: refund.supplier?.name ?? null,
    promisedByDate: refund.promisedByDate,
    notes: refund.notes,
    ageDays: differenceInDays(new Date(), refund.refundedAt),
    orderProfitMinor,
  };
}

async function countTabs(query: RefundsQuery): Promise<Record<RefundTab, number>> {
  const [refunds, returns, cancelled] = await Promise.all([
    prisma.refund.count({ where: whereFor({ ...query, tab: "refunds", claimTab: "all" }) }),
    prisma.refund.count({ where: whereFor({ ...query, tab: "returns", claimTab: "all" }) }),
    prisma.refund.count({ where: whereFor({ ...query, tab: "cancelled", claimTab: "all" }) }),
  ]);
  return { refunds, returns, cancelled };
}

async function countClaims(query: RefundsQuery): Promise<Record<ClaimTab, number>> {
  const [needsAnswer, expecting, settled, all] = await Promise.all([
    prisma.refund.count({ where: whereFor({ ...query, claimTab: "needs_answer" }) }),
    prisma.refund.count({ where: whereFor({ ...query, claimTab: "expecting" }) }),
    prisma.refund.count({ where: whereFor({ ...query, claimTab: "settled" }) }),
    prisma.refund.count({ where: whereFor({ ...query, claimTab: "all" }) }),
  ]);
  return { needs_answer: needsAnswer, expecting, settled, all };
}

/** Headline figures for the Returns page and Profit Protection. */
export async function refundTotals(
  workspaceId: string,
  period: Period,
  currency: string,
): Promise<RefundTotals> {
  const window = period.unbounded ? {} : { refundedAt: { gte: period.from, lte: period.to } };

  const refunds = await prisma.refund.findMany({
    where: { order: { workspaceId }, type: { in: ["REFUND", "RETURN"] }, ...window },
    select: {
      buyerRefundMinor: true, feeCreditMinor: true, recoveredMinor: true,
      supplierClaim: true, promisedByDate: true,
    },
  });

  const now = new Date();
  let totalRefundedMinor = 0;
  let recoveredMinor = 0;
  let stillRecoverableMinor = 0;
  let writtenOffMinor = 0;
  let overdueCount = 0;
  let overdueMinor = 0;
  let needsAnswerCount = 0;

  for (const refund of refunds) {
    totalRefundedMinor += refund.buyerRefundMinor;
    recoveredMinor += refund.recoveredMinor;
    const recoverable = recoverableOf(refund);

    if (refund.supplierClaim === "WRITTEN_OFF") {
      writtenOffMinor += recoverable;
    } else if (["NOT_ASKED", "ASKED", "PROMISED"].includes(refund.supplierClaim)) {
      stillRecoverableMinor += recoverable;
      if (refund.supplierClaim !== "PROMISED") needsAnswerCount += 1;
      if (refund.supplierClaim === "PROMISED" && refund.promisedByDate && refund.promisedByDate < now) {
        overdueCount += 1;
        overdueMinor += recoverable;
      }
    }
  }

  const netLossMinor = stillRecoverableMinor + writtenOffMinor;
  const recoverableTotal = recoveredMinor + netLossMinor;

  return {
    currency,
    totalRefundedMinor,
    refundCount: refunds.length,
    recoveredMinor,
    stillRecoverableMinor,
    writtenOffMinor,
    netLossMinor,
    overdueCount,
    overdueMinor,
    needsAnswerCount,
    recoveryRatio: recoverableTotal > 0 ? recoveredMinor / recoverableTotal : null,
  };
}

/** Why buyers are asking for their money back, biggest first. */
export async function topRefundReasons(
  workspaceId: string,
  period: Period,
): Promise<RefundReasonRow[]> {
  const window = period.unbounded ? {} : { refundedAt: { gte: period.from, lte: period.to } };

  const refunds = await prisma.refund.findMany({
    where: { order: { workspaceId }, type: { in: ["REFUND", "RETURN"] }, ...window },
    select: { reason: true, buyerRefundMinor: true, feeCreditMinor: true, recoveredMinor: true },
  });

  const map = new Map<string, { count: number; lossMinor: number }>();
  for (const refund of refunds) {
    const reason = refund.reason ?? "Not given";
    const bucket = map.get(reason) ?? { count: 0, lossMinor: 0 };
    bucket.count += 1;
    bucket.lossMinor += recoverableOf(refund);
    map.set(reason, bucket);
  }

  const total = refunds.length || 1;
  return [...map.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, share: v.count / total, lossMinor: v.lossMinor }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/** Everything still open with a supplier, oldest first — the chase queue. */
export async function chaseQueue(
  workspaceId: string,
  options: { search?: string; claim?: string[] } = {},
): Promise<RefundRow[]> {
  const refunds = await prisma.refund.findMany({
    where: {
      order: {
        workspaceId,
        ...(options.search
          ? {
              OR: [
                { ebayOrderId: { contains: options.search } },
                { buyerUsername: { contains: options.search } },
                { items: { some: { title: { contains: options.search } } } },
              ],
            }
          : {}),
      },
      supplierClaim: { in: options.claim ?? ["NOT_ASKED", "ASKED", "PROMISED"] },
      type: { in: ["REFUND", "RETURN"] },
    },
    include: REFUND_INCLUDE,
    orderBy: { refundedAt: "asc" },
    take: 300,
  });

  return refunds.map(toRow);
}
