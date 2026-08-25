import { Card, CardHeader } from "@/components/ui/card";
import { Money, Delta } from "@/components/domain/money";
import { InfoTip } from "@/components/ui/tooltip";
import { percentChange } from "@/lib/money";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { TrendingDown, TrendingUp, ArrowRight } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { PnlLine } from "@/lib/finance/pnl";
import type { PeriodTotals } from "@/lib/finance/aggregate";

/**
 * The statement itself: income lines, cost lines, and the bottom line, with the
 * previous period beside each one. This is what an accountant asks for.
 */
export function PnlStatement({
  incomeLines, expenseLines, totals, previousTotals, basis,
  excludedOrderCount, excludedRevenueMinor, currency,
  periodLabel, previousLabel, className,
}: {
  incomeLines: PnlLine[];
  expenseLines: PnlLine[];
  totals: PeriodTotals;
  previousTotals: PeriodTotals | null;
  basis: "all" | "priced";
  excludedOrderCount: number;
  excludedRevenueMinor: number;
  currency: string;
  periodLabel: string;
  previousLabel?: string;
  className?: string;
}) {
  const incomeTotal = incomeLines.reduce((s, l) => s + l.currentMinor, 0);
  const previousIncomeTotal = incomeLines.reduce((s, l) => s + l.previousMinor, 0);
  const expenseTotal = expenseLines.reduce((s, l) => s + l.currentMinor, 0);
  const previousExpenseTotal = expenseLines.reduce((s, l) => s + l.previousMinor, 0);

  const netMinor = incomeTotal - expenseTotal;
  const previousNetMinor = previousIncomeTotal - previousExpenseTotal;
  const columnCount = previousTotals ? 4 : 2;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader
        title="P&L summary"
        description={
          basis === "priced"
            ? `${periodLabel} · the ${totals.pricedOrderCount.toLocaleString()} orders that have a buying price${previousLabel ? `, compared with ${previousLabel}` : ""}`
            : `${periodLabel}${previousLabel ? ` compared with ${previousLabel}` : ""}`
        }
      />

      <div className="table-scroll">
        <table className="w-full min-w-[38rem] text-left">
          <caption className="sr-only">Profit and loss statement</caption>
          <thead>
            <tr className="border-y border-line bg-surface-sunken/50">
              <th scope="col" className="px-5 py-2 text-xs font-semibold text-ink-muted">Category</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">
                This period
              </th>
              {previousTotals ? (
                <>
                  <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink-muted">
                    Previous
                  </th>
                  <th scope="col" className="px-5 py-2 text-right text-xs font-semibold text-ink-muted">
                    Change
                  </th>
                </>
              ) : null}
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            <SectionHeaderRow label="Income" icon={TrendingUp} tone="positive" columns={columnCount} />
            {incomeLines.map((line) => (
              <LineRow key={line.key} line={line} currency={currency} hasComparison={!!previousTotals} />
            ))}
            <TotalRow
              label="Total income"
              minor={incomeTotal}
              previousMinor={previousIncomeTotal}
              currency={currency}
              hasComparison={!!previousTotals}
            />

            <SectionHeaderRow label="Costs" icon={TrendingDown} tone="negative" columns={columnCount} />
            {expenseLines.map((line) => (
              <LineRow key={line.key} line={line} currency={currency} negative hasComparison={!!previousTotals} />
            ))}
            <TotalRow
              label="Total costs"
              minor={-expenseTotal}
              previousMinor={-previousExpenseTotal}
              currency={currency}
              hasComparison={!!previousTotals}
              negative
            />
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-line bg-surface-sunken">
              <th scope="row" className="px-5 py-3 text-left text-base font-semibold">Net profit</th>
              <td className="px-3 py-3 text-right text-lg font-semibold">
                <Money minor={netMinor} currency={currency} signed />
              </td>
              {previousTotals ? (
                <>
                  <td className="px-3 py-3 text-right text-ink-muted">
                    <Money minor={previousNetMinor} currency={currency} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Delta ratio={percentChange(netMinor, previousNetMinor)} showLabel={false} />
                  </td>
                </>
              ) : null}
            </tr>
          </tfoot>
        </table>
      </div>

      {basis === "priced" ? (
        <div className="border-t border-line bg-caution-soft px-5 py-3">
          <p className="text-sm text-caution-ink">
            <strong className="font-semibold">
              {excludedOrderCount.toLocaleString()} orders are not in this statement.
            </strong>{" "}
            They have no buying price yet, so counting their revenue and fees without their supplier cost
            would overstate profit. That is {formatMoney(excludedRevenueMinor, currency)} of sales left out
            entirely — the lines above still add up exactly.
          </p>
          <Link
            href="/orders?tab=awaiting_cost"
            className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-caution-ink underline underline-offset-2"
          >
            Enter the missing buying prices
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

/** A heading row that names the section; it carries no figure of its own. */
function SectionHeaderRow({
  label, icon: Icon, tone, columns,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "positive" | "negative";
  columns: number;
}) {
  return (
    <tr className="bg-surface-sunken/40">
      <th scope="colgroup" colSpan={columns} className="px-5 py-2 text-left">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase",
            tone === "positive" ? "text-positive-ink" : "text-negative-ink",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
      </th>
    </tr>
  );
}

function TotalRow({
  label, minor, previousMinor, currency, hasComparison, negative,
}: {
  label: string;
  minor: number;
  previousMinor: number;
  currency: string;
  hasComparison: boolean;
  negative?: boolean;
}) {
  return (
    <tr className="border-t border-line-strong">
      <th scope="row" className="px-5 py-2 text-left font-semibold">{label}</th>
      <td className={cn("px-3 py-2 text-right font-semibold", negative && "text-negative")}>
        <Money minor={minor} currency={currency} />
      </td>
      {hasComparison ? (
        <>
          <td className="px-3 py-2 text-right text-ink-muted">
            <Money minor={previousMinor} currency={currency} />
          </td>
          <td className="px-5 py-2 text-right">
            <Delta
              ratio={percentChange(Math.abs(minor), Math.abs(previousMinor))}
              showLabel={false}
              invert={negative}
            />
          </td>
        </>
      ) : null}
    </tr>
  );
}

function LineRow({
  line, currency, negative, hasComparison,
}: {
  line: PnlLine;
  currency: string;
  negative?: boolean;
  hasComparison: boolean;
}) {
  return (
    <tr className="transition-colors hover:bg-surface-hover">
      <th scope="row" className="py-2 pr-3 pl-9 text-left font-normal">
        <span className="inline-flex items-center gap-1 text-ink-muted">
          {line.label}
          {line.explain ? <InfoTip label={line.label}>{line.explain}</InfoTip> : null}
        </span>
      </th>
      <td className={cn("px-3 py-2 text-right", negative && "text-negative")}>
        <Money minor={negative ? -line.currentMinor : line.currentMinor} currency={currency} />
      </td>
      {hasComparison ? (
        <>
          <td className="px-3 py-2 text-right text-ink-muted">
            <Money minor={negative ? -line.previousMinor : line.previousMinor} currency={currency} />
          </td>
          <td className="px-5 py-2 text-right">
            <Delta
              ratio={percentChange(line.currentMinor, line.previousMinor)}
              showLabel={false}
              invert={negative}
            />
          </td>
        </>
      ) : null}
    </tr>
  );
}
