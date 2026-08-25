"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { REFUND_ATTRIBUTION, REFUND_ATTRIBUTION_COPY } from "@/lib/finance/types";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

const attributionSchema = z.enum(REFUND_ATTRIBUTION);

/**
 * Refund loss attribution. (R3)
 *
 * This changes how every dashboard, analytic and report *dates* a refund loss.
 * Nothing stored is altered, which is why it is safe to change later — and the
 * copy says so, because a user about to change how their books read deserves
 * to know it is reversible.
 */
export async function setRefundAttributionAction(
  value: string,
): Promise<ActionResult<{ refundAttribution: string }>> {
  const auth = await requirePermissionOrThrow("settings.manage");
  const parsed = attributionSchema.safeParse(value);
  if (!parsed.success) return fail("That is not a valid option.");

  const workspace = await prisma.workspace.update({
    where: { id: auth.workspace.id },
    data: { refundAttribution: parsed.data },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "workspace.refund_attribution_change",
    summary: `Refund losses now count in ${REFUND_ATTRIBUTION_COPY[parsed.data].title.toLowerCase()}.`,
    metadata: { from: auth.workspace.refundAttribution, to: parsed.data },
  });

  revalidatePath("/", "layout");
  return ok({ refundAttribution: workspace.refundAttribution });
}

const generalSchema = z.object({
  name: z.string().trim().min(2, "Give your workspace a name.").max(80),
  currency: z.enum(["GBP", "USD", "EUR", "AUD", "CAD"]),
  refundAttribution: attributionSchema,
});

export async function updateWorkspaceAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("settings.manage");

  const parsed = generalSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    refundAttribution: formData.get("refundAttribution"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  await prisma.workspace.update({
    where: { id: auth.workspace.id },
    data: parsed.data,
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "workspace.update",
    summary: `Workspace settings updated.`,
    metadata: { ...parsed.data },
  });

  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Marks onboarding finished so the app layout stops redirecting. */
export async function completeOnboardingAction(): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("settings.manage");
  await prisma.workspace.update({
    where: { id: auth.workspace.id },
    data: { onboardingStep: "DONE" },
  });
  revalidatePath("/", "layout");
  return ok(undefined, "/dashboard");
}

export async function setOnboardingStepAction(step: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("settings.manage");
  await prisma.workspace.update({
    where: { id: auth.workspace.id },
    data: { onboardingStep: step },
  });
  revalidatePath("/", "layout");
  return ok();
}
