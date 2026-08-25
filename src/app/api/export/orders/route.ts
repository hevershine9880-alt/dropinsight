import { NextRequest } from "next/server";
import { format } from "date-fns";
import { getAuth } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { queryOrders, ORDER_TABS, FULFILMENT_FILTERS, type OrderTab, type FulfilmentFilter } from "@/lib/finance/orders-query";
import { periodFrom, param, paramList, type SearchParams } from "@/lib/params";
import { buildCsv, csvResponse, csvMoney } from "@/lib/export/csv";
import { recordAudit } from "@/lib/audit";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

/**
 * Orders CSV — one row per order, with fees, supplier cost, refunds, profit and
 * margin. Honours whatever filters the user had applied, so "export" means
 * "export what I am looking at".
 */
export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || !can(auth.workspace.role, "reports.download")) {
    return new Response("Your role cannot download reports.", { status: 403 });
  }

  const limit = rateLimit(`export:${auth.user.id}`, LIMITS.export.limit, LIMITS.export.windowMs);
  if (!limit.ok) {
    return new Response(`Too many exports. Try again in ${limit.retryAfterSeconds} seconds.`, { status: 429 });
  }

  const params: SearchParams = Object.fromEntries(request.nextUrl.searchParams);
  const period = periodFrom(params, "last30");
  const tabParam = param(params, "tab");

  const result = await queryOrders({
    workspaceId: auth.workspace.id,
    period,
    tab: (ORDER_TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as OrderTab) : "all",
    fulfilment: paramList(params, "fulfilment").filter((f): f is FulfilmentFilter =>
      (FULFILMENT_FILTERS as readonly string[]).includes(f),
    ),
    accountIds: paramList(params, "accounts"),
    search: param(params, "search") ?? "",
    page: 1,
    // Exports are bounded so one request cannot pull an unbounded result set.
    pageSize: 10_000,
    sort: { key: "date", direction: "desc" },
  });

  const currency = auth.workspace.currency;
  const csv = buildCsv(
    [
      "Order number", "Order date", "eBay account", "Buyer", "Items", "Product",
      "SKU", "Status", "Payment status",
      `Item sales (${currency})`, `Postage charged (${currency})`, `Revenue (${currency})`,
      `eBay fees (${currency})`, `Ad fees (${currency})`, `Supplier cost (${currency})`,
      `Buyer refund (${currency})`, `Fee credit (${currency})`, `Recovered from supplier (${currency})`,
      `Refund loss (${currency})`, `Gross profit (${currency})`, `Net profit (${currency})`,
      "Margin %", "Has buying price", "Tracking number",
    ],
    result.rows.map((row) => [
      row.ebayOrderId,
      format(row.orderDate, "yyyy-MM-dd HH:mm"),
      row.accountUsername,
      row.buyerUsername,
      row.itemCount,
      row.firstItemTitle,
      row.firstItemSku ?? "",
      row.cancelState !== "NONE" ? "Cancelled" : row.fulfillmentStatus,
      row.paymentStatus,
      csvMoney(row.profit.itemSubtotalMinor, currency),
      csvMoney(row.profit.shippingChargedMinor, currency),
      csvMoney(row.profit.revenueMinor, currency),
      csvMoney(row.profit.ebayFeesMinor, currency),
      csvMoney(row.profit.adFeesMinor, currency),
      row.profit.isPriced ? csvMoney(row.profit.costOfGoodsMinor, currency) : "",
      csvMoney(row.profit.buyerRefundMinor, currency),
      csvMoney(row.profit.feeCreditMinor, currency),
      csvMoney(row.profit.recoveredMinor, currency),
      csvMoney(row.profit.refundLossMinor, currency),
      row.profit.isPriced ? csvMoney(row.profit.grossProfitMinor, currency) : "",
      row.profit.isPriced ? csvMoney(row.profit.netProfitMinor, currency) : "",
      // Margin is only meaningful once the supplier cost is known.
      row.profit.isPriced && row.profit.marginRatio !== null
        ? (row.profit.marginRatio * 100).toFixed(2)
        : "",
      row.profit.isPriced ? "yes" : "no",
      row.trackingNumber ?? "",
    ]),
  );

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "report.export",
    summary: `Exported ${result.rows.length} orders as CSV.`,
    metadata: { rows: result.rows.length, period: period.label },
  });

  return csvResponse(`dropinsight-orders-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
}
