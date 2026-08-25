import { NextRequest } from "next/server";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { guardExport } from "@/lib/export/guard";
import { buildPnl } from "@/lib/finance/pnl";
import { buildCsv, csvResponse, csvMoney } from "@/lib/export/csv";
import { recordAudit } from "@/lib/audit";
import type { RefundAttribution } from "@/lib/finance/types";

/**
 * Monthly profit & loss CSV — one row per month, so the whole year opens as a
 * table an accountant can pivot.
 */
export async function GET(request: NextRequest) {
  const guard = await guardExport();
  if (!guard.ok) return guard.response;
  const { auth } = guard;

  const months = Math.min(Number(request.nextUrl.searchParams.get("months") ?? 12), 36);
  const currency = auth.workspace.currency;
  const attribution = auth.workspace.refundAttribution as RefundAttribution;

  const rows: unknown[][] = [];

  for (let i = months - 1; i >= 0; i--) {
    const month = subMonths(new Date(), i);
    const period = {
      key: "custom" as const,
      label: format(month, "MMMM yyyy"),
      from: startOfMonth(month),
      to: endOfMonth(month),
      unbounded: false,
    };

    const pnl = await buildPnl(auth.workspace.id, currency, attribution, period);
    const t = pnl.totals;

    rows.push([
      format(month, "yyyy-MM"),
      format(month, "MMMM yyyy"),
      t.orderCount,
      t.pricedOrderCount,
      csvMoney(t.revenueMinor, currency),
      csvMoney(t.shippingIncomeMinor, currency),
      csvMoney(t.costOfGoodsMinor, currency),
      csvMoney(t.ebayFeesMinor, currency),
      csvMoney(t.adFeesMinor, currency),
      csvMoney(t.buyerRefundMinor, currency),
      csvMoney(t.feeCreditMinor, currency),
      csvMoney(t.recoveredMinor, currency),
      csvMoney(t.refundLossMinor, currency),
      csvMoney(t.expensesMinor, currency),
      csvMoney(t.grossProfitMinor, currency),
      csvMoney(t.netProfitMinor, currency),
      t.marginRatio !== null ? (t.marginRatio * 100).toFixed(2) : "",
    ]);
  }

  const csv = buildCsv(
    [
      "Month", "Month name", "Orders", "Orders with a buying price",
      `Revenue (${currency})`, `Postage income (${currency})`, `Cost of goods (${currency})`,
      `eBay fees (${currency})`, `Ad fees (${currency})`, `Refunds to buyers (${currency})`,
      `eBay fee credits (${currency})`, `Recovered from suppliers (${currency})`,
      `Refund losses (${currency})`, `Business expenses (${currency})`,
      `Gross profit (${currency})`, `Net profit (${currency})`, "Margin %",
    ],
    rows,
  );

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "report.export",
    summary: `Exported a ${months}-month profit & loss CSV.`,
  });

  return csvResponse(`dropinsight-monthly-pnl-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
}
