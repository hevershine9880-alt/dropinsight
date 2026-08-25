import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { entitlementsFor } from "@/lib/plans";
import { TeamClient } from "./team-client";
import { RoleMatrix } from "./role-matrix";
import type { Role } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamSettingsPage() {
  const auth = await requirePermission("team.manage");

  const [memberships, invitations, subscription, accountsUsed] = await Promise.all([
    prisma.membership.findMany({
      where: { workspaceId: auth.workspace.id },
      include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { workspaceId: auth.workspace.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subscription.findUnique({ where: { workspaceId: auth.workspace.id } }),
    prisma.ebayAccount.count({ where: { workspaceId: auth.workspace.id, status: { not: "DISCONNECTED" } } }),
  ]);

  const entitlements = entitlementsFor({
    plan: subscription?.plan ?? "TRIAL",
    status: subscription?.status ?? "TRIALING",
    trialEndsAt: subscription?.trialEndsAt ?? null,
    accountsUsed,
  });

  return (
    <>
      <TeamClient
        currentUserId={auth.user.id}
        members={memberships.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          avatarColor: m.user.avatarColor,
          role: m.role as Role,
        }))}
        invitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role as Role,
          expiresAt: i.expiresAt.toISOString(),
        }))}
        canUseTeam={entitlements.canUseTeam}
        planName={entitlements.plan.name}
      />
      <RoleMatrix />
    </>
  );
}
