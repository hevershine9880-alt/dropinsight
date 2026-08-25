"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { runRule } from "@/lib/automation/runner";
import { TRIGGERS, ACTIONS } from "@/lib/automation/types";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["lt", "lte", "gt", "gte", "eq", "neq"]),
  value: z.union([z.number(), z.string()]),
});

const actionSchema = z.object({
  kind: z.enum(ACTIONS),
  message: z.string().trim().max(200).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
});

const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Give the rule a name you'll recognise.").max(80),
  description: z.string().trim().max(300).optional(),
  trigger: z.enum(TRIGGERS),
  conditions: z.array(conditionSchema).max(6),
  actions: z.array(actionSchema).min(1, "Choose at least one thing for the rule to do.").max(4),
  enabled: z.boolean(),
});

type RuleInput = z.infer<typeof ruleSchema>;

export async function saveAutomationRuleAction(input: RuleInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermissionOrThrow("automation.manage");

  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const data = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    trigger: parsed.data.trigger,
    conditions: JSON.stringify(parsed.data.conditions),
    actions: JSON.stringify(parsed.data.actions),
    enabled: parsed.data.enabled,
  };

  if (parsed.data.id) {
    const existing = await prisma.automationRule.findFirst({
      where: { id: parsed.data.id, workspaceId: auth.workspace.id },
      select: { id: true },
    });
    if (!existing) return fail("That automation no longer exists.");

    await prisma.automationRule.update({ where: { id: existing.id }, data });
    await recordAudit({
      workspaceId: auth.workspace.id,
      actorUserId: auth.user.id,
      action: "automation.update",
      entityType: "automationRule",
      entityId: existing.id,
      summary: `Automation "${data.name}" updated.`,
    });
    revalidatePath("/automation");
    return ok({ id: existing.id });
  }

  const created = await prisma.automationRule.create({
    data: { ...data, workspaceId: auth.workspace.id },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "automation.create",
    entityType: "automationRule",
    entityId: created.id,
    summary: `Automation "${data.name}" created.`,
  });

  revalidatePath("/automation");
  return ok({ id: created.id });
}

export async function toggleAutomationRuleAction(id: string, enabled: boolean): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("automation.manage");

  const { count } = await prisma.automationRule.updateMany({
    where: { id, workspaceId: auth.workspace.id },
    data: { enabled },
  });
  if (count === 0) return fail("That automation no longer exists.");

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "automation.update",
    entityType: "automationRule",
    entityId: id,
    summary: `Automation ${enabled ? "enabled" : "paused"}.`,
  });

  revalidatePath("/automation");
  return ok();
}

export async function deleteAutomationRuleAction(id: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("automation.manage");

  const rule = await prisma.automationRule.findFirst({
    where: { id, workspaceId: auth.workspace.id },
    select: { id: true, name: true },
  });
  if (!rule) return fail("That automation no longer exists.");

  await prisma.automationRule.delete({ where: { id: rule.id } });
  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "automation.delete",
    summary: `Automation "${rule.name}" deleted.`,
  });

  revalidatePath("/automation");
  return ok();
}

/**
 * Run one rule now, so a user can see what it would do before trusting it to
 * run unattended. Uses the same code path as the scheduler — a dry run that
 * behaved differently from the real thing would be worse than none.
 */
export async function runAutomationRuleNowAction(id: string): Promise<ActionResult<{ fired: number }>> {
  const auth = await requirePermissionOrThrow("automation.manage");

  const rule = await prisma.automationRule.findFirst({
    where: { id, workspaceId: auth.workspace.id },
  });
  if (!rule) return fail("That automation no longer exists.");

  const fired = await runRule(rule);

  revalidatePath("/automation");
  revalidatePath("/alerts");
  return ok({ fired });
}
