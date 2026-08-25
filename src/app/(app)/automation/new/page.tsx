import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/guard";
import { PageContainer } from "@/components/shell/page-header";
import { RuleBuilder } from "../rule-builder";

export const metadata: Metadata = { title: "New automation" };

export default async function NewAutomationPage() {
  await requirePermission("automation.manage");
  return (
    <PageContainer>
      <RuleBuilder />
    </PageContainer>
  );
}
