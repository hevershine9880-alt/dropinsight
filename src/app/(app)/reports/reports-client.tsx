"use client";

import * as React from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/finance/periods";
import { cn } from "@/lib/cn";
import {
  Table2, FileSpreadsheet, Package, Receipt, FileText, RotateCcw, Download, Loader2, Check,
} from "lucide-react";

/**
 * Reports.
 *
 * Every card is a real download that hits a real route. The browser handles the
 * file; this component tracks which one is in flight so the user gets feedback
 * on a large export instead of wondering whether the click registered.
 */

const PERIOD_OPTIONS: PeriodKey[] = ["last7", "last30", "this_month", "last_month", "all_time"];

export function ReportsClient({
  months, currency,
}: {
  months: { value: string; label: string }[];
  currency: string;
}) {
  const [period, setPeriod] = React.useState<PeriodKey>("last_month");
  const [month, setMonth] = React.useState(months[1]?.value ?? months[0].value);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const { toast } = useToast();

  const download = async (key: string, url: string, filenameHint: string) => {
    setBusy(key);
    setDone(null);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `The export failed (${response.status}).`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download =
        response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? filenameHint;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setDone(key);
      setTimeout(() => setDone((current) => (current === key ? null : current)), 3000);
    } catch (error) {
      toast({
        tone: "error",
        title: "That export didn't download",
        description: error instanceof Error ? error.message : "Your data is unchanged. Try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  const periodQuery = `period=${period}`;

  const reports = [
    {
      key: "orders",
      icon: Table2,
      title: "Orders",
      description: `Every order with fees, supplier cost, refunds, profit and margin. One row per order, in ${currency}.`,
      url: `/api/export/orders?${periodQuery}`,
      filename: "dropinsight-orders.csv",
      format: "CSV",
    },
    {
      key: "pnl",
      icon: FileSpreadsheet,
      title: "Monthly profit & loss",
      description: "Revenue, fees, cost of goods, refunds and net profit summarised by month, twelve months back.",
      url: "/api/export/pnl?months=12",
      filename: "dropinsight-monthly-pnl.csv",
      format: "CSV",
    },
    {
      key: "products",
      icon: Package,
      title: "Product performance",
      description: "Cost history, average sale price, units sold, break-even price, total profit and refund counts per SKU.",
      url: `/api/export/products?${periodQuery}`,
      filename: "dropinsight-products.csv",
      format: "CSV",
    },
    {
      key: "refunds",
      icon: RotateCcw,
      title: "Refunds & recovery",
      description: "The loss ledger: what you refunded, what eBay credited, what each supplier paid back and what is still owed.",
      url: `/api/export/refunds?${periodQuery}`,
      filename: "dropinsight-refunds.csv",
      format: "CSV",
    },
    {
      key: "expenses",
      icon: Receipt,
      title: "Expenses",
      description: "Business costs by category and month, for bookkeeping.",
      url: `/api/export/expenses?${periodQuery}`,
      filename: "dropinsight-expenses.csv",
      format: "CSV",
    },
  ];

  return (
    <>
      <Card>
        <CardHeader
          title="Period"
          description="Applies to the orders, products, refunds and expenses exports. The monthly P&L always covers the last twelve months."
        />
        <CardBody>
          <Field label="Date range" htmlFor="report-period" className="max-w-64">
            <Select id="report-period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
              {PERIOD_OPTIONS.map((key) => (
                <option key={key} value={key}>{PERIOD_LABELS[key]}</option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {reports.map((report) => (
          <ReportCard
            key={report.key}
            icon={report.icon}
            title={report.title}
            description={report.description}
            format={report.format}
            busy={busy === report.key}
            done={done === report.key}
            onDownload={() => void download(report.key, report.url, report.filename)}
          />
        ))}

        <Card className="flex flex-col">
          <CardBody className="flex flex-1 flex-col">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <FileText className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold">
                  Monthly P&L statement
                  <span className="ml-2 rounded bg-negative-soft px-1.5 py-0.5 align-middle text-2xs font-medium text-negative-ink">
                    PDF
                  </span>
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  A formatted profit & loss statement for one month — the summary an accountant asks
                  for, on one page.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Field label="Month" htmlFor="pnl-month" className="w-48">
                <Select id="pnl-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </Field>
              <DownloadButton
                busy={busy === "pnl-pdf"}
                done={done === "pnl-pdf"}
                label="Download PDF"
                onClick={() => void download("pnl-pdf", `/api/export/pnl-pdf?month=${month}`, `dropinsight-pnl-${month}.pdf`)}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <p className="text-sm text-ink-muted">
        Amounts in every export are plain decimals in {currency}, without symbols or thousands
        separators, so spreadsheets read them as numbers. Orders with no buying price leave their
        cost, profit and margin columns empty rather than showing a zero.
      </p>
    </>
  );
}

function ReportCard({
  icon: Icon, title, description, format: fileFormat, busy, done, onDownload,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  format: string;
  busy: boolean;
  done: boolean;
  onDownload: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardBody className="flex flex-1 flex-col">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-sunken text-ink-muted">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">
              {title}
              <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 align-middle text-2xs font-medium text-ink-muted">
                {fileFormat}
              </span>
            </h3>
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
          </div>
        </div>
        <div className="mt-4">
          <DownloadButton busy={busy} done={done} label={`Download ${fileFormat}`} onClick={onDownload} />
        </div>
      </CardBody>
    </Card>
  );
}

function DownloadButton({
  busy, done, label, onClick,
}: {
  busy: boolean;
  done: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-live="polite"
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-base font-medium shadow-sm transition-colors",
        done
          ? "border-positive/30 bg-positive-soft text-positive-ink"
          : "border-line bg-surface hover:bg-surface-hover",
        busy && "opacity-70",
      )}
    >
      {busy ? (
        <><Loader2 className="size-4 animate-spin-slow" aria-hidden /> Preparing…</>
      ) : done ? (
        <><Check className="size-4" aria-hidden /> Downloaded</>
      ) : (
        <><Download className="size-4" aria-hidden /> {label}</>
      )}
    </button>
  );
}
