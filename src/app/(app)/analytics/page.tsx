import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/guard";
import { periodFrom, type SearchParams } from "@/lib/params";
import { loadOrders, totalsForPeriod, profitOf, periodOrderWhere } from "@/lib/finance/aggregate";
import { bucketsFor, describePeriod } from "@/lib/finance/periods";
import { querySuppliers, queryProducts } from "@/lib/finance/products-query";
import type { RefundAttribution } from "@/lib/finance/types";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PeriodPicker } from "@/components/table/period-picker";
import { AnalyticsTrends } from "./analytics-trends";
import { ProfitableProducts } from "./profitable-products";
import { SupplierComparison } from "./supplier-comparison";
import { CategoryBreakdown } from "./category-breakdown";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requirePermission("analytics.view");
  const params = await searchParams;

  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        description="Profit, revenue, refund and return trends. Product and supplier performance."
        icon={BarChart3}
        actions={
          <PeriodPicker
            options={["today", "last7", "last14", "last30", "this_month", "last_month"]}
            defaultPeriod="last30"
          />
        }
      />

      <Suspense key={JSON.stringify(params)} fallback={<AnalyticsSkeleton />}>
        <AnalyticsBody
          workspaceId={auth.workspace.id}
          currency={auth.workspace.currency}
          attribution={auth.workspace.refundAttribution as RefundAttribution}
          params={params}
        />
      </Suspense>
    </PageContainer>
  );
}

async function AnalyticsBody({
  workspaceId, currency, attribution, params,
}: {
  workspaceId: string;
  currency: string;
  attribution: RefundAttribution;
  params: SearchParams;
}) {
  const period = periodFrom(params, "last30");

  const [orders, suppliers, products] = await Promise.all([
    loadOrders(periodOrderWhere(workspaceId, period, attribution)),
    querySuppliers(workspaceId, period),
    queryProducts(workspaceId, period, { sort: "profit", direction: "desc", currency }),
  ]);

  const trend = bucketsFor(period).map((bucket) => {
    const t = totalsForPeriod(
      orders,
      { key: "custom", label: bucket.label, from: bucket.from, to: bucket.to, unbounded: false },
      attribution,
      currency,
      0,
    );
    return {
      label: bucket.label,
      profit: t.grossProfitMinor - t.refundLossMinor,
      revenue: t.revenueMinor,
      refunds: t.refundLossMinor,
      returns: t.refundCount,
      orders: t.orderCount,
    };
  });

  // Category comes from the catalogue via the product title, so it is derived
  // rather than stored — good enough for a breakdown, and honest about it.
  const byCategory = new Map<string, { revenueMinor: number; profitMinor: number; units: number }>();
  for (const order of orders) {
    if (order.orderDate < period.from || order.orderDate > period.to) continue;
    if (order.cancelState === "CANCELLED_BEFORE_FULFILMENT") continue;
    const p = profitOf(order);
    if (!p.isPriced) continue;
    const lineCount = order.items.length || 1;

    for (const item of order.items) {
      const category = categoryFor(item.title);
      const bucket = byCategory.get(category) ?? { revenueMinor: 0, profitMinor: 0, units: 0 };
      bucket.revenueMinor += item.unitPriceMinor * item.quantity;
      bucket.profitMinor += Math.round(p.netProfitMinor / lineCount);
      bucket.units += item.quantity;
      byCategory.set(category, bucket);
    }
  }

  const categories = [...byCategory.entries()]
    .map(([category, v]) => ({
      category,
      ...v,
      marginRatio: v.revenueMinor > 0 ? v.profitMinor / v.revenueMinor : null,
    }))
    .sort((a, b) => b.profitMinor - a.profitMinor);

  const priced = products.filter((p) => p.lastCostMinor !== null && p.unitsSold > 0);

  // "Most profitable" ranks by total profit — that is where the money comes
  // from. "Weakest margins" must rank by margin, not by total: a product that
  // sold twice at 58% margin is not your worst performer, it is just small.
  // A minimum unit count keeps one-off sales out of the bottom list.
  const MIN_UNITS_FOR_MARGIN_RANK = 3;
  const weakest = priced
    .filter((p) => p.unitsSold >= MIN_UNITS_FOR_MARGIN_RANK && p.marginRatio !== null)
    .sort((a, b) => (a.marginRatio ?? 0) - (b.marginRatio ?? 0));

  return (
    <>
      <AnalyticsTrends data={trend} currency={currency} periodLabel={describePeriod(period)} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ProfitableProducts
          title="Most profitable"
          description="Your best earners in this window."
          products={priced.slice(0, 6)}
          currency={currency}
          tone="positive"
        />
        <ProfitableProducts
          title="Weakest margins"
          description={`Thinnest margin per sale, across products with at least ${MIN_UNITS_FOR_MARGIN_RANK} units sold. Worth re-pricing or dropping.`}
          products={weakest.slice(0, 6)}
          currency={currency}
          tone="negative"
          emptyDescription="No product has sold enough yet to rank its margin fairly."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CategoryBreakdown categories={categories} currency={currency} />
        <SupplierComparison suppliers={suppliers.filter((s) => s.orderLineCount > 0)} currency={currency} />
      </div>
    </>
  );
}

/**
 * Category from the product title.
 *
 * eBay's own category is not exposed on the Fulfillment order payload, so this
 * derives one from keywords. It is a presentation aid, never used in a
 * financial calculation.
 */
const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ["Electronics", /headphone|speaker|power bank|watch|doorbell|charger|bluetooth|voltmeter|hdmi|adapter/i],
  ["Computing", /laptop|usb|cable|mouse|keyboard|sleeve/i],
  ["Home & Garden", /kitchen|fridge|storage|lamp|shower|wallpaper|curtain|bottle|clip|seal|mat/i],
  ["Automotive", /car |tyre|valve|engine|wrench|bumper|vehicle/i],
  ["Fashion", /sunglass|shoe|trainer|strap|bracelet|jewel|silver|watch band/i],
  ["Health & Beauty", /hair|brush|nose|snoring|nail|beauty/i],
  ["Toys & Games", /toy|rocket|sand play|game|children|kids/i],
  ["Sports & Outdoors", /camping|tent|bike|kayak|outdoor|sport|flask/i],
  ["DIY & Tools", /tool|wrench|nut|bolt|adhesive|glue|drill|pipe/i],
];

function categoryFor(title: string): string {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(title)) return category;
  }
  return "Other";
}

function AnalyticsSkeleton() {
  return (
    <>
      <div className="card h-96" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card h-72" />
        <div className="card h-72" />
      </div>
    </>
  );
}
