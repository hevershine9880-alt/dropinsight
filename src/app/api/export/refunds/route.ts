import { NextRequest } from "next/server";
import { format } from "date-fns";
import { guardExport } from "@/lib/export/guard";
import { queryRefunds } from "@/lib/finance/refunds-query";
import { periodFrom, type SearchParams } from "@/lib/params";
import { buildCsv, csvResponse, csvMoney } from "@/lib/export/csv";
import { recordAudit } from "@/lib/audit";
import { SUPPLIER_CLAIM_LABELS, type SupplierClaim } from "@/lib/finance/types";

/** Refunds and recovery CSV — the loss ledger, with the supplier side attached. */
export async function GET(request: NextRequest) {
  const guard = await guardExport();
  if (!guard.ok) return guard.response;
  const { auth } = guard;

  const params: SearchParams = Object.fromEntries(request.nextUrl.searchParams);
  const period = periodFrom(params, "all_time");
  const currency = auth.workspace.currency;

  const result = await queryRefunds({
    workspaceId: auth.workspace.id,
    period,
    tab: "refunds",
    claimTab: "all",
    accountIds: [],
    reasons: [],
    search: "",
    page: 1,
    pageSize: 10_000,
  });

  const csv = buildCsv(
    [
      "Order number", "eBay account", "Buyer", "Item", "SKU", "Type", "Reason",
      "Ordered", "Refunded", "Days open",
      `Buyer refund (${currency})`, `eBay fee credit (${currency})`,
      `Recovered from supplier (${currency})`, `Still recoverable (${currency})`,
      "Supplier claim", "Supplier", "Promised by",
    ],
    result.rows.map((r) => [
      r.ebayOrderId,
      r.accountUsername,
      r.buyerUsername,
      r.productTitle,
      r.productSku ?? "",
      r.type,
      r.reason ?? "",
      format(r.orderedAt, "yyyy-MM-dd"),
      format(r.refundedAt, "yyyy-MM-dd"),
      r.ageDays,
      csvMoney(r.buyerRefundMinor, currency),
      csvMoney(r.feeCreditMinor, currency),
      csvMoney(r.recoveredMinor, currency),
      csvMoney(r.recoverableMinor, currency),
      SUPPLIER_CLAIM_LABELS[r.supplierClaim as SupplierClaim] ?? r.supplierClaim,
      r.supplierName ?? "",
      r.promisedByDate ? format(r.promisedByDate, "yyyy-MM-dd") : "",
    ]),
  );

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "report.export",
    summary: `Exported ${result.rows.length} refunds as CSV.`,
  });

  return csvResponse(`dropinsight-refunds-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
}
