import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { PageContainer } from "@/components/shell/page-header";
import { RuleBuilder } from "../rule-builder";
import { parseConditions, parseActions } from "@/lib/automation/types";

export const metadata: Metadata = { title: "Edit automation" };

export default async function EditAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePermission("automation.manage");
  const { id } = await params;

  const rule = await prisma.automationRule.findFirst({
    where: { id, workspaceId: auth.workspace.id },
  });
  if (!rule) notFound();

  return (
    <PageContainer>
      <RuleBuilder
        rule={{
          id: rule.id,
          name: rule.name,
          description: rule.description,
          trigger: rule.trigger,
          conditions: parseConditions(rule.conditions),
          actions: parseActions(rule.actions),
          enabled: rule.enabled,
        }}
      />
    </PageContainer>
  );
}
