"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db/client";
import { requirePermissionOrThrow } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { INVITABLE_ROLES, ROLE_LABELS, isRole, type Role } from "@/lib/auth/permissions";
import { entitlementsFor } from "@/lib/plans";
import { ok, fail, fromZod, type ActionResult } from "@/lib/action-result";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(INVITABLE_ROLES as [Role, ...Role[]]),
});

export async function inviteTeammateAction(input: {
  email: string;
  role: string;
}): Promise<ActionResult<{ inviteUrl: string }>> {
  const auth = await requirePermissionOrThrow("team.manage");

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);

  const subscription = await prisma.subscription.findUnique({ where: { workspaceId: auth.workspace.id } });
  const accountsUsed = await prisma.ebayAccount.count({
    where: { workspaceId: auth.workspace.id, status: { not: "DISCONNECTED" } },
  });
  const entitlements = entitlementsFor({
    plan: subscription?.plan ?? "TRIAL",
    status: subscription?.status ?? "TRIALING",
    trialEndsAt: subscription?.trialEndsAt ?? null,
    accountsUsed,
  });

  if (!entitlements.canUseTeam) {
    return fail(
      `Team access is part of the Multi plan. You are on ${entitlements.plan.name}. ` +
        `Upgrade to invite people, with roles that limit what each of them can see.`,
    );
  }

  const alreadyMember = await prisma.membership.findFirst({
    where: { workspaceId: auth.workspace.id, user: { email: parsed.data.email } },
    select: { id: true },
  });
  if (alreadyMember) {
    return fail("That person is already in this workspace.", { email: "They are already a member." });
  }

  const token = randomToken(24);

  await prisma.invitation.upsert({
    where: { workspaceId_email: { workspaceId: auth.workspace.id, email: parsed.data.email } },
    create: {
      workspaceId: auth.workspace.id,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash: sha256(token),
      invitedById: auth.user.id,
      expiresAt: addDays(new Date(), 14),
    },
    update: {
      role: parsed.data.role,
      tokenHash: sha256(token),
      expiresAt: addDays(new Date(), 14),
      acceptedAt: null,
    },
  });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "member.invite",
    summary: `${parsed.data.email} invited as ${ROLE_LABELS[parsed.data.role]}.`,
  });

  // No email provider is configured, so the link is returned to the inviter to
  // pass on — and logged server-side. Better than pretending an email was sent.
  const inviteUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/accept-invite?token=${token}`;
  console.info(`[team] Invitation for ${parsed.data.email}: ${inviteUrl}`);

  revalidatePath("/settings/team");
  return ok({ inviteUrl });
}

export async function changeMemberRoleAction(
  membershipId: string,
  role: string,
): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("team.manage");
  if (!isRole(role) || role === "OWNER") return fail("That is not a role you can assign.");

  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, workspaceId: auth.workspace.id },
    include: { user: { select: { name: true } } },
  });
  if (!membership) return fail("That person is not in this workspace.");
  if (membership.role === "OWNER") return fail("The owner's role cannot be changed.");

  await prisma.membership.update({ where: { id: membership.id }, data: { role } });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "member.role_change",
    summary: `${membership.user.name} is now ${ROLE_LABELS[role]}.`,
    metadata: { from: membership.role, to: role },
  });

  revalidatePath("/settings/team");
  return ok();
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("team.manage");

  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, workspaceId: auth.workspace.id },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!membership) return fail("That person is not in this workspace.");
  if (membership.role === "OWNER") return fail("The owner cannot be removed from their own workspace.");
  if (membership.user.id === auth.user.id) return fail("You cannot remove yourself.");

  await prisma.membership.delete({ where: { id: membership.id } });

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "member.remove",
    summary: `${membership.user.name} removed from the workspace.`,
  });

  revalidatePath("/settings/team");
  return ok();
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  const auth = await requirePermissionOrThrow("team.manage");

  const { count } = await prisma.invitation.deleteMany({
    where: { id: invitationId, workspaceId: auth.workspace.id },
  });
  if (count === 0) return fail("That invitation no longer exists.");

  revalidatePath("/settings/team");
  return ok();
}
