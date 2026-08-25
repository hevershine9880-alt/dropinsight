import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/guard";
import { querySuppliers } from "@/lib/finance/products-query";
import { periodFrom, type SearchParams } from "@/lib/params";
import { can } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PeriodPicker } from "@/components/table/period-picker";
import { TableSkeleton } from "@/components/ui/skeleton";
import { SuppliersTable } from "./suppliers-table";
import { Truck } from "lucide-react";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("orders.view");
  const params = await searchParams;

  return (
    <PageContainer>
      <PageHeader
        title="Suppliers"
        description="Where your money goes — spend, order volume, average unit cost and how reliably each one settles a refund claim."
        icon={Truck}
        actions={<PeriodPicker options={["last30", "this_month", "last_month", "all_time"]} defaultPeriod="all_time" />}
      />

      <Suspense key={JSON.stringify(params)} fallback={<div className="card overflow-hidden pt-4"><TableSkeleton rows={6} columns={7} /></div>}>
        <SuppliersBody
          workspaceId={auth.workspace.id}
          currency={auth.workspace.currency}
          canManage={can(auth.workspace.role, "products.manage")}
          params={params}
        />
      </Suspense>
    </PageContainer>
  );
}

async function SuppliersBody({
  workspaceId, currency, canManage, params,
}: {
  workspaceId: string;
  currency: string;
  canManage: boolean;
  params: SearchParams;
}) {
  const period = periodFrom(params, "all_time");
  const rows = await querySuppliers(workspaceId, period);
  return <SuppliersTable rows={rows} currency={currency} canManage={canManage} />;
}
