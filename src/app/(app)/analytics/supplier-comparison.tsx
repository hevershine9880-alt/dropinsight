import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Money, Percent } from "@/components/domain/money";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Truck, ShieldCheck, ShieldAlert } from "lucide-react";
import type { SupplierRow } from "@/lib/finance/products-query";

export function SupplierComparison({
  suppliers, currency,
}: {
  suppliers: SupplierRow[];
  currency: string;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title="Supplier comparison"
        description="Spend, margin and how reliably each one settles a refund claim."
        action={<Link href="/suppliers" className="text-sm font-medium text-brand hover:underline">All suppliers</Link>}
      />

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No supplier costs recorded in this period"
          description="Name a supplier when you enter a buying price and they appear here, ready to compare."
          className="flex-1 py-8"
        />
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[34rem] text-left">
            <caption className="sr-only">Supplier comparison</caption>
            <thead>
              <tr className="border-y border-line bg-surface-sunken/50">
                <th scope="col" className="px-5 py-2 text-xs font-semibold text-ink-muted">Supplier</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Spend</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Margin</th>
                <th scope="col" className="px-5 py-2 text-xs font-semibold text-ink-muted">Claims</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="transition-colors hover:bg-surface-hover">
                  <th scope="row" className="max-w-0 px-5 py-2.5 text-left font-normal">
                    <span className="block truncate font-medium text-ink">{supplier.name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {supplier.orderLineCount} lines · {supplier.productCount} products
                    </span>
                  </th>
                  <td className="px-3 py-2.5 text-right text-sm">
                    <Money minor={supplier.spendMinor} currency={currency} />
                    <span className="tabular block text-xs text-ink-muted">
                      avg <Money minor={supplier.avgUnitCostMinor} currency={currency} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm">
                    <Percent ratio={supplier.marginRatio} />
                  </td>
                  <td className="px-5 py-2.5">
                    {supplier.reliabilityRatio === null ? (
                      <span className="text-xs text-ink-subtle">none raised</span>
                    ) : (
                      <Badge
                        tone={supplier.reliabilityRatio >= 0.85 ? "positive" : supplier.reliabilityRatio >= 0.6 ? "caution" : "negative"}
                        icon={supplier.reliabilityRatio >= 0.85 ? ShieldCheck : ShieldAlert}
                      >
                        {(supplier.reliabilityRatio * 100).toFixed(0)}% settled
                      </Badge>
                    )}
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
