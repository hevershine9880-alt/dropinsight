import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { subDays } from "date-fns";
import { prisma } from "@/lib/db/client";
import { getAuth } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getEbayClient, isMockAdapter, EbayAuthError } from "@/lib/ebay";
import { storeTokens } from "@/lib/sync/tokens";
import { enqueueSync } from "@/lib/sync/engine";
import { recordAudit } from "@/lib/audit";
import { sha256, safeEqual } from "@/lib/crypto";
import { entitlementsFor } from "@/lib/plans";

/**
 * The OAuth callback.
 *
 * Order of checks matters: session, then permission, then CSRF state, then the
 * plan limit — each before anything is written. A failure redirects back with a
 * readable reason rather than showing a stack trace.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/ebay-accounts?connect_error=${encodeURIComponent(reason)}`, url.origin));

  const auth = await getAuth();
  if (!auth) return NextResponse.redirect(new URL("/sign-in", url.origin));
  if (!can(auth.workspace.role, "accounts.manage")) {
    return fail("Your role cannot connect eBay accounts.");
  }

  // eBay reports a user declining consent here rather than by an error status.
  const declined = url.searchParams.get("error");
  if (declined) {
    return fail(
      declined === "access_denied"
        ? "You declined the eBay authorisation, so nothing was connected."
        : `eBay returned an error: ${declined}`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("eBay did not send back an authorisation code. Try again.");

  const jar = await cookies();
  const expectedState = jar.get("ebay_oauth_state")?.value;
  const expectedWorkspace = jar.get("ebay_oauth_workspace")?.value;

  if (!expectedState || !safeEqual(expectedState, sha256(state))) {
    return fail("That connection link has expired or was not started here. Start again from this page.");
  }
  if (expectedWorkspace && expectedWorkspace !== auth.workspace.id) {
    return fail("That connection was started for a different workspace.");
  }

  jar.delete("ebay_oauth_state");
  jar.delete("ebay_oauth_workspace");

  const [accountCount, subscription] = await Promise.all([
    prisma.ebayAccount.count({ where: { workspaceId: auth.workspace.id, status: { not: "DISCONNECTED" } } }),
    prisma.subscription.findUnique({ where: { workspaceId: auth.workspace.id } }),
  ]);
  const entitlements = entitlementsFor({
    plan: subscription?.plan ?? "TRIAL",
    status: subscription?.status ?? "TRIALING",
    trialEndsAt: subscription?.trialEndsAt ?? null,
    accountsUsed: accountCount,
  });

  const client = getEbayClient();

  try {
    const tokens = await client.exchangeCodeForTokens(code);
    const identity = await client.getIdentity(tokens.accessToken);

    const existing = await prisma.ebayAccount.findUnique({
      where: {
        workspaceId_ebayUserId: { workspaceId: auth.workspace.id, ebayUserId: identity.ebayUserId },
      },
      select: { id: true, status: true },
    });

    // Reconnecting an account you already have never counts against the limit.
    if (!existing && !entitlements.canConnectAnotherAccount) {
      return fail(
        `Your ${entitlements.plan.name} plan covers ${entitlements.accountLimit} eBay account${entitlements.accountLimit === 1 ? "" : "s"}. Upgrade to connect another.`,
      );
    }

    const account = await prisma.ebayAccount.upsert({
      where: {
        workspaceId_ebayUserId: { workspaceId: auth.workspace.id, ebayUserId: identity.ebayUserId },
      },
      create: {
        workspaceId: auth.workspace.id,
        ebayUserId: identity.ebayUserId,
        username: identity.username,
        marketplaceId: identity.marketplaceId,
        currency: identity.currency,
        status: "CONNECTED",
        isMock: isMockAdapter(),
        historyFrom: subDays(new Date(), 90),
      },
      update: {
        username: identity.username,
        marketplaceId: identity.marketplaceId,
        currency: identity.currency,
        status: "CONNECTED",
        statusDetail: null,
      },
    });

    await storeTokens(account.id, tokens);

    // The first connection sets the workspace's reporting currency from the
    // marketplace, exactly as the reference product does. (R2.4)
    if (accountCount === 0) {
      await prisma.workspace.update({
        where: { id: auth.workspace.id },
        data: { currency: identity.currency },
      });
    }

    // Clear any "needs reconnecting" alert now that it is resolved.
    await prisma.notification.deleteMany({
      where: { workspaceId: auth.workspace.id, dedupeKey: { in: [`ebay-reconnect-${account.id}`, `sync-failed-${account.id}`] } },
    });

    await enqueueSync(auth.workspace.id, account.id, "FULL", { from: subDays(new Date(), 90) });

    await recordAudit({
      workspaceId: auth.workspace.id,
      actorUserId: auth.user.id,
      action: "ebay.connect",
      entityType: "ebayAccount",
      entityId: account.id,
      summary: `${identity.username} connected (${identity.marketplaceId}).`,
    });

    const destination =
      auth.workspace.onboardingStep === "DONE"
        ? `/ebay-accounts?connected=${encodeURIComponent(identity.username)}`
        : `/onboarding?step=importing&account=${account.id}`;

    return NextResponse.redirect(new URL(destination, url.origin));
  } catch (error) {
    console.error("[ebay] connect failed", error);
    if (error instanceof EbayAuthError) {
      return fail("eBay rejected the authorisation. Try connecting again.");
    }
    return fail("We couldn't finish connecting that account. Nothing was changed — try again.");
  }
}
