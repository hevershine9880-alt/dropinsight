import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { generateInsights } from "@/lib/insights";
import { param, type SearchParams } from "@/lib/params";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { InsightsList } from "./insights-list";
import { Lightbulb } from "lucide-react";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("dashboard.view");
  const params = await searchParams;
  const showDismissed = param(params, "show") === "dismissed";

  // Generate on first visit so the page is never empty for want of a cron tick.
  const existing = await prisma.insight.count({ where: { workspaceId: auth.workspace.id } });
  if (existing === 0) await generateInsights(auth.workspace.id);

  const insights = await prisma.insight.findMany({
    where: {
      workspaceId: auth.workspace.id,
      ...(showDismissed ? { dismissedAt: { not: null } } : { dismissedAt: null }),
    },
    orderBy: [{ severity: "asc" }, { generatedAt: "desc" }],
  });

  const dismissedCount = await prisma.insight.count({
    where: { workspaceId: auth.workspace.id, dismissedAt: { not: null } },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Insights"
        description="Automatic findings: declining margins, rising supplier costs, refund-prone products and prices below break-even."
        icon={Lightbulb}
      />

      <InsightsList
        insights={insights.map((i) => ({
          id: i.id,
          kind: i.kind,
          severity: i.severity,
          title: i.title,
          body: i.body,
          actionHref: i.actionHref,
          generatedAt: i.generatedAt.toISOString(),
          dismissed: i.dismissedAt !== null,
        }))}
        showDismissed={showDismissed}
        dismissedCount={dismissedCount}
      />
    </PageContainer>
  );
}
