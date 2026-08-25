import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { param, type SearchParams } from "@/lib/params";
import { entitlementsFor } from "@/lib/plans";
import { can } from "@/lib/auth/permissions";
import { isMockAdapter } from "@/lib/ebay";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { AccountsClient } from "./accounts-client";
import { Link2 } from "lucide-react";

export const metadata: Metadata = { title: "eBay accounts" };

export default async function EbayAccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("orders.view");
  const params = await searchParams;

  const [accounts, subscription] = await Promise.all([
    prisma.ebayAccount.findMany({
      where: { workspaceId: auth.workspace.id },
      include: {
        syncJobs: { orderBy: { queuedAt: "desc" }, take: 6 },
        _count: { select: { orders: true } },
      },
      orderBy: [{ status: "asc" }, { connectedAt: "asc" }],
    }),
    prisma.subscription.findUnique({ where: { workspaceId: auth.workspace.id } }),
  ]);

  const active = accounts.filter((a) => a.status !== "DISCONNECTED");
  const entitlements = entitlementsFor({
    plan: subscription?.plan ?? "TRIAL",
    status: subscription?.status ?? "TRIALING",
    trialEndsAt: subscription?.trialEndsAt ?? null,
    accountsUsed: active.length,
  });

  return (
    <PageContainer>
      <PageHeader
        title="eBay accounts"
        description="Connect a store once. Orders, fees, refunds and seller standards then arrive on their own."
        icon={Link2}
      />

      <AccountsClient
        accounts={accounts.map((account) => ({
          id: account.id,
          username: account.username,
          marketplaceId: account.marketplaceId,
          currency: account.currency,
          status: account.status,
          statusDetail: account.statusDetail,
          isMock: account.isMock,
          connectedAt: account.connectedAt.toISOString(),
          lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
          historyFrom: account.historyFrom?.toISOString() ?? null,
          orderCount: account._count.orders,
          sellerLevel: account.sellerLevel,
          lateDispatchRate: account.lateDispatchRate,
          transactionDefectRate: account.transactionDefectRate,
          syncJobs: account.syncJobs.map((job) => ({
            id: job.id,
            type: job.type,
            status: job.status,
            ordersImported: job.ordersImported,
            ordersUpdated: job.ordersUpdated,
            error: job.error,
            queuedAt: job.queuedAt.toISOString(),
            finishedAt: job.finishedAt?.toISOString() ?? null,
          })),
        }))}
        canManage={can(auth.workspace.role, "accounts.manage")}
        entitlements={{
          planName: entitlements.plan.name,
          accountLimit: entitlements.accountLimit,
          accountsUsed: active.length,
          canConnectAnother: entitlements.canConnectAnotherAccount,
          syncingActive: entitlements.syncingActive,
        }}
        usingMockAdapter={isMockAdapter()}
        connectError={param(params, "connect_error") ?? null}
        connectedUsername={param(params, "connected") ?? null}
        autoSyncAll={param(params, "action") === "sync-all"}
      />
    </PageContainer>
  );
}
