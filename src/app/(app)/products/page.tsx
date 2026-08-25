import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/guard";
import { queryProducts } from "@/lib/finance/products-query";
import { periodFrom, param, sortFrom, type SearchParams } from "@/lib/params";
import { can } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PeriodPicker } from "@/components/table/period-picker";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ProductsTable } from "./products-table";
import { ListingHealthSummary } from "./listing-health-summary";
import { LISTING_VERDICTS, type ListingVerdict } from "@/lib/finance/listing-health";
import { Package } from "lucide-react";

export const metadata: Metadata = { title: "Listings" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("orders.view");
  const params = await searchParams;

  return (
    <PageContainer>
      <PageHeader
        title="Listings"
        description="Every product you sell, with a verdict on each: what is winning, what is losing money, and what to do about it."
        icon={Package}
        actions={<PeriodPicker options={["last30", "this_month", "last_month", "all_time"]} defaultPeriod="all_time" />}
      />

      <Suspense key={JSON.stringify(params)} fallback={<div className="card overflow-hidden pt-4"><TableSkeleton rows={10} columns={8} /></div>}>
        <ProductsBody
          workspaceId={auth.workspace.id}
          currency={auth.workspace.currency}
          canWriteCosts={can(auth.workspace.role, "costs.write")}
          params={params}
        />
      </Suspense>
    </PageContainer>
  );
}

async function ProductsBody({
  workspaceId, currency, canWriteCosts, params,
}: {
  workspaceId: string;
  currency: string;
  canWriteCosts: boolean;
  params: SearchParams;
}) {
  const period = periodFrom(params, "all_time");
  const sort = sortFrom(params, ["profit", "revenue", "sold", "margin", "refunds", "title"], {
    key: "profit",
    direction: "desc",
  });

  const all = await queryProducts(workspaceId, period, {
    search: param(params, "search"),
    sort: sort.key,
    direction: sort.direction,
    currency,
  });

  // The summary always counts every listing; only the table narrows, so the
  // tiles keep telling the truth while a filter is applied.
  const healthParam = param(params, "health");
  const health = (LISTING_VERDICTS as readonly string[]).includes(healthParam ?? "")
    ? (healthParam as ListingVerdict)
    : null;
  const rows = health ? all.filter((p) => p.health.verdict === health) : all;

  return (
    <>
      <ListingHealthSummary products={all} currency={currency} />
      <ProductsTable
        rows={rows}
        currency={currency}
        sort={sort}
        canWriteCosts={canWriteCosts}
        activeVerdict={health}
        totalCount={all.length}
      />
    </>
  );
}
