import { prisma } from "@/lib/db/client";
import { calculateOrderProfit, type ProfitInput } from "./profit";
import type { OrderProfit, RefundAttribution } from "./types";
import { margin, type Minor } from "@/lib/money";
import type { Period } from "./periods";

/**
 * Turning stored rows into the numbers on screen.
 *
 * Two things make this non-trivial and both come straight from the commentary:
 *
 *  1. A refund's loss is not necessarily dated to the refund. Under
 *     ORDER_MONTH attribution it belongs to the month of the original order,
 *     so an order can contribute revenue to one period and a loss to another.
 *  2. Profit is incomplete until every line has a buying price. We report the
 *     coverage alongside the number instead of pretending zero cost.
 */

export interface PeriodTotals {
  currency: string;

  revenueMinor: Minor;
  costOfGoodsMinor: Minor;
  ebayFeesMinor: Minor;
  adFeesMinor: Minor;
  shippingIncomeMinor: Minor;

  buyerRefundMinor: Minor;
  feeCreditMinor: Minor;
  recoveredMinor: Minor;
  refundLossMinor: Minor;

  /**
   * Fee credit and supplier recovery, each capped so the pair can never exceed
   * what the refund actually cost. Without the cap a statement that lists them
   * as income cannot add up to a refund loss that is floored at zero.
   */
  effectiveFeeCreditMinor: Minor;
  effectiveRecoveredMinor: Minor;

  expensesMinor: Minor;

  /** revenue − cogs − fees. Business-level, before refunds and expenses. */
  grossProfitMinor: Minor;
  /** grossProfit − refundLoss − expenses. The bottom line. */
  netProfitMinor: Minor;
  marginRatio: number | null;

  orderCount: number;
  refundCount: number;
  cancelledCount: number;
  unitsSold: number;
  avgOrderValueMinor: Minor;

  /** How much of the above rests on orders that actually have a buying price. */
  pricedOrderCount: number;
  unpricedOrderCount: number;
  unpricedRevenueMinor: Minor;
  costCoverageRatio: number | null;

  /**
   * Profit restricted to orders that have a buying price.
   *
   * This is the honest profit figure while a backlog exists. Including an
   * unpriced order would count its revenue and its fees but not its cost,
   * which systematically overstates profit — the reference product's dashboard
   * has exactly this flaw. `netProfitMinor` above is the all-orders figure and
   * is only meaningful once coverage reaches 100%.
   */
  pricedRevenueMinor: Minor;
  pricedNetProfitMinor: Minor;
  pricedMarginRatio: number | null;

  /**
   * The same component lines, restricted to priced orders. The P&L statement is
   * drawn from these while a costing backlog exists, so its lines add up to the
   * headline figure instead of contradicting it.
   */
  pricedItemSalesMinor: Minor;
  pricedShippingIncomeMinor: Minor;
  pricedEbayFeesMinor: Minor;
  pricedAdFeesMinor: Minor;
  pricedCostOfGoodsMinor: Minor;
  pricedUnitsSold: number;

  /** Refund components belonging to orders that have a buying price. */
  pricedBuyerRefundMinor: Minor;
  pricedEffectiveFeeCreditMinor: Minor;
  pricedEffectiveRecoveredMinor: Minor;
  pricedRefundLossMinor: Minor;
}

const EMPTY = (currency: string): PeriodTotals => ({
  currency,
  revenueMinor: 0,
  costOfGoodsMinor: 0,
  ebayFeesMinor: 0,
  adFeesMinor: 0,
  shippingIncomeMinor: 0,
  buyerRefundMinor: 0,
  feeCreditMinor: 0,
  recoveredMinor: 0,
  refundLossMinor: 0,
  effectiveFeeCreditMinor: 0,
  effectiveRecoveredMinor: 0,
  expensesMinor: 0,
  grossProfitMinor: 0,
  netProfitMinor: 0,
  marginRatio: null,
  orderCount: 0,
  refundCount: 0,
  cancelledCount: 0,
  unitsSold: 0,
  avgOrderValueMinor: 0,
  pricedOrderCount: 0,
  unpricedOrderCount: 0,
  unpricedRevenueMinor: 0,
  costCoverageRatio: null,
  pricedRevenueMinor: 0,
  pricedNetProfitMinor: 0,
  pricedMarginRatio: null,
  pricedItemSalesMinor: 0,
  pricedShippingIncomeMinor: 0,
  pricedEbayFeesMinor: 0,
  pricedAdFeesMinor: 0,
  pricedCostOfGoodsMinor: 0,
  pricedUnitsSold: 0,
  pricedBuyerRefundMinor: 0,
  pricedEffectiveFeeCreditMinor: 0,
  pricedEffectiveRecoveredMinor: 0,
  pricedRefundLossMinor: 0,
});

/** The shape `calculateOrderProfit` needs, loaded in one query. */
const ORDER_INCLUDE = {
  items: {
    include: {
      costs: { orderBy: { createdAt: "desc" as const }, take: 1 },
    },
  },
  refunds: true,
} as const;

export type LoadedOrder = Awaited<ReturnType<typeof loadOrders>>[number];

export async function loadOrders(where: Record<string, unknown>) {
  return prisma.order.findMany({ where, include: ORDER_INCLUDE });
}

export function toProfitInput(order: LoadedOrder): ProfitInput {
  return {
    currency: order.currency,
    itemSubtotalMinor: order.itemSubtotalMinor,
    shippingChargedMinor: order.shippingChargedMinor,
    ebayFeesMinor: order.ebayFeesMinor,
    adFeesMinor: order.adFeesMinor,
    cancelState: order.cancelState,
    lines: order.items.map((item) => ({
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      unitCostMinor: item.costs[0]?.unitCostMinor ?? null,
    })),
    refunds: order.refunds.map((r) => ({
      buyerRefundMinor: r.buyerRefundMinor,
      feeCreditMinor: r.feeCreditMinor,
      recoveredMinor: r.recoveredMinor,
    })),
  };
}

export function profitOf(order: LoadedOrder): OrderProfit {
  return calculateOrderProfit(toProfitInput(order));
}

function inWindow(date: Date, period: Period): boolean {
  return date >= period.from && date <= period.to;
}

/**
 * Totals for one window.
 *
 * `orders` must already be filtered to those that could contribute — that is,
 * ordered in the window *or* carrying a refund that lands in the window. The
 * caller widens the query; this function decides what counts.
 */
export function totalsForPeriod(
  orders: LoadedOrder[],
  period: Period,
  attribution: RefundAttribution,
  currency: string,
  expensesMinor: Minor = 0,
): PeriodTotals {
  const t = EMPTY(currency);
  t.expensesMinor = expensesMinor;

  for (const order of orders) {
    const orderInWindow = inWindow(order.orderDate, period);

    // --- the sale side, dated to the order ---------------------------------
    if (orderInWindow) {
      if (order.cancelState === "CANCELLED_BEFORE_FULFILMENT") {
        t.cancelledCount += 1;
      } else {
        const p = profitOf(order);
        t.orderCount += 1;
        t.revenueMinor += p.revenueMinor;
        t.shippingIncomeMinor += p.shippingChargedMinor;
        t.costOfGoodsMinor += p.costOfGoodsMinor;
        t.ebayFeesMinor += p.ebayFeesMinor;
        t.adFeesMinor += p.adFeesMinor;
        t.unitsSold += order.items.reduce((n, i) => n + i.quantity, 0);

        if (p.isPriced) {
          t.pricedOrderCount += 1;
          t.pricedRevenueMinor += p.revenueMinor;
          t.pricedNetProfitMinor += p.grossProfitMinor;
          t.pricedItemSalesMinor += p.itemSubtotalMinor;
          t.pricedShippingIncomeMinor += p.shippingChargedMinor;
          t.pricedEbayFeesMinor += p.ebayFeesMinor;
          t.pricedAdFeesMinor += p.adFeesMinor;
          t.pricedCostOfGoodsMinor += p.costOfGoodsMinor;
          t.pricedUnitsSold += order.items.reduce((n, i) => n + i.quantity, 0);
        } else {
          t.unpricedOrderCount += 1;
          t.unpricedRevenueMinor += p.revenueMinor;
        }
      }
    }

    // --- the refund side, dated by the attribution setting (R3) ------------
    if (order.cancelState === "CANCELLED_BEFORE_FULFILMENT") continue;

    // Whether this order's costs are known decides which basis its refund
    // belongs to. Computed once per order rather than per refund.
    const orderIsPriced = profitOf(order).isPriced;

    for (const refund of order.refunds) {
      const lossDate = attribution === "REFUND_MONTH" ? refund.refundedAt : order.orderDate;
      if (!inWindow(lossDate, period)) continue;

      // Cap each offset at what is left to offset, so the three figures always
      // satisfy: buyerRefund - effectiveCredit - effectiveRecovered = loss.
      const effectiveCredit = Math.min(refund.feeCreditMinor, refund.buyerRefundMinor);
      const effectiveRecovered = Math.min(
        refund.recoveredMinor,
        Math.max(0, refund.buyerRefundMinor - effectiveCredit),
      );
      const loss = refund.buyerRefundMinor - effectiveCredit - effectiveRecovered;

      t.refundCount += 1;
      t.buyerRefundMinor += refund.buyerRefundMinor;
      t.feeCreditMinor += refund.feeCreditMinor;
      t.recoveredMinor += refund.recoveredMinor;
      t.effectiveFeeCreditMinor += effectiveCredit;
      t.effectiveRecoveredMinor += effectiveRecovered;
      t.refundLossMinor += loss;

      if (orderIsPriced) {
        t.pricedBuyerRefundMinor += refund.buyerRefundMinor;
        t.pricedEffectiveFeeCreditMinor += effectiveCredit;
        t.pricedEffectiveRecoveredMinor += effectiveRecovered;
        t.pricedRefundLossMinor += loss;
      }
    }
  }

  t.grossProfitMinor = t.revenueMinor - t.costOfGoodsMinor - t.ebayFeesMinor - t.adFeesMinor;
  t.netProfitMinor = t.grossProfitMinor - t.refundLossMinor - t.expensesMinor;
  t.marginRatio = margin(t.netProfitMinor, t.revenueMinor);
  t.avgOrderValueMinor = t.orderCount > 0 ? Math.round(t.revenueMinor / t.orderCount) : 0;
  t.costCoverageRatio = t.orderCount > 0 ? t.pricedOrderCount / t.orderCount : null;

  // Expenses are workspace-wide and are charged in full. Refund losses are
  // charged only for orders whose cost is known, so the priced basis stays a
  // self-consistent set rather than a mix of two populations.
  t.pricedNetProfitMinor -= t.pricedRefundLossMinor + t.expensesMinor;
  t.pricedMarginRatio = margin(t.pricedNetProfitMinor, t.pricedRevenueMinor);

  return t;
}

/**
 * Widened `where` for a period: an order matters if it was placed in the window
 * or refunded in it. Under ORDER_MONTH attribution only the order date counts.
 */
export function periodOrderWhere(
  workspaceId: string,
  period: Period,
  attribution: RefundAttribution,
  extra: Record<string, unknown> = {},
) {
  const window = { gte: period.from, lte: period.to };
  if (attribution === "ORDER_MONTH") {
    return { workspaceId, orderDate: window, ...extra };
  }
  return {
    workspaceId,
    ...extra,
    OR: [{ orderDate: window }, { refunds: { some: { refundedAt: window } } }],
  };
}
