/**
 * Money in DropInsight.
 *
 * Every monetary value is an integer number of MINOR units — pence for GBP,
 * cents for USD. Floats are never used for arithmetic, only for presentation at
 * the very last step. This is why `netProfit` can be summed across ten thousand
 * orders and still reconcile to the penny against the P&L.
 */

export type Minor = number;

export const ZERO: Minor = 0;

/** Currencies whose minor unit is not 1/100. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function minorUnitExponent(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export function minorUnitScale(currency: string): number {
  return 10 ** minorUnitExponent(currency);
}

/**
 * Parse a human-entered amount ("4.50", "£4.50", "1,234.56") into minor units.
 * Returns null when the input is not a valid amount — callers surface that as a
 * field error rather than silently coercing to zero.
 */
export function parseMoney(input: string | number | null | undefined, currency = "GBP"): Minor | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * minorUnitScale(currency));
  }

  const cleaned = input.trim().replace(/[£$€\s]/g, "").replace(/,/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const digits = negative ? cleaned.slice(1) : cleaned;
  const [wholeRaw, fracRaw = ""] = digits.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const exponent = minorUnitExponent(currency);

  // Work on the decimal string directly so 0.1 + 0.2 never enters the picture.
  const frac = (fracRaw + "0".repeat(exponent)).slice(0, exponent);
  const rounder = fracRaw.length > exponent && Number(fracRaw[exponent]) >= 5 ? 1 : 0;

  const value = Number(whole) * minorUnitScale(currency) + Number(frac || "0") + rounder;
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Minor units → a plain decimal string, e.g. 1234 → "12.34". No symbol. */
export function toDecimalString(minor: Minor, currency = "GBP"): string {
  const exponent = minorUnitExponent(currency);
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor)).toString().padStart(exponent + 1, "0");
  const whole = abs.slice(0, abs.length - exponent) || "0";
  const frac = exponent === 0 ? "" : "." + abs.slice(abs.length - exponent);
  return `${negative ? "-" : ""}${whole}${frac}`;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, locale: string, compact: boolean) {
  const key = `${currency}|${locale}|${compact}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: compact ? 0 : minorUnitExponent(currency),
      maximumFractionDigits: compact ? 1 : minorUnitExponent(currency),
    });
    formatterCache.set(key, f);
  }
  return f;
}

export function formatMoney(
  minor: Minor,
  currency = "GBP",
  opts: { locale?: string; compact?: boolean; signed?: boolean } = {},
): string {
  const { locale = "en-GB", compact = false, signed = false } = opts;
  const value = minor / minorUnitScale(currency);
  const text = formatter(currency, locale, compact).format(value);
  return signed && minor > 0 ? `+${text}` : text;
}

/** Percentages are held as a ratio (0.2162), formatted once at the edge. */
export function formatPercent(ratio: number | null, opts: { digits?: number; signed?: boolean } = {}): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  const { digits = 1, signed = false } = opts;
  const text = `${(ratio * 100).toFixed(digits)}%`;
  return signed && ratio > 0 ? `+${text}` : text;
}

export function sum(values: Minor[]): Minor {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Margin as a ratio of revenue. Returns null when revenue is zero — a margin of
 * "0%" and "not applicable" are different facts and the UI shows them differently.
 */
export function margin(netProfitMinor: Minor, revenueMinor: Minor): number | null {
  if (revenueMinor === 0) return null;
  return netProfitMinor / revenueMinor;
}

/** Period-over-period change. Null when there is no base to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

/**
 * Split a total across n parts without losing or inventing a penny.
 * Used when apportioning order-level fees down to line items.
 */
export function allocate(total: Minor, weights: number[]): Minor[] {
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  if (weightTotal === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (total * w) / weightTotal);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = total - floored.reduce((a, b) => a + b, 0);

  // Hand the remaining units to the largest fractional parts, biggest first.
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floored];
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    result[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  while (remainder < 0 && order.length > 0) {
    result[order[k % order.length].i] -= 1;
    remainder += 1;
    k += 1;
  }
  return result;
}
