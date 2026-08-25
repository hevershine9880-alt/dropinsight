"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/table/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Money, Percent } from "@/components/domain/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { upsertSupplierAction } from "@/server/actions/suppliers";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import type { SupplierRow } from "@/lib/finance/products-query";
import { Truck, Pencil, ShieldCheck, ShieldAlert, Plus } from "lucide-react";

export function SuppliersTable({
  rows, currency, canManage,
}: {
  rows: SupplierRow[];
  currency: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = React.useState<SupplierRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (searchParams.get("action") === "add" && canManage) setCreating(true);
  }, [searchParams, canManage]);

  const columns: Column<SupplierRow>[] = [
    {
      key: "name",
      header: "Supplier",
      width: "22%",
      render: (row) => (
        <div className="min-w-0">
          <span className="block truncate font-medium text-ink">{row.name}</span>
          <span className="block truncate text-xs text-ink-muted">
            {row.website ?? row.contactEmail ?? `${row.productCount} products`}
          </span>
        </div>
      ),
    },
    {
      key: "lines",
      header: "Order lines",
      align: "right",
      render: (row) => (
        <div>
          <span className="tabular font-medium">{row.orderLineCount.toLocaleString()}</span>
          <span className="block text-xs text-ink-muted">{row.productCount} products</span>
        </div>
      ),
    },
    {
      key: "spend",
      header: "Spend",
      align: "right",
      render: (row) => (
        <div>
          <Money minor={row.spendMinor} currency={currency} />
          <span className="tabular block text-xs text-ink-muted">
            avg <Money minor={row.avgUnitCostMinor} currency={currency} /> / unit
          </span>
        </div>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      hideBelow: "lg",
      render: (row) => <Money minor={row.revenueMinor} currency={currency} />,
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      render: (row) => (
        <div>
          <Money minor={row.profitMinor} currency={currency} signed />
          <span className="block text-xs text-ink-muted"><Percent ratio={row.marginRatio} /> margin</span>
        </div>
      ),
    },
    {
      key: "refunds",
      header: "Refund rate",
      align: "right",
      hideBelow: "md",
      render: (row) =>
        row.refundCount === 0 ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span className={cn("tabular", row.refundRate > 0.15 && "font-medium text-negative")}>
            {(row.refundRate * 100).toFixed(0)}%
            <span className="ml-1 text-xs text-ink-muted">({row.refundCount})</span>
          </span>
        ),
    },
    {
      key: "reliability",
      header: "Settles claims",
      render: (row) =>
        row.reliabilityRatio === null ? (
          <span className="text-sm text-ink-subtle">no claims yet</span>
        ) : (
          <Badge
            tone={row.reliabilityRatio >= 0.85 ? "positive" : row.reliabilityRatio >= 0.6 ? "caution" : "negative"}
            icon={row.reliabilityRatio >= 0.85 ? ShieldCheck : ShieldAlert}
          >
            {(row.reliabilityRatio * 100).toFixed(0)}% settled
          </Badge>
        ),
    },
    {
      key: "outstanding",
      header: "Owes you",
      align: "right",
      render: (row) => (
        <span className={row.outstandingMinor > 0 ? "font-medium text-negative" : "text-ink-subtle"}>
          <Money minor={row.outstandingMinor} currency={currency} muteZero />
        </span>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "3rem",
      render: (row) => (
        <button
          type="button"
          onClick={() => setEditing(row)}
          aria-label={`Edit ${row.name}`}
          className="inline-grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      ),
    });
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            {rows.length} supplier{rows.length === 1 ? "" : "s"}
          </p>
          {canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" aria-hidden />
              Add a supplier
            </Button>
          ) : null}
        </div>

        <DataTable
          caption={`Suppliers, ${rows.length} in total`}
          columns={columns}
          rows={rows}
          emptyState={
            <EmptyState
              icon={Truck}
              title="No suppliers yet"
              description="Suppliers are created as you enter buying prices on orders, so you can compare cost and reliability over time. You can also add one here and pick it from the cost fields."
              action={
                canManage ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus className="size-4" aria-hidden />
                    Add a supplier
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>

      <SupplierDialog
        open={creating || editing !== null}
        supplier={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
      />
    </>
  );
}

function SupplierDialog({
  open, supplier, onClose,
}: {
  open: boolean;
  supplier: SupplierRow | null;
  onClose: () => void;
}) {
  const [name, setName] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { toast } = useToast();
  const router = useRouter();

  React.useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    setWebsite(supplier?.website ?? "");
    setContactEmail(supplier?.contactEmail ?? "");
    setNotes(supplier?.notes ?? "");
    setErrors({});
  }, [open, supplier]);

  const save = async () => {
    setSaving(true);
    const result = await upsertSupplierAction({
      id: supplier?.id,
      name,
      website: website || undefined,
      contactEmail: contactEmail || undefined,
      notes: notes || undefined,
    });
    setSaving(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast({ tone: "error", title: "Couldn't save", description: result.error });
      return;
    }
    toast({ tone: "success", title: supplier ? "Supplier updated" : "Supplier added" });
    onClose();
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={supplier ? `Edit ${supplier.name}` : "Add a supplier"}
      description="Suppliers are usually created for you when you enter a buying price. Adding one here lets you record contact details and notes up front."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!name.trim()}>
            {supplier ? "Save changes" : "Add supplier"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="supplier-name" error={errors.name} required>
          <Input
            id="supplier-name"
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Shenzhen Kaiyue Trading"
            invalid={!!errors.name}
          />
        </Field>
        <Field label="Website" htmlFor="supplier-website" error={errors.website} hint="Optional.">
          <Input id="supplier-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" />
        </Field>
        <Field label="Contact email" htmlFor="supplier-email" error={errors.contactEmail} hint="Optional.">
          <Input id="supplier-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="sales@example.com" />
        </Field>
        <Field label="Notes" htmlFor="supplier-notes" hint="Anything worth remembering — lead times, how they handle claims.">
          <Textarea id="supplier-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
      </div>
    </Dialog>
  );
}
