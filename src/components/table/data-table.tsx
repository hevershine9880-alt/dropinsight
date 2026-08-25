"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

/**
 * The table shell shared by Orders, Returns, Products, Suppliers and Expenses.
 *
 * Responsibilities kept here so every table behaves identically:
 *  - a sticky, sortable header
 *  - a real <caption> for screen readers
 *  - selection with a working indeterminate "select all"
 *  - horizontal scroll with a masked edge so the cut is legible
 *  - row click that does not fight with buttons inside the row
 *
 * Sorting and pagination happen on the server; this component only reports
 * intent upward.
 */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Header text for assistive tech when `header` is an icon or abbreviation. */
  headerLabel?: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
  /** Hidden below this breakpoint. Use for columns that are nice, not vital. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  render: (row: T) => React.ReactNode;
}

const HIDE_CLASSES = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
} as const;

export function DataTable<T extends { id: string }>({
  caption, columns, rows, sort, onSortChange, selectedIds, onSelectionChange,
  onRowClick, rowHref, emptyState, loading, stickyHeader = true, className,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  sort?: { key: string; direction: "asc" | "desc" };
  onSortChange?: (key: string) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  emptyState?: React.ReactNode;
  loading?: boolean;
  stickyHeader?: boolean;
  className?: string;
}) {
  const selectable = !!selectedIds && !!onSelectionChange;
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectedIds!.has(r.id));
  const someSelected = selectable && rows.some((r) => selectedIds!.has(r.id)) && !allSelected;
  const headerCheckbox = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = !!someSelected;
  }, [someSelected]);

  const toggleAll = () => {
    if (!selectable) return;
    const next = new Set(selectedIds);
    if (allSelected) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => next.add(r.id));
    onSelectionChange!(next);
  };

  const toggleRow = (id: string) => {
    if (!selectable) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange!(next);
  };

  if (!loading && rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const interactive = !!onRowClick || !!rowHref;

  return (
    <div className={cn("scroll-fade-x table-scroll", className)}>
      <table className={cn("w-full min-w-[52rem] border-collapse text-left", stickyHeader && "table-sticky-head")}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {selectable ? (
              <th scope="col" className="w-10 px-4 py-2.5">
                <input
                  ref={headerCheckbox}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={allSelected ? "Deselect all rows on this page" : "Select all rows on this page"}
                  className="size-4 cursor-pointer rounded border-line-strong accent-[var(--brand)]"
                />
              </th>
            ) : null}

            {columns.map((column) => {
              const active = sort?.key === column.key;
              const alignment =
                column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left";

              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "px-3 py-2.5 text-xs font-semibold text-ink-muted first:pl-4 last:pr-4",
                    alignment,
                    column.hideBelow && HIDE_CLASSES[column.hideBelow],
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded transition-colors hover:text-ink",
                        column.align === "right" && "flex-row-reverse",
                        active && "text-ink",
                      )}
                    >
                      <span>{column.header}</span>
                      {active ? (
                        sort!.direction === "asc"
                          ? <ArrowUp className="size-3 shrink-0" aria-hidden />
                          : <ArrowDown className="size-3 shrink-0" aria-hidden />
                      ) : (
                        <ChevronsUpDown className="size-3 shrink-0 opacity-40" aria-hidden />
                      )}
                      <span className="sr-only">
                        {active
                          ? `, sorted ${sort!.direction === "asc" ? "ascending" : "descending"}. Activate to reverse.`
                          : ", not sorted. Activate to sort."}
                      </span>
                    </button>
                  ) : (
                    <span>{column.headerLabel ? <span className="sr-only">{column.headerLabel}</span> : null}{column.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className={cn("divide-y divide-line", loading && "opacity-55")}>
          {rows.map((row) => {
            const selected = selectable && selectedIds!.has(row.id);
            return (
              <tr
                key={row.id}
                data-selected={selected || undefined}
                onClick={
                  interactive
                    ? (event) => {
                        // Let controls inside the row do their own thing.
                        const target = event.target as HTMLElement;
                        if (target.closest("button, a, input, select, textarea, [role=button]")) return;
                        if (rowHref) window.location.assign(rowHref(row));
                        else onRowClick?.(row);
                      }
                    : undefined
                }
                className={cn(
                  "transition-colors",
                  selected ? "bg-brand-soft/50" : "hover:bg-surface-hover",
                  interactive && "cursor-pointer",
                )}
              >
                {selectable ? (
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select row`}
                      className="size-4 cursor-pointer rounded border-line-strong accent-[var(--brand)]"
                    />
                  </td>
                ) : null}

                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-2.5 text-sm first:pl-4 last:pr-4",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.hideBelow && HIDE_CLASSES[column.hideBelow],
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
