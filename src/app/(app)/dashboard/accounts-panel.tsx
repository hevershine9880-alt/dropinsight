import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Money, Percent } from "@/components/domain/money";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConnectionStatusBadge } from "@/components/domain/status";
import { Link2, FlaskConical } from "lucide-react";
import type { AccountRow } from "@/lib/finance/dashboard";
import { cn } from "@/lib/cn";

export function AccountsPanel({
  accounts, currency, className,
}: {
  accounts: AccountRow[];
  currency: string;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader
        title="Your eBay accounts"
        description="Sales and profit in the selected window."
        action={
          <Link href="/ebay-accounts" className="text-sm font-medium text-brand hover:underline">
            View all
          </Link>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No accounts connected"
          description="Connect an eBay store to start importing orders."
          className="py-8"
        />
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[36rem] text-left">
            <caption className="sr-only">eBay accounts with sales, profit and margin</caption>
            <thead>
              <tr className="border-y border-line bg-surface-sunken/50">
                <th scope="col" className="px-5 py-2 text-xs font-semibold text-ink-muted">Account</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Orders</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Sales</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Profit</th>
                <th scope="col" className="px-5 py-2 text-right text-xs font-semibold text-ink-muted">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {accounts.map((account) => (
                <tr key={account.id} className="transition-colors hover:bg-surface-hover">
                  <th scope="row" className="px-5 py-2.5 text-left font-normal">
                    <Link href={`/ebay-accounts#${account.id}`} className="flex items-center gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-medium text-ink">{account.username}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-ink-muted">{marketplaceName(account.marketplaceId)}</span>
                          {account.isMock ? (
                            <Badge tone="info" icon={FlaskConical} className="text-[10px]">Demo data</Badge>
                          ) : null}
                        </span>
                      </span>
                      {account.status !== "CONNECTED" ? <ConnectionStatusBadge status={account.status} /> : null}
                    </Link>
                  </th>
                  <td className="tabular px-3 py-2.5 text-right text-sm">{account.orderCount.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-sm">
                    <Money minor={account.revenueMinor} currency={currency} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm">
                    <Money minor={account.profitMinor} currency={currency} signed />
                  </td>
                  <td className="px-5 py-2.5 text-right text-sm">
                    <Percent ratio={account.marginRatio} />
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

const MARKETPLACE_NAMES: Record<string, string> = {
  EBAY_GB: "United Kingdom", EBAY_US: "United States", EBAY_DE: "Germany",
  EBAY_FR: "France", EBAY_IT: "Italy", EBAY_ES: "Spain", EBAY_AU: "Australia",
  EBAY_CA: "Canada", EBAY_IE: "Ireland", EBAY_NL: "Netherlands",
};

export function marketplaceName(id: string): string {
  return MARKETPLACE_NAMES[id] ?? id.replace("EBAY_", "");
}
