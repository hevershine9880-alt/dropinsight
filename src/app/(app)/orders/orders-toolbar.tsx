"use client";

import * as React from "react";
import { Table2, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeriodPicker } from "@/components/table/period-picker";
import { SpreadsheetModeDialog } from "./spreadsheet-mode-dialog";
import { ImportCostsDialog } from "./import-costs-dialog";
import { useSearchParams, useRouter } from "next/navigation";

export function OrdersToolbar({
  accounts, canWriteCosts, canExport,
}: {
  accounts: { id: string; username: string }[];
  canWriteCosts: boolean;
  canExport: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [spreadsheetOpen, setSpreadsheetOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  // The sidebar quick action deep-links straight into spreadsheet mode.
  React.useEffect(() => {
    if (searchParams.get("mode") === "spreadsheet" && canWriteCosts) setSpreadsheetOpen(true);
  }, [searchParams, canWriteCosts]);

  const exportHref = `/api/export/orders?${searchParams.toString()}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker
          options={["today", "last7", "last14", "last30", "this_month", "last_month", "all_time"]}
          defaultPeriod="last30"
        />

        <div className="flex flex-wrap items-center gap-2">
          {canExport ? (
            <a
              href={exportHref}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-base font-medium shadow-sm transition-colors hover:bg-surface-hover"
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
          ) : null}

          {canWriteCosts ? (
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" aria-hidden />
                Import costs
              </Button>
              <Button variant="primary" onClick={() => setSpreadsheetOpen(true)}>
                <Table2 className="size-4" aria-hidden />
                Spreadsheet mode
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {canWriteCosts ? (
        <>
          <SpreadsheetModeDialog
            open={spreadsheetOpen}
            onClose={() => {
              setSpreadsheetOpen(false);
              if (searchParams.get("mode")) {
                const next = new URLSearchParams(searchParams.toString());
                next.delete("mode");
                router.replace(next.toString() ? `/orders?${next}` : "/orders", { scroll: false });
              }
            }}
            accounts={accounts}
          />
          <ImportCostsDialog open={importOpen} onClose={() => setImportOpen(false)} />
        </>
      ) : null}
    </>
  );
}
