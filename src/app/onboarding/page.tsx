import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { isMockAdapter } from "@/lib/ebay";
import { can } from "@/lib/auth/permissions";
import { OnboardingFlow } from "./onboarding-flow";
import type { RefundAttribution } from "@/lib/finance/types";

export const metadata: Metadata = { title: "Set up DropInsight" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; account?: string }>;
}) {
  const auth = await requireAuth();
  const { step, account } = await searchParams;

  // A workspace that has finished has no onboarding to show — unless someone
  // deep-links back into it, in which case send them home.
  if (auth.workspace.onboardingStep === "DONE" && !step) redirect("/dashboard");

  // Only an owner or manager can complete setup; everyone else waits.
  if (!can(auth.workspace.role, "accounts.manage")) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">This workspace is still being set up</h1>
          <p className="mt-2 text-md text-ink-muted">
            An owner or manager needs to connect an eBay account before there is anything to see.
            You will be able to get in as soon as they have.
          </p>
        </div>
      </main>
    );
  }

  const [accounts, orderCount, latestJob] = await Promise.all([
    prisma.ebayAccount.findMany({
      where: { workspaceId: auth.workspace.id, status: { not: "DISCONNECTED" } },
      select: { id: true, username: true, marketplaceId: true, currency: true, lastSyncAt: true },
      orderBy: { connectedAt: "asc" },
    }),
    prisma.order.count({ where: { workspaceId: auth.workspace.id } }),
    prisma.syncJob.findFirst({
      where: { workspaceId: auth.workspace.id },
      orderBy: { queuedAt: "desc" },
      select: { id: true, status: true, type: true, ordersImported: true, error: true },
    }),
  ]);

  return (
    <OnboardingFlow
      workspaceName={auth.workspace.name}
      userName={auth.user.name}
      currency={auth.workspace.currency}
      refundAttribution={auth.workspace.refundAttribution as RefundAttribution}
      accounts={accounts.map((a) => ({
        id: a.id,
        username: a.username,
        marketplaceId: a.marketplaceId,
        currency: a.currency,
        lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
      }))}
      orderCount={orderCount}
      latestJob={latestJob}
      usingMockAdapter={isMockAdapter()}
      initialStep={step ?? null}
      justConnectedAccountId={account ?? null}
    />
  );
}
