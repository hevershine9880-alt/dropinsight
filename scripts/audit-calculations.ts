import { PrismaClient } from "@/generated/prisma";
import { loadOrders, totalsForPeriod, profitOf, periodOrderWhere } from "@/lib/finance/aggregate";
import { buildPnl } from "@/lib/finance/pnl";
import { resolvePeriod } from "@/lib/finance/periods";
import { queryProducts, querySuppliers } from "@/lib/finance/products-query";
import { refundTotals, recoverableOf } from "@/lib/finance/refunds-query";
import { formatMoney } from "@/lib/money";

/**
 * A full reconciliation audit against whatever is in the database.
 *
 * Each check states an identity that must hold and reports the exact
 * discrepancy when it does not. Run it after any change to the finance layer.
 */

const prisma = new PrismaClient();
const problems: string[] = [];
const notes: string[] = [];

function check(name: string, condition: boolean, detail: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name} — ${detail}`);
    problems.push(`${name}: ${detail}`);
  }
}

async function main() {
  const workspace = await prisma.workspace.findFirstOrThrow({
    where: { orders: { some: {} } },
    select: { id: true, currency: true, refundAttribution: true, name: true },
  });
  const { id: workspaceId, currency } = workspace;
  const money = (m: number) => formatMoney(m, currency);

  console.log(`\nAuditing "${workspace.name}" (${currency}, ${workspace.refundAttribution})\n`);

  // ── 1. Per-order identities ────────────────────────────────────────────
  console.log("Per-order identities");
  const allOrders = await loadOrders({ workspaceId });

  let badGross = 0;
  let badNet = 0;
  let negativeLoss = 0;
  let refundGain = 0;
  let cancelledCharged = 0;
  let marginWithoutRevenue = 0;

  for (const order of allOrders) {
    const p = profitOf(order);

    if (p.grossProfitMinor !== p.revenueMinor - p.costOfGoodsMinor - p.ebayFeesMinor - p.adFeesMinor) badGross++;
    if (p.netProfitMinor !== p.grossProfitMinor - p.refundLossMinor) badNet++;
    if (p.refundLossMinor < 0) negativeLoss++;
    if (p.refundLossMinor > p.buyerRefundMinor) refundGain++;
    if (p.isNonLossCancellation && (p.netProfitMinor !== 0 || p.revenueMinor !== 0)) cancelledCharged++;
    if (p.revenueMinor === 0 && p.marginRatio !== null) marginWithoutRevenue++;
  }

  check("gross = revenue − cogs − fees", badGross === 0, `${badGross} orders fail`);
  check("net = gross − refund loss", badNet === 0, `${badNet} orders fail`);
  check("refund loss is never negative", negativeLoss === 0, `${negativeLoss} orders fail`);
  check("refund loss never exceeds the refund", refundGain === 0, `${refundGain} orders fail`);
  check("cancelled-before-fulfilment carries nothing", cancelledCharged === 0, `${cancelledCharged} orders fail`);
  check("no margin without revenue", marginWithoutRevenue === 0, `${marginWithoutRevenue} orders fail`);

  // ── 2. Period aggregation ──────────────────────────────────────────────
  console.log("\nPeriod aggregation");
  for (const key of ["last7", "last30", "this_month", "last_month", "all_time"] as const) {
    const period = resolvePeriod(key);
    const orders = await loadOrders(periodOrderWhere(workspaceId, period, "REFUND_MONTH"));
    const t = totalsForPeriod(orders, period, "REFUND_MONTH", currency);

    const inWindow = orders.filter(
      (o) => o.orderDate >= period.from && o.orderDate <= period.to && o.cancelState !== "CANCELLED_BEFORE_FULFILMENT",
    );
    const summed = inWindow.map(profitOf);
    const revenue = summed.reduce((s, p) => s + p.revenueMinor, 0);
    const cogs = summed.reduce((s, p) => s + p.costOfGoodsMinor, 0);
    const priced = summed.filter((p) => p.isPriced);

    check(
      `${key}: revenue matches the sum of its orders`,
      t.revenueMinor === revenue,
      `aggregate ${money(t.revenueMinor)} vs summed ${money(revenue)}`,
    );
    check(
      `${key}: cost of goods matches`,
      t.costOfGoodsMinor === cogs,
      `aggregate ${money(t.costOfGoodsMinor)} vs summed ${money(cogs)}`,
    );
    check(
      `${key}: priced count matches`,
      t.pricedOrderCount === priced.length,
      `aggregate ${t.pricedOrderCount} vs summed ${priced.length}`,
    );
    check(
      `${key}: capped refund identity holds`,
      t.buyerRefundMinor - t.effectiveFeeCreditMinor - t.effectiveRecoveredMinor === t.refundLossMinor,
      `${money(t.buyerRefundMinor)} − ${money(t.effectiveFeeCreditMinor)} − ${money(t.effectiveRecoveredMinor)} ≠ ${money(t.refundLossMinor)}`,
    );
    check(
      `${key}: priced net = priced gross − priced loss − expenses`,
      t.pricedNetProfitMinor ===
        priced.reduce((s, p) => s + p.grossProfitMinor, 0) - t.pricedRefundLossMinor - t.expensesMinor,
      "mismatch",
    );
  }

  // ── 3. P&L statement ───────────────────────────────────────────────────
  console.log("\nP&L statement");
  for (const key of ["last7", "last30", "this_month", "last_month"] as const) {
    const pnl = await buildPnl(workspaceId, currency, "REFUND_MONTH", resolvePeriod(key));
    const income = pnl.incomeLines.reduce((s, l) => s + l.currentMinor, 0);
    const costs = pnl.expenseLines.reduce((s, l) => s + l.currentMinor, 0);
    const slices = pnl.breakdown.reduce((s, b) => s + b.minor, 0);

    check(`${key}: income − costs = net profit`, income - costs === pnl.netProfitMinor,
      `${money(income)} − ${money(costs)} = ${money(income - costs)}, reported ${money(pnl.netProfitMinor)}`);
    check(`${key}: breakdown slices sum to net profit`, slices === pnl.netProfitMinor,
      `slices ${money(slices)} vs ${money(pnl.netProfitMinor)}`);
    check(`${key}: previous-period lines also reconcile`,
      pnl.incomeLines.reduce((s, l) => s + l.previousMinor, 0) -
        pnl.expenseLines.reduce((s, l) => s + l.previousMinor, 0) ===
        (pnl.previousTotals
          ? pnl.previousTotals.unpricedOrderCount > 0
            ? pnl.previousTotals.pricedNetProfitMinor
            : pnl.previousTotals.netProfitMinor
          : 0),
      "previous column does not reconcile");
  }

  // ── 4. Refund recovery ─────────────────────────────────────────────────
  console.log("\nRefund recovery");
  const allTime = resolvePeriod("all_time");
  const rt = await refundTotals(workspaceId, allTime, currency);
  const refunds = await prisma.refund.findMany({
    where: { order: { workspaceId }, type: { in: ["REFUND", "RETURN"] } },
  });

  const recoveredSum = refunds.reduce((s, r) => s + r.recoveredMinor, 0);
  const openSum = refunds
    .filter((r) => ["NOT_ASKED", "ASKED", "PROMISED"].includes(r.supplierClaim))
    .reduce((s, r) => s + recoverableOf(r), 0);
  const writtenOffSum = refunds
    .filter((r) => r.supplierClaim === "WRITTEN_OFF")
    .reduce((s, r) => s + recoverableOf(r), 0);

  check("recovered total matches the refund rows", rt.recoveredMinor === recoveredSum,
    `${money(rt.recoveredMinor)} vs ${money(recoveredSum)}`);
  check("still-recoverable matches open claims", rt.stillRecoverableMinor === openSum,
    `${money(rt.stillRecoverableMinor)} vs ${money(openSum)}`);
  check("written-off matches", rt.writtenOffMinor === writtenOffSum,
    `${money(rt.writtenOffMinor)} vs ${money(writtenOffSum)}`);
  check("net loss = still recoverable + written off",
    rt.netLossMinor === rt.stillRecoverableMinor + rt.writtenOffMinor, "mismatch");
  check("nobody recovered more than they lost",
    refunds.every((r) => r.recoveredMinor <= Math.max(0, r.buyerRefundMinor - r.feeCreditMinor)),
    `${refunds.filter((r) => r.recoveredMinor > Math.max(0, r.buyerRefundMinor - r.feeCreditMinor)).length} refunds over-recovered`);
  check("recovery rate is between 0 and 1",
    rt.recoveryRatio === null || (rt.recoveryRatio >= 0 && rt.recoveryRatio <= 1),
    `rate is ${rt.recoveryRatio}`);

  // ── 5. Products and suppliers ──────────────────────────────────────────
  console.log("\nProducts and suppliers");
  const products = await queryProducts(workspaceId, allTime, { sort: "profit", direction: "desc" });
  const suppliers = await querySuppliers(workspaceId, allTime);

  check("every product's margin matches its own profit ÷ revenue",
    products.every((p) => p.marginRatio === null || Math.abs(p.marginRatio - p.profitMinor / p.revenueMinor) < 1e-9),
    "a product's margin does not match");
  check("refund rate never exceeds 1", products.every((p) => p.refundRate <= 1),
    `${products.filter((p) => p.refundRate > 1).length} products over 100%`);
  check("units sold is never negative", products.every((p) => p.unitsSold >= 0), "negative units");
  check("break-even always exceeds cost",
    products.every((p) => p.breakEvenMinor === null || p.lastCostMinor === null || p.breakEvenMinor >= p.lastCostMinor),
    "a break-even price is below its cost");
  check("supplier spend is never negative", suppliers.every((s) => s.spendMinor >= 0), "negative spend");
  check("supplier reliability is a ratio",
    suppliers.every((s) => s.reliabilityRatio === null || (s.reliabilityRatio >= 0 && s.reliabilityRatio <= 1)),
    "reliability out of range");

  // ── 6. Cross-surface consistency ───────────────────────────────────────
  console.log("\nCross-surface consistency");
  const period = resolvePeriod("last30");
  const orders30 = await loadOrders(periodOrderWhere(workspaceId, period, "REFUND_MONTH"));
  const t30 = totalsForPeriod(orders30, period, "REFUND_MONTH", currency);
  const products30 = await queryProducts(workspaceId, period, { sort: "profit", direction: "desc" });

  const productRevenue = products30.reduce((s, p) => s + p.revenueMinor, 0);
  const orderItemRevenue = orders30
    .filter((o) => o.orderDate >= period.from && o.orderDate <= period.to && o.cancelState !== "CANCELLED_BEFORE_FULFILMENT")
    .reduce((s, o) => s + o.items.reduce((n, i) => n + i.unitPriceMinor * i.quantity, 0), 0);

  check("product revenue equals order item revenue",
    productRevenue === orderItemRevenue,
    `products ${money(productRevenue)} vs items ${money(orderItemRevenue)}`);

  // Item revenue excludes postage, so it should be at or below total revenue.
  notes.push(
    `Item revenue ${money(orderItemRevenue)} vs order revenue ${money(t30.revenueMinor)} — ` +
      `difference ${money(t30.revenueMinor - orderItemRevenue)} is postage charged, which sits on the order, not a line.`,
  );

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(64));
  if (notes.length) {
    console.log("\nNotes");
    for (const note of notes) console.log(`  · ${note}`);
  }
  if (problems.length === 0) {
    console.log("\nEvery identity holds. No reconciliation problems found.\n");
  } else {
    console.log(`\n${problems.length} problems:\n`);
    for (const problem of problems) console.log(`  ✗ ${problem}`);
    console.log("");
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
