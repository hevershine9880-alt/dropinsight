import { NextRequest } from "next/server";
import { format } from "date-fns";
import { guardExport } from "@/lib/export/guard";
import { queryProducts } from "@/lib/finance/products-query";
import { periodFrom, type SearchParams } from "@/lib/params";
import { buildCsv, csvResponse, csvMoney } from "@/lib/export/csv";
import { recordAudit } from "@/lib/audit";

/** Product performance CSV — cost history, sale price, units, profit, refunds per SKU. */
export async function GET(request: NextRequest) {
  const guard = await guardExport();
  if (!guard.ok) return guard.response;
  const { auth } = guard;

  const params: SearchParams = Object.fromEntries(request.nextUrl.searchParams);
  const period = periodFrom(params, "all_time");
  const currency = auth.workspace.currency;

  const products = await queryProducts(auth.workspace.id, period, { sort: "profit", direction: "desc", currency });

  const csv = buildCsv(
    [
      "Product", "SKU", "Suppliers", "Units sold", "Orders",
      `Revenue (${currency})`, `Average sale price (${currency})`,
      `Last buying price (${currency})`, `Lowest cost (${currency})`, `Highest cost (${currency})`,
      `Break-even price (${currency})`, `Currently listed at (${currency})`,
      `Total profit (${currency})`, "Margin %", "Refunds", "Refund rate %",
      "Order lines still needing a cost",
    ],
    products.map((p) => [
      p.title,
      p.sku ?? "",
      p.supplierNames.join("; "),
      p.unitsSold,
      p.orderCount,
      csvMoney(p.revenueMinor, currency),
      csvMoney(p.avgSaleMinor, currency),
      p.lastCostMinor !== null ? csvMoney(p.lastCostMinor, currency) : "",
      p.costRange ? csvMoney(p.costRange.minMinor, currency) : "",
      p.costRange ? csvMoney(p.costRange.maxMinor, currency) : "",
      p.breakEvenMinor !== null ? csvMoney(p.breakEvenMinor, currency) : "",
      csvMoney(p.currentPriceMinor, currency),
      csvMoney(p.profitMinor, currency),
      p.marginRatio !== null ? (p.marginRatio * 100).toFixed(2) : "",
      p.refundCount,
      (p.refundRate * 100).toFixed(2),
      p.unpricedLines,
    ]),
  );

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "report.export",
    summary: `Exported ${products.length} products as CSV.`,
  });

  return csvResponse(`dropinsight-products-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
}
