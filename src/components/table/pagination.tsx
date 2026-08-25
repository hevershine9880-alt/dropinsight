"use client";

import { cn } from "@/lib/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Server-side pagination. Shows the true range and total because "page 3 of
 * many" is not useful when you are looking for one order.
 */
export function Pagination({
  page, pageSize, total, onPageChange, onPageSizeChange, itemLabel = "orders",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  itemLabel?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"
    >
      <p className="tabular text-sm text-ink-muted" aria-live="polite">
        {total === 0
          ? `No ${itemLabel}`
          : <>Showing <span className="font-medium text-ink">{from.toLocaleString()}–{to.toLocaleString()}</span> of {total.toLocaleString()} {itemLabel}</>}
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-sm text-ink-muted">
            <span className="sr-only sm:not-sr-only">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-2 text-sm hover:border-line-strong focus:border-brand focus:outline-none"
            >
              {[20, 50, 100].map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-0.5">
          <PageButton onClick={() => onPageChange(page - 1)} disabled={page <= 1} label="Previous page">
            <ChevronLeft className="size-4" aria-hidden />
          </PageButton>

          {pageNumbers(page, pages).map((entry, index) =>
            entry === "…" ? (
              <span key={`gap-${index}`} className="px-1.5 text-sm text-ink-subtle" aria-hidden>…</span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Page ${entry}`}
                className={cn(
                  "tabular grid size-8 place-items-center rounded-lg text-sm font-medium transition-colors",
                  entry === page ? "bg-brand text-white" : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                {entry}
              </button>
            ),
          )}

          <PageButton onClick={() => onPageChange(page + 1)} disabled={page >= pages} label="Next page">
            <ChevronRight className="size-4" aria-hidden />
          </PageButton>
        </div>
      </div>
    </nav>
  );
}

function PageButton({
  onClick, disabled, label, children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** First, last, and a window around the current page — with gaps elided. */
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const result: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) result.push("…");
  for (let i = start; i <= end; i++) result.push(i);
  if (end < total - 1) result.push("…");
  result.push(total);

  return result;
}
