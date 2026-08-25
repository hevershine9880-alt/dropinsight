import { margin, sum, type Minor } from "@/lib/money";
import type { OrderProfit } from "./types";

/**
 * The one place order profit is calculated.
 *
 * Nothing in the app re-derives profit from raw columns; pages, exports, the
 * P&L and the automation engine all call through here. That is what makes
 * "every financial figure is traceable" true rather than aspirational.
 */

export interface ProfitInputLine {
  quantity: number;
  unitPriceMinor: Minor;
  /** Newest cost entry for the line, or null when nobody has priced it yet. */
  unitCostMinor: Minor | null;
}

export interface ProfitInputRefund {
  buyerRefundMinor: Minor;
  feeCreditMinor: Minor;
  recoveredMinor: Minor;
}

export interface ProfitInput {
  currency: string;
  itemSubtotalMinor: Minor;
  shippingChargedMinor: Minor;
  ebayFeesMinor: Minor;
  adFeesMinor: Minor;
  cancelState: string;
  lines: ProfitInputLine[];
  refunds: ProfitInputRefund[];
}

export function calculateOrderProfit(input: ProfitInput): OrderProfit {
  const revenueMinor = input.itemSubtotalMinor + input.shippingChargedMinor;

  let costOfGoodsMinor = 0;
  let unpricedLineCount = 0;
  for (const line of input.lines) {
    if (line.unitCostMinor === null) {
      unpricedLineCount += 1;
      continue;
    }
    costOfGoodsMinor += line.unitCostMinor * line.quantity;
  }
  const isPriced = unpricedLineCount === 0 && input.lines.length > 0;

  const buyerRefundMinor = sum(input.refunds.map((r) => r.buyerRefundMinor));
  const feeCreditMinor = sum(input.refunds.map((r) => r.feeCreditMinor));
  const recoveredMinor = sum(input.refunds.map((r) => r.recoveredMinor));

  // A refund can never turn into a gain: if eBay credits back more than the
  // buyer received, that is a fee correction, not profit from the refund.
  const refundLossMinor = Math.max(0, buyerRefundMinor - feeCreditMinor - recoveredMinor);

  const grossProfitMinor =
    revenueMinor - costOfGoodsMinor - input.ebayFeesMinor - input.adFeesMinor;

  const isNonLossCancellation = input.cancelState === "CANCELLED_BEFORE_FULFILMENT";

  // Cancelled-before-fulfilment orders never reached a supplier, so they carry
  // no cost, no revenue and no loss. They are counted, not charged. (R6)
  if (isNonLossCancellation) {
    return {
      currency: input.currency,
      revenueMinor: 0,
      itemSubtotalMinor: 0,
      shippingChargedMinor: 0,
      costOfGoodsMinor: 0,
      ebayFeesMinor: 0,
      adFeesMinor: 0,
      buyerRefundMinor,
      feeCreditMinor,
      recoveredMinor,
      refundLossMinor: 0,
      grossProfitMinor: 0,
      netProfitMinor: 0,
      marginRatio: null,
      isPriced: true,
      unpricedLineCount: 0,
      isNonLossCancellation: true,
    };
  }

  const netProfitMinor = grossProfitMinor - refundLossMinor;

  return {
    currency: input.currency,
    revenueMinor,
    itemSubtotalMinor: input.itemSubtotalMinor,
    shippingChargedMinor: input.shippingChargedMinor,
    costOfGoodsMinor,
    ebayFeesMinor: input.ebayFeesMinor,
    adFeesMinor: input.adFeesMinor,
    buyerRefundMinor,
    feeCreditMinor,
    recoveredMinor,
    refundLossMinor,
    grossProfitMinor,
    netProfitMinor,
    marginRatio: margin(netProfitMinor, revenueMinor),
    isPriced,
    unpricedLineCount,
    isNonLossCancellation: false,
  };
}

/**
 * The lowest sale price at which an order of this product still breaks even,
 * given the supplier cost and the fee rate eBay actually charged. Drives the
 * "prices your products can't afford to drop below" surface. (R7)
 *
 * feeRatio is derived from real orders, not guessed: fees ÷ revenue.
 */
export function breakEvenPriceMinor(
  unitCostMinor: Minor,
  feeRatio: number,
  shippingCostMinor: Minor = 0,
): Minor | null {
  if (feeRatio >= 1 || feeRatio < 0) return null;
  return Math.ceil((unitCostMinor + shippingCostMinor) / (1 - feeRatio));
}

/** Fee rate observed across a set of orders. Null when there is no revenue to divide by. */
export function observedFeeRatio(feesMinor: Minor, revenueMinor: Minor): number | null {
  if (revenueMinor <= 0) return null;
  return feesMinor / revenueMinor;
}
