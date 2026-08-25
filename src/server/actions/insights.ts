"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { generateInsights } from "@/lib/insights";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export async function refreshInsightsAction(): Promise<ActionResult<{ count: number }>> {
  const auth = await requirePermissionOrThrow("dashboard.view");
  const count = await generateInsights(auth.workspace.id);
  revalidatePath("/insights");
  return ok({ count });
}

export async function dismissInsightAction(id: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("dashboard.view");

  const insight = await prisma.insight.findFirst({
    where: { id, workspaceId: auth.workspace.id },
    select: { id: true },
  });
  if (!insight) return fail("That insight no longer exists.");

  await prisma.insight.update({ where: { id: insight.id }, data: { dismissedAt: new Date() } });
  revalidatePath("/insights");
  return ok();
}

export async function restoreInsightAction(id: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("dashboard.view");
  await prisma.insight.updateMany({
    where: { id, workspaceId: auth.workspace.id },
    data: { dismissedAt: null },
  });
  revalidatePath("/insights");
  return ok();
}
