"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireAuthOrThrow } from "@/lib/auth/guard";
import { sha256 } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const auth = await requireAuthOrThrow();

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { workspace: { select: { name: true } } },
  });

  if (!invitation || invitation.acceptedAt) return fail("This invitation has already been used.");
  if (invitation.expiresAt < new Date()) return fail("This invitation has expired.");

  // Re-checked here as well as on the page: the page render and this action are
  // separate requests, and only this one writes.
  if (auth.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return fail(`This invitation was sent to ${invitation.email}.`);
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: auth.user.id, workspaceId: invitation.workspaceId } },
    select: { id: true },
  });
  if (existing) return fail("You are already a member of that workspace.");

  await prisma.$transaction([
    prisma.membership.create({
      data: { userId: auth.user.id, workspaceId: invitation.workspaceId, role: invitation.role },
    }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
  ]);

  await recordAudit({
    workspaceId: invitation.workspaceId,
    actorUserId: auth.user.id,
    action: "member.invite",
    summary: `${auth.user.name} joined as ${ROLE_LABELS[invitation.role as Role]}.`,
  });

  // Land them in the workspace they just joined, not whichever came first.
  const jar = await cookies();
  jar.set("dropinsight_workspace", invitation.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });

  revalidatePath("/", "layout");
  return ok();
}
