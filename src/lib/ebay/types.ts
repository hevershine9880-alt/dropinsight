/**
 * The contract between DropInsight and eBay.
 *
 * Everything above this line (sync engine, profit, UI) is written against these
 * types only. `LiveEbayClient` talks to the real Sell APIs; `MockEbayClient`
 * generates a deterministic account for development. Swapping them changes
 * nothing else, which is what makes the mock worth having — it exercises the
 * same code path rather than a parallel one.
 */

export interface EbayTokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  scopes: string[];
}

export interface EbayIdentity {
  ebayUserId: string;
  username: string;
  marketplaceId: string;
  currency: string;
}

export interface EbayMoney {
  /** Minor units. Converted at the boundary; nothing downstream sees a decimal string. */
  amountMinor: number;
  currency: string;
}

export interface EbayLineItem {
  lineItemId: string;
  legacyItemId: string | null;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: EbayMoney;
  /** Final value fee and other per-line charges eBay attributes to this item. */
  lineFees: EbayMoney;
}

export type EbayFulfillmentStatus = "AWAITING_DISPATCH" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED";
export type EbayPaymentStatus = "PAID" | "UNPAID" | "REFUNDED" | "PARTIALLY_REFUNDED";
export type EbayCancelState = "NONE" | "CANCELLED_BEFORE_FULFILMENT" | "CANCELLED_AFTER_FULFILMENT";

export interface EbayOrder {
  orderId: string;
  legacyOrderId: string | null;
  creationDate: Date;
  currency: string;

  buyerUsername: string;
  buyerName: string | null;
  buyerFeedbackScore: number | null;
  shipToCity: string | null;
  shipToCountry: string | null;

  itemSubtotal: EbayMoney;
  shippingCharged: EbayMoney;
  tax: EbayMoney;
  total: EbayMoney;
  /** Marketplace fees: final value fee, fixed fee, international fee. */
  fees: EbayMoney;
  /** Promoted Listings spend attributed to this order. */
  adFees: EbayMoney;

  fulfillmentStatus: EbayFulfillmentStatus;
  paymentStatus: EbayPaymentStatus;
  cancelState: EbayCancelState;
  dispatchDeadline: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  trackingNumber: string | null;
  carrier: string | null;

  lineItems: EbayLineItem[];
  refunds: EbayRefund[];
}

export interface EbayRefund {
  refundId: string;
  orderId: string;
  type: "REFUND" | "RETURN" | "CANCELLATION";
  refundedAt: Date;
  buyerRefund: EbayMoney;
  /** What eBay credited back of its own fees. */
  feeCredit: EbayMoney;
  reason: string | null;
  returnState: string | null;
}

export interface EbayAccountHealth {
  sellerLevel: string;
  lateDispatchRate: number;
  transactionDefectRate: number;
  casesClosedWithoutSellerResolutionRate: number;
  evaluatedAt: Date;
  nextEvaluationAt: Date;
}

export interface EbayStoreFee {
  externalRef: string;
  description: string;
  amount: EbayMoney;
  periodStart: Date;
  periodEnd: Date;
}

export interface OrderPage {
  orders: EbayOrder[];
  /** Opaque continuation token. Null when the caller has reached the end. */
  nextCursor: string | null;
  total: number;
}

export interface FetchOrdersParams {
  modifiedSince?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  cursor?: string | null;
  limit?: number;
}

/** Implemented by both the live and mock clients. */
export interface EbayClient {
  readonly kind: "live" | "mock";
  buildAuthorizationUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<EbayTokenSet>;
  refreshTokens(refreshToken: string): Promise<EbayTokenSet>;
  getIdentity(accessToken: string): Promise<EbayIdentity>;
  fetchOrders(accessToken: string, params: FetchOrdersParams): Promise<OrderPage>;
  fetchAccountHealth(accessToken: string): Promise<EbayAccountHealth | null>;
  fetchStoreFees(accessToken: string, from: Date, to: Date): Promise<EbayStoreFee[]>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Base for anything the sync engine has to reason about. */
export class EbayError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "EbayError";
  }
}

/** The refresh token is dead — only the user can fix this, by reconnecting. */
export class EbayAuthError extends EbayError {
  constructor(message: string) {
    super(message, false);
    this.name = "EbayAuthError";
  }
}

/** The user revoked the application's access in their eBay account. */
export class EbayRevokedError extends EbayAuthError {
  constructor(message = "This eBay account revoked DropInsight's access.") {
    super(message);
    this.name = "EbayRevokedError";
  }
}

/** Back off and try again. `retryAfterSeconds` comes from eBay when it says so. */
export class EbayRateLimitError extends EbayError {
  constructor(public readonly retryAfterSeconds: number) {
    super(`eBay rate limit reached. Retry in ${retryAfterSeconds}s.`, true);
    this.name = "EbayRateLimitError";
  }
}

export class EbayTransientError extends EbayError {
  constructor(message: string) {
    super(message, true);
    this.name = "EbayTransientError";
  }
}
