import { prisma } from "@/lib/db/client";

/**
 * Audit trail for anything a user might later need to account for: money
 * changing, access changing, or an integration being connected or removed.
 */
export type AuditAction =
  | "auth.sign_in" | "auth.sign_out" | "auth.sign_up" | "auth.password_reset"
  | "workspace.update" | "workspace.refund_attribution_change"
  | "member.invite" | "member.remove" | "member.role_change"
  | "ebay.connect" | "ebay.disconnect" | "ebay.sync_requested" | "ebay.history_import"
  | "cost.set" | "cost.bulk_import"
  | "refund.answer" | "refund.bulk_answer"
  | "expense.create" | "expense.update" | "expense.delete"
  | "supplier.create" | "supplier.update"
  | "automation.create" | "automation.update" | "automation.delete"
  | "report.export"
  | "billing.plan_change";

export async function recordAudit(input: {
  workspaceId: string;
  actorUserId?: string | null;
  action: AuditAction;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        summary: input.summary,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    // An audit failure must never take down the operation it was recording.
    console.error("[audit] failed to write entry", { action: input.action, error });
  }
}
