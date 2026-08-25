import { redirect } from "next/navigation";
import { format } from "date-fns";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { entitlementsFor } from "@/lib/plans";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Loads everything the chrome needs in one pass: sidebar counts, connection
 * health, plan state and the unread badge. Doing it here rather than in each
 * page means one round of queries per navigation, not one per component.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();

  // A workspace that has not finished onboarding has nothing to show yet.
  if (auth.workspace.onboardingStep !== "DONE") redirect("/onboarding");

  const workspaceId = auth.workspace.id;

  const [
    ordersAwaitingCost, refundsNeedingAnswer, unreadAlerts, accounts, subscription,
  ] = await Promise.all([
    // Every nav badge means the same thing: work waiting on you. A total that
    // only ever grows (2,325 orders) tells a reader nothing and sits in the
    // same column as counts that do need acting on.
    prisma.order.count({
      where: {
        workspaceId,
        cancelState: { not: "CANCELLED_BEFORE_FULFILMENT" },
        items: { some: { costs: { none: {} } } },
      },
    }),
    prisma.refund.count({
      where: { order: { workspaceId }, supplierClaim: { in: ["NOT_ASKED", "ASKED", "PROMISED"] } },
    }),
    prisma.notification.count({ where: { workspaceId, readAt: null } }),
    prisma.ebayAccount.findMany({
      where: { workspaceId, status: { not: "DISCONNECTED" } },
      select: { id: true, username: true, status: true, isMock: true },
      orderBy: { connectedAt: "asc" },
    }),
    prisma.subscription.findUnique({ where: { workspaceId } }),
  ]);

  const entitlements = entitlementsFor({
    plan: subscription?.plan ?? "TRIAL",
    status: subscription?.status ?? "TRIALING",
    trialEndsAt: subscription?.trialEndsAt ?? null,
    accountsUsed: accounts.length,
  });

  return (
    <AppShell
      auth={auth}
      counts={{
        orders: ordersAwaitingCost,
        refunds: refundsNeedingAnswer,
        alerts: unreadAlerts,
        accounts: accounts.filter((a) => a.status !== "CONNECTED").length,
      }}
      connections={accounts}
      plan={{
        plan: entitlements.plan.id,
        status: subscription?.status ?? "TRIALING",
        accountsUsed: accounts.length,
        accountLimit: entitlements.accountLimit,
        trialEndsAt: entitlements.trialDaysLeft === null ? null : String(entitlements.trialDaysLeft),
        renewsAt: subscription?.currentPeriodEnd ? format(subscription.currentPeriodEnd, "d MMM yyyy") : null,
      }}
      unreadCount={unreadAlerts}
      syncingActive={entitlements.syncingActive}
    >
      {children}
    </AppShell>
  );
}
