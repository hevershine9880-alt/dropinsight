import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Money, Percent } from "@/components/domain/money";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProductRow } from "@/lib/finance/products-query";

export function ProfitableProducts({
  title, description, products, currency, tone, emptyDescription,
}: {
  title: string;
  description: string;
  products: ProductRow[];
  currency: string;
  tone: "positive" | "negative";
  emptyDescription?: string;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={title} description={description} />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No costed sales in this period"
          description={emptyDescription ?? "Product profit needs a buying price. Enter costs on a few orders and this fills in."}
          className="flex-1 py-8"
        />
      ) : (
        <ol className="divide-y divide-line border-t border-line">
          {products.map((product, index) => (
            <li key={product.id}>
              <Link
                href={`/products/${product.id}`}
                className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <span
                  className={cn(
                    "tabular grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold",
                    tone === "positive" ? "bg-positive-soft text-positive-ink" : "bg-negative-soft text-negative-ink",
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-ink">{product.title}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {product.unitsSold} sold · avg <Money minor={product.avgSaleMinor} currency={currency} />
                    {product.refundCount > 0 ? ` · ${product.refundCount} refunded` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {tone === "negative" ? (
                    <>
                      <span className="block text-base font-medium">
                        <Percent ratio={product.marginRatio} /> margin
                      </span>
                      <span className="block text-xs text-ink-muted">
                        <Money minor={product.profitMinor} currency={currency} signed /> total
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-base font-medium">
                        <Money minor={product.profitMinor} currency={currency} signed />
                      </span>
                      <span className="block text-xs text-ink-muted">
                        <Percent ratio={product.marginRatio} /> margin
                      </span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
