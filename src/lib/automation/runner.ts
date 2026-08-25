import { prisma } from "@/lib/db/client";
import { differenceInDays, differenceInHours, subDays } from "date-fns";
import { loadOrders, profitOf } from "@/lib/finance/aggregate";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  evaluateCondition, parseActions, parseConditions,
  type Action, type Trigger,
} from "./types";

/**
 * Runs enabled automation rules.
 *
 * Every rule execution is recorded — success, skip and failure alike — so the
 * Automation page can show what a rule actually did rather than only that it
 * exists. A rule that throws is logged and the next rule still runs.
 */

export async function runAutomations(): Promise<number> {
  const rules = await prisma.automationRule.findMany({ where: { enabled: true } });
  let fired = 0;

  for (const rule of rules) {
    try {
      fired += await runRule(rule);
    } catch (error) {
      await prisma.automationRun.create({
        data: {
          ruleId: rule.id,
          status: "FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }).catch(() => {});
    }
  }
  return fired;
}

type Rule = Awaited<ReturnType<typeof prisma.automationRule.findMany>>[number];

export async function runRule(rule: Rule): Promise<number> {
  const conditions = parseConditions(rule.conditions);
  const actions = parseActions(rule.actions);
  const workspace = await prisma.workspace.findUnique({ where: { id: rule.workspaceId } });
  if (!workspace) return 0;

  const candidates = await gatherCandidates(rule.workspaceId, rule.trigger as Trigger);
  let fired = 0;

  for (const candidate of candidates) {
    if (!conditions.every((c) => evaluateCondition(c, candidate.facts))) continue;

    // A rule fires once per subject. The dedupe key is what stops a nightly
    // tick from raising the same alert thirty times.
    const dedupeKey = `automation-${rule.id}-${candidate.key}`;
    const already = await prisma.notification.findUnique({
      where: { workspaceId_dedupeKey: { workspaceId: rule.workspaceId, dedupeKey } },
      select: { id: true },
    });
    if (already) continue;

    for (const action of actions) {
      await applyAction(rule, action, candidate, dedupeKey, workspace.currency);
    }

    await prisma.automationRun.create({
      data: {
        ruleId: rule.id,
        status: "SUCCESS",
        message: candidate.summary,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
      },
    });
    fired += 1;
  }

  await prisma.automationRule.update({
    where: { id: rule.id },
    data: { lastRunAt: new Date(), runCount: { increment: fired } },
  });

  if (fired === 0) {
    await prisma.automationRun.create({
      data: { ruleId: rule.id, status: "SKIPPED", message: "Nothing matched this run." },
    });
  }

  return fired;
}

interface Candidate {
  key: string;
  entityType: string;
  entityId: string;
  summary: string;
  href: string;
  facts: Record<string, number | string>;
}

async function gatherCandidates(workspaceId: string, trigger: Trigger): Promise<Candidate[]> {
  const since = subDays(new Date(), 45);

  switch (trigger) {
    case "ORDER_REFUNDED": {
      const orders = await loadOrders({
        workspaceId,
        cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
        refunds: { some: { refundedAt: { gte: since } } },
      });
      return orders.flatMap((order) => {
        const p = profitOf(order);
        return order.refunds
          .filter((r) => r.refundedAt >= since)
          .map((refund) => ({
            key: `refund-${refund.id}`,
            entityType: "order",
            entityId: order.id,
            summary: `${order.ebayOrderId} refunded ${formatMoney(refund.buyerRefundMinor, order.currency)}`,
            href: `/orders/${order.id}`,
            facts: {
              refundLoss: p.refundLossMinor,
              orderValue: p.revenueMinor,
            },
          }));
      });
    }

    case "ORDER_BELOW_MARGIN": {
      const orders = await loadOrders({
        workspaceId,
        orderDate: { gte: since },
        cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
      });
      return orders
        .map((order) => ({ order, p: profitOf(order) }))
        .filter(({ p }) => p.isPriced && p.marginRatio !== null)
        .map(({ order, p }) => ({
          key: `margin-${order.id}`,
          entityType: "order",
          entityId: order.id,
          summary: `${order.ebayOrderId} came in at ${formatPercent(p.marginRatio)} margin`,
          href: `/orders/${order.id}`,
          facts: {
            marginPercent: (p.marginRatio ?? 0) * 100,
            orderValue: p.revenueMinor,
          },
        }));
    }

    case "ORDER_MISSING_COST": {
      const orders = await loadOrders({
        workspaceId,
        orderDate: { gte: since },
        cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
      });
      return orders
        .map((order) => ({ order, p: profitOf(order) }))
        .filter(({ p }) => !p.isPriced)
        .map(({ order, p }) => ({
          key: `unpriced-${order.id}`,
          entityType: "order",
          entityId: order.id,
          summary: `${order.ebayOrderId} has had no buying price for ${differenceInDays(new Date(), order.orderDate)} days`,
          href: `/orders/${order.id}`,
          facts: {
            ageDays: differenceInDays(new Date(), order.orderDate),
            orderValue: p.revenueMinor,
          },
        }));
    }

    case "SUPPLIER_REFUND_OVERDUE": {
      const refunds = await prisma.refund.findMany({
        where: {
          order: { workspaceId },
          supplierClaim: { in: ["NOT_ASKED", "ASKED", "PROMISED"] },
        },
        include: { order: { select: { id: true, ebayOrderId: true, currency: true } } },
      });
      return refunds.map((refund) => ({
        key: `overdue-${refund.id}`,
        entityType: "refund",
        entityId: refund.id,
        summary: `${refund.order.ebayOrderId} has been unanswered for ${differenceInDays(new Date(), refund.refundedAt)} days`,
        href: `/profit-protection`,
        facts: {
          ageDays: differenceInDays(new Date(), refund.refundedAt),
          recoverable: Math.max(0, refund.buyerRefundMinor - refund.feeCreditMinor - refund.recoveredMinor),
        },
      }));
    }

    case "SYNC_FAILED": {
      const jobs = await prisma.syncJob.findMany({
        where: { workspaceId, status: { in: ["FAILED", "PARTIAL"] }, finishedAt: { gte: subDays(new Date(), 7) } },
        include: { ebayAccount: { select: { username: true } } },
      });
      return jobs.map((job) => ({
        key: `sync-${job.id}`,
        entityType: "syncJob",
        entityId: job.id,
        summary: `${job.ebayAccount.username} sync ended ${job.status.toLowerCase()}`,
        href: "/settings/connections",
        facts: {},
      }));
    }

    case "ORDER_DISPATCH_DEADLINE_NEAR": {
      const orders = await prisma.order.findMany({
        where: {
          workspaceId,
          fulfillmentStatus: "AWAITING_DISPATCH",
          cancelState: "NONE",
          dispatchDeadline: { gte: new Date() },
        },
        select: { id: true, ebayOrderId: true, dispatchDeadline: true },
      });
      return orders.map((order) => ({
        key: `dispatch-${order.id}`,
        entityType: "order",
        entityId: order.id,
        summary: `${order.ebayOrderId} must be dispatched soon`,
        href: `/orders/${order.id}`,
        facts: {
          hoursRemaining: order.dispatchDeadline
            ? Math.max(0, differenceInHours(order.dispatchDeadline, new Date()))
            : 999,
        },
      }));
    }
  }
}

async function applyAction(
  rule: Rule,
  action: Action,
  candidate: Candidate,
  dedupeKey: string,
  currency: string,
): Promise<void> {
  void currency;
  switch (action.kind) {
    case "NOTIFY":
    case "FLAG_ORDER":
      await prisma.notification.create({
        data: {
          workspaceId: rule.workspaceId,
          type: `AUTOMATION_${rule.trigger}`,
          severity: action.severity ?? (action.kind === "FLAG_ORDER" ? "WARNING" : "INFO"),
          title: rule.name,
          body: action.message ? `${action.message} — ${candidate.summary}` : candidate.summary,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          actionLabel: "Open",
          actionHref: candidate.href,
          dedupeKey,
        },
      });
      break;

    case "SET_SUPPLIER_CLAIM":
      if (candidate.entityType === "refund") {
        await prisma.refund.updateMany({
          where: { id: candidate.entityId, supplierClaim: "NOT_ASKED" },
          data: { supplierClaim: "ASKED" },
        });
      }
      // Still record that the rule fired, so the run history is complete.
      await prisma.notification.create({
        data: {
          workspaceId: rule.workspaceId,
          type: `AUTOMATION_${rule.trigger}`,
          severity: "INFO",
          title: rule.name,
          body: `Marked as asked — ${candidate.summary}`,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          actionHref: candidate.href,
          actionLabel: "Open",
          dedupeKey,
        },
      }).catch(() => {});
      break;

    case "ADD_NOTE":
      if (candidate.entityType === "order" && action.message) {
        const order = await prisma.order.findUnique({
          where: { id: candidate.entityId },
          select: { notes: true },
        });
        const stamp = `[${rule.name}] ${action.message}`;
        await prisma.order.update({
          where: { id: candidate.entityId },
          data: { notes: order?.notes ? `${order.notes}\n${stamp}` : stamp },
        });
      }
      break;
  }
}
