import { LiveEbayClient } from "./live-client";
import { MockEbayClient } from "./mock-client";
import type { EbayClient } from "./types";

export * from "./types";
export { currencyForMarketplace } from "./live-client";
export { MOCK_ACCOUNTS } from "./mock-client";

/**
 * Chooses the adapter from the environment.
 *
 * EBAY_ADAPTER=live requires a full keyset — the app refuses to start the live
 * path with blank credentials rather than failing later with a confusing 401.
 */
let cached: EbayClient | null = null;

export function getEbayClient(): EbayClient {
  if (cached) return cached;

  const adapter = (process.env.EBAY_ADAPTER ?? "mock").toLowerCase();

  if (adapter === "live") {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const redirectUri = process.env.EBAY_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "EBAY_ADAPTER=live needs EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_REDIRECT_URI. " +
          "Set them in .env, or use EBAY_ADAPTER=mock for local development.",
      );
    }

    cached = new LiveEbayClient({
      clientId,
      clientSecret,
      redirectUri,
      environment: process.env.EBAY_ENV === "production" ? "production" : "sandbox",
    });
  } else {
    cached = new MockEbayClient();
  }

  return cached;
}

export function isMockAdapter(): boolean {
  return (process.env.EBAY_ADAPTER ?? "mock").toLowerCase() !== "live";
}

/** Reset between tests. */
export function __resetEbayClient(): void {
  cached = null;
}
