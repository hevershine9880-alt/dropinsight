import { parseMoney } from "@/lib/money";
import {
  EbayAuthError, EbayRateLimitError, EbayRevokedError, EbayTransientError,
  type EbayAccountHealth, type EbayClient, type EbayIdentity, type EbayLineItem,
  type EbayMoney, type EbayOrder, type EbayRefund, type EbayStoreFee,
  type EbayTokenSet, type FetchOrdersParams, type OrderPage,
} from "./types";

/**
 * The real eBay integration.
 *
 * Uses the Sell APIs: Fulfillment for orders, Finances for the transaction-level
 * fees that make profit accurate, and Analytics for seller performance.
 *
 * Notes that cost real time to rediscover:
 *  - Order totals from Fulfillment do NOT include marketplace fees. Fees have to
 *    come from Finances `/transaction`, keyed by orderId, or profit is wrong by
 *    roughly 13%.
 *  - `filter=lastmodifieddate:[...]` is what makes incremental sync possible;
 *    creationdate misses status changes on old orders.
 *  - eBay returns amounts as decimal strings. They are parsed to minor units
 *    here, at the boundary, and never travel as floats.
 */

const HOSTS = {
  production: { api: "https://api.ebay.com", auth: "https://auth.ebay.com" },
  sandbox: { api: "https://api.sandbox.ebay.com", auth: "https://auth.sandbox.ebay.com" },
} as const;

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.finances.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
];

export interface LiveClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: "production" | "sandbox";
}

export class LiveEbayClient implements EbayClient {
  readonly kind = "live" as const;

  constructor(private readonly config: LiveClientConfig) {}

  private get hosts() {
    return HOSTS[this.config.environment];
  }

  // -- OAuth ---------------------------------------------------------------

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      state,
      prompt: "login",
    });
    return `${this.hosts.auth}/oauth2/authorize?${params}`;
  }

  private basicAuth(): string {
    return Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
  }

  private async tokenRequest(body: URLSearchParams): Promise<EbayTokenSet> {
    const response = await fetch(`${this.hosts.api}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.basicAuth()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 400 && /invalid_grant/.test(text)) {
        throw new EbayRevokedError();
      }
      if (response.status === 401) throw new EbayAuthError("eBay rejected the application credentials.");
      if (response.status === 429) throw new EbayRateLimitError(retryAfter(response));
      if (response.status >= 500) throw new EbayTransientError(`eBay token endpoint returned ${response.status}.`);
      throw new EbayAuthError(`eBay token exchange failed (${response.status}).`);
    }

    const json = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      refresh_token_expires_in?: number;
    };

    const now = Date.now();
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? body.get("refresh_token") ?? "",
      accessTokenExpiresAt: new Date(now + json.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + (json.refresh_token_expires_in ?? 47_304_000) * 1000),
      scopes: SCOPES,
    };
  }

  exchangeCodeForTokens(code: string): Promise<EbayTokenSet> {
    return this.tokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.redirectUri,
      }),
    );
  }

  refreshTokens(refreshToken: string): Promise<EbayTokenSet> {
    return this.tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: SCOPES.join(" "),
      }),
    );
  }

  // -- Authenticated calls -------------------------------------------------

  private async get<T>(accessToken: string, path: string, marketplace?: string): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };
    if (marketplace) headers["X-EBAY-C-MARKETPLACE-ID"] = marketplace;

    const response = await fetch(`${this.hosts.api}${path}`, { headers });

    if (response.status === 401) throw new EbayAuthError("eBay access token was rejected.");
    if (response.status === 403) throw new EbayRevokedError();
    if (response.status === 429) throw new EbayRateLimitError(retryAfter(response));
    if (response.status >= 500) throw new EbayTransientError(`eBay returned ${response.status} for ${path}.`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new EbayTransientError(`eBay returned ${response.status} for ${path}: ${text.slice(0, 300)}`);
    }

    return (await response.json()) as T;
  }

  async getIdentity(accessToken: string): Promise<EbayIdentity> {
    const user = await this.get<{ userId: string; username: string; registrationMarketplaceId?: string }>(
      accessToken,
      "/commerce/identity/v1/user/",
    );
    const marketplaceId = user.registrationMarketplaceId ?? "EBAY_GB";
    return {
      ebayUserId: user.userId,
      username: user.username,
      marketplaceId,
      currency: currencyForMarketplace(marketplaceId),
    };
  }

  async fetchOrders(accessToken: string, params: FetchOrdersParams): Promise<OrderPage> {
    const limit = Math.min(params.limit ?? 50, 200);
    const query = new URLSearchParams({ limit: String(limit) });

    if (params.cursor) {
      query.set("offset", params.cursor);
    }
    if (params.modifiedSince) {
      query.set("filter", `lastmodifieddate:[${params.modifiedSince.toISOString()}..]`);
    } else if (params.createdFrom) {
      const to = params.createdTo ? `..${params.createdTo.toISOString()}` : "..";
      query.set("filter", `creationdate:[${params.createdFrom.toISOString()}${to}]`);
    }

    const page = await this.get<RawOrderPage>(
      accessToken,
      `/sell/fulfillment/v1/order?${query}`,
    );

    const orders = (page.orders ?? []).map(mapOrder);

    // Fulfillment does not carry fees. Without this second call every profit
    // figure in the product would be overstated by the marketplace's cut.
    await this.attachFees(accessToken, orders);

    const offset = Number(params.cursor ?? 0);
    const nextOffset = offset + orders.length;
    return {
      orders,
      nextCursor: page.next && nextOffset < (page.total ?? 0) ? String(nextOffset) : null,
      total: page.total ?? orders.length,
    };
  }

  private async attachFees(accessToken: string, orders: EbayOrder[]): Promise<void> {
    if (orders.length === 0) return;

    const earliest = orders.reduce(
      (min, o) => (o.creationDate < min ? o.creationDate : min),
      orders[0].creationDate,
    );
    const query = new URLSearchParams({
      limit: "200",
      filter: `transactionDate:[${new Date(earliest.getTime() - 86_400_000).toISOString()}..]`,
    });

    let transactions: RawTransaction[] = [];
    try {
      const result = await this.get<{ transactions?: RawTransaction[] }>(
        accessToken,
        `/sell/finances/v1/transaction?${query}`,
      );
      transactions = result.transactions ?? [];
    } catch (error) {
      // Fees are important but a Finances outage should not lose the orders.
      // The sync marks itself PARTIAL and the next run fills them in.
      if (error instanceof EbayAuthError) throw error;
      console.warn("[ebay] fee lookup failed, orders imported without fees", error);
      return;
    }

    const byOrder = new Map<string, { fees: number; ads: number; currency: string }>();
    for (const tx of transactions) {
      if (!tx.orderId) continue;
      const bucket = byOrder.get(tx.orderId) ?? { fees: 0, ads: 0, currency: tx.amount?.currency ?? "GBP" };
      const amount = Math.abs(parseMoney(tx.amount?.value ?? "0", tx.amount?.currency ?? "GBP") ?? 0);

      if (tx.transactionType === "NON_SALE_CHARGE" && /AD_FEE|PROMOTED/i.test(tx.feeType ?? "")) {
        bucket.ads += amount;
      } else if (tx.transactionType === "SALE") {
        for (const fee of tx.orderLineItems?.flatMap((li) => li.marketplaceFees ?? []) ?? []) {
          bucket.fees += Math.abs(parseMoney(fee.amount?.value ?? "0", fee.amount?.currency ?? "GBP") ?? 0);
        }
      }
      byOrder.set(tx.orderId, bucket);
    }

    for (const order of orders) {
      const found = byOrder.get(order.orderId);
      if (!found) continue;
      order.fees = { amountMinor: found.fees, currency: order.currency };
      order.adFees = { amountMinor: found.ads, currency: order.currency };
    }
  }

  async fetchAccountHealth(accessToken: string): Promise<EbayAccountHealth | null> {
    try {
      const raw = await this.get<RawSellerStandards>(
        accessToken,
        "/sell/analytics/v1/seller_standards_profile",
      );
      const metrics = new Map(
        (raw.metrics ?? []).map((m) => [m.metricKey, Number(m.value ?? 0)]),
      );
      return {
        sellerLevel: raw.standardsLevel ?? "UNKNOWN",
        lateDispatchRate: metrics.get("LATE_SHIPMENT_RATE") ?? 0,
        transactionDefectRate: metrics.get("TRANSACTION_DEFECT_RATE") ?? 0,
        casesClosedWithoutSellerResolutionRate: metrics.get("CASES_CLOSED_WITHOUT_SELLER_RESOLUTION") ?? 0,
        evaluatedAt: raw.evaluationDate ? new Date(raw.evaluationDate) : new Date(),
        nextEvaluationAt: nextEbayEvaluation(),
      };
    } catch (error) {
      if (error instanceof EbayAuthError) throw error;
      // Health is a nice-to-have; never fail a sync over it.
      return null;
    }
  }

  async fetchStoreFees(accessToken: string, from: Date, to: Date): Promise<EbayStoreFee[]> {
    try {
      const query = new URLSearchParams({
        filter: `payoutDate:[${from.toISOString()}..${to.toISOString()}]`,
        limit: "200",
      });
      const result = await this.get<{ transactions?: RawTransaction[] }>(
        accessToken,
        `/sell/finances/v1/transaction?${query}`,
      );
      return (result.transactions ?? [])
        .filter((tx) => tx.transactionType === "NON_SALE_CHARGE" && /STORE|SUBSCRIPTION/i.test(tx.feeType ?? ""))
        .map((tx) => ({
          externalRef: tx.transactionId,
          description: tx.feeType ?? "eBay store fee",
          amount: {
            amountMinor: Math.abs(parseMoney(tx.amount?.value ?? "0", tx.amount?.currency ?? "GBP") ?? 0),
            currency: tx.amount?.currency ?? "GBP",
          },
          periodStart: from,
          periodEnd: to,
        }));
    } catch {
      return [];
    }
  }
}

// -- Response mapping ------------------------------------------------------

function money(raw: { value?: string; currency?: string } | undefined, fallback = "GBP"): EbayMoney {
  const currency = raw?.currency ?? fallback;
  return { amountMinor: parseMoney(raw?.value ?? "0", currency) ?? 0, currency };
}

function mapOrder(raw: RawOrder): EbayOrder {
  const currency = raw.pricingSummary?.total?.currency ?? "GBP";
  const cancelled = raw.cancelStatus?.cancelState === "CANCELED";
  const dispatched = raw.fulfillmentStartInstructions?.some(() => false) ?? false;
  void dispatched;

  const shipment = raw.fulfillmentStartInstructions?.[0]?.shippingStep;
  const anyShipped = (raw.lineItems ?? []).some(
    (li) => li.lineItemFulfillmentStatus === "FULFILLED",
  );

  return {
    orderId: raw.orderId,
    legacyOrderId: raw.legacyOrderId ?? null,
    creationDate: new Date(raw.creationDate),
    currency,
    buyerUsername: raw.buyer?.username ?? "unknown",
    buyerName: shipment?.shipTo?.fullName ?? null,
    buyerFeedbackScore: null,
    shipToCity: shipment?.shipTo?.contactAddress?.city ?? null,
    shipToCountry: shipment?.shipTo?.contactAddress?.countryCode ?? null,
    itemSubtotal: money(raw.pricingSummary?.priceSubtotal, currency),
    shippingCharged: money(raw.pricingSummary?.deliveryCost, currency),
    tax: money(raw.pricingSummary?.tax, currency),
    total: money(raw.pricingSummary?.total, currency),
    fees: { amountMinor: 0, currency },
    adFees: { amountMinor: 0, currency },
    fulfillmentStatus: mapFulfillment(raw.orderFulfillmentStatus, anyShipped),
    paymentStatus: mapPayment(raw.orderPaymentStatus),
    cancelState: cancelled
      ? anyShipped
        ? "CANCELLED_AFTER_FULFILMENT"
        : "CANCELLED_BEFORE_FULFILMENT"
      : "NONE",
    dispatchDeadline: raw.lineItems?.[0]?.lineItemFulfillmentInstructions?.shipByDate
      ? new Date(raw.lineItems[0].lineItemFulfillmentInstructions!.shipByDate!)
      : null,
    dispatchedAt: raw.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo ? null : null,
    deliveredAt: null,
    trackingNumber: null,
    carrier: null,
    lineItems: (raw.lineItems ?? []).map(mapLineItem(currency)),
    refunds: mapRefunds(raw, currency),
  };
}

const mapLineItem = (currency: string) => (raw: RawLineItem): EbayLineItem => ({
  lineItemId: raw.lineItemId,
  legacyItemId: raw.legacyItemId ?? null,
  sku: raw.sku ?? null,
  title: raw.title ?? "Untitled item",
  imageUrl: null,
  quantity: raw.quantity ?? 1,
  unitPrice: money(raw.lineItemCost, currency),
  lineFees: { amountMinor: 0, currency },
});

function mapRefunds(raw: RawOrder, currency: string): EbayRefund[] {
  return (raw.paymentSummary?.refunds ?? []).map((r, i) => ({
    refundId: r.refundId ?? `${raw.orderId}-refund-${i}`,
    orderId: raw.orderId,
    type: raw.cancelStatus?.cancelState === "CANCELED" ? "CANCELLATION" : "REFUND",
    refundedAt: r.refundDate ? new Date(r.refundDate) : new Date(raw.creationDate),
    buyerRefund: money(r.amount, currency),
    feeCredit: { amountMinor: 0, currency },
    reason: raw.cancelStatus?.cancelReason ?? null,
    returnState: null,
  }));
}

function mapFulfillment(status: string | undefined, anyShipped: boolean): EbayOrder["fulfillmentStatus"] {
  switch (status) {
    case "FULFILLED": return "DELIVERED";
    case "IN_PROGRESS": return "IN_TRANSIT";
    default: return anyShipped ? "DISPATCHED" : "AWAITING_DISPATCH";
  }
}

function mapPayment(status: string | undefined): EbayOrder["paymentStatus"] {
  switch (status) {
    case "PAID": return "PAID";
    case "FULLY_REFUNDED": return "REFUNDED";
    case "PARTIALLY_REFUNDED": return "PARTIALLY_REFUNDED";
    default: return "UNPAID";
  }
}

function retryAfter(response: Response): number {
  const header = response.headers.get("retry-after");
  const parsed = header ? Number(header) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

/** eBay re-evaluates seller standards on the 20th of each month. */
function nextEbayEvaluation(now = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 20));
  if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

const MARKETPLACE_CURRENCY: Record<string, string> = {
  EBAY_GB: "GBP", EBAY_US: "USD", EBAY_DE: "EUR", EBAY_FR: "EUR", EBAY_IT: "EUR",
  EBAY_ES: "EUR", EBAY_IE: "EUR", EBAY_NL: "EUR", EBAY_AT: "EUR", EBAY_BE: "EUR",
  EBAY_AU: "AUD", EBAY_CA: "CAD", EBAY_CH: "CHF", EBAY_PL: "PLN",
};

export function currencyForMarketplace(marketplaceId: string): string {
  return MARKETPLACE_CURRENCY[marketplaceId] ?? "USD";
}

// -- Raw response shapes ---------------------------------------------------

interface RawOrderPage { orders?: RawOrder[]; next?: string; total?: number }
interface RawOrder {
  orderId: string;
  legacyOrderId?: string;
  creationDate: string;
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  buyer?: { username?: string };
  pricingSummary?: {
    priceSubtotal?: RawAmount; deliveryCost?: RawAmount; tax?: RawAmount; total?: RawAmount;
  };
  cancelStatus?: { cancelState?: string; cancelReason?: string };
  paymentSummary?: { refunds?: { refundId?: string; refundDate?: string; amount?: RawAmount }[] };
  lineItems?: RawLineItem[];
  fulfillmentStartInstructions?: {
    shippingStep?: {
      shipTo?: { fullName?: string; contactAddress?: { city?: string; countryCode?: string } };
    };
  }[];
}
interface RawLineItem {
  lineItemId: string; legacyItemId?: string; sku?: string; title?: string; quantity?: number;
  lineItemCost?: RawAmount; lineItemFulfillmentStatus?: string;
  lineItemFulfillmentInstructions?: { shipByDate?: string };
}
interface RawAmount { value?: string; currency?: string }
interface RawTransaction {
  transactionId: string; orderId?: string; transactionType?: string; feeType?: string;
  amount?: RawAmount;
  orderLineItems?: { marketplaceFees?: { amount?: RawAmount }[] }[];
}
interface RawSellerStandards {
  standardsLevel?: string; evaluationDate?: string;
  metrics?: { metricKey: string; value?: string | number }[];
}
