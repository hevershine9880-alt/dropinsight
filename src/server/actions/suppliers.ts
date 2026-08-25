"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Give the supplier a name.").max(120),
  website: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email("Enter a valid email address.").max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional(),
});

export async function upsertSupplierAction(input: {
  id?: string;
  name: string;
  website?: string;
  contactEmail?: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermissionOrThrow("products.manage");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const data = {
    name: parsed.data.name,
    website: parsed.data.website || null,
    contactEmail: parsed.data.contactEmail || null,
    notes: parsed.data.notes || null,
  };

  if (parsed.data.id) {
    const existing = await prisma.supplier.findFirst({
      where: { id: parsed.data.id, workspaceId: auth.workspace.id },
      select: { id: true, name: true },
    });
    if (!existing) return fail("That supplier no longer exists.");

    // The unique index is (workspaceId, name), so a rename can collide.
    const clash = await prisma.supplier.findFirst({
      where: { workspaceId: auth.workspace.id, name: data.name, id: { not: existing.id } },
      select: { id: true },
    });
    if (clash) return fail("You already have a supplier with that name.", { name: "Pick a different name." });

    await prisma.supplier.update({ where: { id: existing.id }, data });
    await recordAudit({
      workspaceId: auth.workspace.id,
      actorUserId: auth.user.id,
      action: "supplier.update",
      entityType: "supplier",
      entityId: existing.id,
      summary: `Supplier ${data.name} updated.`,
    });
    revalidatePath("/suppliers");
    return ok({ id: existing.id });
  }

  const clash = await prisma.supplier.findFirst({
    where: { workspaceId: auth.workspace.id, name: data.name },
    select: { id: true },
  });
  if (clash) return fail("You already have a supplier with that name.", { name: "Pick a different name." });

  const created = await prisma.supplier.create({
    data: { ...data, workspaceId: auth.workspace.id },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "supplier.create",
    entityType: "supplier",
    entityId: created.id,
    summary: `Supplier ${data.name} added.`,
  });

  revalidatePath("/suppliers");
  return ok({ id: created.id });
}
