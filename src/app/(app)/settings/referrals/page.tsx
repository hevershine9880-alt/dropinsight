import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { ReferralsClient } from "./referrals-client";

export const metadata: Metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const auth = await requirePermission("billing.manage");

  // Created on sign-up, but a workspace seeded before the feature may not have one.
  const referral =
    (await prisma.referral.findUnique({ where: { workspaceId: auth.workspace.id } })) ??
    (await prisma.referral.create({
      data: {
        workspaceId: auth.workspace.id,
        code: `${auth.workspace.name.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10) || "DROP"}-${Math.floor(1000 + Math.random() * 8999)}`,
      },
    }));

  const referred = await prisma.workspace.findMany({
    where: { referral: { referredById: referral.id } },
    select: { id: true, name: true, createdAt: true, subscription: { select: { plan: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <ReferralsClient
      code={referral.code}
      appUrl={process.env.APP_URL ?? "http://localhost:3000"}
      rewardMinor={referral.rewardMinor}
      referred={referred.map((w) => ({
        id: w.id,
        name: w.name,
        joinedAt: w.createdAt.toISOString(),
        plan: w.subscription?.plan ?? "TRIAL",
        status: w.subscription?.status ?? "TRIALING",
      }))}
    />
  );
}
