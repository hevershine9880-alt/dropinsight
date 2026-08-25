import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/domain/money";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPercent } from "@/lib/money";
import { cn } from "@/lib/cn";
import { TrendingDown, AlertTriangle, Check } from "lucide-react";
import type { PriceFloorRow } from "./page";

/**
 * The price floor per product. (R7)
 *
 * "Headroom" is the gap between what a product sells for and the least it could
 * sell for while still covering its cost and eBay's cut. Negative headroom
 * means every sale loses money — the single most valuable thing this page can
 * tell someone.
 */
export function PriceFloorPanel({
  products, currency,
}: {
  products: PriceFloorRow[];
  currency: string;
}) {
  const belowFloor = products.filter((p) => (p.headroomMinor ?? 0) < 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Prices your products can't afford to drop below"
        description={
          products.length > 0
            ? `Break-even prices, using the ${formatPercent(products[0].feeRatio)} fee rate your own orders actually paid over the last 90 days.`
            : "Break-even prices, once you have costed some orders."
        }
        action={
          belowFloor.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-negative-soft px-2 py-1 text-sm font-medium text-negative-ink">
              <AlertTriangle className="size-3.5" aria-hidden />
              {belowFloor.length} below break-even
            </span>
          ) : null
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon={TrendingDown}
          title="No break-even prices yet"
          description="Enter buying prices on a few orders and DropInsight will work out the lowest price each product can sell at."
          className="py-10"
          action={
            <Link
              href="/orders?tab=awaiting_cost"
              className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover"
            >
              Enter buying prices
            </Link>
          }
        />
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[44rem] text-left">
            <caption className="sr-only">Break-even price per product</caption>
            <thead>
              <tr className="border-y border-line bg-surface-sunken/50">
                <th scope="col" className="px-5 py-2 text-xs font-semibold text-ink-muted">Product</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Your cost</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Break-even</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Listed at</th>
                <th scope="col" className="px-5 py-2 text-right text-xs font-semibold text-ink-muted">Headroom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((product) => {
                const below = (product.headroomMinor ?? 0) < 0;
                const thin = !below && (product.headroomMinor ?? 0) < 100;
                return (
                  <tr key={product.id} className={cn("transition-colors hover:bg-surface-hover", below && "bg-negative-soft/30")}>
                    <th scope="row" className="max-w-0 px-5 py-2.5 text-left font-normal">
                      <Link href={`/products/${product.id}`} className="block truncate font-medium text-ink hover:text-brand hover:underline">
                        {product.title}
                      </Link>
                      <span className="block truncate text-xs text-ink-muted">
                        {product.sku ? `${product.sku} · ` : ""}{product.unitsSold} sold
                      </span>
                    </th>
                    <td className="px-3 py-2.5 text-right text-sm">
                      <Money minor={product.latestCostMinor} currency={currency} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-medium">
                      <Money minor={product.floorMinor ?? 0} currency={currency} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm">
                      <Money minor={product.currentPriceMinor} currency={currency} />
                    </td>
                    <td className="px-5 py-2.5 text-right text-sm">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-medium",
                          below ? "text-negative" : thin ? "text-caution-ink" : "text-positive",
                        )}
                      >
                        {below ? <AlertTriangle className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                        <Money minor={product.headroomMinor ?? 0} currency={currency} signed />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
