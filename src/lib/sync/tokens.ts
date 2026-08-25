import { prisma } from "@/lib/db/client";
import { encrypt, decrypt } from "@/lib/crypto";
import { getEbayClient, EbayAuthError, type EbayTokenSet } from "@/lib/ebay";

/**
 * Access tokens live about two hours; refresh tokens about 18 months. Every
 * call goes through here so a token is refreshed once, centrally, rather than
 * by whichever caller happened to notice it had expired.
 */

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export async function storeTokens(ebayAccountId: string, tokens: EbayTokenSet): Promise<void> {
  const data = {
    accessTokenEncrypted: encrypt(tokens.accessToken),
    refreshTokenEncrypted: encrypt(tokens.refreshToken),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    scopes: tokens.scopes.join(" "),
  };
  await prisma.oAuthCredential.upsert({
    where: { ebayAccountId },
    create: { ebayAccountId, ...data },
    update: data,
  });
}

/**
 * A usable access token for the account, refreshing first if needed.
 * Throws EbayAuthError when only the user can fix the situation; the caller
 * marks the account and raises a notification rather than retrying forever.
 */
export async function getAccessToken(ebayAccountId: string): Promise<string> {
  const credential = await prisma.oAuthCredential.findUnique({ where: { ebayAccountId } });
  if (!credential) {
    throw new EbayAuthError("This eBay account has no stored credentials. Reconnect it.");
  }

  const now = Date.now();

  if (credential.refreshTokenExpiresAt.getTime() < now) {
    await markAccountNeedsReconnect(ebayAccountId, "The eBay authorisation expired.");
    throw new EbayAuthError("The eBay authorisation expired. Reconnect the account.");
  }

  if (credential.accessTokenExpiresAt.getTime() - now > REFRESH_MARGIN_MS) {
    return decrypt(credential.accessTokenEncrypted);
  }

  const client = getEbayClient();
  try {
    const refreshed = await client.refreshTokens(decrypt(credential.refreshTokenEncrypted));
    await storeTokens(ebayAccountId, refreshed);
    await prisma.ebayAccount.update({
      where: { id: ebayAccountId },
      data: { status: "CONNECTED", statusDetail: null },
    });
    return refreshed.accessToken;
  } catch (error) {
    if (error instanceof EbayAuthError) {
      await markAccountNeedsReconnect(ebayAccountId, error.message);
    }
    throw error;
  }
}

export async function markAccountNeedsReconnect(ebayAccountId: string, detail: string): Promise<void> {
  const account = await prisma.ebayAccount.update({
    where: { id: ebayAccountId },
    data: { status: "TOKEN_EXPIRED", statusDetail: detail },
  });

  await prisma.notification.upsert({
    where: {
      workspaceId_dedupeKey: {
        workspaceId: account.workspaceId,
        dedupeKey: `ebay-reconnect-${ebayAccountId}`,
      },
    },
    create: {
      workspaceId: account.workspaceId,
      type: "EBAY_RECONNECT_REQUIRED",
      severity: "CRITICAL",
      title: `${account.username} needs reconnecting`,
      body: `${detail} Your existing orders and costs are safe — new orders will not arrive until you reconnect.`,
      entityType: "ebayAccount",
      entityId: ebayAccountId,
      actionLabel: "Reconnect",
      actionHref: "/settings/connections",
      dedupeKey: `ebay-reconnect-${ebayAccountId}`,
    },
    update: { readAt: null, body: detail },
  });
}
