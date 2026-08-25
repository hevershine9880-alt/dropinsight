import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, pruneRateLimits, LIMITS } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => pruneRateLimits(0));

  it("allows up to the limit, then refuses", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit("k", 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key separately", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000);
    expect(rateLimit("a", 5, 60_000).ok).toBe(false);
    expect(rateLimit("b", 5, 60_000).ok).toBe(true);
  });

  it("reports how many attempts remain", () => {
    expect(rateLimit("c", 3, 60_000).remaining).toBe(2);
    expect(rateLimit("c", 3, 60_000).remaining).toBe(1);
    expect(rateLimit("c", 3, 60_000).remaining).toBe(0);
  });
});

describe("sign-in limits", () => {
  it("allows a shared office far more attempts than any one account", () => {
    // An IP-only limit would lock out everyone behind one NAT as soon as a few
    // colleagues mistyped. The per-IP allowance must be the looser of the two.
    expect(LIMITS.signInPerIp.limit).toBeGreaterThan(LIMITS.signInPerAccount.limit * 5);
  });

  it("keeps the per-account limit tight enough to stop password grinding", () => {
    expect(LIMITS.signInPerAccount.limit).toBeLessThanOrEqual(10);
  });
});
