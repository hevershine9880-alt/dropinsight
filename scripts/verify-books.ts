import { PrismaClient } from "@/generated/prisma";
import { totalsForPeriod, loadOrders, profitOf } from "@/lib/finance/aggregate";
import { resolvePeriod } from "@/lib/finance/periods";
import { formatMoney, formatPercent } from "@/lib/money";

const prisma = new PrismaClient();

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow({ where: { name: "Northbridge Retail" } });
  const period = resolvePeriod("last30");
  const orders = await loadOrders({
    workspaceId: ws.id,
    OR: [
      { orderDate: { gte: period.from, lte: period.to } },
      { refunds: { some: { refundedAt: { gte: period.from, lte: period.to } } } },
    ],
  });
  const expenses = await prisma.expense.aggregate({
    where: { workspaceId: ws.id, date: { gte: period.from, lte: period.to } },
    _sum: { amountMinor: true },
  });

  const t = totalsForPeriod(orders, period, "REFUND_MONTH", ws.currency, expenses._sum.amountMinor ?? 0);

  console.log("Last 30 days —", ws.name);
  console.log("  Orders            ", t.orderCount);
  console.log("  Revenue           ", formatMoney(t.revenueMinor, "GBP"));
  console.log("  Cost of goods     ", formatMoney(-t.costOfGoodsMinor, "GBP"));
  console.log("  eBay fees         ", formatMoney(-t.ebayFeesMinor, "GBP"));
  console.log("  Ad fees           ", formatMoney(-t.adFeesMinor, "GBP"));
  console.log("  = Gross profit    ", formatMoney(t.grossProfitMinor, "GBP"));
  console.log("  Refund loss       ", formatMoney(-t.refundLossMinor, "GBP"));
  console.log("  Expenses          ", formatMoney(-t.expensesMinor, "GBP"));
  console.log("  = Net profit      ", formatMoney(t.netProfitMinor, "GBP"));
  console.log("  Margin            ", formatPercent(t.marginRatio));
  console.log("  Cost coverage     ", formatPercent(t.costCoverageRatio), `(${t.pricedOrderCount}/${t.orderCount})`);
  console.log("  Recovered         ", formatMoney(t.recoveredMinor, "GBP"));
  console.log("  Fee ratio         ", formatPercent(t.ebayFeesMinor / t.revenueMinor));

  // Reconciliation: does the sum of per-order net profit equal the aggregate?
  const inWindow = orders.filter(o => o.orderDate >= period.from && o.orderDate <= period.to);
  const perOrder = inWindow.reduce((s, o) => s + profitOf(o).netProfitMinor, 0);
  const aggregateBeforeExpenses = t.grossProfitMinor - t.refundLossMinor;
  console.log("\nReconciliation");
  console.log("  Sum of per-order net profit :", formatMoney(perOrder, "GBP"));
  console.log("  Aggregate (excl. expenses)  :", formatMoney(aggregateBeforeExpenses, "GBP"));
  console.log("  Difference                  :", formatMoney(perOrder - aggregateBeforeExpenses, "GBP"),
    "(refunds dated outside the window under REFUND_MONTH)");

  const claims = await prisma.refund.groupBy({
    by: ["supplierClaim"], _count: true,
    where: { order: { workspaceId: ws.id } },
  });
  console.log("\nSupplier claims:", claims.map(c => `${c.supplierClaim}=${c._count}`).join(" "));
}
main().finally(() => prisma.$disconnect());
