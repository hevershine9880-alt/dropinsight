import { describe, it, expect } from "vitest";
import { totalsForPeriod, type LoadedOrder } from "@/lib/finance/aggregate";
import { resolvePeriod } from "@/lib/finance/periods";

/** Minimal stand-in for a row loaded with ORDER_INCLUDE. */
function makeOrder(o: {
  orderDate: string;
  itemSubtotal?: number;
  shipping?: number;
  fees?: number;
  adFees?: number;
  cancelState?: string;
  lines?: { qty: number; price: number; cost: number | null }[];
  refunds?: { at: string; buyer: number; feeCredit: number; recovered: number }[];
}): LoadedOrder {
  return {
    currency: "GBP",
    orderDate: new Date(o.orderDate),
    itemSubtotalMinor: o.itemSubtotal ?? 1000,
    shippingChargedMinor: o.shipping ?? 0,
    ebayFeesMinor: o.fees ?? 130,
    adFeesMinor: o.adFees ?? 0,
    cancelState: o.cancelState ?? "NONE",
    items: (o.lines ?? [{ qty: 1, price: 1000, cost: 500 }]).map((l, i) => ({
      id: `i${i}`,
      quantity: l.qty,
      unitPriceMinor: l.price,
      costs: l.cost === null ? [] : [{ unitCostMinor: l.cost }],
    })),
    refunds: (o.refunds ?? []).map((r, i) => ({
      id: `r${i}`,
      refundedAt: new Date(r.at),
      buyerRefundMinor: r.buyer,
      feeCreditMinor: r.feeCredit,
      recoveredMinor: r.recovered,
    })),
  } as unknown as LoadedOrder;
}

const JULY = resolvePeriod("custom", new Date("2026-08-15"), {
  from: new Date("2026-07-01"),
  to: new Date("2026-07-31"),
});
const AUGUST = resolvePeriod("custom", new Date("2026-08-31"), {
  from: new Date("2026-08-01"),
  to: new Date("2026-08-31"),
});

describe("totalsForPeriod — basics", () => {
  const orders = [
    makeOrder({ orderDate: "2026-08-05" }),
    makeOrder({ orderDate: "2026-08-12" }),
    makeOrder({ orderDate: "2026-07-20" }), // outside
  ];

  it("counts only orders inside the window", () => {
    expect(totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP").orderCount).toBe(2);
  });

  it("reconciles gross profit from its own parts", () => {
    const t = totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP");
    expect(t.grossProfitMinor).toBe(t.revenueMinor - t.costOfGoodsMinor - t.ebayFeesMinor - t.adFeesMinor);
  });

  it("subtracts business expenses from net profit only", () => {
    const withoutExpenses = totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP", 0);
    const withExpenses = totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP", 5000);
    expect(withExpenses.grossProfitMinor).toBe(withoutExpenses.grossProfitMinor);
    expect(withExpenses.netProfitMinor).toBe(withoutExpenses.netProfitMinor - 5000);
  });

  it("computes average order value", () => {
    const t = totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP");
    expect(t.avgOrderValueMinor).toBe(Math.round(t.revenueMinor / 2));
  });
});

describe("totalsForPeriod — refund attribution (R3)", () => {
  // A July sale refunded in August.
  const orders = [
    makeOrder({
      orderDate: "2026-07-20",
      refunds: [{ at: "2026-08-04", buyer: 1000, feeCredit: 130, recovered: 0 }],
    }),
  ];

  it("REFUND_MONTH puts the loss in August", () => {
    expect(totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP").refundLossMinor).toBe(870);
    expect(totalsForPeriod(orders, JULY, "REFUND_MONTH", "GBP").refundLossMinor).toBe(0);
  });

  it("ORDER_MONTH puts the loss in July", () => {
    expect(totalsForPeriod(orders, JULY, "ORDER_MONTH", "GBP").refundLossMinor).toBe(870);
    expect(totalsForPeriod(orders, AUGUST, "ORDER_MONTH", "GBP").refundLossMinor).toBe(0);
  });

  it("keeps the revenue in July under either mode", () => {
    expect(totalsForPeriod(orders, JULY, "REFUND_MONTH", "GBP").revenueMinor).toBe(1000);
    expect(totalsForPeriod(orders, JULY, "ORDER_MONTH", "GBP").revenueMinor).toBe(1000);
    expect(totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP").revenueMinor).toBe(0);
  });

  it("lands the same total loss in exactly one month either way", () => {
    for (const mode of ["REFUND_MONTH", "ORDER_MONTH"] as const) {
      const july = totalsForPeriod(orders, JULY, mode, "GBP").refundLossMinor;
      const august = totalsForPeriod(orders, AUGUST, mode, "GBP").refundLossMinor;
      expect(july + august).toBe(870);
    }
  });
});

describe("totalsForPeriod — supplier recovery", () => {
  it("removes the loss once the supplier refunds", () => {
    const orders = [
      makeOrder({
        orderDate: "2026-08-02",
        refunds: [{ at: "2026-08-06", buyer: 1000, feeCredit: 130, recovered: 870 }],
      }),
    ];
    const t = totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP");
    expect(t.refundLossMinor).toBe(0);
    expect(t.recoveredMinor).toBe(870);
    expect(t.netProfitMinor).toBe(t.grossProfitMinor);
  });
});

describe("totalsForPeriod — cancellations (R6)", () => {
  const orders = [
    makeOrder({ orderDate: "2026-08-03" }),
    makeOrder({
      orderDate: "2026-08-04",
      cancelState: "CANCELLED_BEFORE_FULFILMENT",
      refunds: [{ at: "2026-08-04", buyer: 1000, feeCredit: 130, recovered: 0 }],
    }),
  ];

  it("keeps them out of orders, revenue and losses", () => {
    const t = totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP");
    expect(t.orderCount).toBe(1);
    expect(t.cancelledCount).toBe(1);
    expect(t.refundLossMinor).toBe(0);
    expect(t.refundCount).toBe(0);
  });
});

describe("totalsForPeriod — cost coverage (I1)", () => {
  const orders = [
    makeOrder({ orderDate: "2026-08-01", lines: [{ qty: 1, price: 1000, cost: 500 }] }),
    makeOrder({ orderDate: "2026-08-02", lines: [{ qty: 1, price: 1000, cost: null }] }),
    makeOrder({ orderDate: "2026-08-03", lines: [{ qty: 1, price: 1000, cost: null }] }),
  ];

  it("reports how many orders the profit actually rests on", () => {
    const t = totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP");
    expect(t.pricedOrderCount).toBe(1);
    expect(t.unpricedOrderCount).toBe(2);
    expect(t.costCoverageRatio).toBeCloseTo(1 / 3);
  });

  it("reports the revenue not yet reflected in profit", () => {
    expect(totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP").unpricedRevenueMinor).toBe(2000);
  });

  it("has no coverage ratio when there are no orders", () => {
    expect(totalsForPeriod([], AUGUST, "REFUND_MONTH", "GBP").costCoverageRatio).toBeNull();
  });
});

describe("totalsForPeriod — margin", () => {
  it("is null with no revenue", () => {
    expect(totalsForPeriod([], AUGUST, "REFUND_MONTH", "GBP").marginRatio).toBeNull();
  });
});

describe("totalsForPeriod — priced-only profit (I1)", () => {
  // Two orders: one priced with a real cost, one with no cost at all.
  const orders = [
    makeOrder({ orderDate: "2026-08-01", itemSubtotal: 1000, fees: 130, lines: [{ qty: 1, price: 1000, cost: 500 }] }),
    makeOrder({ orderDate: "2026-08-02", itemSubtotal: 1000, fees: 130, lines: [{ qty: 1, price: 1000, cost: null }] }),
  ];
  const t = totalsForPeriod(orders, AUGUST, "REFUND_MONTH", "GBP");

  it("keeps the unpriced order out of the profit it reports", () => {
    expect(t.pricedRevenueMinor).toBe(1000);
    expect(t.pricedNetProfitMinor).toBe(1000 - 500 - 130);
  });

  it("gives a margin that is not inflated by a missing cost", () => {
    // All-orders margin looks like 62%; the honest figure is 37%.
    expect(t.marginRatio).toBeCloseTo(1240 / 2000, 4);
    expect(t.pricedMarginRatio).toBeCloseTo(370 / 1000, 4);
    expect(t.pricedMarginRatio!).toBeLessThan(t.marginRatio!);
  });

  it("agrees with the all-orders figure once everything is priced", () => {
    const allPriced = [
      makeOrder({ orderDate: "2026-08-01", lines: [{ qty: 1, price: 1000, cost: 500 }] }),
      makeOrder({ orderDate: "2026-08-02", lines: [{ qty: 1, price: 1000, cost: 400 }] }),
    ];
    const full = totalsForPeriod(allPriced, AUGUST, "REFUND_MONTH", "GBP");
    expect(full.pricedNetProfitMinor).toBe(full.netProfitMinor);
    expect(full.pricedMarginRatio).toBeCloseTo(full.marginRatio!, 6);
    expect(full.costCoverageRatio).toBe(1);
  });

  it("charges refund losses and expenses against the priced subset too", () => {
    const withLoss = [
      makeOrder({
        orderDate: "2026-08-01", lines: [{ qty: 1, price: 1000, cost: 500 }],
        refunds: [{ at: "2026-08-05", buyer: 500, feeCredit: 65, recovered: 0 }],
      }),
      makeOrder({ orderDate: "2026-08-02", lines: [{ qty: 1, price: 1000, cost: null }] }),
    ];
    const t2 = totalsForPeriod(withLoss, AUGUST, "REFUND_MONTH", "GBP", 200);
    expect(t2.pricedNetProfitMinor).toBe(1000 - 500 - 130 - 435 - 200);
  });
});
