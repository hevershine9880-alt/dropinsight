"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/table/data-table";
import { SegmentedControl } from "@/components/table/filter-chips";
import { TableSearch } from "@/components/table/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/domain/money";
import { Badge } from "@/components/ui/badge";
import { SupplierClaimBadge } from "@/components/domain/status";
import { SupplierClaimAnswer } from "@/components/domain/supplier-claim-answer";
import { BulkClaimBar } from "../returns/bulk-claim-bar";
import { useQueryState } from "@/lib/use-query-state";
import { cn } from "@/lib/cn";
import type { RefundRow } from "@/lib/finance/refunds-query";
import { CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * The chase queue. (R5.6)
 *
 * Every refund where the supplier side is unanswered or promised, oldest first,
 * because age is what turns a recoverable amount into a write-off. Answering
 * here updates the order's profit immediately.
 */
export function ChaseQueue({
  rows, currency, canAnswer, counts,
}: {
  rows: RefundRow[];
  currency: string;
  canAnswer: boolean;
  counts: { open: number; not_asked: number; promised: number };
}) {
  const { get, set, pending } = useQueryState();
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const tab = get("tab") || "open";

  React.useEffect(() => { setSelected(new Set()); }, [tab]);

  const columns: Column<RefundRow>[] = [
    {
      key: "order",
      header: "Order",
      width: "30%",
      render: (row) => (
        <div className="min-w-0">
          <span className="block truncate font-medium text-ink" title={row.productTitle}>
            {row.productTitle}
          </span>
          <span className="block truncate text-xs text-ink-muted">
            <Link href={`/orders/${row.orderId}`} className="tabular text-brand hover:underline">
              {row.ebayOrderId}
            </Link>
            {" · "}{row.buyerUsername}
            {row.supplierName ? ` · ${row.supplierName}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "age",
      header: "Refunded",
      render: (row) => {
        const stale = row.ageDays >= 21;
        return (
          <div className="min-w-0">
            <span className={cn("block whitespace-nowrap", stale && "font-medium text-negative")}>
              {row.ageDays === 0 ? "today" : `${row.ageDays}d ago`}
            </span>
            <time dateTime={row.refundedAt.toISOString()} className="block text-xs text-ink-muted">
              {format(row.refundedAt, "d MMM yyyy")}
            </time>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="min-w-0">
          <SupplierClaimBadge claim={row.supplierClaim} />
          {row.promisedByDate ? (
            <span
              className={cn(
                "mt-0.5 block text-xs",
                row.promisedByDate < new Date() ? "font-medium text-negative" : "text-ink-muted",
              )}
            >
              {row.promisedByDate < new Date() ? "overdue since " : "due "}
              {format(row.promisedByDate, "d MMM")}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "recoverable",
      header: "Recoverable",
      align: "right",
      render: (row) => (
        <div>
          <span className="font-medium"><Money minor={row.recoverableMinor} currency={currency} /></span>
          <span className="block text-xs text-ink-muted">
            of <Money minor={row.buyerRefundMinor} currency={currency} /> refunded
          </span>
        </div>
      ),
    },
    {
      key: "answer",
      header: "Record the answer",
      width: "28%",
      render: (row) =>
        canAnswer ? (
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
          <span className="text-sm text-ink-subtle">Your role cannot answer refunds</span>
        ),
    },
  ];

  const overdue = rows.filter((r) => r.promisedByDate && r.promisedByDate < new Date()).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Chase queue"
        description="Every refund where the supplier side is unanswered or promised. Answers update the order's profit immediately."
        action={
          overdue > 0 ? (
            <Badge tone="negative" icon={AlertTriangle}>{overdue} overdue</Badge>
          ) : null
        }
      />

      <div className="flex flex-col items-stretch gap-3 px-5 pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <SegmentedControl
          label="Claim status"
          size="sm"
          value={tab}
          onChange={(next) => set({ tab: next === "open" ? null : next })}
          options={[
            { value: "open", label: "All open", count: counts.open },
            { value: "not_asked", label: "Not asked", count: counts.not_asked },
            { value: "promised", label: "Promised", count: counts.promised },
          ]}
        />
        <TableSearch label="Search the chase queue" placeholder="Order, buyer or product…" />
      </div>

      {selected.size > 0 && canAnswer ? (
        <BulkClaimBar
          selectedIds={[...selected]}
          onDone={() => { setSelected(new Set()); router.refresh(); }}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      <DataTable
        caption="Open supplier refund claims, oldest first"
        columns={columns}
        rows={rows}
        selectedIds={canAnswer ? selected : undefined}
        onSelectionChange={canAnswer ? setSelected : undefined}
        loading={pending}
        emptyState={
          <EmptyState
            icon={CheckCircle2}
            tone="positive"
            title="Supplier refunds are all settled"
            description="Nothing is waiting on a supplier. Every refund has an answer, so your loss figures are complete."
          />
        }
      />

      {rows.length >= 300 ? (
        <p className="border-t border-line px-5 py-2.5 text-sm text-ink-muted">
          Showing the 300 oldest open claims. Answer some, or narrow with the search, to see the rest.
        </p>
      ) : null}
    </Card>
  );
}
