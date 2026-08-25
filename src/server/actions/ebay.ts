"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { subDays } from "date-fns";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { enqueueSync } from "@/lib/sync/engine";
import { getEbayClient, isMockAdapter } from "@/lib/ebay";
import { entitlementsFor } from "@/lib/plans";
import { randomToken, sha256 } from "@/lib/crypto";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/**
 * Connecting an eBay account.
 *
 * The OAuth state is a random token; only its hash is stored in a short-lived
 * httpOnly cookie, and the callback rejects anything that does not match. That
 * is what stops a CSRF attacker attaching *their* eBay account to *your*
 * workspace.
 */
export async function startEbayConnectAction(): Promise<ActionResult<{ url: string }>> {
  const auth = await requirePermissionOrThrow("accounts.manage");

  const [accountCount, subscription] = await Promise.all([
    prisma.ebayAccount.count({
      where: { workspaceId: auth.workspace.id, status: { not: "DISCONNECTED" } },
    }),
    prisma.subscription.findUnique({ where: { workspaceId: auth.workspace.id } }),
  ]);

  const entitlements = entitlementsFor({
    plan: subscription?.plan ?? "TRIAL",
    status: subscription?.status ?? "TRIALING",
    trialEndsAt: subscription?.trialEndsAt ?? null,
    accountsUsed: accountCount,
  });

  if (!entitlements.canConnectAnotherAccount) {
    return fail(
      `Your ${entitlements.plan.name} plan covers ${entitlements.accountLimit} eBay ` +
        `account${entitlements.accountLimit === 1 ? "" : "s"}, and ${accountCount} ${accountCount === 1 ? "is" : "are"} ` +
        `connected. Move up a plan to connect another — the accounts you already have keep working either way.`,
    );
  }

  const state = randomToken(24);
  const jar = await cookies();
  jar.set("ebay_oauth_state", sha256(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  jar.set("ebay_oauth_workspace", auth.workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });

  return ok({ url: getEbayClient().buildAuthorizationUrl(state) });
}

export async function syncAccountAction(
  ebayAccountId: string,
  type: "INCREMENTAL" | "FULL" = "INCREMENTAL",
): Promise<ActionResult<{ jobId: string }>> {
  const auth = await requirePermissionOrThrow("accounts.manage");

  const limit = rateLimit(`sync:${auth.workspace.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs);
  if (!limit.ok) {
    return fail(`That is a lot of syncing. Try again in ${limit.retryAfterSeconds} seconds.`);
  }

  const account = await prisma.ebayAccount.findFirst({
    where: { id: ebayAccountId, workspaceId: auth.workspace.id },
    select: { id: true, username: true, status: true },
  });
  if (!account) return fail("That eBay account is not connected to this workspace.");
  if (account.status === "TOKEN_EXPIRED" || account.status === "REVOKED") {
    return fail(`${account.username} needs reconnecting before it can sync again.`);
  }

  const jobId = await enqueueSync(auth.workspace.id, account.id, type);

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "ebay.sync_requested",
    entityType: "ebayAccount",
    entityId: account.id,
    summary: `Sync requested for ${account.username}.`,
  });

  revalidatePath("/ebay-accounts");
  return ok({ jobId });
}

export async function syncAllAccountsAction(): Promise<ActionResult<{ queued: number }>> {
  const auth = await requirePermissionOrThrow("accounts.manage");

  const limit = rateLimit(`sync:${auth.workspace.id}`, LIMITS.sync.limit, LIMITS.sync.windowMs);
  if (!limit.ok) {
    return fail(`That is a lot of syncing. Try again in ${limit.retryAfterSeconds} seconds.`);
  }

  const accounts = await prisma.ebayAccount.findMany({
    where: { workspaceId: auth.workspace.id, status: "CONNECTED" },
    select: { id: true },
  });

  for (const account of accounts) {
    await enqueueSync(auth.workspace.id, account.id, "INCREMENTAL");
  }

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "ebay.sync_requested",
    summary: `Sync requested for all ${accounts.length} connected accounts.`,
  });

  revalidatePath("/ebay-accounts");
  return ok({ queued: accounts.length });
}

/** Import older history than the default window. */
export async function importHistoryAction(
  ebayAccountId: string,
  days: number,
): Promise<ActionResult<{ jobId: string }>> {
  const auth = await requirePermissionOrThrow("accounts.manage");

  if (![90, 180, 365, 730].includes(days)) return fail("Pick one of the offered ranges.");

  const account = await prisma.ebayAccount.findFirst({
    where: { id: ebayAccountId, workspaceId: auth.workspace.id },
    select: { id: true, username: true },
  });
  if (!account) return fail("That eBay account is not connected to this workspace.");

  const from = subDays(new Date(), days);
  const jobId = await enqueueSync(auth.workspace.id, account.id, "HISTORY", { from });

  await prisma.ebayAccount.update({
    where: { id: account.id },
    data: { historyFrom: from },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "ebay.history_import",
    entityType: "ebayAccount",
    entityId: account.id,
    summary: `History import queued for ${account.username}, back ${days} days.`,
  });

  revalidatePath("/ebay-accounts");
  return ok({ jobId });
}

/**
 * Disconnect. Orders, costs and refund answers are kept — they are the user's
 * work, not eBay's — and only the credentials are destroyed.
 */
export async function disconnectAccountAction(ebayAccountId: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("accounts.manage");

  const account = await prisma.ebayAccount.findFirst({
    where: { id: ebayAccountId, workspaceId: auth.workspace.id },
    select: { id: true, username: true, _count: { select: { orders: true } } },
  });
  if (!account) return fail("That eBay account is not connected to this workspace.");

  await prisma.$transaction([
    prisma.oAuthCredential.deleteMany({ where: { ebayAccountId: account.id } }),
    prisma.syncJob.deleteMany({ where: { ebayAccountId: account.id, status: { in: ["QUEUED", "RUNNING"] } } }),
    prisma.ebayAccount.update({
      where: { id: account.id },
      data: { status: "DISCONNECTED", statusDetail: "Disconnected by a member of your team." },
    }),
  ]);

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "ebay.disconnect",
    entityType: "ebayAccount",
    entityId: account.id,
    summary: `${account.username} disconnected. ${account._count.orders} orders kept.`,
  });

  revalidatePath("/ebay-accounts");
  revalidatePath("/", "layout");
  return ok();
}

export async function isUsingMockAdapterAction(): Promise<boolean> {
  return isMockAdapter();
}
