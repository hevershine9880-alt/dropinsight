import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Money, Percent } from "@/components/domain/money";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";
import type { TopProduct } from "@/lib/finance/dashboard";

export function TopProductsPanel({ products, currency }: { products: TopProduct[]; currency: string }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title="Top listings"
        description="Your best profit earners in this window — where to put your ad spend."
        action={<Link href="/products" className="text-sm font-medium text-brand hover:underline">All products</Link>}
      />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No sales in this period"
          description="Widen the date range, or check that your accounts have finished syncing."
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
                <span className="tabular grid size-6 shrink-0 place-items-center rounded-md bg-surface-sunken text-xs font-semibold text-ink-muted">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-ink">{product.title}</span>
                  <span className="block text-xs text-ink-muted">
                    {product.sku ? `${product.sku} · ` : ""}
                    {product.unitsSold} sold
                    {!product.priced ? " · some orders unpriced" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-medium">
                    <Money minor={product.profitMinor} currency={currency} signed />
                  </span>
                  <span className="block text-xs text-ink-muted">
                    <Percent ratio={product.marginRatio} /> margin
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
