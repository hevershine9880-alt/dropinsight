"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/table/data-table";
import { Pagination } from "@/components/table/pagination";
import { FilterChips, SegmentedControl, ActiveFilters } from "@/components/table/filter-chips";
import { TableSearch } from "@/components/table/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Money, Percent } from "@/components/domain/money";
import { OrderStatusBadge } from "@/components/domain/status";
import { useQueryState } from "@/lib/use-query-state";
import { cn } from "@/lib/cn";
import { InlineCostCell } from "./inline-cost-cell";
import { BulkCostBar } from "./bulk-cost-bar";
import type { OrderRow, OrderTab, FulfilmentFilter } from "@/lib/finance/orders-query";
import { ShoppingCart, PackageSearch, Eye, AlertTriangle } from "lucide-react";

const TAB_LABELS: Record<OrderTab, string> = {
  all: "All",
  awaiting_cost: "Awaiting cost",
  refunded: "Refunded",
  returned: "Returned",
  cancelled: "Cancelled",
  made_a_loss: "Made a loss",
};

const FULFILMENT_LABELS: Record<FulfilmentFilter, string> = {
  awaiting_dispatch: "Awaiting dispatch",
  past_deadline: "Past dispatch deadline",
  dispatched_on_time: "Dispatched on time",
  dispatched_late: "Dispatched late",
  in_transit: "In transit",
  delivered: "Delivered",
  no_tracking: "Dispatched without tracking",
};

export function OrdersTable({
  rows, total, tabCounts, fulfilmentCounts, page, pageSize, sort,
  currency, canWriteCosts, canSeeProfit,
}: {
  rows: OrderRow[];
  total: number;
  tabCounts: Record<OrderTab, number>;
  fulfilmentCounts: Record<FulfilmentFilter, number>;
  page: number;
  pageSize: number;
  sort: { key: string; direction: "asc" | "desc" };
  currency: string;
  canWriteCosts: boolean;
  canSeeProfit: boolean;
}) {
  const { get, getAll, set, clear, pending } = useQueryState();
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const tab = (get("tab") || "all") as OrderTab;
  const fulfilment = getAll("fulfilment") as FulfilmentFilter[];
  const search = get("search");

  // A change of filter invalidates whatever was selected under the old one.
  React.useEffect(() => { setSelected(new Set()); }, [tab, fulfilment.join(","), search, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key: string) => {
    const direction = sort.key === key && sort.direction === "desc" ? "asc" : "desc";
    set({ sort: `${key}:${direction}` });
  };

  const activeFilters = [
    ...fulfilment.map((f) => ({ key: `fulfilment:${f}`, label: FULFILMENT_LABELS[f] })),
    ...(search ? [{ key: "search", label: `“${search}”` }] : []),
    ...(tab !== "all" ? [{ key: "tab", label: TAB_LABELS[tab] }] : []),
  ];

  const removeFilter = (key: string) => {
    if (key === "search") return set({ search: null });
    if (key === "tab") return set({ tab: null });
    const value = key.split(":")[1] as FulfilmentFilter;
    set({ fulfilment: fulfilment.filter((f) => f !== value) });
  };

  const columns: Column<OrderRow>[] = [
    {
      key: "date",
      header: "Order",
      sortable: true,
      width: "16%",
      render: (row) => (
        <div className="min-w-0">
          <Link
            href={`/orders/${row.id}`}
            className="tabular block truncate font-medium text-brand hover:underline"
          >
            {row.ebayOrderId}
          </Link>
          <span className="block text-xs text-ink-muted">
            <time dateTime={row.orderDate.toISOString()}>{format(row.orderDate, "d MMM yyyy, HH:mm")}</time>
          </span>
        </div>
      ),
    },
    {
      key: "account",
      header: "Account",
      hideBelow: "xl",
      width: "11%",
      render: (row) => <span className="block truncate text-ink-muted">{row.accountUsername}</span>,
    },
    {
      key: "buyer",
      header: "Buyer",
      sortable: true,
      hideBelow: "lg",
      width: "11%",
      render: (row) => (
        <div className="min-w-0">
          <span className="block truncate">{row.buyerUsername}</span>
          {row.buyerFeedback !== null ? (
            <span className="tabular block text-xs text-ink-subtle">{row.buyerFeedback}% feedback</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "product",
      header: "Product",
      width: "24%",
      render: (row) => (
        <div className="min-w-0">
          <span className="block truncate" title={row.firstItemTitle}>{row.firstItemTitle}</span>
          <span className="block text-xs text-ink-muted">
            {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
            {row.firstItemSku ? ` · ${row.firstItemSku}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Sold",
      sortable: true,
      align: "right",
      render: (row) => <Money minor={row.profit.revenueMinor} currency={currency} />,
    },
    {
      key: "fees",
      header: "Fees",
      align: "right",
      hideBelow: "md",
      render: (row) => (
        <span className="text-ink-muted">
          <Money minor={row.profit.ebayFeesMinor + row.profit.adFeesMinor} currency={currency} muteZero />
        </span>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      width: "9%",
      render: (row) => (
        <InlineCostCell row={row} currency={currency} editable={canWriteCosts} onSaved={() => router.refresh()} />
      ),
    },
  ];

  if (canSeeProfit) {
    columns.push(
      {
        key: "profit",
        header: "Profit",
        sortable: true,
        align: "right",
        render: (row) =>
          row.profit.isNonLossCancellation ? (
            <span className="text-ink-subtle">—</span>
          ) : row.profit.isPriced ? (
            <Money minor={row.profit.netProfitMinor} currency={currency} signed />
          ) : (
            <span className="text-ink-subtle" title="No buying price entered yet">—</span>
          ),
      },
      {
        key: "margin",
        header: "Margin",
        sortable: true,
        align: "right",
        hideBelow: "md",
        render: (row) =>
          row.profit.isPriced && !row.profit.isNonLossCancellation ? (
            <span className={cn(
              (row.profit.marginRatio ?? 0) < 0 ? "text-negative" :
              (row.profit.marginRatio ?? 0) < 0.08 ? "text-caution-ink" : "",
            )}>
              <Percent ratio={row.profit.marginRatio} />
            </span>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
    );
  }

  columns.push(
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <OrderStatusBadge
          fulfillmentStatus={row.fulfillmentStatus}
          cancelState={row.cancelState}
          paymentStatus={row.paymentStatus}
        />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "3rem",
      render: (row) => (
        <Link
          href={`/orders/${row.id}`}
          aria-label={`Open order ${row.ebayOrderId}`}
          className="inline-grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <Eye className="size-4" aria-hidden />
        </Link>
      ),
    },
  );

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 p-4">
        <FilterChips
          label="Fulfilment"
          multiple
          value={fulfilment}
          onChange={(next) => set({ fulfilment: next })}
          options={(Object.keys(FULFILMENT_LABELS) as FulfilmentFilter[]).map((key) => ({
            value: key,
            label: FULFILMENT_LABELS[key],
            count: fulfilmentCounts[key],
          }))}
        />

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SegmentedControl
            label="Order status"
            value={tab}
            onChange={(next) => set({ tab: next === "all" ? null : next })}
            options={(Object.keys(TAB_LABELS) as OrderTab[]).map((key) => ({
              value: key,
              label: TAB_LABELS[key],
              count: tabCounts[key],
            }))}
          />
          <TableSearch label="Search orders" placeholder="Order number, buyer, SKU, tracking…" />
        </div>

        <ActiveFilters filters={activeFilters} onRemove={removeFilter} onClearAll={() => clear(["period", "from", "to"])} />
      </div>

      {selected.size > 0 && canWriteCosts ? (
        <BulkCostBar
          selectedIds={[...selected]}
          rows={rows}
          currency={currency}
          onDone={() => { setSelected(new Set()); router.refresh(); }}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      <DataTable
        caption={`Orders, ${total} in total`}
        columns={columns}
        rows={rows}
        sort={sort}
        onSortChange={toggleSort}
        selectedIds={canWriteCosts ? selected : undefined}
        onSelectionChange={canWriteCosts ? setSelected : undefined}
        loading={pending}
        emptyState={<OrdersEmpty tab={tab} hasFilters={activeFilters.length > 0} onClear={() => clear(["period"])} />}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        itemLabel="orders"
        onPageChange={(next) => set({ page: next === 1 ? null : String(next) }, { resetPage: false })}
        onPageSizeChange={(size) => set({ pageSize: size === 20 ? null : String(size) })}
      />
    </Card>
  );
}

function OrdersEmpty({
  tab, hasFilters, onClear,
}: {
  tab: OrderTab;
  hasFilters: boolean;
  onClear: () => void;
}) {
  if (tab === "awaiting_cost") {
    return (
      <EmptyState
        icon={ShoppingCart}
        tone="positive"
        title="Every order has a buying price"
        description="Nothing is waiting to be costed, so your profit figures are complete for this period."
      />
    );
  }
  if (tab === "made_a_loss") {
    return (
      <EmptyState
        icon={AlertTriangle}
        tone="positive"
        title="No orders lost money"
        description="Every priced order in this period came out ahead of its costs and fees."
      />
    );
  }
  return (
    <EmptyState
      icon={PackageSearch}
      title={hasFilters ? "No orders match these filters" : "No orders in this period"}
      description={
        hasFilters
          ? "Try removing a filter, or widening the date range."
          : "Orders appear here within a minute of landing on eBay. If a store was connected recently, its history may still be importing."
      }
      action={
        hasFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover"
          >
            Clear filters
          </button>
        ) : undefined
      }
    />
  );
}
