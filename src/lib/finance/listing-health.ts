import { formatMoney, type Minor } from "@/lib/money";

/**
 * Listing health.
 *
 * A seller with 300 SKUs cannot read a table and work out which ones are worth
 * keeping. This turns the numbers into a verdict per listing, with the reason
 * and the thing to do about it — so the answer to "what should I fix today?"
 * is one glance rather than an afternoon in a spreadsheet.
 *
 * The thresholds are stated here, once, and shown to the user wherever a
 * verdict appears. A judgement you cannot see the basis for is not useful.
 */

export const HEALTH_THRESHOLDS = {
  /** Below this margin a listing is barely worth the handling. */
  thinMarginRatio: 0.1,
  /** A strong listing clears this comfortably. */
  healthyMarginRatio: 0.2,
  /** At or above this refund rate the product itself is the problem. */
  refundProneRatio: 0.2,
  /** Fewer sales than this and any rate is noise, not signal. */
  minSalesForRate: 4,
  /** A winner has to have actually sold. */
  minUnitsForWinner: 5,
  /**
   * How much of a listing's history must be costed before its profit is worth
   * judging. Below this the verdict is "we don't know yet"; above it, a handful
   * of recent uncosted orders does not invalidate what the rest already shows.
   */
  minCostCoverage: 0.5,
} as const;

export const LISTING_VERDICTS = [
  "losing_money",
  "below_break_even",
  "refund_prone",
  "thin_margin",
  "needs_pricing",
  "winner",
  "steady",
] as const;

export type ListingVerdict = (typeof LISTING_VERDICTS)[number];

export interface VerdictMeta {
  label: string;
  /** One line, in the seller's language, describing what the verdict means. */
  meaning: string;
  tone: "negative" | "caution" | "positive" | "neutral" | "brand";
  /** Lower sorts first: the most urgent verdicts lead. */
  urgency: number;
}

export const VERDICT_META: Record<ListingVerdict, VerdictMeta> = {
  losing_money: {
    label: "Losing money",
    meaning: "Sales of this listing have cost you more than they brought in.",
    tone: "negative",
    urgency: 0,
  },
  below_break_even: {
    label: "Priced too low",
    meaning: "It is listed below the price it needs to cover its cost and eBay's fees.",
    tone: "negative",
    urgency: 1,
  },
  refund_prone: {
    label: "Refunded often",
    meaning: "Enough of its sales come back that the product or the listing is the problem.",
    tone: "caution",
    urgency: 2,
  },
  thin_margin: {
    label: "Thin margin",
    meaning: "It makes money, but not enough to be worth the handling.",
    tone: "caution",
    urgency: 3,
  },
  needs_pricing: {
    label: "Needs a cost",
    meaning: "Some of its orders have no buying price, so its profit is unknown.",
    tone: "neutral",
    urgency: 4,
  },
  winner: {
    label: "Winner",
    meaning: "Sells well at a healthy margin. Worth more stock and more ad spend.",
    tone: "positive",
    urgency: 6,
  },
  steady: {
    label: "Steady",
    meaning: "Profitable and unremarkable. Nothing to do.",
    tone: "neutral",
    urgency: 5,
  },
};

export interface ListingHealthInput {
  unitsSold: number;
  orderCount: number;
  /** Total order lines for this listing, costed or not. */
  totalLines: number;
  revenueMinor: Minor;
  profitMinor: Minor;
  marginRatio: number | null;
  refundRate: number;
  refundCount: number;
  unpricedLines: number;
  currentPriceMinor: Minor;
  breakEvenMinor: Minor | null;
  lastCostMinor: Minor | null;
  /** Needed only so the advice can name an amount the seller recognises. */
  currency: string;
}

export interface ListingHealth {
  /** The single most urgent thing true of this listing. */
  verdict: ListingVerdict;
  /** Share of this listing's order lines that have a buying price. */
  costCoverage: number;
  /** Everything true of it, most urgent first — a listing is often several. */
  flags: ListingVerdict[];
  /** Why this verdict, with the actual numbers in it. */
  reason: string;
  /** What to do, in plain terms. */
  action: string;
  /**
   * Money at stake if nothing changes, over a period of the same length.
   * Null when the verdict is not costing anything.
   */
  atRiskMinor: Minor | null;
}

export function assessListing(input: ListingHealthInput): ListingHealth {
  const flags: ListingVerdict[] = [];

  const totalLines = Math.max(input.totalLines, input.unpricedLines);
  const costCoverage = totalLines === 0 ? 0 : (totalLines - input.unpricedLines) / totalLines;

  /**
   * A listing with 117 sales and 11 recent orders still to cost is not an
   * unknown quantity — the other 106 already say what it does. Only when most
   * of its history is uncosted is the profit picture genuinely missing.
   */
  const judgeable =
    input.lastCostMinor !== null && costCoverage >= HEALTH_THRESHOLDS.minCostCoverage;

  const belowBreakEven =
    input.breakEvenMinor !== null && input.currentPriceMinor < input.breakEvenMinor;
  const refundProne =
    input.orderCount >= HEALTH_THRESHOLDS.minSalesForRate &&
    input.refundRate >= HEALTH_THRESHOLDS.refundProneRatio;

  if (judgeable && input.profitMinor < 0) flags.push("losing_money");
  if (belowBreakEven) flags.push("below_break_even");
  if (refundProne) flags.push("refund_prone");
  if (
    judgeable &&
    input.profitMinor >= 0 &&
    input.marginRatio !== null &&
    input.marginRatio < HEALTH_THRESHOLDS.thinMarginRatio
  ) {
    flags.push("thin_margin");
  }
  // Only flagged when the missing costs actually cloud the verdict. A listing
  // that is 95% costed does not "need a cost" in any listing-level sense —
  // that is an orders-page task, and flagging it here would mark every listing.
  if (!judgeable) flags.push("needs_pricing");
  if (
    judgeable &&
    input.unitsSold >= HEALTH_THRESHOLDS.minUnitsForWinner &&
    input.marginRatio !== null &&
    input.marginRatio >= HEALTH_THRESHOLDS.healthyMarginRatio &&
    input.profitMinor > 0 &&
    !refundProne &&
    !belowBreakEven
  ) {
    flags.push("winner");
  }

  if (flags.length === 0) flags.push("steady");
  flags.sort((a, b) => VERDICT_META[a].urgency - VERDICT_META[b].urgency);

  // "Needs a cost" leads only when the profit really is unknowable. Otherwise
  // it stays as a secondary flag and the money verdict leads, because that is
  // what the seller can act on.
  const verdict = judgeable ? (flags.find((f) => f !== "needs_pricing") ?? "steady") : "needs_pricing";

  const { reason, action, atRiskMinor } = explain(verdict, { ...input, costCoverage });

  return { verdict, flags, costCoverage, reason, action, atRiskMinor };
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`;
}

function explain(
  verdict: ListingVerdict,
  input: ListingHealthInput & { costCoverage: number },
): { reason: string; action: string; atRiskMinor: Minor | null } {
  switch (verdict) {
    case "losing_money":
      return {
        reason: `${input.unitsSold} sold and down overall — these sales are costing you money.`,
        action: "Raise the price, find a cheaper supplier, or stop listing it.",
        atRiskMinor: Math.abs(input.profitMinor),
      };

    case "below_break_even": {
      const gap = input.breakEvenMinor! - input.currentPriceMinor;
      return {
        reason: `Listed below the price it needs to cover its cost plus eBay's fees.`,
        action: `Raise the price by at least ${formatMoney(gap, input.currency)} to break even.`,
        atRiskMinor: gap * Math.max(1, input.unitsSold),
      };
    }

    case "refund_prone":
      return {
        reason: `${pct(input.refundRate)} of its ${input.orderCount} orders came back — ${input.refundCount} refunds.`,
        action: "Check the listing description and photos, then the supplier's quality.",
        atRiskMinor: null,
      };

    case "thin_margin":
      return {
        reason: `${pct(input.marginRatio ?? 0)} margin — under the ${pct(HEALTH_THRESHOLDS.thinMarginRatio)} worth handling.`,
        action: "Nudge the price up, or negotiate the buying price down.",
        atRiskMinor: null,
      };

    case "needs_pricing":
      return {
        reason:
          input.lastCostMinor === null
            ? `No buying price recorded across ${input.totalLines} order line${input.totalLines === 1 ? "" : "s"}.`
            : `Only ${pct(input.costCoverage)} of its orders are costed, so its profit is not yet reliable.`,
        action: "Enter the missing costs and this listing gets a real verdict.",
        atRiskMinor: null,
      };

    case "winner":
      return {
        reason: `${input.unitsSold} sold at ${pct(input.marginRatio ?? 0)} margin.`,
        action: "Keep it in stock and consider promoting it.",
        atRiskMinor: null,
      };

    case "steady":
      return {
        reason: input.marginRatio !== null ? `${pct(input.marginRatio)} margin, no problems.` : "No problems.",
        action: "Nothing to do.",
        atRiskMinor: null,
      };

  }
}

/** Verdicts a seller should act on, in the order they should act. */
export const ACTIONABLE_VERDICTS: ListingVerdict[] = [
  "losing_money",
  "below_break_even",
  "refund_prone",
  "thin_margin",
  "needs_pricing",
];
