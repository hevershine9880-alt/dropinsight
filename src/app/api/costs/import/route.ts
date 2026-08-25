import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getAuth } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { parseMoney } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

/**
 * CSV cost import.
 *
 * Matches on the eBay order number, which is what the user has in their sheet.
 * A row that matches nothing is reported back rather than silently dropped —
 * an import that says "500 rows imported" when 200 matched nothing is worse
 * than one that fails.
 *
 * A single-line order takes the price as-is. A multi-line order cannot be
 * costed from one number, so those are reported as unmatched with a reason.
 */

const schema = z.object({
  rows: z.array(
    z.object({
      orderNumber: z.string().trim().min(1),
      buyingPrice: z.string().trim().min(1),
      supplierOrderNumber: z.string().trim().optional(),
      supplierName: z.string().trim().optional(),
    }),
  ).min(1).max(20_000),
});

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || !can(auth.workspace.role, "costs.write")) {
    return NextResponse.json({ error: "Your role cannot enter buying prices." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "That file could not be read." }, { status: 400 });
  }

  const orderNumbers = [...new Set(parsed.data.rows.map((r) => r.orderNumber))];

  const orders = await prisma.order.findMany({
    where: {
      workspaceId: auth.workspace.id,
      OR: [{ ebayOrderId: { in: orderNumbers } }, { legacyOrderId: { in: orderNumbers } }],
    },
    select: { id: true, ebayOrderId: true, legacyOrderId: true, currency: true, items: { select: { id: true } } },
  });

  const byNumber = new Map<string, (typeof orders)[number]>();
  for (const order of orders) {
    byNumber.set(order.ebayOrderId, order);
    if (order.legacyOrderId) byNumber.set(order.legacyOrderId, order);
  }

  // Suppliers first, outside the transaction.
  const supplierNames = [...new Set(parsed.data.rows.map((r) => r.supplierName?.trim()).filter(Boolean))] as string[];
  const supplierIds = new Map<string, string>();
  for (const name of supplierNames) {
    const supplier = await prisma.supplier.upsert({
      where: { workspaceId_name: { workspaceId: auth.workspace.id, name } },
      create: { workspaceId: auth.workspace.id, name },
      update: {},
    });
    supplierIds.set(name, supplier.id);
  }

  const unmatched: string[] = [];
  const invalid: string[] = [];
  const writes: {
    orderItemId: string; unitCostMinor: number; currency: string;
    supplierId?: string; supplierOrderNumber: string | null;
  }[] = [];

  for (const row of parsed.data.rows) {
    const order = byNumber.get(row.orderNumber);
    if (!order) { unmatched.push(row.orderNumber); continue; }

    if (order.items.length !== 1) {
      unmatched.push(`${row.orderNumber} (has ${order.items.length} lines — cost each one on the order page)`);
      continue;
    }

    const unitCostMinor = parseMoney(row.buyingPrice, order.currency);
    if (unitCostMinor === null || unitCostMinor < 0) {
      invalid.push(`${row.orderNumber}: "${row.buyingPrice}"`);
      continue;
    }

    writes.push({
      orderItemId: order.items[0].id,
      unitCostMinor,
      currency: order.currency,
      supplierId: row.supplierName?.trim() ? supplierIds.get(row.supplierName.trim()) : undefined,
      supplierOrderNumber: row.supplierOrderNumber?.trim() || null,
    });
  }

  // Chunked so a very large import does not build one enormous transaction.
  const CHUNK = 200;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const chunk = writes.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((w) =>
        prisma.costEntry.create({
          data: { ...w, source: "CSV_IMPORT", createdByUserId: auth.user.id },
        }),
      ),
    );
  }

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "cost.bulk_import",
    summary: `Imported ${writes.length} buying prices from a spreadsheet.`,
    metadata: { saved: writes.length, unmatched: unmatched.length, invalid: invalid.length },
  });

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/products");

  return NextResponse.json({
    matched: writes.length,
    saved: writes.length,
    unmatched: unmatched.slice(0, 200),
    invalid: invalid.slice(0, 50),
  });
}
