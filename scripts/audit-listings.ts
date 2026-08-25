import { PrismaClient } from "@/generated/prisma";
import { queryProducts } from "@/lib/finance/products-query";
import { resolvePeriod } from "@/lib/finance/periods";
import { VERDICT_META } from "@/lib/finance/listing-health";
import { formatMoney, formatPercent } from "@/lib/money";

const prisma = new PrismaClient();

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow({
    where: { orders: { some: {} } },
    select: { id: true, currency: true },
  });

  for (const key of ["all_time", "last30"] as const) {
    const products = await queryProducts(ws.id, resolvePeriod(key), { sort: "profit", direction: "desc" });
    console.log(`\n=== ${key}: ${products.length} listings ===`);

    // Two tallies, because they answer different questions and only one of
    // them adds up to the number of listings. The page shows the primary one,
    // so every listing appears in exactly one group; the flag tally is what a
    // listing is doing wrong in total, and a listing can do several.
    const primary = new Map<string, number>();
    const flagged = new Map<string, number>();
    for (const p of products) {
      primary.set(p.health.verdict, (primary.get(p.health.verdict) ?? 0) + 1);
      for (const flag of p.health.flags) flagged.set(flag, (flagged.get(flag) ?? 0) + 1);
    }

    console.log("  verdict              shown   flags");
    for (const [verdict, meta] of Object.entries(VERDICT_META)) {
      console.log(
        `  ${meta.label.padEnd(18)} ${String(primary.get(verdict) ?? 0).padStart(5)} ` +
          `${String(flagged.get(verdict) ?? 0).padStart(7)}`,
      );
    }

    const shown = [...primary.values()].reduce((a, b) => a + b, 0);
    console.log(
      `  ${"—".repeat(18)} ${String(shown).padStart(5)}` +
        (shown === products.length ? "   every listing counted once ✓" : "   ✗ DOES NOT ADD UP"),
    );

    console.log("\n  Sample rows:");
    for (const p of products.slice(0, 5)) {
      console.log(
        `   ${p.health.verdict.padEnd(17)} ${p.title.slice(0, 38).padEnd(40)} ` +
          `sold ${String(p.unitsSold).padStart(4)}  ` +
          `profit ${formatMoney(p.profitMinor, ws.currency).padStart(10)}  ` +
          `margin ${formatPercent(p.marginRatio).padStart(7)}  ` +
          `unpriced ${p.unpricedLines}`,
      );
    }
  }
}

main().finally(() => prisma.$disconnect());
