import { prisma } from "@/lib/db/client";
import { loadOrders, totalsForPeriod, profitOf, periodOrderWhere, type PeriodTotals } from "./aggregate";
import { bucketsFor, previousPeriod, type Period } from "./periods";
import type { RefundAttribution } from "./types";
import type { Minor } from "@/lib/money";

/**
 * The profit & loss statement.
 *
 * The breakdown is built so that the income lines minus the expense lines equal
 * net profit exactly — not approximately. Anything that cannot be attributed to
 * a named line does not silently vanish into a rounding difference; there is no
 * such line, because every figure comes from a stored amount.
 */

export interface PnlLine {
  key: string;
  label: string;
  kind: "income" | "expense";
  currentMinor: Minor;
  previousMinor: Minor;
  explain?: string;
}

export interface PnlBreakdownSlice {
  key: string;
  label: string;
  minor: Minor;
  /**
   * Share of total income, signed — costs are negative. Measured against
   * income rather than net profit because a slice several times larger than
   * a thin profit reads as "480%", which nobody parses as a quantity. The
   * shares still sum to the net margin, since they share one denominator.
   */
  shareOfIncome: number | null;
  color: string;
}

export interface PnlData {
  currency: string;
  period: Period;
  previous: Period | null;
  totals: PeriodTotals;
  previousTotals: PeriodTotals | null;
  /**
   * Which orders the statement is drawn from.
   *
   * "priced" while any order still lacks a buying price — including an unpriced
   * order would count its revenue and its fees but not the cost between them,
   * which inflates profit. The statement says so on its face.
   */
  basis: "all" | "priced";
  excludedOrderCount: number;
  excludedRevenueMinor: Minor;
  netProfitMinor: Minor;
  revenueMinor: Minor;
  marginRatio: number | null;
  incomeLines: PnlLine[];
  expenseLines: PnlLine[];
  breakdown: PnlBreakdownSlice[];
  trend: { label: string; profit: number; revenue: number; margin: number }[];
  topSkus: {
    id: string; title: string; sku: string | null;
    quantity: number; profitMinor: Minor; marginRatio: number | null;
  }[];
  expensesByCategory: { category: string; minor: Minor }[];
}

export async function buildPnl(
  workspaceId: string,
  currency: string,
  attribution: RefundAttribution,
  period: Period,
): Promise<PnlData> {
  const previous = previousPeriod(period);

  const [orders, previousOrders, expenses, previousExpenses] = await Promise.all([
    loadOrders(periodOrderWhere(workspaceId, period, attribution)),
    previous ? loadOrders(periodOrderWhere(workspaceId, previous, attribution)) : Promise.resolve([]),
    prisma.expense.findMany({
      where: { workspaceId, date: { gte: period.from, lte: period.to } },
      select: { category: true, amountMinor: true },
    }),
    previous
      ? prisma.expense.findMany({
          where: { workspaceId, date: { gte: previous.from, lte: previous.to } },
          select: { category: true, amountMinor: true },
        })
      : Promise.resolve([]),
  ]);

  const expensesMinor = expenses.reduce((s, e) => s + e.amountMinor, 0);
  const previousExpensesMinor = previousExpenses.reduce((s, e) => s + e.amountMinor, 0);

  const totals = totalsForPeriod(orders, period, attribution, currency, expensesMinor);
  const previousTotals = previous
    ? totalsForPeriod(previousOrders, previous, attribution, currency, previousExpensesMinor)
    : null;

  // While anything is unpriced the statement is drawn from the priced subset,
  // so income minus costs equals the headline net profit exactly.
  const basis: "all" | "priced" = totals.unpricedOrderCount > 0 ? "priced" : "all";
  const usePriced = basis === "priced";

  const itemSales = usePriced ? totals.pricedItemSalesMinor : totals.revenueMinor - totals.shippingIncomeMinor;
  const shippingIncome = usePriced ? totals.pricedShippingIncomeMinor : totals.shippingIncomeMinor;
  const ebayFees = usePriced ? totals.pricedEbayFeesMinor : totals.ebayFeesMinor;
  const adFees = usePriced ? totals.pricedAdFeesMinor : totals.adFeesMinor;
  const costOfGoods = usePriced ? totals.pricedCostOfGoodsMinor : totals.costOfGoodsMinor;
  const buyerRefund = usePriced ? totals.pricedBuyerRefundMinor : totals.buyerRefundMinor;
  const feeCredit = usePriced ? totals.pricedEffectiveFeeCreditMinor : totals.effectiveFeeCreditMinor;
  const recovered = usePriced ? totals.pricedEffectiveRecoveredMinor : totals.effectiveRecoveredMinor;
  const revenueMinor = usePriced ? totals.pricedRevenueMinor : totals.revenueMinor;
  const netProfitMinor = usePriced ? totals.pricedNetProfitMinor : totals.netProfitMinor;
  const marginRatio = usePriced ? totals.pricedMarginRatio : totals.marginRatio;

  const pp = (pricedGetter: (t: PeriodTotals) => number, allGetter: (t: PeriodTotals) => number) =>
    previousTotals
      ? previousTotals.unpricedOrderCount > 0
        ? pricedGetter(previousTotals)
        : allGetter(previousTotals)
      : 0;

  const incomeLines: PnlLine[] = [
    {
      key: "product_sales", label: "Product sales", kind: "income",
      currentMinor: itemSales,
      previousMinor: pp((t) => t.pricedItemSalesMinor, (t) => t.revenueMinor - t.shippingIncomeMinor),
      explain: "What buyers paid for the items themselves.",
    },
    {
      key: "shipping_income", label: "Postage charged", kind: "income",
      currentMinor: shippingIncome,
      previousMinor: pp((t) => t.pricedShippingIncomeMinor, (t) => t.shippingIncomeMinor),
      explain: "Postage the buyer paid on top of the item price.",
    },
    {
      key: "fee_credits", label: "eBay fee credits", kind: "income",
      currentMinor: feeCredit,
      previousMinor: pp((t) => t.pricedEffectiveFeeCreditMinor, (t) => t.effectiveFeeCreditMinor),
      explain: "Fees eBay refunded back to you when an order was refunded.",
    },
    {
      key: "supplier_recovery", label: "Recovered from suppliers", kind: "income",
      currentMinor: recovered,
      previousMinor: pp((t) => t.pricedEffectiveRecoveredMinor, (t) => t.effectiveRecoveredMinor),
      explain: "Money your suppliers paid back on refunded orders.",
    },
  ];

  const expenseLines: PnlLine[] = [
    {
      key: "cogs", label: "Cost of goods", kind: "expense",
      currentMinor: costOfGoods,
      previousMinor: pp((t) => t.pricedCostOfGoodsMinor, (t) => t.costOfGoodsMinor),
      explain: "The buying prices you entered, multiplied by quantity.",
    },
    {
      key: "ebay_fees", label: "eBay fees", kind: "expense",
      currentMinor: ebayFees,
      previousMinor: pp((t) => t.pricedEbayFeesMinor, (t) => t.ebayFeesMinor),
      explain: "Final value fees and per-order fixed charges.",
    },
    {
      key: "ad_fees", label: "Ad fees", kind: "expense",
      currentMinor: adFees,
      previousMinor: pp((t) => t.pricedAdFeesMinor, (t) => t.adFeesMinor),
      explain: "Promoted Listings spend attributed to these orders.",
    },
    {
      key: "refunds", label: "Refunds to buyers", kind: "expense",
      currentMinor: buyerRefund,
      previousMinor: pp((t) => t.pricedBuyerRefundMinor, (t) => t.buyerRefundMinor),
      explain:
        "Everything refunded to buyers. The eBay fee credits and supplier recovery that offset it are listed under income.",
    },
    {
      key: "business_expenses", label: "Business expenses", kind: "expense",
      currentMinor: totals.expensesMinor,
      previousMinor: previousExpensesMinor,
      explain: "Software, payroll, advertising and anything else you logged on the Expenses page.",
    },
  ];

  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountMinor);
  }

  return {
    currency,
    period,
    previous,
    totals,
    previousTotals,
    basis,
    excludedOrderCount: totals.unpricedOrderCount,
    excludedRevenueMinor: totals.unpricedRevenueMinor,
    netProfitMinor,
    revenueMinor,
    marginRatio,
    incomeLines: incomeLines.filter((l) => l.currentMinor !== 0 || l.previousMinor !== 0),
    expenseLines: expenseLines.filter((l) => l.currentMinor !== 0 || l.previousMinor !== 0),
    breakdown: buildBreakdown(totals, usePriced),
    trend: buildTrend(orders, period, attribution, currency),
    topSkus: buildTopSkus(orders, period),
    expensesByCategory: [...byCategory.entries()]
      .map(([category, minor]) => ({ category, minor }))
      .sort((a, b) => b.minor - a.minor),
  };
}

/**
 * The doughnut. Income slices are positive, cost slices negative, and their sum
 * is net profit — so the chart and the statement cannot disagree.
 */
function buildBreakdown(totals: PeriodTotals, usePriced: boolean): PnlBreakdownSlice[] {

  const itemSales = usePriced ? totals.pricedItemSalesMinor : totals.revenueMinor - totals.shippingIncomeMinor;
  const shipping = usePriced ? totals.pricedShippingIncomeMinor : totals.shippingIncomeMinor;
  const ebayFees = usePriced ? totals.pricedEbayFeesMinor : totals.ebayFeesMinor;
  const adFees = usePriced ? totals.pricedAdFeesMinor : totals.adFeesMinor;

  const feeCredit = usePriced ? totals.pricedEffectiveFeeCreditMinor : totals.effectiveFeeCreditMinor;
  const recovered = usePriced ? totals.pricedEffectiveRecoveredMinor : totals.effectiveRecoveredMinor;

  const cogs = usePriced ? totals.pricedCostOfGoodsMinor : totals.costOfGoodsMinor;
  const refundLoss = usePriced ? totals.pricedRefundLossMinor : totals.refundLossMinor;

  // The same "Total income" the KPI above the chart shows, so a reader can
  // check any percentage here against a figure already on the page.
  const income = itemSales + shipping + feeCredit + recovered;
  const share = (minor: number) => (income === 0 ? null : minor / income);

  const slices: PnlBreakdownSlice[] = [
    { key: "product_profit", label: "Product profit", minor: itemSales - cogs, shareOfIncome: null, color: "var(--positive)" },
    { key: "shipping_profit", label: "Postage income", minor: shipping, shareOfIncome: null, color: "var(--color-mint-300)" },
    { key: "ebay_fees", label: "eBay fees", minor: -ebayFees, shareOfIncome: null, color: "var(--negative)" },
    { key: "ad_fees", label: "Ad fees", minor: -adFees, shareOfIncome: null, color: "var(--color-rose-300)" },
    { key: "refund_losses", label: "Refunds & losses", minor: -refundLoss, shareOfIncome: null, color: "var(--caution)" },
    { key: "expenses", label: "Business expenses", minor: -totals.expensesMinor, shareOfIncome: null, color: "var(--color-slate-400)" },
  ];

  return slices
    .filter((s) => s.minor !== 0)
    .map((s) => ({ ...s, shareOfIncome: share(s.minor) }));
}

function buildTrend(
  orders: Awaited<ReturnType<typeof loadOrders>>,
  period: Period,
  attribution: RefundAttribution,
  currency: string,
) {
  return bucketsFor(period).map((bucket) => {
    const t = totalsForPeriod(
      orders,
      { key: "custom", label: bucket.label, from: bucket.from, to: bucket.to, unbounded: false },
      attribution,
      currency,
      0,
    );
    const profit = t.grossProfitMinor - t.refundLossMinor;
    return {
      label: bucket.label,
      profit,
      revenue: t.revenueMinor,
      margin: t.revenueMinor > 0 ? profit / t.revenueMinor : 0,
    };
  });
}

function buildTopSkus(orders: Awaited<ReturnType<typeof loadOrders>>, period: Period) {
  const map = new Map<string, {
    id: string; title: string; sku: string | null;
    quantity: number; profitMinor: number; revenueMinor: number;
  }>();

  for (const order of orders) {
    if (order.orderDate < period.from || order.orderDate > period.to) continue;
    if (order.cancelState === "CANCELLED_BEFORE_FULFILMENT") continue;

    const p = profitOf(order);
    if (!p.isPriced) continue;

    const lineCount = order.items.length || 1;
    for (const item of order.items) {
      const key = item.productId ?? item.title;
      const existing = map.get(key) ?? {
        id: item.productId ?? key, title: item.title, sku: item.sku,
        quantity: 0, profitMinor: 0, revenueMinor: 0,
      };
      existing.quantity += item.quantity;
      existing.profitMinor += Math.round(p.netProfitMinor / lineCount);
      existing.revenueMinor += item.unitPriceMinor * item.quantity;
      map.set(key, existing);
    }
  }

  return [...map.values()]
    .map((s) => ({
      id: s.id, title: s.title, sku: s.sku, quantity: s.quantity,
      profitMinor: s.profitMinor,
      marginRatio: s.revenueMinor > 0 ? s.profitMinor / s.revenueMinor : null,
    }))
    .sort((a, b) => b.profitMinor - a.profitMinor)
    .slice(0, 8);
}
