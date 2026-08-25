import type { Minor } from "@/lib/money";

/** Refund loss dating. See docs/VIDEO-REQUIREMENTS.md R3. */
export const REFUND_ATTRIBUTION = ["REFUND_MONTH", "ORDER_MONTH"] as const;
export type RefundAttribution = (typeof REFUND_ATTRIBUTION)[number];

export const REFUND_ATTRIBUTION_COPY: Record<
  RefundAttribution,
  { title: string; example: string; rationale: string }
> = {
  REFUND_MONTH: {
    title: "The month the refund arrives",
    example: "A July sale refunded in August reduces August.",
    rationale: "Closed months never change — the way profit-share and month-end teams settle.",
  },
  ORDER_MONTH: {
    title: "The month of the original order",
    example: "A July sale refunded in August reduces July.",
    rationale: "Each month always shows what its orders truly earned in the end.",
  },
};

/** Supplier-side state of a buyer refund. See R5. */
export const SUPPLIER_CLAIM = [
  "NOT_ASKED",
  "ASKED",
  "PROMISED",
  "RECEIVED",
  "PARTIAL",
  "WRITTEN_OFF",
  "NOT_APPLICABLE",
] as const;
export type SupplierClaim = (typeof SUPPLIER_CLAIM)[number];

export const SUPPLIER_CLAIM_LABELS: Record<SupplierClaim, string> = {
  NOT_ASKED: "Not asked",
  ASKED: "Asked",
  PROMISED: "Promised",
  RECEIVED: "Received",
  PARTIAL: "Partly received",
  WRITTEN_OFF: "Not coming back",
  NOT_APPLICABLE: "No supplier cost",
};

/** Claims that still need a human to do something. */
export const OPEN_CLAIMS: SupplierClaim[] = ["NOT_ASKED", "ASKED", "PROMISED"];
/** Claims where the answer is final. */
export const SETTLED_CLAIMS: SupplierClaim[] = ["RECEIVED", "PARTIAL", "WRITTEN_OFF", "NOT_APPLICABLE"];

/**
 * Everything the profit of a single order resolves to.
 *
 * Sign convention: `revenue` and `recovered` are positive; every cost field is
 * a positive magnitude and is *subtracted* by the formula. That way a reader
 * can add up the displayed rows by eye and land on `netProfit`.
 */
export interface OrderProfit {
  currency: string;

  /** Gross sales including shipping charged to the buyer. Tax is excluded — eBay collects and remits it. */
  revenueMinor: Minor;
  itemSubtotalMinor: Minor;
  shippingChargedMinor: Minor;

  /** Supplier buying price × quantity, over the line items that have a cost. */
  costOfGoodsMinor: Minor;
  ebayFeesMinor: Minor;
  adFeesMinor: Minor;

  /** What the buyer got back, what eBay credited back, what the supplier returned. */
  buyerRefundMinor: Minor;
  feeCreditMinor: Minor;
  recoveredMinor: Minor;
  /** buyerRefund − feeCredit − recovered, floored at zero. The real hole in the pocket. */
  refundLossMinor: Minor;

  /** revenue − costOfGoods − ebayFees − adFees. Before refunds. */
  grossProfitMinor: Minor;
  /** grossProfit − refundLoss. What the order actually earned. */
  netProfitMinor: Minor;
  marginRatio: number | null;

  /** False when any line item still has no buying price. Profit is then incomplete, not zero. */
  isPriced: boolean;
  unpricedLineCount: number;
  /** True when the order was cancelled before anything was bought from a supplier — not a loss. See R6. */
  isNonLossCancellation: boolean;
}
