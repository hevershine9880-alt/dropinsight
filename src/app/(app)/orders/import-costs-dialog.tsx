"use client";

import * as React from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * CSV import of buying prices. (R4.3)
 *
 * The reference product's version guesses columns and hopes. This one parses
 * the header, lets the user map the columns it could not guess, and reports the
 * result honestly: how many matched, how many did not, and why.
 */

type Stage = "choose" | "map" | "importing" | "done";

interface Preview {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

interface ImportResult {
  matched: number;
  saved: number;
  unmatched: string[];
  invalid: string[];
}

export function ImportCostsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stage, setStage] = React.useState<Stage>("choose");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [mapping, setMapping] = React.useState({ orderNumber: "", buyingPrice: "", supplierOrder: "", supplier: "" });
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const reset = () => {
    setStage("choose");
    setPreview(null);
    setMapping({ orderNumber: "", buyingPrice: "", supplierOrder: "", supplier: "" });
    setResult(null);
    setError(null);
  };

  const close = () => { onClose(); setTimeout(reset, 250); };

  const onFile = async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("That file is larger than 5 MB. Split it, or export a narrower date range.");
      return;
    }

    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setError("That file has no data rows under its header.");
      return;
    }

    const headers = rows[0];
    setPreview({ headers, rows: rows.slice(1, 6), totalRows: rows.length - 1 });
    setMapping({
      orderNumber: guessColumn(headers, ["ebay order number", "order number", "order id", "order"]) ?? "",
      buyingPrice: guessColumn(headers, ["buying price", "cost", "unit cost", "supplier price"]) ?? "",
      supplierOrder: guessColumn(headers, ["supplier order no", "supplier order number", "supplier order"]) ?? "",
      supplier: guessColumn(headers, ["supplier", "vendor"]) ?? "",
    });
    // Keep the parsed body around for the import step.
    parsedBody.current = rows.slice(1);
    setStage("map");
  };

  const parsedBody = React.useRef<string[][]>([]);

  const runImport = async () => {
    if (!preview) return;
    setStage("importing");

    const indexOf = (name: string) => preview.headers.indexOf(name);
    const payload = parsedBody.current
      .map((row) => ({
        orderNumber: row[indexOf(mapping.orderNumber)]?.trim() ?? "",
        buyingPrice: row[indexOf(mapping.buyingPrice)]?.trim() ?? "",
        supplierOrderNumber: mapping.supplierOrder ? row[indexOf(mapping.supplierOrder)]?.trim() : undefined,
        supplierName: mapping.supplier ? row[indexOf(mapping.supplier)]?.trim() : undefined,
      }))
      .filter((r) => r.orderNumber && r.buyingPrice);

    const response = await fetch("/api/costs/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payload }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "The import failed. Your existing costs are unchanged.");
      setStage("map");
      return;
    }

    const data = (await response.json()) as ImportResult;
    setResult(data);
    setStage("done");
    toast({
      tone: data.saved > 0 ? "success" : "info",
      title: `${data.saved} buying prices imported`,
      description: data.unmatched.length > 0 ? `${data.unmatched.length} order numbers were not found.` : undefined,
    });
    router.refresh();
  };

  const canImport = mapping.orderNumber && mapping.buyingPrice;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Import buying prices from a spreadsheet"
      description="Kept your costs in a sheet? Export it as CSV and upload it here. DropInsight matches each eBay order number and fills in the price."
      size="lg"
      footer={
        stage === "done" ? (
          <Button variant="primary" onClick={close}>Done</Button>
        ) : stage === "map" ? (
          <>
            <Button variant="secondary" onClick={reset}>Choose another file</Button>
            <Button variant="primary" onClick={() => void runImport()} disabled={!canImport}>
              Import {preview?.totalRows.toLocaleString()} rows
            </Button>
          </>
        ) : null
      }
    >
      {error ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-negative/25 bg-negative-soft px-3 py-2.5 text-sm text-negative-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      ) : null}

      {stage === "choose" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-sunken p-3">
            <p className="text-sm font-medium text-ink">Your sheet needs these two columns</p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Example CSV layout</caption>
                <thead className="border-b border-line">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 text-xs font-semibold">
                      eBay Order Number <span className="ml-1 rounded bg-negative-soft px-1 text-2xs text-negative-ink">required</span>
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-xs font-semibold">
                      Buying Price <span className="ml-1 rounded bg-negative-soft px-1 text-2xs text-negative-ink">required</span>
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-xs font-semibold">
                      Supplier Order No <span className="ml-1 rounded bg-surface-sunken px-1 text-2xs text-ink-muted">optional</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-ink-muted">
                    <td className="tabular px-3 py-1.5">12-34567-89012</td>
                    <td className="tabular px-3 py-1.5">4.50</td>
                    <td className="px-3 py-1.5">AMZ-123-456</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Column names don&rsquo;t have to match exactly — you can point DropInsight at the right columns
              after uploading. Everything else in the sheet is ignored, including any profit or payout
              columns: those come from your real eBay data.
            </p>
          </div>

          <label
            className={cn(
              "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-line px-6 py-10 text-center",
              "transition-colors hover:border-brand hover:bg-brand-soft/40",
            )}
          >
            <Upload className="size-6 text-ink-subtle" aria-hidden />
            <span className="mt-2 text-base font-medium text-ink">Choose a CSV file</span>
            <span className="mt-1 text-sm text-ink-muted">
              Google Sheets: File → Download → Comma-separated values. Excel: File → Save As → CSV.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </label>
        </div>
      ) : null}

      {stage === "map" && preview ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-positive-soft px-3 py-2 text-sm text-positive-ink">
            <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
            {preview.totalRows.toLocaleString()} data rows found. Point each field at the right column.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ColumnPicker
              label="eBay order number" required headers={preview.headers}
              value={mapping.orderNumber}
              onChange={(v) => setMapping((m) => ({ ...m, orderNumber: v }))}
            />
            <ColumnPicker
              label="Buying price per unit" required headers={preview.headers}
              value={mapping.buyingPrice}
              onChange={(v) => setMapping((m) => ({ ...m, buyingPrice: v }))}
            />
            <ColumnPicker
              label="Supplier order number" headers={preview.headers}
              value={mapping.supplierOrder}
              onChange={(v) => setMapping((m) => ({ ...m, supplierOrder: v }))}
            />
            <ColumnPicker
              label="Supplier name" headers={preview.headers}
              value={mapping.supplier}
              onChange={(v) => setMapping((m) => ({ ...m, supplier: v }))}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">First few rows</p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Preview of the uploaded file</caption>
                <thead className="border-b border-line bg-surface-sunken">
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header} scope="col" className="px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {preview.headers.map((_, c) => (
                        <td key={c} className="px-2.5 py-1.5 whitespace-nowrap text-ink-muted">{row[c] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {stage === "importing" ? (
        <div className="flex flex-col items-center py-12" role="status" aria-live="polite">
          <Loader2 className="size-7 animate-spin-slow text-brand" aria-hidden />
          <p className="mt-3 text-base font-medium">Matching order numbers…</p>
          <p className="mt-1 text-sm text-ink-muted">This runs in one transaction — nothing is half-applied.</p>
        </div>
      ) : null}

      {stage === "done" && result ? (
        <div className="py-4">
          <div className="flex items-center gap-2.5 rounded-lg bg-positive-soft px-3 py-3">
            <CheckCircle2 className="size-5 shrink-0 text-positive" aria-hidden />
            <p className="text-base font-medium text-positive-ink">
              {result.saved.toLocaleString()} buying prices imported.
            </p>
          </div>

          {result.unmatched.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm font-medium text-ink">
                {result.unmatched.length.toLocaleString()} order numbers were not found in this workspace
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                They may belong to an account you have not connected, or fall outside the history that has
                been imported so far.
              </p>
              <ul className="tabular mt-2 max-h-32 space-y-0.5 overflow-y-auto rounded-lg bg-surface-sunken p-2.5 text-xs text-ink-muted">
                {result.unmatched.slice(0, 20).map((id) => <li key={id}>{id}</li>)}
                {result.unmatched.length > 20 ? <li>…and {result.unmatched.length - 20} more</li> : null}
              </ul>
            </div>
          ) : null}

          {result.invalid.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm font-medium text-ink">{result.invalid.length} rows had an unreadable price</p>
              <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto rounded-lg bg-surface-sunken p-2.5 text-xs text-ink-muted">
                {result.invalid.slice(0, 10).map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function ColumnPicker({
  label, headers, value, onChange, required,
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-negative" aria-hidden>*</span> : null}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{required ? "Choose a column…" : "Not in my sheet"}</option>
        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
      </Select>
    </div>
  );
}

function guessColumn(headers: string[], candidates: string[]): string | null {
  const normalised = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim());
  for (const candidate of candidates) {
    const index = normalised.indexOf(candidate);
    if (index >= 0) return headers[index];
  }
  for (const candidate of candidates) {
    const index = normalised.findIndex((h) => h.includes(candidate));
    if (index >= 0) return headers[index];
  }
  return null;
}

/** Minimal RFC-4180 CSV reader: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += char;
      continue;
    }

    if (char === '"') { inQuotes = true; continue; }
    if (char === ",") { row.push(field); field = ""; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }

  return rows;
}
