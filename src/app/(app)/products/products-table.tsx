"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/table/data-table";
import { Pagination } from "@/components/table/pagination";
import { TableSearch } from "@/components/table/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Money, Percent } from "@/components/domain/money";

import { useQueryState } from "@/lib/use-query-state";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ProductRow } from "@/lib/finance/products-query";
import { VERDICT_META, type ListingVerdict } from "@/lib/finance/listing-health";
import { VerdictBadge } from "./verdict-badge";
import { Package, Plus, AlertTriangle, ArrowRight } from "lucide-react";

export function ProductsTable({
  rows, currency, sort, canWriteCosts, activeVerdict, totalCount,
}: {
  rows: ProductRow[];
  currency: string;
  sort: { key: string; direction: "asc" | "desc" };
  canWriteCosts: boolean;
  activeVerdict: ListingVerdict | null;
  totalCount: number;
}) {
  const { get, set, pending } = useQueryState();
  const page = Number(get("page", "1"));
  const pageSize = Number(get("pageSize", "20"));
  const search = get("search");

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: string) => {
    const direction = sort.key === key && sort.direction === "desc" ? "asc" : "desc";
    set({ sort: `${key}:${direction}` });
  };

  const columns: Column<ProductRow>[] = [
    {
      key: "title",
      header: "Product",
      sortable: true,
      width: "26%",
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/products/${row.id}`} className="block truncate font-medium text-ink hover:text-brand hover:underline">
            {row.title}
          </Link>
          <span className="block truncate text-xs text-ink-muted">
            {row.sku ?? "no SKU"}
            {row.supplierNames.length > 0 ? ` · ${row.supplierNames.join(", ")}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "sold",
      header: "Sold",
      sortable: true,
      align: "right",
      render: (row) => (
        <div>
          <span className="tabular font-medium">{row.unitsSold.toLocaleString()}</span>
          <span className="block text-xs text-ink-muted">{row.orderCount} orders</span>
        </div>
      ),
    },
    {
      key: "avgSale",
      header: "Avg sale",
      align: "right",
      hideBelow: "md",
      render: (row) => <Money minor={row.avgSaleMinor} currency={currency} />,
    },
    {
      key: "lastCost",
      header: "Last cost",
      align: "right",
      render: (row) =>
        row.lastCostMinor === null ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <Money minor={row.lastCostMinor} currency={currency} />
        ),
    },
    {
      key: "costRange",
      header: "Cost range",
      align: "right",
      hideBelow: "xl",
      render: (row) =>
        !row.costRange ? (
          <span className="text-ink-subtle">—</span>
        ) : row.costRange.minMinor === row.costRange.maxMinor ? (
          <span className="tabular text-ink-muted">{formatMoney(row.costRange.minMinor, currency)}</span>
        ) : (
          <span className="tabular text-ink-muted">
            {formatMoney(row.costRange.minMinor, currency)} – {formatMoney(row.costRange.maxMinor, currency)}
          </span>
        ),
    },
    {
      key: "breakEven",
      header: "Break-even",
      align: "right",
      hideBelow: "xl",
      render: (row) => {
        if (row.breakEvenMinor === null) return <span className="text-ink-subtle">—</span>;
        const below = row.currentPriceMinor < row.breakEvenMinor;
        return (
          <span className={cn("tabular", below && "font-medium text-negative")}>
            {formatMoney(row.breakEvenMinor, currency)}
            {below ? <AlertTriangle className="ml-1 inline size-3" aria-label="Listed below break-even" /> : null}
          </span>
        );
      },
    },
    {
      key: "profit",
      header: "Total profit",
      sortable: true,
      align: "right",
      render: (row) => <Money minor={row.profitMinor} currency={currency} signed />,
    },
    {
      key: "margin",
      header: "Margin",
      sortable: true,
      align: "right",
      render: (row) => <Percent ratio={row.marginRatio} />,
    },
    {
      key: "refunds",
      header: "Refunds",
      sortable: true,
      align: "right",
      hideBelow: "lg",
      render: (row) =>
        row.refundCount === 0 ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span className={cn("tabular", row.refundRate > 0.15 && "font-medium text-negative")}>
            {row.refundCount}
            <span className="ml-1 text-xs text-ink-muted">({(row.refundRate * 100).toFixed(0)}%)</span>
          </span>
        ),
    },
    {
      key: "verdict",
      header: "Verdict",
      width: "17%",
      render: (row) => {
        // A winner's reason is "68 sold at 34% margin" — the Sold and Margin
        // columns already say that. Only spend the line when it adds something.
        const worthSaying = VERDICT_META[row.health.verdict].urgency <= 4;
        return (
          <div className="min-w-0">
            <VerdictBadge verdict={row.health.verdict} />
            {worthSaying ? (
              <span className="mt-0.5 block truncate text-xs text-ink-muted" title={row.health.reason}>
                {row.health.reason}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "action",
      header: <span className="sr-only">Action</span>,
      align: "right",
      width: "8rem",
      render: (row) =>
        row.unpricedLines > 0 && canWriteCosts ? (
          <Link
            href={`/orders?tab=awaiting_cost&search=${encodeURIComponent(row.sku ?? row.title.slice(0, 24))}`}
            className="inline-flex items-center gap-1 rounded-lg bg-caution-soft px-2 py-1 text-xs font-medium whitespace-nowrap text-caution-ink transition-colors hover:brightness-97"
          >
            <Plus className="size-3" aria-hidden />
            Price {row.unpricedLines}
          </Link>
        ) : (
          <Link
            href={`/products/${row.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-brand hover:underline"
          >
            Open
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        ),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">
          {activeVerdict ? (
            <>
              Showing <span className="font-medium text-ink">{rows.length.toLocaleString()}</span>{" "}
              {VERDICT_META[activeVerdict].label.toLowerCase()} listing{rows.length === 1 ? "" : "s"} of{" "}
              {totalCount.toLocaleString()}
            </>
          ) : (
            <>{rows.length.toLocaleString()} listing{rows.length === 1 ? "" : "s"} sold in this period</>
          )}
        </p>
        <TableSearch label="Search listings" placeholder="Product title or SKU…" />
      </div>

      <DataTable
        caption={`Listings, ${rows.length} in total`}
        columns={columns}
        rows={paged}
        sort={sort}
        onSortChange={toggleSort}
        loading={pending}
        emptyState={
          <EmptyState
            icon={Package}
            title={
              activeVerdict
                ? `No ${VERDICT_META[activeVerdict].label.toLowerCase()} listings`
                : search
                  ? "No listings match that search"
                  : "No listings yet"
            }
            description={
              activeVerdict
                ? `Nothing in this period is ${VERDICT_META[activeVerdict].label.toLowerCase()}. ${VERDICT_META[activeVerdict].meaning}`
                : search
                  ? "Try part of a product title or a SKU."
                  : "Listings are built from your order lines, so they appear as soon as your first orders sync. Nothing to add by hand."
            }
          />
        }
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={rows.length}
        itemLabel="listings"
        onPageChange={(next) => set({ page: next === 1 ? null : String(next) }, { resetPage: false })}
        onPageSizeChange={(size) => set({ pageSize: size === 20 ? null : String(size) })}
      />
    </Card>
  );
}
