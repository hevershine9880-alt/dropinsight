/**
 * In-process sliding-window rate limiter.
 *
 * Enough for a single Node instance, which is what the app runs as today. On a
 * multi-instance deployment this is the one module to swap for Redis — the
 * interface is deliberately narrow so nothing else changes.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

/** Drop buckets nobody has touched, so the map cannot grow without bound. */
export function pruneRateLimits(olderThanMs = 60 * 60 * 1000): void {
  const cutoff = Date.now() - olderThanMs;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] < cutoff) {
      buckets.delete(key);
    }
  }
}

export const LIMITS = {
  /**
   * Sign-in is limited on two axes, because they defend against different
   * things and one alone gets it wrong:
   *
   *  - per account: stops somebody grinding passwords against one email
   *  - per IP: stops somebody spraying one password across many emails
   *
   * Limiting by IP alone would lock out a whole office behind one NAT the
   * moment a few colleagues mistype their passwords, which is why the per-IP
   * allowance is much larger than the per-account one.
   */
  signInPerAccount: { limit: 8, windowMs: 10 * 60 * 1000 },
  signInPerIp: { limit: 60, windowMs: 10 * 60 * 1000 },
  signUp: { limit: 5, windowMs: 60 * 60 * 1000 },
  passwordReset: { limit: 5, windowMs: 60 * 60 * 1000 },
  sync: { limit: 12, windowMs: 60 * 1000 },
  export: { limit: 30, windowMs: 60 * 1000 },
} as const;
