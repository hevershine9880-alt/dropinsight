"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/table/data-table";
import { Pagination } from "@/components/table/pagination";
import { SegmentedControl } from "@/components/table/filter-chips";
import { TableSearch } from "@/components/table/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/domain/money";
import { SupplierClaimBadge } from "@/components/domain/status";
import { SupplierClaimAnswer } from "@/components/domain/supplier-claim-answer";
import { BulkClaimBar } from "./bulk-claim-bar";
import { useQueryState } from "@/lib/use-query-state";
import type { RefundRow, RefundTab, ClaimTab } from "@/lib/finance/refunds-query";
import { CheckCircle2, PackageSearch, Eye } from "lucide-react";

const TAB_LABELS: Record<RefundTab, string> = {
  refunds: "Refunds",
  returns: "Returns",
  cancelled: "Cancelled",
};

const CLAIM_LABELS: Record<ClaimTab, string> = {
  needs_answer: "Needs answer",
  expecting: "Expecting",
  settled: "Settled",
  all: "All",
};

export function RefundsTable({
  rows, total, tabCounts, claimCounts, page, pageSize, currency, canAnswer,
}: {
  rows: RefundRow[];
  total: number;
  tabCounts: Record<RefundTab, number>;
  claimCounts: Record<ClaimTab, number>;
  page: number;
  pageSize: number;
  currency: string;
  canAnswer: boolean;
}) {
  const { get, set, pending } = useQueryState();
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const tab = (get("tab") || "refunds") as RefundTab;
  const claimTab = (get("claim") || "all") as ClaimTab;

  React.useEffect(() => { setSelected(new Set()); }, [tab, claimTab, page]);

  const columns: Column<RefundRow>[] = [
    {
      key: "refunded",
      header: "Refunded",
      render: (row) => (
        <div className="min-w-0">
          <time dateTime={row.refundedAt.toISOString()} className="block whitespace-nowrap">
            {format(row.refundedAt, "d MMM yyyy")}
          </time>
          <span className="block text-xs text-ink-muted">
            ordered {format(row.orderedAt, "d MMM")} · {row.ageDays}d ago
          </span>
        </div>
      ),
    },
    {
      key: "order",
      header: "Order",
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/orders/${row.orderId}`} className="tabular block truncate font-medium text-brand hover:underline">
            {row.ebayOrderId}
          </Link>
          <span className="block truncate text-xs text-ink-muted">{row.buyerUsername}</span>
        </div>
      ),
    },
    {
      key: "product",
      header: "Item",
      hideBelow: "lg",
      width: "20%",
      render: (row) => (
        <div className="min-w-0">
          <span className="block truncate" title={row.productTitle}>{row.productTitle}</span>
          {row.reason ? <span className="block truncate text-xs text-ink-muted">{row.reason}</span> : null}
        </div>
      ),
    },
    {
      key: "buyerRefund",
      header: "Buyer refund",
      align: "right",
      render: (row) => <Money minor={row.buyerRefundMinor} currency={currency} />,
    },
    {
      key: "feeCredit",
      header: "Fee credit",
      align: "right",
      hideBelow: "xl",
      render: (row) => (
        <span className="text-positive"><Money minor={row.feeCreditMinor} currency={currency} muteZero /></span>
      ),
    },
    {
      key: "recovered",
      header: "Recovered",
      align: "right",
      render: (row) => (
        <span className="text-positive"><Money minor={row.recoveredMinor} currency={currency} muteZero /></span>
      ),
    },
    {
      key: "loss",
      header: "Your loss",
      align: "right",
      render: (row) => (
        <span className={row.netLossMinor > 0 ? "font-medium text-negative" : "text-positive"}>
          <Money minor={row.netLossMinor} currency={currency} />
        </span>
      ),
    },
    {
      key: "claim",
      header: "Supplier",
      render: (row) =>
        canAnswer && ["NOT_ASKED", "ASKED"].includes(row.supplierClaim) ? (
          <SupplierClaimAnswer
            size="sm"
            target={{
              refundId: row.id,
              orderLabel: row.ebayOrderId,
              buyerRefundMinor: row.buyerRefundMinor,
              feeCreditMinor: row.feeCreditMinor,
              recoveredMinor: row.recoveredMinor,
              currency,
              supplierName: row.supplierName,
              currentClaim: row.supplierClaim,
            }}
            onAnswered={() => router.refresh()}
          />
        ) : (
          <div className="min-w-0">
            <SupplierClaimBadge claim={row.supplierClaim} />
            {row.supplierName ? (
              <span className="mt-0.5 block truncate text-xs text-ink-muted">{row.supplierName}</span>
            ) : null}
          </div>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "3rem",
      render: (row) => (
        <Link
          href={`/orders/${row.orderId}`}
          aria-label={`Open order ${row.ebayOrderId}`}
          className="inline-grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <Eye className="size-4" aria-hidden />
        </Link>
      ),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 p-4">
        <SegmentedControl
          label="Refund type"
          value={tab}
          onChange={(next) => set({ tab: next === "refunds" ? null : next })}
          options={(Object.keys(TAB_LABELS) as RefundTab[]).map((key) => ({
            value: key, label: TAB_LABELS[key], count: tabCounts[key],
          }))}
        />

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <SegmentedControl
            label="Supplier claim status"
            size="sm"
            value={claimTab}
            onChange={(next) => set({ claim: next === "all" ? null : next })}
            options={(Object.keys(CLAIM_LABELS) as ClaimTab[]).map((key) => ({
              value: key, label: CLAIM_LABELS[key], count: claimCounts[key],
            }))}
          />
          <TableSearch label="Search refunds" placeholder="Order, buyer or item…" />
        </div>
      </div>

      {selected.size > 0 && canAnswer ? (
        <BulkClaimBar
          selectedIds={[...selected]}
          onDone={() => { setSelected(new Set()); router.refresh(); }}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      <DataTable
        caption={`Refunds, ${total} in total`}
        columns={columns}
        rows={rows}
        selectedIds={canAnswer ? selected : undefined}
        onSelectionChange={canAnswer ? setSelected : undefined}
        loading={pending}
        emptyState={
          tab === "returns" && total === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              tone="positive"
              title="No returns in this period"
              description="Nothing came back. Return cases appear here as eBay opens them."
            />
          ) : (
            <EmptyState
              icon={PackageSearch}
              tone={claimTab === "needs_answer" ? "positive" : "neutral"}
              title={
                claimTab === "needs_answer"
                  ? "Every refund has been answered"
                  : "No refunds in this period"
              }
              description={
                claimTab === "needs_answer"
                  ? "You have told DropInsight what happened with each supplier, so your loss figures are accurate."
                  : "Refunds appear here within a minute of eBay processing them."
              }
            />
          )
        }
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        itemLabel="refunds"
        onPageChange={(next) => set({ page: next === 1 ? null : String(next) }, { resetPage: false })}
        onPageSizeChange={(size) => set({ pageSize: size === 20 ? null : String(size) })}
      />
    </Card>
  );
}
