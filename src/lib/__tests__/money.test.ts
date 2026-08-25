import { describe, it, expect } from "vitest";
import {
  parseMoney,
  toDecimalString,
  formatMoney,
  formatPercent,
  margin,
  percentChange,
  allocate,
  minorUnitExponent,
} from "@/lib/money";

describe("parseMoney", () => {
  it("parses plain decimals to minor units", () => {
    expect(parseMoney("4.50")).toBe(450);
    expect(parseMoney("0.01")).toBe(1);
    expect(parseMoney("1234.56")).toBe(123456);
  });

  it("strips currency symbols, spaces and thousands separators", () => {
    expect(parseMoney("£4.50")).toBe(450);
    expect(parseMoney("  1,234.56 ")).toBe(123456);
    expect(parseMoney("$99")).toBe(9900);
  });

  it("handles values that float arithmetic gets wrong", () => {
    // 1.15 * 100 is 114.99999999999999 in IEEE-754.
    expect(parseMoney("1.15")).toBe(115);
    expect(parseMoney("8.20")).toBe(820);
    expect(parseMoney("29.99")).toBe(2999);
    expect(parseMoney("1.005")).toBe(101);
  });

  it("rounds half up at the minor unit", () => {
    expect(parseMoney("4.567")).toBe(457);
    expect(parseMoney("4.564")).toBe(456);
  });

  it("handles negatives", () => {
    expect(parseMoney("-12.34")).toBe(-1234);
  });

  it("returns null rather than zero for junk", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney(Number.NaN)).toBeNull();
  });

  it("respects zero-decimal currencies", () => {
    expect(minorUnitExponent("JPY")).toBe(0);
    expect(parseMoney("500", "JPY")).toBe(500);
    expect(toDecimalString(500, "JPY")).toBe("500");
  });
});

describe("toDecimalString", () => {
  it("round-trips with parseMoney", () => {
    for (const s of ["0.00", "0.01", "4.50", "123.45", "-9.99", "1000000.00"]) {
      expect(toDecimalString(parseMoney(s)!)).toBe(s);
    }
  });

  it("pads sub-unit amounts", () => {
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(0)).toBe("0.00");
    expect(toDecimalString(-5)).toBe("-0.05");
  });
});

describe("formatMoney", () => {
  it("formats GBP", () => {
    expect(formatMoney(536721, "GBP")).toBe("£5,367.21");
  });
  it("marks positives when asked", () => {
    expect(formatMoney(100, "GBP", { signed: true })).toBe("+£1.00");
    expect(formatMoney(-100, "GBP", { signed: true })).toBe("-£1.00");
  });
});

describe("margin", () => {
  it("is null when there is no revenue", () => {
    expect(margin(0, 0)).toBeNull();
    expect(margin(500, 0)).toBeNull();
  });
  it("computes a ratio", () => {
    expect(margin(536721, 2482176)).toBeCloseTo(0.2162, 4);
  });
  it("goes negative on a loss", () => {
    expect(margin(-1831, 2295)).toBeCloseTo(-0.7978, 4);
  });
});

describe("percentChange", () => {
  it("is null when there is nothing to compare against", () => {
    expect(percentChange(100, 0)).toBeNull();
  });
  it("is zero when both sides are zero", () => {
    expect(percentChange(0, 0)).toBe(0);
  });
  it("compares against the magnitude of the base", () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2);
    expect(percentChange(80, 100)).toBeCloseTo(-0.2);
    // Recovering from a loss reads as an improvement, not a collapse.
    expect(percentChange(-50, -100)).toBeCloseTo(0.5);
  });
});

describe("allocate", () => {
  it("never loses or invents a unit", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });

  it("weights proportionally", () => {
    const parts = allocate(1000, [3, 1]);
    expect(parts).toEqual([750, 250]);
  });

  it("handles a zero weight total", () => {
    expect(allocate(1000, [0, 0])).toEqual([0, 0]);
  });

  it("handles negative totals", () => {
    const parts = allocate(-1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-1000);
  });

  it("survives a fuzz of random splits", () => {
    for (let i = 0; i < 500; i++) {
      const total = Math.floor(Math.random() * 200000) - 100000;
      const n = 1 + Math.floor(Math.random() * 8);
      const weights = Array.from({ length: n }, () => Math.random() * 10);
      expect(allocate(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe("formatPercent", () => {
  it("shows an em dash for an undefined ratio", () => {
    expect(formatPercent(null)).toBe("—");
  });
  it("formats to one digit by default", () => {
    expect(formatPercent(0.2162)).toBe("21.6%");
    expect(formatPercent(0.2162, { signed: true })).toBe("+21.6%");
  });
});
