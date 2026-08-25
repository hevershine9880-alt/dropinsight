import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { param, type SearchParams } from "@/lib/params";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { AlertsList } from "./alerts-list";
import { Bell } from "lucide-react";

export const metadata: Metadata = { title: "Alerts" };

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("orders.view");
  const params = await searchParams;
  const filter = param(params, "filter") ?? "all";

  const where = {
    workspaceId: auth.workspace.id,
    ...(filter === "unread" ? { readAt: null } : {}),
    ...(filter === "critical" ? { severity: { in: ["CRITICAL", "WARNING"] } } : {}),
  };

  const [notifications, counts] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.notification.groupBy({
      by: ["severity"],
      where: { workspaceId: auth.workspace.id },
      _count: true,
    }),
  ]);

  const unread = await prisma.notification.count({
    where: { workspaceId: auth.workspace.id, readAt: null },
  });
  const total = counts.reduce((s, c) => s + c._count, 0);
  const important = counts
    .filter((c) => c.severity !== "INFO")
    .reduce((s, c) => s + c._count, 0);

  return (
    <PageContainer>
      <PageHeader
        title="Alerts"
        description="Sync failures, refunds needing an answer, thin margins and anything your automations raise."
        icon={Bell}
      />

      <AlertsList
        notifications={notifications.map((n) => ({
          id: n.id,
          type: n.type,
          severity: n.severity,
          title: n.title,
          body: n.body,
          actionLabel: n.actionLabel,
          actionHref: n.actionHref,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        }))}
        counts={{ all: total, unread, critical: important }}
        filter={filter}
      />
    </PageContainer>
  );
}
