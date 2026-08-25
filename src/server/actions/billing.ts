"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addMonths, addYears } from "date-fns";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { PLAN_CATALOG, planFor, type PlanId } from "@/lib/plans";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/**
 * Plan changes.
 *
 * No payment processor is configured, so this records the intent and moves the
 * subscription — it does not pretend to have taken a payment. When Stripe is
 * wired up, `changePlanAction` becomes "create a checkout session" and this
 * body moves to the webhook handler; nothing else in the app changes, because
 * everything asks `entitlementsFor()` rather than the plan directly.
 */

const schema = z.object({
  plan: z.enum(["SOLO", "MULTI"] as [PlanId, ...PlanId[]]),
  interval: z.enum(["MONTHLY", "YEARLY"]),
});

export async function changePlanAction(input: {
  plan: string;
  interval: string;
}): Promise<ActionResult<{ plan: string; stripeConfigured: boolean }>> {
  const auth = await requirePermissionOrThrow("billing.manage");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("That is not a plan you can choose here.");

  const plan = PLAN_CATALOG[parsed.data.plan];
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  const accountsUsed = await prisma.ebayAccount.count({
    where: { workspaceId: auth.workspace.id, status: { not: "DISCONNECTED" } },
  });

  // Downgrading below what is already connected would strand accounts.
  if (accountsUsed > plan.accountLimit) {
    return fail(
      `You have ${accountsUsed} eBay accounts connected and ${plan.name} covers ${plan.accountLimit}. ` +
        `Disconnect ${accountsUsed - plan.accountLimit} first, or stay on your current plan.`,
    );
  }

  const now = new Date();
  await prisma.subscription.upsert({
    where: { workspaceId: auth.workspace.id },
    create: {
      workspaceId: auth.workspace.id,
      plan: plan.id,
      status: "ACTIVE",
      interval: parsed.data.interval,
      currentPeriodEnd: parsed.data.interval === "YEARLY" ? addYears(now, 1) : addMonths(now, 1),
      accountLimitAtBuy: plan.accountLimit,
    },
    update: {
      plan: plan.id,
      status: "ACTIVE",
      interval: parsed.data.interval,
      currentPeriodEnd: parsed.data.interval === "YEARLY" ? addYears(now, 1) : addMonths(now, 1),
      accountLimitAtBuy: plan.accountLimit,
      cancelAtPeriodEnd: false,
    },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "billing.plan_change",
    summary: `Plan changed to ${plan.name} (${parsed.data.interval.toLowerCase()}).`,
    metadata: { plan: plan.id, interval: parsed.data.interval, stripeConfigured },
  });

  revalidatePath("/settings/billing");
  revalidatePath("/", "layout");
  return ok({ plan: plan.id, stripeConfigured });
}

export async function cancelPlanAction(): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("billing.manage");

  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId: auth.workspace.id },
  });
  if (!subscription) return fail("There is no subscription to cancel.");

  await prisma.subscription.update({
    where: { workspaceId: auth.workspace.id },
    data: { cancelAtPeriodEnd: true },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "billing.plan_change",
    summary: `${planFor(subscription.plan).name} set to cancel at the end of the period.`,
  });

  revalidatePath("/settings/billing");
  return ok();
}

export async function resumePlanAction(): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("billing.manage");
  await prisma.subscription.updateMany({
    where: { workspaceId: auth.workspace.id },
    data: { cancelAtPeriodEnd: false },
  });
  revalidatePath("/settings/billing");
  return ok();
}
