import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Money, Percent } from "@/components/domain/money";
import { EmptyState } from "@/components/ui/empty-state";
import { Layers } from "lucide-react";
import { cn } from "@/lib/cn";

const COLORS = [
  "bg-indigo-500", "bg-mint-500", "bg-amber-400", "bg-rose-400",
  "bg-navy-400", "bg-indigo-300", "bg-mint-300", "bg-slate-400",
];

export function CategoryBreakdown({
  categories, currency,
}: {
  categories: { category: string; revenueMinor: number; profitMinor: number; units: number; marginRatio: number | null }[];
  currency: string;
}) {
  const totalProfit = categories.reduce((s, c) => s + Math.max(0, c.profitMinor), 0);

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Profit by category"
        description="Categories are derived from product titles, so treat them as a guide rather than eBay's own taxonomy."
      />
      <CardBody className="flex-1">
        {categories.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No costed sales in this period"
            description="Once orders have buying prices, this shows where your profit actually comes from."
            className="py-8"
          />
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Profit by product category</caption>
            <thead>
              <tr>
                <th scope="col" className="pb-2 text-xs font-semibold text-ink-muted">Category</th>
                <th scope="col" className="pb-2 text-right text-xs font-semibold text-ink-muted">Profit</th>
                <th scope="col" className="pb-2 pl-3 text-right text-xs font-semibold text-ink-muted">Margin</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category, index) => (
                <tr key={category.category}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 shrink-0 rounded-full", COLORS[index % COLORS.length])} aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{category.category}</span>
                        <span className="block text-xs text-ink-muted">{category.units} units</span>
                      </span>
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-sunken">
                      <span
                        className={cn("block h-full rounded-full", COLORS[index % COLORS.length])}
                        style={{ width: `${totalProfit > 0 ? Math.max(2, (Math.max(0, category.profitMinor) / totalProfit) * 100) : 0}%` }}
                      />
                    </span>
                  </th>
                  <td className="py-1.5 text-right align-top">
                    <Money minor={category.profitMinor} currency={currency} signed />
                  </td>
                  <td className="py-1.5 pl-3 text-right align-top text-ink-muted">
                    <Percent ratio={category.marginRatio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}
