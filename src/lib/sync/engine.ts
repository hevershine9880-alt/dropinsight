import { prisma } from "@/lib/db/client";
import { getEbayClient, EbayAuthError, EbayRateLimitError, EbayError, type EbayOrder } from "@/lib/ebay";
import { getAccessToken, markAccountNeedsReconnect } from "./tokens";
import { subDays, startOfMonth, endOfMonth } from "date-fns";

/**
 * The sync engine.
 *
 * Rules it exists to enforce:
 *  - **Idempotent.** Orders key on (ebayAccountId, ebayOrderId) and refunds on
 *    (orderId, ebayRefundId). Running the same window twice changes nothing.
 *  - **Non-destructive.** A sync updates eBay's own fields and never touches a
 *    buying price, a supplier answer or a note. The user's work is theirs.
 *  - **Resumable.** Progress is written page by page with a cursor, so a job
 *    killed halfway does not start over.
 *  - **Honest about failure.** A job that imported 300 of 900 orders finishes
 *    PARTIAL with the reason attached, not SUCCESS and not silence.
 */

const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 60;
const MAX_ATTEMPTS = 4;

export interface SyncOutcome {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  ordersImported: number;
  ordersUpdated: number;
  refundsImported: number;
  message: string;
}

export async function enqueueSync(
  workspaceId: string,
  ebayAccountId: string,
  type: "FULL" | "INCREMENTAL" | "HISTORY",
  window?: { from?: Date; to?: Date },
): Promise<string> {
  // One queued job per account per type is enough; a user hammering "Sync now"
  // should not build a backlog.
  const existing = await prisma.syncJob.findFirst({
    where: { ebayAccountId, type, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (existing) return existing.id;

  const job = await prisma.syncJob.create({
    data: {
      workspaceId,
      ebayAccountId,
      type,
      status: "QUEUED",
      windowFrom: window?.from,
      windowTo: window?.to,
    },
  });
  return job.id;
}

/** Claim and run the next queued job. Returns null when the queue is empty. */
export async function runNextJob(): Promise<{ jobId: string; outcome: SyncOutcome } | null> {
  const job = await prisma.syncJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { queuedAt: "asc" },
  });
  if (!job) return null;

  // Optimistic claim: only one worker can move a job out of QUEUED.
  const claimed = await prisma.syncJob.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;

  const outcome = await executeJob(job.id);
  return { jobId: job.id, outcome };
}

export async function executeJob(jobId: string): Promise<SyncOutcome> {
  const job = await prisma.syncJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { ebayAccount: true },
  });

  const log = (level: string, message: string, detail?: string) =>
    prisma.syncLog.create({ data: { syncJobId: jobId, level, message, detail } }).catch(() => {});

  let imported = 0;
  let updated = 0;
  let refundsImported = 0;

  try {
    const accessToken = await getAccessToken(job.ebayAccountId);
    const client = getEbayClient();

    await log("INFO", `Started ${job.type.toLowerCase()} sync for ${job.ebayAccount.username}`);

    const params = buildFetchParams(job);
    let cursor: string | null = job.cursor ?? null;
    let pages = 0;
    let reachedEnd = false;

    while (pages < MAX_PAGES_PER_RUN) {
      const page = await client.fetchOrders(accessToken, { ...params, cursor, limit: PAGE_SIZE });

      for (const order of page.orders) {
        const result = await upsertOrder(job.workspaceId, job.ebayAccountId, order);
        if (result.created) imported += 1;
        else updated += 1;
        refundsImported += result.refundsWritten;
      }

      pages += 1;
      cursor = page.nextCursor;

      // Persist progress after every page so a crash resumes rather than restarts.
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { cursor, ordersImported: imported, ordersUpdated: updated, refundsImported },
      });

      if (!cursor) {
        reachedEnd = true;
        break;
      }
    }

    await refreshAccountHealth(job.ebayAccountId, accessToken);
    if (job.type !== "INCREMENTAL") {
      await importStoreFees(job.workspaceId, job.ebayAccountId, accessToken);
    }

    if (!reachedEnd) {
      // More pages remain. Queue the continuation rather than blocking the
      // worker on one enormous account.
      await prisma.syncJob.create({
        data: {
          workspaceId: job.workspaceId,
          ebayAccountId: job.ebayAccountId,
          type: job.type,
          status: "QUEUED",
          cursor,
          windowFrom: job.windowFrom,
          windowTo: job.windowTo,
        },
      });
      await log("INFO", `Paused after ${pages} pages; continuation queued`);
    }

    await prisma.$transaction([
      prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          ordersImported: imported,
          ordersUpdated: updated,
          refundsImported,
          error: null,
        },
      }),
      prisma.ebayAccount.update({
        where: { id: job.ebayAccountId },
        data: { lastSyncAt: new Date(), status: "CONNECTED", statusDetail: null },
      }),
    ]);

    const message = `Imported ${imported} new orders, updated ${updated}.`;
    await log("INFO", message);
    return { status: "SUCCESS", ordersImported: imported, ordersUpdated: updated, refundsImported, message };
  } catch (error) {
    return handleFailure(jobId, job, error, { imported, updated, refundsImported });
  }
}

function buildFetchParams(job: { type: string; windowFrom: Date | null; windowTo: Date | null; ebayAccount: { lastSyncAt: Date | null } }) {
  if (job.type === "INCREMENTAL") {
    // Overlap by an hour: eBay's lastmodified index is eventually consistent,
    // and re-reading an order is free because the upsert is idempotent.
    const since = job.ebayAccount.lastSyncAt
      ? new Date(job.ebayAccount.lastSyncAt.getTime() - 60 * 60 * 1000)
      : subDays(new Date(), 30);
    return { modifiedSince: since };
  }
  return {
    createdFrom: job.windowFrom ?? subDays(new Date(), 90),
    createdTo: job.windowTo ?? undefined,
  };
}

async function handleFailure(
  jobId: string,
  job: { workspaceId: string; ebayAccountId: string; attempts: number; ebayAccount: { username: string } },
  error: unknown,
  counts: { imported: number; updated: number; refundsImported: number },
): Promise<SyncOutcome> {
  const message = error instanceof Error ? error.message : "Unknown error";
  const partial = counts.imported + counts.updated > 0;
  const retryable = error instanceof EbayError ? error.retryable : true;
  const canRetry = retryable && job.attempts < MAX_ATTEMPTS;

  await prisma.syncLog.create({
    data: {
      syncJobId: jobId,
      level: "ERROR",
      message: partial ? "Sync stopped partway" : "Sync failed",
      detail: message,
    },
  }).catch(() => {});

  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: partial ? "PARTIAL" : "FAILED",
      finishedAt: new Date(),
      error: message,
      ordersImported: counts.imported,
      ordersUpdated: counts.updated,
      refundsImported: counts.refundsImported,
    },
  });

  if (error instanceof EbayAuthError) {
    await markAccountNeedsReconnect(job.ebayAccountId, message);
  } else if (canRetry) {
    // Exponential backoff, respecting eBay's own Retry-After when it gives one.
    const delaySeconds =
      error instanceof EbayRateLimitError ? error.retryAfterSeconds : 2 ** job.attempts * 30;
    await prisma.syncJob.create({
      data: {
        workspaceId: job.workspaceId,
        ebayAccountId: job.ebayAccountId,
        type: "INCREMENTAL",
        status: "QUEUED",
        attempts: job.attempts,
        queuedAt: new Date(Date.now() + delaySeconds * 1000),
      },
    });
  } else {
    await notifySyncFailure(job.workspaceId, job.ebayAccountId, job.ebayAccount.username, message);
  }

  return {
    status: partial ? "PARTIAL" : "FAILED",
    ordersImported: counts.imported,
    ordersUpdated: counts.updated,
    refundsImported: counts.refundsImported,
    message,
  };
}

async function notifySyncFailure(workspaceId: string, accountId: string, username: string, detail: string) {
  await prisma.notification.upsert({
    where: { workspaceId_dedupeKey: { workspaceId, dedupeKey: `sync-failed-${accountId}` } },
    create: {
      workspaceId,
      type: "SYNC_FAILED",
      severity: "WARNING",
      title: `Couldn't sync ${username}`,
      body: `Your existing data is safe. ${detail} Try again, or reconnect the account if this keeps happening.`,
      entityType: "ebayAccount",
      entityId: accountId,
      actionLabel: "Open connections",
      actionHref: "/settings/connections",
      dedupeKey: `sync-failed-${accountId}`,
    },
    update: { readAt: null, body: `Your existing data is safe. ${detail}` },
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Writing an order
// ---------------------------------------------------------------------------

interface UpsertResult {
  created: boolean;
  refundsWritten: number;
}

/**
 * Write one eBay order.
 *
 * Only eBay's own fields are touched. `notes`, cost entries and every field of
 * a refund the user has answered are left exactly as they are.
 */
export async function upsertOrder(
  workspaceId: string,
  ebayAccountId: string,
  source: EbayOrder,
): Promise<UpsertResult> {
  const existing = await prisma.order.findUnique({
    where: { ebayAccountId_ebayOrderId: { ebayAccountId, ebayOrderId: source.orderId } },
    select: { id: true },
  });

  const scalar = {
    legacyOrderId: source.legacyOrderId,
    orderDate: source.creationDate,
    currency: source.currency,
    buyerUsername: source.buyerUsername,
    buyerName: source.buyerName,
    buyerFeedback: source.buyerFeedbackScore,
    shipToCity: source.shipToCity,
    shipToCountry: source.shipToCountry,
    itemSubtotalMinor: source.itemSubtotal.amountMinor,
    shippingChargedMinor: source.shippingCharged.amountMinor,
    taxMinor: source.tax.amountMinor,
    totalMinor: source.total.amountMinor,
    ebayFeesMinor: source.fees.amountMinor,
    adFeesMinor: source.adFees.amountMinor,
    fulfillmentStatus: source.fulfillmentStatus,
    paymentStatus: source.paymentStatus,
    cancelState: source.cancelState,
    dispatchDeadline: source.dispatchDeadline,
    dispatchedAt: source.dispatchedAt,
    deliveredAt: source.deliveredAt,
    trackingNumber: source.trackingNumber,
    carrier: source.carrier,
    lastSyncedAt: new Date(),
  };

  const order = await prisma.order.upsert({
    where: { ebayAccountId_ebayOrderId: { ebayAccountId, ebayOrderId: source.orderId } },
    create: { workspaceId, ebayAccountId, ebayOrderId: source.orderId, ...scalar },
    update: scalar,
    select: { id: true },
  });

  for (const line of source.lineItems) {
    const product = await ensureProduct(workspaceId, line.title, line.sku, line.legacyItemId, line.imageUrl);
    const lineData = {
      productId: product.id,
      ebayItemId: line.legacyItemId,
      sku: line.sku,
      title: line.title,
      imageUrl: line.imageUrl,
      quantity: line.quantity,
      unitPriceMinor: line.unitPrice.amountMinor,
      lineFeesMinor: line.lineFees.amountMinor,
    };
    await prisma.orderItem.upsert({
      where: { orderId_ebayLineItemId: { orderId: order.id, ebayLineItemId: line.lineItemId } },
      create: { orderId: order.id, ebayLineItemId: line.lineItemId, ...lineData },
      update: lineData,
    });
  }

  let refundsWritten = 0;
  for (const refund of source.refunds) {
    const written = await upsertRefund(order.id, refund);
    if (written) refundsWritten += 1;
  }

  return { created: !existing, refundsWritten };
}

/**
 * Write a refund without ever overwriting the user's supplier answer.
 * `supplierClaim`, `recoveredMinor`, `supplierId` and `notes` belong to the
 * user; eBay has no opinion about them.
 */
async function upsertRefund(orderId: string, refund: EbayOrder["refunds"][number]): Promise<boolean> {
  const existing = await prisma.refund.findUnique({
    where: { orderId_ebayRefundId: { orderId, ebayRefundId: refund.refundId } },
    select: { id: true },
  });

  const ebayFields = {
    type: refund.type,
    refundedAt: refund.refundedAt,
    buyerRefundMinor: refund.buyerRefund.amountMinor,
    feeCreditMinor: refund.feeCredit.amountMinor,
    currency: refund.buyerRefund.currency,
    reason: refund.reason,
    returnState: refund.returnState,
  };

  if (existing) {
    await prisma.refund.update({ where: { id: existing.id }, data: ebayFields });
    return false;
  }

  await prisma.refund.create({
    data: {
      orderId,
      ebayRefundId: refund.refundId,
      ...ebayFields,
      // A cancellation never involved a supplier, so it starts settled. (R6)
      supplierClaim: refund.type === "CANCELLATION" ? "NOT_APPLICABLE" : "NOT_ASKED",
    },
  });
  return true;
}

async function ensureProduct(
  workspaceId: string,
  title: string,
  sku: string | null,
  ebayItemId: string | null,
  imageUrl: string | null,
) {
  return prisma.product.upsert({
    where: { workspaceId_title: { workspaceId, title } },
    create: { workspaceId, title, sku, ebayItemId, imageUrl },
    update: { sku: sku ?? undefined, ebayItemId: ebayItemId ?? undefined, imageUrl: imageUrl ?? undefined },
  });
}

async function refreshAccountHealth(ebayAccountId: string, accessToken: string): Promise<void> {
  try {
    const health = await getEbayClient().fetchAccountHealth(accessToken);
    if (!health) return;
    await prisma.ebayAccount.update({
      where: { id: ebayAccountId },
      data: {
        sellerLevel: health.sellerLevel,
        lateDispatchRate: health.lateDispatchRate,
        transactionDefectRate: health.transactionDefectRate,
        casesClosedWithoutSellerResolutionRate: health.casesClosedWithoutSellerResolutionRate,
        healthEvaluatedAt: health.evaluatedAt,
        healthNextEvaluationAt: health.nextEvaluationAt,
      },
    });
  } catch {
    // Seller standards are supplementary. Never fail a sync over them.
  }
}

/** eBay shop subscription and similar charges land as read-only expenses. (R12.5) */
async function importStoreFees(workspaceId: string, ebayAccountId: string, accessToken: string): Promise<void> {
  try {
    const now = new Date();
    const fees = await getEbayClient().fetchStoreFees(accessToken, startOfMonth(subDays(now, 60)), endOfMonth(now));
    for (const fee of fees) {
      await prisma.expense.upsert({
        where: { workspaceId_externalRef: { workspaceId, externalRef: fee.externalRef } },
        create: {
          workspaceId,
          ebayAccountId,
          date: fee.periodEnd,
          category: "Marketplace fees",
          description: `${fee.description}: ${fee.periodStart.toISOString().slice(0, 10)} – ${fee.periodEnd.toISOString().slice(0, 10)}`,
          amountMinor: fee.amount.amountMinor,
          currency: fee.amount.currency,
          source: "EBAY",
          externalRef: fee.externalRef,
        },
        update: { amountMinor: fee.amount.amountMinor },
      });
    }
  } catch {
    // Same reasoning as health.
  }
}
