import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { AutomationList } from "./automation-list";
import { Workflow, Plus } from "lucide-react";

export const metadata: Metadata = { title: "Automation" };

export default async function AutomationPage() {
  const auth = await requirePermission("automation.manage");

  const rules = await prisma.automationRule.findMany({
    where: { workspaceId: auth.workspace.id },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
  });

  return (
    <PageContainer>
      <PageHeader
        title="Automation"
        description="Rules that watch your orders and raise the things you would otherwise miss. Nothing here refunds a buyer, messages anyone or changes a listing."
        icon={Workflow}
        actions={
          <Link
            href="/automation/new"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-base font-medium text-white transition-colors hover:bg-brand-hover"
          >
            <Plus className="size-4" aria-hidden />
            New automation
          </Link>
        }
      />

      <AutomationList
        rules={rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          trigger: rule.trigger,
          conditions: rule.conditions,
          actions: rule.actions,
          enabled: rule.enabled,
          runCount: rule.runCount,
          lastRunAt: rule.lastRunAt?.toISOString() ?? null,
          runs: rule.runs.map((run) => ({
            id: run.id,
            status: run.status,
            message: run.message,
            createdAt: run.createdAt.toISOString(),
          })),
        }))}
      />
    </PageContainer>
  );
}
