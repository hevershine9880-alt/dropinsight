import { NextRequest } from "next/server";
import { format } from "date-fns";
import { prisma } from "@/lib/db/client";
import { guardExport } from "@/lib/export/guard";
import { periodFrom, type SearchParams } from "@/lib/params";
import { buildCsv, csvResponse, csvMoney } from "@/lib/export/csv";
import { recordAudit } from "@/lib/audit";

/** Expenses CSV — monthly business costs by category, for bookkeeping. */
export async function GET(request: NextRequest) {
  const guard = await guardExport();
  if (!guard.ok) return guard.response;
  const { auth } = guard;

  const params: SearchParams = Object.fromEntries(request.nextUrl.searchParams);
  const period = periodFrom(params, "all_time");
  const currency = auth.workspace.currency;

  const expenses = await prisma.expense.findMany({
    where: {
      workspaceId: auth.workspace.id,
      ...(period.unbounded ? {} : { date: { gte: period.from, lte: period.to } }),
    },
    orderBy: { date: "desc" },
    include: { ebayAccount: { select: { username: true } } },
  });

  const csv = buildCsv(
    ["Date", "Month", "Category", "Description", `Amount (${currency})`, "Recurring", "Source", "eBay account"],
    expenses.map((e) => [
      format(e.date, "yyyy-MM-dd"),
      format(e.date, "yyyy-MM"),
      e.category,
      e.description,
      csvMoney(e.amountMinor, e.currency),
      e.recurring ? "yes" : "no",
      e.source === "EBAY" ? "Imported from eBay" : "Entered by hand",
      e.ebayAccount?.username ?? "",
    ]),
  );

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "report.export",
    summary: `Exported ${expenses.length} expenses as CSV.`,
  });

  return csvResponse(`dropinsight-expenses-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
}
