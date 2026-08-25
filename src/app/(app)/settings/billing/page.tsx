import type { Metadata } from "next";
import { format } from "date-fns";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { entitlementsFor } from "@/lib/plans";
import { startOfMonth } from "date-fns";
import { BillingClient } from "./billing-client";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const auth = await requirePermission("billing.manage");

  const [subscription, accountsUsed, ordersThisMonth] = await Promise.all([
    prisma.subscription.findUnique({ where: { workspaceId: auth.workspace.id } }),
    prisma.ebayAccount.count({ where: { workspaceId: auth.workspace.id, status: { not: "DISCONNECTED" } } }),
    prisma.order.count({
      where: { workspaceId: auth.workspace.id, orderDate: { gte: startOfMonth(new Date()) } },
    }),
  ]);

  const entitlements = entitlementsFor({
    plan: subscription?.plan ?? "TRIAL",
    status: subscription?.status ?? "TRIALING",
    trialEndsAt: subscription?.trialEndsAt ?? null,
    accountsUsed,
  });

  return (
    <BillingClient
      planId={entitlements.plan.id}
      planName={entitlements.plan.name}
      status={subscription?.status ?? "TRIALING"}
      interval={subscription?.interval ?? "MONTHLY"}
      trialDaysLeft={entitlements.trialDaysLeft}
      renewsAt={subscription?.currentPeriodEnd ? format(subscription.currentPeriodEnd, "d MMMM yyyy") : null}
      cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
      accountsUsed={accountsUsed}
      accountLimit={entitlements.accountLimit}
      ordersThisMonth={ordersThisMonth}
      stripeConfigured={Boolean(process.env.STRIPE_SECRET_KEY)}
    />
  );
}
