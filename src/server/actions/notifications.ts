"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireAuthOrThrow } from "@/lib/auth/guard";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export async function markNotificationReadAction(id: string, read = true): Promise<ActionResult> {
  const auth = await requireAuthOrThrow();
  const { count } = await prisma.notification.updateMany({
    where: { id, workspaceId: auth.workspace.id },
    data: { readAt: read ? new Date() : null },
  });
  if (count === 0) return fail("That alert no longer exists.");
  revalidatePath("/alerts");
  revalidatePath("/", "layout");
  return ok();
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ marked: number }>> {
  const auth = await requireAuthOrThrow();
  const { count } = await prisma.notification.updateMany({
    where: { workspaceId: auth.workspace.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/alerts");
  revalidatePath("/", "layout");
  return ok({ marked: count });
}

export async function deleteNotificationAction(id: string): Promise<ActionResult> {
  const auth = await requireAuthOrThrow();
  const { count } = await prisma.notification.deleteMany({
    where: { id, workspaceId: auth.workspace.id },
  });
  if (count === 0) return fail("That alert no longer exists.");
  revalidatePath("/alerts");
  revalidatePath("/", "layout");
  return ok();
}
