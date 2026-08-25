import { describe, it, expect } from "vitest";
import { calculateOrderProfit, breakEvenPriceMinor, observedFeeRatio } from "@/lib/finance/profit";
import type { ProfitInput } from "@/lib/finance/profit";

function order(overrides: Partial<ProfitInput> = {}): ProfitInput {
  return {
    currency: "GBP",
    itemSubtotalMinor: 3899,
    shippingChargedMinor: 0,
    ebayFeesMinor: 507,
    adFeesMinor: 0,
    cancelState: "NONE",
    lines: [{ quantity: 1, unitPriceMinor: 3899, unitCostMinor: 2265 }],
    refunds: [],
    ...overrides,
  };
}

describe("calculateOrderProfit — a plain profitable order", () => {
  const p = calculateOrderProfit(order());

  it("counts shipping charged as revenue", () => {
    const withShipping = calculateOrderProfit(
      order({ itemSubtotalMinor: 3899, shippingChargedMinor: 299 }),
    );
    expect(withShipping.revenueMinor).toBe(4198);
  });

  it("reconciles: revenue − cogs − fees = gross profit", () => {
    expect(p.grossProfitMinor).toBe(p.revenueMinor - p.costOfGoodsMinor - p.ebayFeesMinor - p.adFeesMinor);
    expect(p.grossProfitMinor).toBe(1127);
  });

  it("equals net profit when there are no refunds", () => {
    expect(p.netProfitMinor).toBe(p.grossProfitMinor);
  });

  it("reports margin against revenue", () => {
    expect(p.marginRatio).toBeCloseTo(1127 / 3899, 6);
  });

  it("is marked priced", () => {
    expect(p.isPriced).toBe(true);
    expect(p.unpricedLineCount).toBe(0);
  });
});

describe("calculateOrderProfit — unpriced orders", () => {
  it("reports incomplete rather than assuming a zero cost", () => {
    const p = calculateOrderProfit(order({ lines: [{ quantity: 1, unitPriceMinor: 3899, unitCostMinor: null }] }));
    expect(p.isPriced).toBe(false);
    expect(p.unpricedLineCount).toBe(1);
    expect(p.costOfGoodsMinor).toBe(0);
  });

  it("still subtracts the fees eBay really charged", () => {
    const p = calculateOrderProfit(order({ lines: [{ quantity: 1, unitPriceMinor: 3899, unitCostMinor: null }] }));
    expect(p.netProfitMinor).toBe(3899 - 507);
  });

  it("counts a partially priced order as unpriced", () => {
    const p = calculateOrderProfit(
      order({
        lines: [
          { quantity: 1, unitPriceMinor: 2000, unitCostMinor: 1000 },
          { quantity: 1, unitPriceMinor: 1899, unitCostMinor: null },
        ],
      }),
    );
    expect(p.isPriced).toBe(false);
    expect(p.unpricedLineCount).toBe(1);
    expect(p.costOfGoodsMinor).toBe(1000);
  });

  it("treats an order with no lines at all as unpriced", () => {
    expect(calculateOrderProfit(order({ lines: [] })).isPriced).toBe(false);
  });
});

describe("calculateOrderProfit — quantity", () => {
  it("multiplies unit cost by quantity", () => {
    const p = calculateOrderProfit(
      order({
        itemSubtotalMinor: 852,
        ebayFeesMinor: 111,
        lines: [{ quantity: 3, unitPriceMinor: 284, unitCostMinor: 150 }],
      }),
    );
    expect(p.costOfGoodsMinor).toBe(450);
    expect(p.netProfitMinor).toBe(852 - 450 - 111);
  });
});

describe("calculateOrderProfit — refunds", () => {
  it("nets the fee credit off the buyer refund", () => {
    const p = calculateOrderProfit(
      order({ refunds: [{ buyerRefundMinor: 3899, feeCreditMinor: 507, recoveredMinor: 0 }] }),
    );
    expect(p.refundLossMinor).toBe(3392);
    expect(p.netProfitMinor).toBe(1127 - 3392);
  });

  it("erases the loss once the supplier pays back in full", () => {
    const p = calculateOrderProfit(
      order({ refunds: [{ buyerRefundMinor: 3899, feeCreditMinor: 507, recoveredMinor: 3392 }] }),
    );
    expect(p.refundLossMinor).toBe(0);
    expect(p.netProfitMinor).toBe(1127);
  });

  it("reduces the loss proportionally on a partial recovery", () => {
    const p = calculateOrderProfit(
      order({ refunds: [{ buyerRefundMinor: 3899, feeCreditMinor: 507, recoveredMinor: 1500 }] }),
    );
    expect(p.refundLossMinor).toBe(1892);
  });

  it("never lets a refund become a gain", () => {
    const p = calculateOrderProfit(
      order({ refunds: [{ buyerRefundMinor: 1000, feeCreditMinor: 600, recoveredMinor: 900 }] }),
    );
    expect(p.refundLossMinor).toBe(0);
    expect(p.netProfitMinor).toBe(p.grossProfitMinor);
  });

  it("sums multiple partial refunds on one order", () => {
    const p = calculateOrderProfit(
      order({
        refunds: [
          { buyerRefundMinor: 1000, feeCreditMinor: 130, recoveredMinor: 0 },
          { buyerRefundMinor: 500, feeCreditMinor: 65, recoveredMinor: 200 },
        ],
      }),
    );
    expect(p.buyerRefundMinor).toBe(1500);
    expect(p.feeCreditMinor).toBe(195);
    expect(p.recoveredMinor).toBe(200);
    expect(p.refundLossMinor).toBe(1105);
  });
});

describe("calculateOrderProfit — cancellations (R6)", () => {
  it("zeroes a cancellation that never reached a supplier", () => {
    const p = calculateOrderProfit(
      order({
        cancelState: "CANCELLED_BEFORE_FULFILMENT",
        refunds: [{ buyerRefundMinor: 3899, feeCreditMinor: 507, recoveredMinor: 0 }],
      }),
    );
    expect(p.isNonLossCancellation).toBe(true);
    expect(p.netProfitMinor).toBe(0);
    expect(p.refundLossMinor).toBe(0);
    expect(p.revenueMinor).toBe(0);
  });

  it("does not treat it as an unpriced order needing attention", () => {
    const p = calculateOrderProfit(
      order({ cancelState: "CANCELLED_BEFORE_FULFILMENT", lines: [{ quantity: 1, unitPriceMinor: 3899, unitCostMinor: null }] }),
    );
    expect(p.isPriced).toBe(true);
    expect(p.unpricedLineCount).toBe(0);
  });

  it("still charges a cancellation that happened after dispatch", () => {
    const p = calculateOrderProfit(
      order({
        cancelState: "CANCELLED_AFTER_FULFILMENT",
        refunds: [{ buyerRefundMinor: 3899, feeCreditMinor: 507, recoveredMinor: 0 }],
      }),
    );
    expect(p.isNonLossCancellation).toBe(false);
    expect(p.refundLossMinor).toBe(3392);
  });
});

describe("breakEvenPriceMinor (R7)", () => {
  it("covers cost plus the fee taken on the higher price", () => {
    // At a 13% fee rate, a £2.00 item must sell for £2.30 to break even.
    const be = breakEvenPriceMinor(200, 0.13)!;
    expect(be).toBe(230);
    expect(be - Math.round(be * 0.13) - 200).toBeGreaterThanOrEqual(0);
  });

  it("includes shipping cost when the seller pays it", () => {
    expect(breakEvenPriceMinor(200, 0.13, 100)).toBe(345);
  });

  it("refuses to answer for an impossible fee rate", () => {
    expect(breakEvenPriceMinor(200, 1)).toBeNull();
    expect(breakEvenPriceMinor(200, -0.1)).toBeNull();
  });
});

describe("observedFeeRatio", () => {
  it("is null without revenue", () => {
    expect(observedFeeRatio(500, 0)).toBeNull();
  });
  it("divides fees by revenue", () => {
    expect(observedFeeRatio(507, 3899)).toBeCloseTo(0.13, 3);
  });
});
