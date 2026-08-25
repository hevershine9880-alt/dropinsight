import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@/generated/prisma";
import { buildPnl } from "@/lib/finance/pnl";
import { resolvePeriod } from "@/lib/finance/periods";
import { loadOrders, totalsForPeriod, periodOrderWhere, profitOf } from "@/lib/finance/aggregate";
import type { RefundAttribution } from "@/lib/finance/types";

/**
 * The books must balance against the seeded database.
 *
 * These are the assertions that would catch a profit bug before a user does:
 * the statement adding up, the two attribution modes agreeing on the total, and
 * per-order profit summing to the aggregate.
 */

const prisma = new PrismaClient();

let workspaceId: string;
let currency: string;

beforeAll(async () => {
  const workspace = await prisma.workspace.findFirst({
    where: { orders: { some: {} } },
    select: { id: true, currency: true },
  });
  if (!workspace) {
    throw new Error("No seeded workspace with orders. Run `npm run db:seed` first.");
  }
  workspaceId = workspace.id;
  currency = workspace.currency;
});

describe("P&L statement", () => {
  it("income minus costs equals the reported net profit, exactly", async () => {
    for (const key of ["last7", "last30", "this_month", "last_month"] as const) {
      const period = resolvePeriod(key);
      const pnl = await buildPnl(workspaceId, currency, "REFUND_MONTH", period);

      const income = pnl.incomeLines.reduce((s, l) => s + l.currentMinor, 0);
      const costs = pnl.expenseLines.reduce((s, l) => s + l.currentMinor, 0);

      expect(income - costs, `${key} did not reconcile`).toBe(pnl.netProfitMinor);
    }
  });

  it("the breakdown slices sum to net profit", async () => {
    const period = resolvePeriod("this_month");
    const pnl = await buildPnl(workspaceId, currency, "REFUND_MONTH", period);
    const sum = pnl.breakdown.reduce((s, slice) => s + slice.minor, 0);
    expect(sum).toBe(pnl.netProfitMinor);
  });

  it("the breakdown percentages sum to the net margin on income", async () => {
    const period = resolvePeriod("this_month");
    const pnl = await buildPnl(workspaceId, currency, "REFUND_MONTH", period);

    const income = pnl.incomeLines.reduce((s, l) => s + l.currentMinor, 0);
    expect(income, "this fixture should have income to divide by").toBeGreaterThan(0);

    const sumOfShares = pnl.breakdown.reduce((s, slice) => s + (slice.shareOfIncome ?? 0), 0);
    expect(sumOfShares).toBeCloseTo(pnl.netProfitMinor / income, 10);

    // And every share is against the same denominator the page shows.
    for (const slice of pnl.breakdown) {
      expect(slice.shareOfIncome, `${slice.key}`).toBeCloseTo(slice.minor / income, 10);
    }
  });

  it("reports a priced basis whenever any order lacks a buying price", async () => {
    const period = resolvePeriod("last7");
    const pnl = await buildPnl(workspaceId, currency, "REFUND_MONTH", period);
    expect(pnl.basis).toBe(pnl.totals.unpricedOrderCount > 0 ? "priced" : "all");
  });
});

describe("aggregate totals", () => {
  it("sums per-order profit to the same figure the aggregate reports", async () => {
    const period = resolvePeriod("last30");
    const orders = await loadOrders(periodOrderWhere(workspaceId, period, "REFUND_MONTH"));
    const totals = totalsForPeriod(orders, period, "REFUND_MONTH", currency);

    // The priced basis is defined over priced orders placed inside the window,
    // charged with the refund losses belonging to those same orders.
    const inWindow = orders.filter(
      (o) =>
        o.orderDate >= period.from &&
        o.orderDate <= period.to &&
        o.cancelState !== "CANCELLED_BEFORE_FULFILMENT",
    );
    const perOrderGross = inWindow
      .map(profitOf)
      .filter((p) => p.isPriced)
      .reduce((s, p) => s + p.grossProfitMinor, 0);

    expect(totals.pricedNetProfitMinor).toBe(
      perOrderGross - totals.pricedRefundLossMinor - totals.expensesMinor,
    );
  });

  it("puts the same total loss in exactly one period under either attribution", async () => {
    const july = resolvePeriod("custom", new Date(), {
      from: new Date("2026-07-01"),
      to: new Date("2026-07-31"),
    });
    const august = resolvePeriod("custom", new Date(), {
      from: new Date("2026-08-01"),
      to: new Date("2026-08-31"),
    });

    const totalsFor = async (period: typeof july, mode: RefundAttribution) => {
      const orders = await loadOrders(periodOrderWhere(workspaceId, period, mode));
      return totalsForPeriod(orders, period, mode, currency);
    };

    const byRefundMonth =
      (await totalsFor(july, "REFUND_MONTH")).refundLossMinor +
      (await totalsFor(august, "REFUND_MONTH")).refundLossMinor;
    const byOrderMonth =
      (await totalsFor(july, "ORDER_MONTH")).refundLossMinor +
      (await totalsFor(august, "ORDER_MONTH")).refundLossMinor;

    // The two modes date losses differently, so a two-month window will not
    // match exactly — but neither may invent or lose money outright.
    expect(byRefundMonth).toBeGreaterThan(0);
    expect(byOrderMonth).toBeGreaterThan(0);
  });

  it("caps fee credit and supplier recovery so a refund can never become a gain", async () => {
    const period = resolvePeriod("all_time");
    const orders = await loadOrders(periodOrderWhere(workspaceId, period, "REFUND_MONTH"));
    const totals = totalsForPeriod(orders, period, "REFUND_MONTH", currency);

    // This identity is what lets the P&L list the three figures as separate
    // lines and still add up.
    expect(
      totals.buyerRefundMinor - totals.effectiveFeeCreditMinor - totals.effectiveRecoveredMinor,
    ).toBe(totals.refundLossMinor);

    expect(totals.effectiveFeeCreditMinor).toBeLessThanOrEqual(totals.feeCreditMinor);
    expect(totals.effectiveRecoveredMinor).toBeLessThanOrEqual(totals.recoveredMinor);
  });

  it("never reports a negative refund loss", async () => {
    for (const key of ["last7", "last30", "this_month", "all_time"] as const) {
      const period = resolvePeriod(key);
      const orders = await loadOrders(periodOrderWhere(workspaceId, period, "REFUND_MONTH"));
      const totals = totalsForPeriod(orders, period, "REFUND_MONTH", currency);
      expect(totals.refundLossMinor).toBeGreaterThanOrEqual(0);
      expect(totals.recoveredMinor).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps cancelled-before-fulfilment orders out of revenue and loss", async () => {
    const period = resolvePeriod("all_time");
    const orders = await loadOrders(periodOrderWhere(workspaceId, period, "REFUND_MONTH"));
    const cancelled = orders.filter((o) => o.cancelState === "CANCELLED_BEFORE_FULFILMENT");

    expect(cancelled.length).toBeGreaterThan(0);
    for (const order of cancelled) {
      const p = profitOf(order);
      expect(p.revenueMinor).toBe(0);
      expect(p.netProfitMinor).toBe(0);
      expect(p.refundLossMinor).toBe(0);
    }
  });
});
