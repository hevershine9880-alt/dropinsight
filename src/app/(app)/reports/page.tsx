import type { Metadata } from "next";
import { format, subMonths, startOfMonth } from "date-fns";
import { requirePermission } from "@/lib/auth/guard";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ReportsClient } from "./reports-client";
import { FileText } from "lucide-react";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const auth = await requirePermission("reports.download");

  // Twelve months back, so the picker offers only months that could hold data.
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = startOfMonth(subMonths(new Date(), i));
    return { value: format(date, "yyyy-MM"), label: format(date, "MMMM yyyy") };
  });

  return (
    <PageContainer>
      <PageHeader
        title="Reports"
        description="Accountant-ready exports of orders, monthly P&L, products, refunds and expenses."
        icon={FileText}
      />
      <ReportsClient months={months} currency={auth.workspace.currency} />
    </PageContainer>
  );
}
