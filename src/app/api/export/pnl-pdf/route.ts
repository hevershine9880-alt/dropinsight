import { NextRequest } from "next/server";
import { format, startOfMonth, endOfMonth, parse, isValid } from "date-fns";
import { guardExport } from "@/lib/export/guard";
import { buildPnl } from "@/lib/finance/pnl";
import { PdfDocument, pdfResponse } from "@/lib/export/pdf";
import { formatMoney, formatPercent } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import { REFUND_ATTRIBUTION_COPY, type RefundAttribution } from "@/lib/finance/types";
import { prisma } from "@/lib/db/client";

/**
 * The monthly P&L statement as a one-page PDF. (R14.2)
 *
 * Includes the refund-attribution note, because a statement that dates its
 * refund losses one way and is read as if it dated them the other way is worse
 * than no statement.
 */
export async function GET(request: NextRequest) {
  const guard = await guardExport();
  if (!guard.ok) return guard.response;
  const { auth } = guard;

  const monthParam = request.nextUrl.searchParams.get("month");
  const parsed = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const month = isValid(parsed) ? parsed : new Date();

  const period = {
    key: "custom" as const,
    label: format(month, "MMMM yyyy"),
    from: startOfMonth(month),
    to: endOfMonth(month),
    unbounded: false,
  };

  const currency = auth.workspace.currency;
  const attribution = auth.workspace.refundAttribution as RefundAttribution;

  const [pnl, workspace] = await Promise.all([
    buildPnl(auth.workspace.id, currency, attribution, period),
    prisma.workspace.findUniqueOrThrow({ where: { id: auth.workspace.id }, select: { name: true } }),
  ]);

  const t = pnl.totals;
  const money = (minor: number) => formatMoney(minor, currency);

  const doc = new PdfDocument();

  // -- header -------------------------------------------------------------
  doc.text("DropInsight", { size: 18, font: "bold", colour: [0.34, 0.24, 0.91] });
  doc.text(format(new Date(), "d MMMM yyyy"), { size: 9, align: "right", colour: [0.45, 0.5, 0.58] });
  doc.moveDown(24);

  doc.text("Profit & loss statement", { size: 20, font: "bold" });
  doc.moveDown(26);
  doc.text(`${workspace.name} · ${format(month, "MMMM yyyy")}`, { size: 11, colour: [0.29, 0.33, 0.41] });
  doc.moveDown(20);
  doc.rule({ thickness: 1, colour: [0.34, 0.24, 0.91] });
  doc.moveDown(10);

  // -- headline -----------------------------------------------------------
  const headlineProfit = pnl.netProfitMinor;
  const headlineMargin = pnl.marginRatio;
  const statementOrderCount = pnl.basis === "priced" ? t.pricedOrderCount : t.orderCount;

  doc.band(46, [0.97, 0.98, 0.99]);
  doc.moveDown(8);
  doc.row("Net profit", money(headlineProfit), {
    size: 14,
    font: "bold",
    colour: headlineProfit >= 0 ? [0.02, 0.59, 0.38] : [0.88, 0.11, 0.28],
  });
  doc.row(
    `Margin ${formatPercent(headlineMargin)}  ·  ${statementOrderCount.toLocaleString()} orders`,
    `Revenue ${money(pnl.revenueMinor)}`,
    { size: 9, colour: [0.45, 0.5, 0.58] },
  );
  doc.moveDown(16);

  // -- income -------------------------------------------------------------
  doc.text("Income", { size: 11, font: "bold" });
  doc.moveDown(16);
  doc.rule();
  for (const line of pnl.incomeLines) {
    doc.row(line.label, money(line.currentMinor), { indent: 10 });
  }
  const incomeTotal = pnl.incomeLines.reduce((s, l) => s + l.currentMinor, 0);
  doc.rule();
  doc.row("Total income", money(incomeTotal), { font: "bold" });
  doc.moveDown(14);

  // -- costs --------------------------------------------------------------
  doc.text("Costs", { size: 11, font: "bold" });
  doc.moveDown(16);
  doc.rule();
  for (const line of pnl.expenseLines) {
    doc.row(line.label, `-${money(line.currentMinor)}`, { indent: 10, colour: [0.88, 0.11, 0.28] });
  }
  const expenseTotal = pnl.expenseLines.reduce((s, l) => s + l.currentMinor, 0);
  doc.rule();
  doc.row("Total costs", `-${money(expenseTotal)}`, { font: "bold", colour: [0.88, 0.11, 0.28] });
  doc.moveDown(16);

  // -- bottom line --------------------------------------------------------
  doc.rule({ thickness: 1, colour: [0.55, 0.6, 0.68] });
  doc.moveDown(4);
  doc.row("Net profit", money(incomeTotal - expenseTotal), { size: 13, font: "bold" });
  doc.moveDown(20);

  // -- notes --------------------------------------------------------------
  doc.rule();
  doc.text("Notes", { size: 9, font: "bold", colour: [0.45, 0.5, 0.58] });
  doc.moveDown(14);

  const notes = [
    `Refund losses are dated to ${REFUND_ATTRIBUTION_COPY[attribution].title.toLowerCase()}. ${REFUND_ATTRIBUTION_COPY[attribution].example}`,
    "Revenue is gross sales including postage charged. Sales tax is excluded — eBay collects and remits it.",
    pnl.basis === "priced"
      ? `This statement covers the ${t.pricedOrderCount} of ${t.orderCount} orders that have a buying price recorded. The other ${pnl.excludedOrderCount}, worth ${money(pnl.excludedRevenueMinor)} of sales, are left out entirely — including their revenue and fees without their supplier cost would overstate profit.`
      : `All ${t.orderCount} orders in this period have a buying price recorded, so this statement covers the period in full.`,
    `Amounts are in ${currency}. This statement is generated from your own records and is not a substitute for filed accounts.`,
  ];

  for (const note of notes) {
    for (const wrapped of wrap(note, 108)) {
      doc.text(wrapped, { size: 8, colour: [0.45, 0.5, 0.58] });
      doc.moveDown(11);
    }
    doc.moveDown(3);
  }

  await recordAudit({
    workspaceId: auth.workspace.id,
    actorUserId: auth.user.id,
    action: "report.export",
    summary: `Exported the ${format(month, "MMMM yyyy")} P&L statement as PDF.`,
  });

  return pdfResponse(
    `dropinsight-pnl-${format(month, "yyyy-MM")}.pdf`,
    doc.build(`Profit & loss — ${workspace.name} — ${format(month, "MMMM yyyy")}`),
  );
}

/** Greedy word wrap; the PDF writer has no line-breaking of its own. */
function wrap(text: string, columns: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (line.length + word.length + 1 > columns) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
