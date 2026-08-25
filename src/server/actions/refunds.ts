"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { parseMoney, formatMoney } from "@/lib/money";
import { SUPPLIER_CLAIM, type SupplierClaim } from "@/lib/finance/types";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

/**
 * Supplier refund recovery. (R5)
 *
 * "You refunded the buyer on eBay — did you get that money back from your
 * supplier?" Answering it updates the order's profit immediately, which is why
 * every path revalidates the pages that show profit.
 *
 * The recovered amount is capped at what was actually lost: a supplier cannot
 * hand back more than the refund cost you, and letting them would turn a loss
 * into phantom profit.
 */

const answerSchema = z.object({
  refundId: z.string().min(1),
  claim: z.enum(SUPPLIER_CLAIM),
  recovered: z.string().optional(),
  supplierName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  promisedInDays: z.number().int().min(1).max(120).optional(),
});

export async function answerSupplierClaimAction(input: {
  refundId: string;
  claim: SupplierClaim;
  recovered?: string;
  supplierName?: string;
  notes?: string;
  promisedInDays?: number;
}): Promise<ActionResult<{ recoveredMinor: number; previousClaim: string; previousRecoveredMinor: number }>> {
  const auth = await requirePermissionOrThrow("refunds.answer");

  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const refund = await prisma.refund.findFirst({
    where: { id: parsed.data.refundId, order: { workspaceId: auth.workspace.id } },
    include: { order: { select: { id: true, ebayOrderId: true, currency: true } } },
  });
  if (!refund) return fail("That refund no longer exists.");

  const maxRecoverable = Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor);
  let recoveredMinor = 0;

  switch (parsed.data.claim) {
    case "RECEIVED":
      recoveredMinor = maxRecoverable;
      break;
    case "PARTIAL": {
      const entered = parseMoney(parsed.data.recovered ?? "", refund.order.currency);
      if (entered === null || entered <= 0) {
        return fail("Enter how much the supplier paid back.", {
          recovered: "Enter an amount like 4.50.",
        });
      }
      if (entered > maxRecoverable) {
        return fail("That is more than this refund cost you.", {
          recovered: `The most recoverable here is ${formatMoney(maxRecoverable, refund.order.currency)}.`,
        });
      }
      recoveredMinor = entered;
      break;
    }
    // ASKED, PROMISED, NOT_ASKED and WRITTEN_OFF all recover nothing.
    default:
      recoveredMinor = 0;
  }

  const supplierId = parsed.data.supplierName
    ? (
        await prisma.supplier.upsert({
          where: { workspaceId_name: { workspaceId: auth.workspace.id, name: parsed.data.supplierName } },
          create: { workspaceId: auth.workspace.id, name: parsed.data.supplierName },
          update: {},
        })
      ).id
    : undefined;

  const previousClaim = refund.supplierClaim;
  const previousRecoveredMinor = refund.recoveredMinor;

  await prisma.refund.update({
    where: { id: refund.id },
    data: {
      supplierClaim: parsed.data.claim,
      recoveredMinor,
      supplierId,
      notes: parsed.data.notes ?? refund.notes,
      supplierAnsweredAt: ["RECEIVED", "PARTIAL", "WRITTEN_OFF"].includes(parsed.data.claim) ? new Date() : null,
      promisedByDate:
        parsed.data.claim === "PROMISED" ? addDays(new Date(), parsed.data.promisedInDays ?? 14) : null,
    },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "refund.answer",
    entityType: "refund",
    entityId: refund.id,
    summary: `${refund.order.ebayOrderId}: supplier claim set to ${parsed.data.claim.toLowerCase().replace("_", " ")}${
      recoveredMinor > 0 ? `, ${formatMoney(recoveredMinor, refund.order.currency)} recovered` : ""
    }.`,
    metadata: { from: previousClaim, to: parsed.data.claim, recoveredMinor },
  });

  revalidatePath("/returns");
  revalidatePath("/profit-protection");
  revalidatePath("/dashboard");
  revalidatePath(`/orders/${refund.order.id}`);
  revalidatePath("/profit-and-loss");

  return ok({ recoveredMinor, previousClaim, previousRecoveredMinor });
}

/** Restores a claim to what it was, so the toast's Undo does what it says. */
export async function undoSupplierClaimAction(input: {
  refundId: string;
  claim: string;
  recoveredMinor: number;
}): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("refunds.answer");

  const refund = await prisma.refund.findFirst({
    where: { id: input.refundId, order: { workspaceId: auth.workspace.id } },
    select: { id: true },
  });
  if (!refund) return fail("That refund no longer exists.");

  await prisma.refund.update({
    where: { id: refund.id },
    data: {
      supplierClaim: input.claim,
      recoveredMinor: input.recoveredMinor,
      supplierAnsweredAt: ["RECEIVED", "PARTIAL", "WRITTEN_OFF"].includes(input.claim) ? new Date() : null,
      promisedByDate: null,
    },
  });

  revalidatePath("/returns");
  revalidatePath("/profit-protection");
  revalidatePath("/dashboard");
  return ok();
}

/** Answer a batch from the chase queue. */
export async function bulkAnswerClaimsAction(input: {
  refundIds: string[];
  claim: SupplierClaim;
}): Promise<ActionResult<{ updated: number }>> {
  const auth = await requirePermissionOrThrow("refunds.answer");

  const schema = z.object({
    refundIds: z.array(z.string().min(1)).min(1).max(500),
    claim: z.enum(SUPPLIER_CLAIM),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  // A bulk "partial" makes no sense — the amount differs per refund.
  if (parsed.data.claim === "PARTIAL") {
    return fail("A partial recovery has to be recorded one refund at a time, because the amount differs.");
  }

  const refunds = await prisma.refund.findMany({
    where: { id: { in: parsed.data.refundIds }, order: { workspaceId: auth.workspace.id } },
    select: { id: true, buyerRefundMinor: true, feeCreditMinor: true },
  });

  const answeredAt = ["RECEIVED", "WRITTEN_OFF"].includes(parsed.data.claim) ? new Date() : null;
  const promisedByDate = parsed.data.claim === "PROMISED" ? addDays(new Date(), 14) : null;

  await prisma.$transaction(
    refunds.map((refund) =>
      prisma.refund.update({
        where: { id: refund.id },
        data: {
          supplierClaim: parsed.data.claim,
          recoveredMinor:
            parsed.data.claim === "RECEIVED"
              ? Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor)
              : 0,
          supplierAnsweredAt: answeredAt,
          promisedByDate,
        },
      }),
    ),
  );

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "refund.bulk_answer",
    summary: `${refunds.length} supplier claims set to ${parsed.data.claim.toLowerCase().replace("_", " ")}.`,
    metadata: { count: refunds.length, claim: parsed.data.claim },
  });

  revalidatePath("/returns");
  revalidatePath("/profit-protection");
  revalidatePath("/dashboard");
  return ok({ updated: refunds.length });
}

/** Free-text note on a refund. */
export async function setRefundNotesAction(refundId: string, notes: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("refunds.answer");
  const refund = await prisma.refund.findFirst({
    where: { id: refundId, order: { workspaceId: auth.workspace.id } },
    select: { id: true },
  });
  if (!refund) return fail("That refund no longer exists.");

  await prisma.refund.update({ where: { id: refund.id }, data: { notes: notes.slice(0, 1000) || null } });
  revalidatePath("/profit-protection");
  return ok();
}

/** Order-level note. */
export async function setOrderNotesAction(orderId: string, notes: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("costs.write");
  const order = await prisma.order.findFirst({
    where: { id: orderId, workspaceId: auth.workspace.id },
    select: { id: true },
  });
  if (!order) return fail("That order no longer exists.");

  await prisma.order.update({ where: { id: order.id }, data: { notes: notes.slice(0, 2000) || null } });
  revalidatePath(`/orders/${orderId}`);
  return ok();
}
