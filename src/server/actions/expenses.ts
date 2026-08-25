"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { parseMoney, formatMoney } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

/**
 * Business expenses. (R12)
 *
 * Rows imported from eBay (shop subscription and similar) are read-only: they
 * came from the marketplace, and letting someone edit them would put the P&L
 * out of step with the payout report it is meant to reconcile against.
 */

const schema = z.object({
  date: z.string().min(1, "Pick a date."),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(2, "Say what this was for.").max(200),
  amount: z.string().min(1, "Enter an amount."),
  recurring: z.boolean().optional(),
});

export async function addExpenseAction(input: {
  date: string;
  category: string;
  description: string;
  amount: string;
  recurring?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermissionOrThrow("expenses.manage");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const amountMinor = parseMoney(parsed.data.amount, auth.workspace.currency);
  if (amountMinor === null || amountMinor <= 0) {
    return fail("That is not a valid amount.", { amount: "Enter an amount greater than zero." });
  }

  const date = new Date(parsed.data.date);
  if (Number.isNaN(+date)) return fail("That is not a valid date.", { date: "Pick a date." });

  const expense = await prisma.expense.create({
    data: {
      workspaceId: auth.workspace.id,
      date,
      category: parsed.data.category,
      description: parsed.data.description,
      amountMinor,
      currency: auth.workspace.currency,
      recurring: parsed.data.recurring ?? false,
      source: "MANUAL",
    },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "expense.create",
    entityType: "expense",
    entityId: expense.id,
    summary: `Expense added: ${parsed.data.description} — ${formatMoney(amountMinor, auth.workspace.currency)}.`,
  });

  revalidatePath("/expenses");
  revalidatePath("/profit-and-loss");
  revalidatePath("/dashboard");
  return ok({ id: expense.id });
}

export async function updateExpenseAction(input: {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  recurring?: boolean;
}): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("expenses.manage");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const existing = await prisma.expense.findFirst({
    where: { id: input.id, workspaceId: auth.workspace.id },
    select: { id: true, source: true },
  });
  if (!existing) return fail("That expense no longer exists.");
  if (existing.source === "EBAY") {
    return fail("This came from eBay and cannot be edited. It is here so your P&L matches your payout report.");
  }

  const amountMinor = parseMoney(parsed.data.amount, auth.workspace.currency);
  if (amountMinor === null || amountMinor <= 0) {
    return fail("That is not a valid amount.", { amount: "Enter an amount greater than zero." });
  }

  await prisma.expense.update({
    where: { id: existing.id },
    data: {
      date: new Date(parsed.data.date),
      category: parsed.data.category,
      description: parsed.data.description,
      amountMinor,
      recurring: parsed.data.recurring ?? false,
    },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "expense.update",
    entityType: "expense",
    entityId: existing.id,
    summary: `Expense updated: ${parsed.data.description}.`,
  });

  revalidatePath("/expenses");
  revalidatePath("/profit-and-loss");
  return ok();
}

export async function deleteExpenseAction(id: string): Promise<ActionResult<{ restore: {
  date: string; category: string; description: string; amount: string; recurring: boolean;
} }>> {
  const auth = await requirePermissionOrThrow("expenses.manage");

  const expense = await prisma.expense.findFirst({
    where: { id, workspaceId: auth.workspace.id },
  });
  if (!expense) return fail("That expense no longer exists.");
  if (expense.source === "EBAY") {
    return fail("This came from eBay and cannot be removed.");
  }

  await prisma.expense.delete({ where: { id: expense.id } });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "expense.delete",
    entityType: "expense",
    entityId: expense.id,
    summary: `Expense removed: ${expense.description} — ${formatMoney(expense.amountMinor, expense.currency)}.`,
  });

  revalidatePath("/expenses");
  revalidatePath("/profit-and-loss");

  // Returned so the toast can offer a real Undo rather than a fake one.
  return ok({
    restore: {
      date: expense.date.toISOString().slice(0, 10),
      category: expense.category,
      description: expense.description,
      amount: (expense.amountMinor / 100).toFixed(2),
      recurring: expense.recurring,
    },
  });
}

/**
 * "Copy last month's recurring" — the one action that makes month-end expense
 * entry bearable. Anything already copied is skipped, so pressing it twice is
 * harmless.
 */
export async function copyRecurringExpensesAction(targetMonth: string): Promise<ActionResult<{ copied: number; skipped: number }>> {
  const auth = await requirePermissionOrThrow("expenses.manage");

  const target = new Date(`${targetMonth}-01T00:00:00.000Z`);
  if (Number.isNaN(+target)) return fail("That is not a valid month.");

  const source = subMonths(target, 1);
  const [recurring, existing] = await Promise.all([
    prisma.expense.findMany({
      where: {
        workspaceId: auth.workspace.id,
        recurring: true,
        source: "MANUAL",
        date: { gte: startOfMonth(source), lte: endOfMonth(source) },
      },
    }),
    prisma.expense.findMany({
      where: {
        workspaceId: auth.workspace.id,
        date: { gte: startOfMonth(target), lte: endOfMonth(target) },
      },
      select: { description: true, category: true },
    }),
  ]);

  if (recurring.length === 0) {
    return fail("There were no recurring expenses last month to copy.");
  }

  const alreadyThere = new Set(existing.map((e) => `${e.category}::${e.description}`));
  const toCreate = recurring.filter((e) => !alreadyThere.has(`${e.category}::${e.description}`));

  if (toCreate.length === 0) {
    return fail("Every recurring expense from last month is already in this month.");
  }

  await prisma.expense.createMany({
    data: toCreate.map((e) => ({
      workspaceId: auth.workspace.id,
      // Keep the day of the month where possible; clamp into the target month.
      date: clampToMonth(addMonths(e.date, 1), target),
      category: e.category,
      description: e.description,
      amountMinor: e.amountMinor,
      currency: e.currency,
      recurring: true,
      source: "MANUAL",
    })),
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "expense.create",
    summary: `Copied ${toCreate.length} recurring expenses into ${targetMonth}.`,
    metadata: { copied: toCreate.length, skipped: recurring.length - toCreate.length },
  });

  revalidatePath("/expenses");
  revalidatePath("/profit-and-loss");
  return ok({ copied: toCreate.length, skipped: recurring.length - toCreate.length });
}

function clampToMonth(date: Date, month: Date): Date {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  if (date < start) return start;
  if (date > end) return end;
  return date;
}
