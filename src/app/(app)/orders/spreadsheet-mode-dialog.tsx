"use client";

import * as React from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { setCostsBulkAction } from "@/server/actions/costs";
import { formatMoney, toDecimalString } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Loader2, Sparkles, Keyboard } from "lucide-react";

/**
 * Spreadsheet mode. (R4.3)
 *
 * A grid built for one job: getting a few hundred buying prices in as fast as a
 * spreadsheet would. What makes it fast:
 *
 *  - **Paste a block** straight from Sheets or Excel. Rows and columns land
 *    where the cursor is, so a copied column of 200 prices fills 200 rows.
 *  - **Enter** moves down, **Tab** across, arrow keys navigate, **⌘D** fills the
 *    column downward from the current cell.
 *  - Every row carries the suggestion from that product's own cost history, so
 *    repeat products are one keystroke.
 *
 * Nothing is written until Save, and then it is one transaction.
 */

interface Line {
  orderItemId: string;
  orderId: string;
  ebayOrderId: string;
  orderDate: string;
  title: string;
  sku: string | null;
  quantity: number;
  soldMinor: number;
  currency: string;
  suggestionMinor: number | null;
  accountUsername: string;
}

type Field = "cost" | "supplierOrder" | "supplier";
const FIELDS: Field[] = ["cost", "supplierOrder", "supplier"];

type RowValues = Record<Field, string>;
const EMPTY_ROW: RowValues = { cost: "", supplierOrder: "", supplier: "" };

export function SpreadsheetModeDialog({
  open, onClose, accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: { id: string; username: string }[];
}) {
  const [lines, setLines] = React.useState<Line[] | null>(null);
  const [values, setValues] = React.useState<Record<string, RowValues>>({});
  const [cursor, setCursor] = React.useState<{ row: number; field: Field }>({ row: 0, field: "cost" });
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [accountId, setAccountId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const router = useRouter();

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`/api/costs/unpriced?limit=200${accountId ? `&accountId=${accountId}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load unpriced orders."))))
      .then((data: { lines: Line[] }) => {
        setLines(data.lines);
        setValues({});
        setCursor({ row: 0, field: "cost" });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, accountId]);

  const setValue = (row: number, field: Field, value: string) => {
    const line = lines?.[row];
    if (!line) return;
    setValues((prev) => ({
      ...prev,
      [line.orderItemId]: { ...EMPTY_ROW, ...prev[line.orderItemId], [field]: value },
    }));
  };

  const valueAt = (row: number, field: Field): string => {
    const line = lines?.[row];
    if (!line) return "";
    return values[line.orderItemId]?.[field] ?? "";
  };

  const focusCell = React.useCallback((row: number, field: Field) => {
    const input = gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}-${field}"]`);
    input?.focus();
    input?.select();
  }, []);

  const move = (rowDelta: number, fieldDelta: number) => {
    if (!lines) return;
    let { row, field } = cursor;
    const fieldIndex = FIELDS.indexOf(field) + fieldDelta;

    if (fieldIndex < 0) { field = FIELDS[FIELDS.length - 1]; row -= 1; }
    else if (fieldIndex >= FIELDS.length) { field = FIELDS[0]; row += 1; }
    else field = FIELDS[fieldIndex];

    row = Math.max(0, Math.min(lines.length - 1, row + rowDelta));
    setCursor({ row, field });
    focusCell(row, field);
  };

  /** Fill the current column downward from the current cell. */
  const fillDown = () => {
    if (!lines) return;
    const source = valueAt(cursor.row, cursor.field);
    if (!source) return;

    setValues((prev) => {
      const next = { ...prev };
      for (let r = cursor.row + 1; r < lines.length; r++) {
        const id = lines[r].orderItemId;
        next[id] = { ...EMPTY_ROW, ...next[id], [cursor.field]: source };
      }
      return next;
    });
    toast({ tone: "info", title: `Filled ${lines.length - cursor.row - 1} rows below` });
  };

  /** Paste a block from a spreadsheet, landing at the cursor. */
  const onPaste = (event: React.ClipboardEvent, row: number, field: Field) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // single value: let the browser handle it

    event.preventDefault();
    if (!lines) return;

    const block = text.replace(/\r/g, "").split("\n").filter((l) => l !== "").map((l) => l.split("\t"));
    const startField = FIELDS.indexOf(field);

    setValues((prev) => {
      const next = { ...prev };
      block.forEach((cells, r) => {
        const targetRow = row + r;
        if (targetRow >= lines.length) return;
        const id = lines[targetRow].orderItemId;
        const current: RowValues = { ...EMPTY_ROW, ...next[id] };
        cells.forEach((cell, c) => {
          const targetField = FIELDS[startField + c];
          if (targetField) current[targetField] = cell.trim();
        });
        next[id] = current;
      });
      return next;
    });

    toast({
      tone: "success",
      title: `Pasted ${Math.min(block.length, lines.length - row)} rows`,
      description: "Nothing is saved until you press Save.",
    });
  };

  const filled = Object.entries(values).filter(([, v]) => v.cost?.trim()).length;

  const save = async () => {
    if (!lines) return;
    setSaving(true);
    const rows = lines
      .filter((line) => values[line.orderItemId]?.cost?.trim())
      .map((line) => ({
        orderItemId: line.orderItemId,
        unitCost: values[line.orderItemId].cost,
        supplierOrderNumber: values[line.orderItemId].supplierOrder || undefined,
        supplierName: values[line.orderItemId].supplier || undefined,
      }));

    const result = await setCostsBulkAction({ rows });
    setSaving(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Nothing was saved", description: result.error });
      return;
    }

    toast({
      tone: "success",
      title: `${result.data!.saved} buying prices saved`,
      description: result.data!.skipped > 0 ? `${result.data!.skipped} rows were skipped.` : "Every profit figure has updated.",
    });
    onClose();
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Price orders like a spreadsheet"
      description={
        lines
          ? `${lines.length} unpriced lines. Paste a block straight from Google Sheets or Excel — rows and columns land where your cursor is.`
          : "Loading the orders that still need a buying price…"
      }
      size="full"
      footer={
        <>
          <p className="mr-auto flex items-center gap-1.5 text-sm text-ink-muted">
            <Keyboard className="size-3.5" aria-hidden />
            <kbd className="rounded border border-line bg-surface-sunken px-1 font-sans text-2xs">Enter</kbd> moves down ·
            <kbd className="rounded border border-line bg-surface-sunken px-1 font-sans text-2xs">⌘D</kbd> fills the column downward
          </p>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={filled === 0}>
            Save {filled} price{filled === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      {accounts.length > 1 ? (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="ss-account" className="text-sm font-medium">eBay account</label>
          <Select
            id="ss-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-auto min-w-44"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
          </Select>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-negative-soft px-3 py-2.5 text-sm text-negative-ink">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-ink-muted" role="status">
          <Loader2 className="size-5 animate-spin-slow" aria-hidden />
          Loading unpriced orders…
        </div>
      ) : lines && lines.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg font-semibold">Nothing left to price</p>
          <p className="mt-1 text-md text-ink-muted">
            Every order in this workspace already has a buying price. Your profit figures are complete.
          </p>
        </div>
      ) : lines ? (
        <div ref={gridRef} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              Unpriced order lines. Enter moves down, Tab moves across, Command-D fills the column downward.
            </caption>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-line bg-surface-sunken">
                <th scope="col" className="w-10 px-2 py-2 text-xs font-semibold text-ink-subtle">#</th>
                <th scope="col" className="px-2 py-2 text-xs font-semibold">Order</th>
                <th scope="col" className="px-2 py-2 text-xs font-semibold">Date</th>
                <th scope="col" className="px-2 py-2 text-xs font-semibold">Product</th>
                <th scope="col" className="px-2 py-2 text-right text-xs font-semibold">Qty</th>
                <th scope="col" className="px-2 py-2 text-right text-xs font-semibold">Sold</th>
                <th scope="col" className="w-32 bg-brand-soft/60 px-2 py-2 text-xs font-semibold">Buying price / unit</th>
                <th scope="col" className="w-36 px-2 py-2 text-xs font-semibold">Supplier order #</th>
                <th scope="col" className="w-40 px-2 py-2 text-xs font-semibold">Supplier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((line, row) => (
                <tr key={line.orderItemId} className={cn(cursor.row === row && "bg-brand-soft/30")}>
                  <td className="tabular px-2 py-1 text-xs text-ink-subtle">{row + 1}</td>
                  <td className="tabular px-2 py-1 whitespace-nowrap">{line.ebayOrderId}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-ink-muted">
                    {format(new Date(line.orderDate), "d MMM")}
                  </td>
                  <td className="max-w-64 px-2 py-1">
                    <span className="block truncate" title={line.title}>{line.title}</span>
                  </td>
                  <td className="tabular px-2 py-1 text-right">{line.quantity}</td>
                  <td className="tabular px-2 py-1 text-right">{formatMoney(line.soldMinor, line.currency)}</td>

                  <td className="bg-brand-soft/20 p-0">
                    <div className="relative">
                      <input
                        data-cell={`${row}-cost`}
                        inputMode="decimal"
                        value={valueAt(row, "cost")}
                        placeholder={line.suggestionMinor !== null ? toDecimalString(line.suggestionMinor, line.currency) : "0.00"}
                        onFocus={() => setCursor({ row, field: "cost" })}
                        onChange={(e) => setValue(row, "cost", e.target.value)}
                        onPaste={(e) => onPaste(e, row, "cost")}
                        onKeyDown={(e) => handleKey(e, row, "cost")}
                        aria-label={`Buying price for order ${line.ebayOrderId}`}
                        className="tabular h-8 w-full bg-transparent px-2 text-right outline-none focus:bg-surface focus:ring-2 focus:ring-brand/40 focus:ring-inset"
                      />
                      {line.suggestionMinor !== null && !valueAt(row, "cost") ? (
                        <button
                          type="button"
                          onClick={() => setValue(row, "cost", toDecimalString(line.suggestionMinor!, line.currency))}
                          aria-label={`Use suggested price ${formatMoney(line.suggestionMinor, line.currency)} for ${line.ebayOrderId}`}
                          title="Use your last cost for this product"
                          className="absolute top-1/2 left-1 grid size-5 -translate-y-1/2 place-items-center rounded text-ink-subtle hover:bg-brand-soft hover:text-brand"
                        >
                          <Sparkles className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>

                  <td className="p-0">
                    <input
                      data-cell={`${row}-supplierOrder`}
                      value={valueAt(row, "supplierOrder")}
                      onFocus={() => setCursor({ row, field: "supplierOrder" })}
                      onChange={(e) => setValue(row, "supplierOrder", e.target.value)}
                      onPaste={(e) => onPaste(e, row, "supplierOrder")}
                      onKeyDown={(e) => handleKey(e, row, "supplierOrder")}
                      aria-label={`Supplier order number for ${line.ebayOrderId}`}
                      className="h-8 w-full bg-transparent px-2 outline-none focus:bg-surface focus:ring-2 focus:ring-brand/40 focus:ring-inset"
                    />
                  </td>

                  <td className="p-0">
                    <input
                      data-cell={`${row}-supplier`}
                      value={valueAt(row, "supplier")}
                      onFocus={() => setCursor({ row, field: "supplier" })}
                      onChange={(e) => setValue(row, "supplier", e.target.value)}
                      onPaste={(e) => onPaste(e, row, "supplier")}
                      onKeyDown={(e) => handleKey(e, row, "supplier")}
                      aria-label={`Supplier for ${line.ebayOrderId}`}
                      className="h-8 w-full bg-transparent px-2 outline-none focus:bg-surface focus:ring-2 focus:ring-brand/40 focus:ring-inset"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-ink-muted">
        Each price is per item — quantity is applied for you. Supplier fields are optional. Rows save
        through the same cost ledger as every other entry.
      </p>
    </Dialog>
  );

  function handleKey(event: React.KeyboardEvent, row: number, field: Field) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      setCursor({ row, field });
      fillDown();
      return;
    }
    if (event.key === "Enter") { event.preventDefault(); setCursor({ row, field }); move(1, 0); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor({ row, field }); move(1, 0); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setCursor({ row, field }); move(-1, 0); return; }
    if (event.key === "Tab") {
      event.preventDefault();
      setCursor({ row, field });
      move(0, event.shiftKey ? -1 : 1);
    }
  }
}
