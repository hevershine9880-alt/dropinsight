"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { parseMoney, formatMoney } from "@/lib/money";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

/**
 * The cost ledger — the single write path for buying prices.
 *
 * Inline editing, spreadsheet mode and CSV import all land here, which is why
 * a cost entered any of the three ways behaves identically: it creates a new
 * CostEntry, the newest wins, and the previous value stays as history for the
 * buying-price suggestions.
 */

const costSchema = z.object({
  orderItemId: z.string().min(1),
  unitCost: z.string(),
  supplierName: z.string().trim().max(120).optional(),
  supplierOrderNumber: z.string().trim().max(80).optional(),
});

export async function setCostAction(input: {
  orderItemId: string;
  unitCost: string;
  supplierName?: string;
  supplierOrderNumber?: string;
}): Promise<ActionResult<{ unitCostMinor: number }>> {
  const auth = await requirePermissionOrThrow("costs.write");

  const parsed = costSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const item = await prisma.orderItem.findUnique({
    where: { id: parsed.data.orderItemId },
    include: { order: { select: { id: true, workspaceId: true, currency: true, ebayOrderId: true } } },
  });

  // Never trust an id from the client to belong to the caller's workspace.
  if (!item || item.order.workspaceId !== auth.workspace.id) {
    return fail("That order line no longer exists.");
  }

  const unitCostMinor = parseMoney(parsed.data.unitCost, item.order.currency);
  if (unitCostMinor === null) {
    return fail("That is not a valid amount.", { unitCost: "Enter an amount like 4.50." });
  }
  if (unitCostMinor < 0) {
    return fail("A buying price cannot be negative.", { unitCost: "Enter zero or more." });
  }

  const supplierId = parsed.data.supplierName
    ? (await upsertSupplier(auth.workspace.id, parsed.data.supplierName)).id
    : undefined;

  await prisma.costEntry.create({
    data: {
      orderItemId: item.id,
      unitCostMinor,
      currency: item.order.currency,
      supplierId,
      supplierOrderNumber: parsed.data.supplierOrderNumber || null,
      source: "MANUAL",
      createdByUserId: auth.user.id,
    },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "cost.set",
    entityType: "order",
    entityId: item.order.id,
    summary: `Buying price for ${item.order.ebayOrderId} set to ${formatMoney(unitCostMinor, item.order.currency)} a unit.`,
    metadata: { orderItemId: item.id, unitCostMinor },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${item.order.id}`);
  revalidatePath("/dashboard");

  return ok({ unitCostMinor });
}

/**
 * Spreadsheet mode. One transaction, so a paste of 200 rows either lands or
 * does not — a half-applied paste would be far worse than a rejected one.
 */
const bulkSchema = z.object({
  rows: z.array(
    z.object({
      orderItemId: z.string().min(1),
      unitCost: z.string(),
      supplierName: z.string().trim().max(120).optional(),
      supplierOrderNumber: z.string().trim().max(80).optional(),
    }),
  ).min(1).max(500),
});

export async function setCostsBulkAction(input: {
  rows: { orderItemId: string; unitCost: string; supplierName?: string; supplierOrderNumber?: string }[];
}): Promise<ActionResult<{ saved: number; skipped: number; errors: string[] }>> {
  const auth = await requirePermissionOrThrow("costs.write");

  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const ids = parsed.data.rows.map((r) => r.orderItemId);
  const items = await prisma.orderItem.findMany({
    where: { id: { in: ids }, order: { workspaceId: auth.workspace.id } },
    include: { order: { select: { id: true, currency: true } } },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const errors: string[] = [];
  const writes: { orderItemId: string; unitCostMinor: number; currency: string; supplierId?: string; supplierOrderNumber: string | null }[] = [];

  // Suppliers are resolved first, outside the transaction, so the transaction
  // stays short and cannot deadlock on the unique index.
  const supplierNames = [...new Set(parsed.data.rows.map((r) => r.supplierName?.trim()).filter(Boolean))] as string[];
  const supplierIds = new Map<string, string>();
  for (const name of supplierNames) {
    supplierIds.set(name, (await upsertSupplier(auth.workspace.id, name)).id);
  }

  for (const row of parsed.data.rows) {
    const item = byId.get(row.orderItemId);
    if (!item) {
      errors.push(`Line ${row.orderItemId} is not in this workspace.`);
      continue;
    }
    // A blank cell means "leave this one alone", not "set it to zero".
    if (!row.unitCost.trim()) continue;

    const unitCostMinor = parseMoney(row.unitCost, item.order.currency);
    if (unitCostMinor === null || unitCostMinor < 0) {
      errors.push(`"${row.unitCost}" is not a valid amount.`);
      continue;
    }

    writes.push({
      orderItemId: item.id,
      unitCostMinor,
      currency: item.order.currency,
      supplierId: row.supplierName?.trim() ? supplierIds.get(row.supplierName.trim()) : undefined,
      supplierOrderNumber: row.supplierOrderNumber?.trim() || null,
    });
  }

  if (writes.length === 0) {
    return fail(
      errors.length > 0 ? "Nothing could be saved." : "No prices to save.",
      undefined,
    );
  }

  await prisma.$transaction(
    writes.map((w) =>
      prisma.costEntry.create({
        data: { ...w, source: "SPREADSHEET", createdByUserId: auth.user.id },
      }),
    ),
  );

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "cost.bulk_import",
    summary: `${writes.length} buying prices entered in spreadsheet mode.`,
    metadata: { saved: writes.length, skipped: errors.length },
  });

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/products");

  return ok({ saved: writes.length, skipped: errors.length, errors: errors.slice(0, 10) });
}

/** Remove the newest cost entry for a line, exposing the one before it. */
export async function clearCostAction(orderItemId: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("costs.write");

  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      order: { select: { id: true, workspaceId: true, ebayOrderId: true } },
      costs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!item || item.order.workspaceId !== auth.workspace.id) {
    return fail("That order line no longer exists.");
  }
  if (item.costs.length === 0) return fail("There is no buying price to remove.");

  await prisma.costEntry.delete({ where: { id: item.costs[0].id } });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "cost.set",
    entityType: "order",
    entityId: item.order.id,
    summary: `Buying price removed from ${item.order.ebayOrderId}.`,
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${item.order.id}`);
  return ok();
}

async function upsertSupplier(workspaceId: string, name: string) {
  return prisma.supplier.upsert({
    where: { workspaceId_name: { workspaceId, name } },
    create: { workspaceId, name },
    update: {},
  });
}

/**
 * Buying-price suggestion for a line, from the product's own cost history.
 * This is the thing the reference product promises on its Products page but
 * never actually surfaces at the point of entry.
 */
export async function suggestCostAction(orderItemId: string): Promise<
  ActionResult<{ unitCostMinor: number; basis: string; supplierName: string | null } | null>
> {
  const auth = await requirePermissionOrThrow("costs.write");

  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: { productId: true, order: { select: { workspaceId: true } } },
  });
  if (!item || item.order.workspaceId !== auth.workspace.id || !item.productId) return ok(null);

  const history = await prisma.costEntry.findMany({
    where: { orderItem: { productId: item.productId }, orderItemId: { not: orderItemId } },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { supplier: { select: { name: true } } },
  });

  if (history.length === 0) return ok(null);

  const latest = history[0];
  const average = Math.round(history.reduce((s, h) => s + h.unitCostMinor, 0) / history.length);

  return ok({
    unitCostMinor: latest.unitCostMinor,
    basis:
      history.length === 1
        ? "your last cost for this product"
        : `your last cost for this product · ${history.length}-entry average is ${(average / 100).toFixed(2)}`,
    supplierName: latest.supplier?.name ?? null,
  });
}
