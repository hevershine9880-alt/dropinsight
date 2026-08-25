import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/guard";
import { GeneralSettingsForm } from "./general-form";
import type { RefundAttribution } from "@/lib/finance/types";

export const metadata: Metadata = { title: "General settings" };

export default async function GeneralSettingsPage() {
  const auth = await requirePermission("settings.manage");

  return (
    <GeneralSettingsForm
      name={auth.workspace.name}
      currency={auth.workspace.currency}
      refundAttribution={auth.workspace.refundAttribution as RefundAttribution}
    />
  );
}
