"use client";

import * as React from "react";
import { X, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { setCostsBulkAction } from "@/server/actions/costs";
import type { OrderRow } from "@/lib/finance/orders-query";

/**
 * Bulk action bar for selected orders.
 *
 * Applying one unit price across a selection is genuinely useful when the
 * selection is all the same product — which is why the dialog says exactly how
 * many distinct products are in the selection before anything is written.
 */
export function BulkCostBar({
  selectedIds, rows, currency, onDone, onClear,
}: {
  selectedIds: string[];
  rows: OrderRow[];
  currency: string;
  onDone: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [unitCost, setUnitCost] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const lines = selectedRows.flatMap((r) => r.lines);
  const distinctProducts = new Set(selectedRows.map((r) => r.firstItemSku ?? r.firstItemTitle)).size;

  const apply = async () => {
    setSaving(true);
    const result = await setCostsBulkAction({
      rows: lines.map((line) => ({
        orderItemId: line.id,
        unitCost,
        supplierName: supplier.trim() || undefined,
      })),
    });
    setSaving(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't apply those prices", description: result.error });
      return;
    }
    setOpen(false);
    setUnitCost("");
    setSupplier("");
    toast({
      tone: "success",
      title: `${result.data!.saved} buying prices saved`,
      description: result.data!.skipped > 0 ? `${result.data!.skipped} rows were skipped.` : undefined,
    });
    onDone();
  };

  return (
    <>
      <div className="animate-rise flex flex-wrap items-center gap-3 border-y border-brand/25 bg-brand-soft px-4 py-2.5">
        <p className="text-base font-medium text-brand-ink">
          {selectedIds.length} order{selectedIds.length === 1 ? "" : "s"} selected
          {distinctProducts > 1 ? ` · ${distinctProducts} different products` : ""}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            <Tag className="size-3.5" aria-hidden />
            Set buying price
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Set one buying price across the selection"
        description={`${lines.length} order line${lines.length === 1 ? "" : "s"} across ${selectedIds.length} order${selectedIds.length === 1 ? "" : "s"}.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void apply()} loading={saving} disabled={!unitCost.trim()}>
              {saving ? "Saving" : `Apply to ${lines.length} lines`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {distinctProducts > 1 ? (
            <p className="rounded-lg bg-caution-soft px-3 py-2 text-sm text-caution-ink">
              This selection covers {distinctProducts} different products. One price for all of them is
              rarely right — consider selecting a single product first.
            </p>
          ) : null}

          <Field
            label={`Buying price per unit (${currency})`}
            htmlFor="bulk-cost"
            hint="This is the price per item, not per order. Quantity is applied automatically."
          >
            <Input
              id="bulk-cost"
              data-autofocus
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="4.50"
            />
          </Field>

          <Field label="Supplier" htmlFor="bulk-supplier" hint="Optional. A new supplier is created if this name is new.">
            <Input
              id="bulk-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Shenzhen Kaiyue Trading"
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
