import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Money, Percent } from "@/components/domain/money";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";

export function TopSkus({
  skus, currency,
}: {
  skus: { id: string; title: string; sku: string | null; quantity: number; profitMinor: number; marginRatio: number | null }[];
  currency: string;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title="Top profit by SKU"
        description="Counting only orders that have a buying price."
        action={<Link href="/products" className="text-sm font-medium text-brand hover:underline">All products</Link>}
      />

      {skus.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No costed sales yet"
          description="Once orders have buying prices, your best earners appear here."
          className="flex-1 py-8"
        />
      ) : (
        <div className="table-scroll">
          <table className="w-full text-left">
            <caption className="sr-only">Top listings by profit</caption>
            <thead>
              <tr className="border-y border-line bg-surface-sunken/50">
                <th scope="col" className="px-5 py-2 text-xs font-semibold text-ink-muted">Product</th>
                <th scope="col" className="px-2 py-2 text-right text-xs font-semibold text-ink-muted">Qty</th>
                <th scope="col" className="px-2 py-2 text-right text-xs font-semibold text-ink-muted">Profit</th>
                <th scope="col" className="px-5 py-2 text-right text-xs font-semibold text-ink-muted">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {skus.map((sku) => (
                <tr key={sku.id} className="transition-colors hover:bg-surface-hover">
                  <th scope="row" className="max-w-0 px-5 py-2 text-left font-normal">
                    <Link href={`/products/${sku.id}`} className="block truncate font-medium text-ink hover:text-brand hover:underline">
                      {sku.title}
                    </Link>
                    {sku.sku ? <span className="block truncate text-xs text-ink-muted">{sku.sku}</span> : null}
                  </th>
                  <td className="tabular px-2 py-2 text-right text-sm">{sku.quantity}</td>
                  <td className="px-2 py-2 text-right text-sm">
                    <Money minor={sku.profitMinor} currency={currency} signed />
                  </td>
                  <td className="px-5 py-2 text-right text-sm">
                    <Percent ratio={sku.marginRatio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
