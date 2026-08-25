import { describe, it, expect } from "vitest";
import { assessListing, HEALTH_THRESHOLDS, type ListingHealthInput } from "@/lib/finance/listing-health";

function listing(overrides: Partial<ListingHealthInput> = {}): ListingHealthInput {
  return {
    unitsSold: 40,
    orderCount: 40,
    totalLines: 40,
    revenueMinor: 40_000,
    profitMinor: 12_000,
    marginRatio: 0.3,
    refundRate: 0.02,
    refundCount: 1,
    unpricedLines: 0,
    currentPriceMinor: 1_000,
    breakEvenMinor: 700,
    lastCostMinor: 600,
    currency: "GBP",
    ...overrides,
  };
}

describe("assessListing — the money verdicts", () => {
  it("calls a profitable, well-selling listing a winner", () => {
    const health = assessListing(listing());
    expect(health.verdict).toBe("winner");
    expect(health.reason).toContain("40 sold");
    expect(health.atRiskMinor).toBeNull();
  });

  it("calls a negative-profit listing a loss-maker, and says what it cost", () => {
    const health = assessListing(listing({ profitMinor: -5_000, marginRatio: -0.125 }));
    expect(health.verdict).toBe("losing_money");
    expect(health.atRiskMinor).toBe(5_000);
    expect(health.action).toMatch(/raise the price/i);
  });

  it("flags a listing priced under its break-even and names the shortfall", () => {
    const health = assessListing(listing({ currentPriceMinor: 650, breakEvenMinor: 700 }));
    expect(health.flags).toContain("below_break_even");
    expect(health.action).toContain("£0.50");
  });

  it("flags a thin margin but does not confuse it with a loss", () => {
    const health = assessListing(listing({ profitMinor: 800, marginRatio: 0.02 }));
    expect(health.verdict).toBe("thin_margin");
    expect(health.flags).not.toContain("losing_money");
  });

  it("never calls the same listing a winner and a problem", () => {
    for (const overrides of [
      { profitMinor: -100, marginRatio: -0.01 },
      { currentPriceMinor: 500, breakEvenMinor: 900 },
      { refundRate: 0.4, refundCount: 16 },
      { profitMinor: 200, marginRatio: 0.005 },
    ]) {
      const health = assessListing(listing(overrides));
      expect(health.flags).not.toContain("winner");
    }
  });
});

describe("assessListing — refund-prone", () => {
  it("flags a listing that comes back often", () => {
    const health = assessListing(listing({ refundRate: 0.35, refundCount: 14 }));
    expect(health.verdict).toBe("refund_prone");
    expect(health.reason).toContain("35%");
  });

  it("ignores a high rate on too few sales to mean anything", () => {
    const health = assessListing(listing({
      orderCount: HEALTH_THRESHOLDS.minSalesForRate - 1,
      unitsSold: 3,
      refundRate: 1,
      refundCount: 3,
    }));
    expect(health.flags).not.toContain("refund_prone");
  });
});

describe("assessListing — cost coverage", () => {
  it("says the profit is unknown when most orders are uncosted", () => {
    const health = assessListing(listing({ unpricedLines: 30, totalLines: 40 }));
    expect(health.verdict).toBe("needs_pricing");
    expect(health.reason).toMatch(/25%.*costed/);
  });

  it("still judges a listing that is mostly costed", () => {
    // Eleven recent uncosted orders out of 117 must not stop a clear winner
    // being called a winner — that was a real bug.
    const health = assessListing(listing({ unitsSold: 117, orderCount: 117, totalLines: 117, unpricedLines: 11 }));
    expect(health.verdict).toBe("winner");
    expect(health.flags).not.toContain("needs_pricing");
  });

  it("says so plainly when there is no cost at all", () => {
    const health = assessListing(listing({ lastCostMinor: null, unpricedLines: 40, breakEvenMinor: null }));
    expect(health.verdict).toBe("needs_pricing");
    expect(health.reason).toMatch(/no buying price/i);
  });

  it("reports the coverage it used", () => {
    expect(assessListing(listing({ unpricedLines: 10, totalLines: 40 })).costCoverage).toBeCloseTo(0.75);
    expect(assessListing(listing()).costCoverage).toBe(1);
  });
});

describe("assessListing — always actionable", () => {
  it("gives every verdict a reason and an action", () => {
    const cases: Partial<ListingHealthInput>[] = [
      {},
      { profitMinor: -1 },
      { currentPriceMinor: 100, breakEvenMinor: 900 },
      { refundRate: 0.5, refundCount: 20 },
      { profitMinor: 100, marginRatio: 0.01 },
      { unpricedLines: 40, totalLines: 40, lastCostMinor: null, breakEvenMinor: null },
      { unitsSold: 1, orderCount: 1, totalLines: 1, marginRatio: 0.15, profitMinor: 100 },
    ];
    for (const input of cases) {
      const health = assessListing(listing(input));
      expect(health.reason.length, JSON.stringify(input)).toBeGreaterThan(5);
      expect(health.action.length, JSON.stringify(input)).toBeGreaterThan(5);
      expect(health.flags.length).toBeGreaterThan(0);
    }
  });
});
