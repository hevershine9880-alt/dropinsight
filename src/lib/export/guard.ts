import { getAuth, type AuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

/** Shared preamble for every export route: permission, then rate limit. */
export async function guardExport(): Promise<
  { ok: true; auth: AuthContext } | { ok: false; response: Response }
> {
  const auth = await getAuth();
  if (!auth || !can(auth.workspace.role, "reports.download")) {
    return { ok: false, response: new Response("Your role cannot download reports.", { status: 403 }) };
  }

  const limit = rateLimit(`export:${auth.user.id}`, LIMITS.export.limit, LIMITS.export.windowMs);
  if (!limit.ok) {
    return {
      ok: false,
      response: new Response(`Too many exports. Try again in ${limit.retryAfterSeconds} seconds.`, {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }),
    };
  }

  return { ok: true, auth };
}
