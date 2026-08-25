"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { setCostAction, clearCostAction, suggestCostAction } from "@/server/actions/costs";
import { formatMoney, toDecimalString } from "@/lib/money";
import { Plus, Pencil, Sparkles, History, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface CostHistoryEntry {
  id: string;
  unitCostMinor: number;
  source: string;
  supplierName: string | null;
  createdAt: string;
  createdBy: string | null;
}

interface Line {
  id: string;
  title: string;
  sku: string | null;
  productId: string | null;
  quantity: number;
  unitPriceMinor: number;
  currentCostMinor: number | null;
  supplierName: string | null;
  supplierOrderNumber: string | null;
  history: CostHistoryEntry[];
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Entered by hand",
  SPREADSHEET: "Spreadsheet mode",
  CSV_IMPORT: "CSV import",
};

export function OrderLines({
  currency, lines, editable,
}: {
  currency: string;
  lines: Line[];
  editable: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title={lines.length === 1 ? "Item" : `${lines.length} items`}
        description={editable ? "The buying price is per unit — quantity is applied for you." : undefined}
      />
      <ul className="divide-y divide-line border-t border-line">
        {lines.map((line) => (
          <LineRow key={line.id} line={line} currency={currency} editable={editable} />
        ))}
      </ul>
    </Card>
  );
}

function LineRow({
  line, currency, editable,
}: {
  line: Line;
  currency: string;
  editable: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [cost, setCost] = React.useState("");
  const [supplier, setSupplier] = React.useState(line.supplierName ?? "");
  const [supplierOrder, setSupplierOrder] = React.useState(line.supplierOrderNumber ?? "");
  const [suggestion, setSuggestion] = React.useState<{ unitCostMinor: number; basis: string; supplierName: string | null } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  // Same reasoning as the inline cell: a late suggestion must not clobber
  // whatever the user has already typed.
  const touched = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const soldMinor = line.unitPriceMinor * line.quantity;
  const totalCostMinor = line.currentCostMinor !== null ? line.currentCostMinor * line.quantity : null;

  const open = async () => {
    touched.current = false;
    setEditing(true);
    setError(null);
    setCost(line.currentCostMinor !== null ? toDecimalString(line.currentCostMinor, currency) : "");

    const result = await suggestCostAction(line.id);
    if (result.ok && result.data) {
      setSuggestion(result.data);
      if (line.currentCostMinor === null && !touched.current) {
        setCost(toDecimalString(result.data.unitCostMinor, currency));
        if (result.data.supplierName && !supplier) setSupplier(result.data.supplierName);
      }
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await setCostAction({
      orderItemId: line.id,
      unitCost: cost,
      supplierName: supplier.trim() || undefined,
      supplierOrderNumber: supplierOrder.trim() || undefined,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.fieldErrors?.unitCost ?? result.error ?? "Couldn't save that.");
      return;
    }

    setEditing(false);
    setSuggestion(null);
    toast({ tone: "success", title: "Buying price saved", description: "Profit has been recalculated." });
    router.refresh();
  };

  const remove = async () => {
    const previous = line.history[1];
    const result = await clearCostAction(line.id);
    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't remove that", description: result.error });
      return;
    }
    toast({
      tone: "success",
      title: "Buying price removed",
      description: previous
        ? `Reverted to ${formatMoney(previous.unitCostMinor, currency)} from ${format(new Date(previous.createdAt), "d MMM")}.`
        : "This line has no cost now.",
    });
    router.refresh();
  };

  return (
    <li className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {line.productId ? (
            <Link href={`/products/${line.productId}`} className="text-base font-medium text-ink hover:text-brand hover:underline">
              {line.title}
            </Link>
          ) : (
            <p className="text-base font-medium text-ink">{line.title}</p>
          )}
          <p className="mt-0.5 text-sm text-ink-muted">
            {line.sku ? `${line.sku} · ` : ""}
            {line.quantity} × {formatMoney(line.unitPriceMinor, currency)}
          </p>
        </div>
        <p className="tabular shrink-0 text-lg font-semibold">{formatMoney(soldMinor, currency)}</p>
      </div>

      <div className="mt-3 rounded-lg bg-surface-sunken p-3">
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={`Buying price / unit (${currency})`} htmlFor={`cost-${line.id}`} error={error}>
                <Input
                  id={`cost-${line.id}`}
                  data-autofocus
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => { touched.current = true; setCost(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
                  placeholder="4.50"
                  invalid={!!error}
                />
              </Field>
              <Field label="Supplier" htmlFor={`supplier-${line.id}`}>
                <Input
                  id={`supplier-${line.id}`}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Supplier order #" htmlFor={`sorder-${line.id}`}>
                <Input
                  id={`sorder-${line.id}`}
                  value={supplierOrder}
                  onChange={(e) => setSupplierOrder(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>

            {suggestion ? (
              <button
                type="button"
                onClick={() => setCost(toDecimalString(suggestion.unitCostMinor, currency))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-sm text-brand-ink transition-colors hover:brightness-97"
              >
                <Sparkles className="size-3.5 shrink-0" aria-hidden />
                Use {formatMoney(suggestion.unitCostMinor, currency)} — {suggestion.basis}
              </button>
            ) : null}

            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => void save()} loading={saving} disabled={!cost.trim()}>
                Save buying price
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              {line.currentCostMinor !== null ? (
                <>
                  <p className="tabular text-base font-medium">
                    {formatMoney(line.currentCostMinor, currency)} / unit
                    {line.quantity > 1 ? (
                      <span className="ml-1.5 text-sm font-normal text-ink-muted">
                        = {formatMoney(totalCostMinor!, currency)}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {line.supplierName ?? "No supplier recorded"}
                    {line.supplierOrderNumber ? ` · ${line.supplierOrderNumber}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-base font-medium text-caution-ink">No buying price yet</p>
              )}
            </div>

            {editable ? (
              <div className="flex items-center gap-1.5">
                {line.history.length > 1 ? (
                  <Button size="xs" variant="ghost" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
                    <History className="size-3.5" aria-hidden />
                    {line.history.length} entries
                  </Button>
                ) : null}
                {line.currentCostMinor !== null ? (
                  <Button size="xs" variant="ghost" onClick={() => void remove()}>
                    <Trash2 className="size-3.5" aria-hidden />
                    <span className="sr-only">Remove buying price</span>
                  </Button>
                ) : null}
                <Button size="sm" variant={line.currentCostMinor === null ? "primary" : "secondary"} onClick={() => void open()}>
                  {line.currentCostMinor === null ? (
                    <><Plus className="size-3.5" aria-hidden /> Add cost</>
                  ) : (
                    <><Pencil className="size-3.5" aria-hidden /> Change</>
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {showHistory && line.history.length > 0 ? (
        <div className="mt-2 rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Cost history for {line.title}</caption>
            <thead className="border-b border-line bg-surface-sunken">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-xs font-semibold">Price</th>
                <th scope="col" className="px-3 py-1.5 text-xs font-semibold">Supplier</th>
                <th scope="col" className="px-3 py-1.5 text-xs font-semibold">Entered</th>
                <th scope="col" className="px-3 py-1.5 text-xs font-semibold">How</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {line.history.map((entry, index) => (
                <tr key={entry.id} className={cn(index === 0 && "bg-brand-soft/30")}>
                  <td className="tabular px-3 py-1.5 font-medium">
                    {formatMoney(entry.unitCostMinor, currency)}
                    {index === 0 ? <Badge tone="brand" className="ml-1.5">current</Badge> : null}
                  </td>
                  <td className="px-3 py-1.5 text-ink-muted">{entry.supplierName ?? "—"}</td>
                  <td className="px-3 py-1.5 text-ink-muted">
                    {format(new Date(entry.createdAt), "d MMM yyyy")}
                    {entry.createdBy ? ` by ${entry.createdBy}` : ""}
                  </td>
                  <td className="px-3 py-1.5 text-ink-muted">{SOURCE_LABELS[entry.source] ?? entry.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </li>
  );
}
