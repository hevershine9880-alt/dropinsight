import { subDays, addDays, addHours, startOfDay } from "date-fns";
import { CATALOG, BUYER_HANDLES, REFUND_REASONS, SUPPLIERS, type CatalogItem } from "./catalog";
import {
  type EbayAccountHealth, type EbayClient, type EbayIdentity, type EbayOrder,
  type EbayRefund, type EbayStoreFee, type EbayTokenSet, type FetchOrdersParams,
  type OrderPage,
} from "./types";

/**
 * Development adapter.
 *
 * This is NOT sample JSON pasted into the app. It generates a full eBay account
 * on demand — orders, line items, fees, refunds, cancellations, dispatch
 * timings and seller standards — and hands it to exactly the same sync engine
 * the live client feeds. Every screen, filter, export and calculation therefore
 * runs against real application code.
 *
 * It is deterministic: the same account id always produces the same account, so
 * a bug found on Tuesday is still there on Wednesday.
 *
 * Data produced here is always flagged `isMock` on the eBay account, is badged
 * in the UI, and is refused outright when EBAY_ADAPTER=live.
 */

const FEE_RATE = 0.129;      // eBay UK final value fee, typical category
const FIXED_FEE_MINOR = 30;  // per-order fixed charge
const AD_RATE_SHARE = 0.35;  // share of orders carrying Promoted Listings spend

/** Deterministic PRNG — mulberry32. Same seed, same account, every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickWeighted(random: () => number, items: CatalogItem[]): CatalogItem {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export interface MockAccountProfile {
  ebayUserId: string;
  username: string;
  marketplaceId: string;
  currency: string;
  /** Orders per day this store averages. */
  ordersPerDay: number;
  /** How far back the account's history goes. */
  historyDays: number;
}

export const MOCK_ACCOUNTS: MockAccountProfile[] = [
  { ebayUserId: "mock-user-001", username: "click_fifty3", marketplaceId: "EBAY_GB", currency: "GBP", ordersPerDay: 9, historyDays: 180 },
  { ebayUserId: "mock-user-002", username: "evershine_products", marketplaceId: "EBAY_GB", currency: "GBP", ordersPerDay: 6, historyDays: 150 },
  { ebayUserId: "mock-user-003", username: "khambalia_goods", marketplaceId: "EBAY_GB", currency: "GBP", ordersPerDay: 4, historyDays: 120 },
];

export class MockEbayClient implements EbayClient {
  readonly kind = "mock" as const;

  buildAuthorizationUrl(state: string): string {
    // Points at our own consent screen, which mirrors the real eBay round trip:
    // the user picks a store, is redirected back with a code, and the callback
    // exchanges it exactly as it would with eBay.
    //
    // Relative on purpose: the live client must return an absolute URL because
    // eBay redirects the browser, but the mock stays inside the app, so a
    // relative path keeps it working on whatever port the dev server got.
    return `/connect/mock-consent?state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForTokens(code: string): Promise<EbayTokenSet> {
    const profile = MOCK_ACCOUNTS.find((a) => a.ebayUserId === code) ?? MOCK_ACCOUNTS[0];
    const now = Date.now();
    return {
      accessToken: `mock-access.${profile.ebayUserId}`,
      refreshToken: `mock-refresh.${profile.ebayUserId}`,
      accessTokenExpiresAt: new Date(now + 2 * 60 * 60 * 1000),
      refreshTokenExpiresAt: new Date(now + 547 * 24 * 60 * 60 * 1000),
      scopes: ["mock"],
    };
  }

  async refreshTokens(refreshToken: string): Promise<EbayTokenSet> {
    const id = refreshToken.split(".")[1] ?? MOCK_ACCOUNTS[0].ebayUserId;
    return this.exchangeCodeForTokens(id);
  }

  async getIdentity(accessToken: string): Promise<EbayIdentity> {
    const profile = this.profileFor(accessToken);
    return {
      ebayUserId: profile.ebayUserId,
      username: profile.username,
      marketplaceId: profile.marketplaceId,
      currency: profile.currency,
    };
  }

  private profileFor(accessToken: string): MockAccountProfile {
    const id = accessToken.split(".")[1];
    return MOCK_ACCOUNTS.find((a) => a.ebayUserId === id) ?? MOCK_ACCOUNTS[0];
  }

  async fetchOrders(accessToken: string, params: FetchOrdersParams): Promise<OrderPage> {
    const profile = this.profileFor(accessToken);
    const all = this.generateOrders(profile);

    const filtered = all.filter((order) => {
      if (params.modifiedSince && order.creationDate < params.modifiedSince) return false;
      if (params.createdFrom && order.creationDate < params.createdFrom) return false;
      if (params.createdTo && order.creationDate > params.createdTo) return false;
      return true;
    });

    const limit = Math.min(params.limit ?? 50, 200);
    const offset = Number(params.cursor ?? 0);
    const page = filtered.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return {
      orders: page,
      nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
      total: filtered.length,
    };
  }

  /**
   * The whole account, generated once per call from a fixed seed.
   *
   * Everything downstream — fees, refunds, cancellations, dispatch state — is
   * derived from the same random stream, so the books balance: fees really are
   * 12.9% of the sale, a refunded order really does have a refund row, and a
   * cancelled-before-dispatch order really does have no tracking.
   */
  private generateOrders(profile: MockAccountProfile): EbayOrder[] {
    const random = rng(hashSeed(profile.ebayUserId));
    const orders: EbayOrder[] = [];
    const today = startOfDay(new Date());
    let sequence = 0;

    for (let dayOffset = profile.historyDays; dayOffset >= 0; dayOffset--) {
      const day = subDays(today, dayOffset);

      // Weekends run lighter, and volume drifts upward over the account's life.
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      const growth = 0.72 + 0.55 * (1 - dayOffset / profile.historyDays);
      const target = profile.ordersPerDay * growth * (weekend ? 0.68 : 1);
      const count = Math.max(0, Math.round(target + (random() - 0.5) * target * 0.7));

      for (let i = 0; i < count; i++) {
        sequence += 1;
        orders.push(this.generateOrder(profile, random, day, sequence, dayOffset));
      }
    }

    return orders.sort((a, b) => +b.creationDate - +a.creationDate);
  }

  private generateOrder(
    profile: MockAccountProfile,
    random: () => number,
    day: Date,
    sequence: number,
    dayOffset: number,
  ): EbayOrder {
    const currency = profile.currency;
    const placedAt = addHours(day, 7 + Math.floor(random() * 15));

    // Most orders are a single unit; the occasional multi-buy keeps quantity
    // handling honest in every calculation downstream.
    const lineCount = random() < 0.12 ? 2 : 1;
    const lineItems = [];
    let itemSubtotal = 0;

    for (let i = 0; i < lineCount; i++) {
      const product = pickWeighted(random, CATALOG);
      const quantity = random() < 0.14 ? 2 + Math.floor(random() * 2) : 1;
      const lineTotal = product.salePriceMinor * quantity;
      itemSubtotal += lineTotal;
      lineItems.push({
        lineItemId: `${sequence}-${i}`,
        legacyItemId: `2${String(hashSeed(product.sku)).slice(0, 11)}`,
        sku: product.sku,
        title: product.title,
        imageUrl: null,
        quantity,
        unitPrice: { amountMinor: product.salePriceMinor, currency },
        lineFees: { amountMinor: 0, currency },
      });
    }

    // Roughly a third of orders charge postage; the rest are free-postage listings.
    const shippingCharged = random() < 0.33 ? 199 + Math.floor(random() * 200) : 0;
    const revenue = itemSubtotal + shippingCharged;
    const tax = Math.round(revenue * 0.0);
    const fees = Math.round(revenue * FEE_RATE) + FIXED_FEE_MINOR;
    const adFees = random() < AD_RATE_SHARE ? Math.round(itemSubtotal * (0.02 + random() * 0.05)) : 0;

    const orderId = `${String(10 + (sequence % 20)).padStart(2, "0")}-${15000 + (sequence % 900)}-${String(10000 + Math.floor(random() * 89999))}`;
    const buyer = BUYER_HANDLES[Math.floor(random() * BUYER_HANDLES.length)];

    // --- lifecycle -------------------------------------------------------
    // How far an order has progressed depends only on its age, so "awaiting
    // dispatch" is never an order from four months ago.
    const dispatchDeadline = addDays(placedAt, 2);
    const cancelRoll = random();
    const isCancelled = cancelRoll < 0.035;
    const cancelledBeforeDispatch = isCancelled && dayOffset < 3;

    let fulfillmentStatus: EbayOrder["fulfillmentStatus"] = "AWAITING_DISPATCH";
    let dispatchedAt: Date | null = null;
    let deliveredAt: Date | null = null;
    let trackingNumber: string | null = null;

    if (!cancelledBeforeDispatch) {
      if (dayOffset >= 1) {
        // 96% dispatch within the deadline — a healthy Top Rated store.
        const lateBy = random() < 0.04 ? 1 + Math.floor(random() * 2) : 0;
        dispatchedAt = addHours(placedAt, 10 + Math.floor(random() * 26) + lateBy * 24);
        fulfillmentStatus = "DISPATCHED";
        trackingNumber = random() < 0.97 ? `RM${String(100000000 + Math.floor(random() * 899999999))}GB` : null;
      }
      if (dayOffset >= 3) fulfillmentStatus = "IN_TRANSIT";
      if (dayOffset >= 6 && random() < 0.94) {
        fulfillmentStatus = "DELIVERED";
        deliveredAt = addDays(dispatchedAt ?? placedAt, 2 + Math.floor(random() * 4));
      }
    }

    // --- refunds ---------------------------------------------------------
    const refunds: EbayRefund[] = [];
    let paymentStatus: EbayOrder["paymentStatus"] = "PAID";

    const worstRefundRate = Math.max(
      ...lineItems.map((li) => CATALOG.find((c) => c.sku === li.sku)?.refundRate ?? 0.05),
    );

    if (isCancelled) {
      refunds.push({
        refundId: `${orderId}-cxl`,
        orderId,
        type: "CANCELLATION",
        refundedAt: addHours(placedAt, 4 + Math.floor(random() * 30)),
        buyerRefund: { amountMinor: revenue, currency },
        feeCredit: { amountMinor: fees, currency },
        reason: random() < 0.6 ? "Buyer asked to cancel" : "Out of stock",
        returnState: null,
      });
      paymentStatus = "REFUNDED";
    } else if (deliveredAt && random() < worstRefundRate) {
      const partial = random() < 0.22;
      const amount = partial ? Math.round(revenue * (0.3 + random() * 0.4)) : revenue;
      const isReturn = random() < 0.45;
      refunds.push({
        refundId: `${orderId}-rfd`,
        orderId,
        type: isReturn ? "RETURN" : "REFUND",
        refundedAt: addDays(deliveredAt, 1 + Math.floor(random() * 12)),
        buyerRefund: { amountMinor: amount, currency },
        // eBay credits back its variable fee on a refund, never the fixed part.
        feeCredit: { amountMinor: Math.round((amount / revenue) * (fees - FIXED_FEE_MINOR)), currency },
        reason: REFUND_REASONS[Math.floor(random() * REFUND_REASONS.length)],
        returnState: isReturn ? (random() < 0.7 ? "CLOSED" : "RETURN_REQUESTED") : null,
      });
      paymentStatus = partial ? "PARTIALLY_REFUNDED" : "REFUNDED";
    }

    return {
      orderId,
      legacyOrderId: `${1500 + sequence}-${10000 + sequence}`,
      creationDate: placedAt,
      currency,
      buyerUsername: buyer,
      buyerName: null,
      buyerFeedbackScore: 80 + Math.floor(random() * 20),
      shipToCity: null,
      shipToCountry: profile.marketplaceId === "EBAY_GB" ? "GB" : "US",
      itemSubtotal: { amountMinor: itemSubtotal, currency },
      shippingCharged: { amountMinor: shippingCharged, currency },
      tax: { amountMinor: tax, currency },
      total: { amountMinor: revenue + tax, currency },
      fees: { amountMinor: fees, currency },
      adFees: { amountMinor: adFees, currency },
      fulfillmentStatus,
      paymentStatus,
      cancelState: cancelledBeforeDispatch
        ? "CANCELLED_BEFORE_FULFILMENT"
        : isCancelled
          ? "CANCELLED_AFTER_FULFILMENT"
          : "NONE",
      dispatchDeadline,
      dispatchedAt,
      deliveredAt,
      trackingNumber,
      carrier: trackingNumber ? "Royal Mail" : null,
      lineItems,
      refunds,
    };
  }

  async fetchAccountHealth(accessToken: string): Promise<EbayAccountHealth> {
    const profile = this.profileFor(accessToken);
    const random = rng(hashSeed(`${profile.ebayUserId}-health`));
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 20));
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);

    return {
      sellerLevel: random() < 0.75 ? "TOP_RATED" : "ABOVE_STANDARD",
      lateDispatchRate: Number((random() * 0.02).toFixed(4)),
      transactionDefectRate: Number((random() * 0.004).toFixed(4)),
      casesClosedWithoutSellerResolutionRate: 0,
      evaluatedAt: subDays(now, 3),
      nextEvaluationAt: next,
    };
  }

  async fetchStoreFees(accessToken: string, from: Date, to: Date): Promise<EbayStoreFee[]> {
    const profile = this.profileFor(accessToken);
    const random = rng(hashSeed(`${profile.ebayUserId}-fees-${from.getUTCFullYear()}-${from.getUTCMonth()}`));
    return [
      {
        externalRef: `mock-storefee-${profile.ebayUserId}-${from.toISOString().slice(0, 7)}`,
        description: "eBay shop subscription",
        amount: { amountMinor: 2400 + Math.floor(random() * 7000), currency: profile.currency },
        periodStart: from,
        periodEnd: to,
      },
    ];
  }
}

export { SUPPLIERS };
