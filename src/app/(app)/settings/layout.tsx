import { requireAuth } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { SettingsTabs } from "./settings-tabs";
import { Settings } from "lucide-react";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  const role = auth.workspace.role;

  const tabs = [
    { href: "/settings", label: "General", show: can(role, "settings.manage") },
    { href: "/settings/profile", label: "Your profile", show: true },
    { href: "/settings/team", label: "Team", show: can(role, "team.manage") },
    { href: "/settings/connections", label: "Connections", show: can(role, "accounts.manage") },
    { href: "/settings/billing", label: "Billing", show: can(role, "billing.manage") },
    { href: "/settings/referrals", label: "Referrals", show: can(role, "billing.manage") },
    { href: "/settings/activity", label: "Activity", show: can(role, "settings.manage") },
  ].filter((tab) => tab.show);

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Workspace, team and integrations." icon={Settings} />
      <SettingsTabs tabs={tabs} />
      {children}
    </PageContainer>
  );
}
