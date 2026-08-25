"use client";

import { cn } from "@/lib/cn";
import { X } from "lucide-react";

/**
 * The chip row from the reference product, with the counts it shows made real:
 * a chip with a count of zero is disabled, because clicking it can only produce
 * an empty table.
 */
export function FilterChips({
  options, value, onChange, multiple = false, label,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  label: string;
}) {
  const toggle = (option: string) => {
    if (!multiple) {
      onChange(value[0] === option ? [] : [option]);
      return;
    }
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const active = value.includes(option.value);
        const empty = option.count === 0;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            disabled={empty && !active}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
              empty && !active && "cursor-not-allowed opacity-45",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("tabular text-2xs", active ? "text-white/75" : "text-ink-subtle")}>
                {option.count.toLocaleString()}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control for mutually exclusive views. */
export function SegmentedControl({
  options, value, onChange, label, size = "md",
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (next: string) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    // Scrolls sideways on a narrow screen instead of widening the page.
    <div className="scroll-fade-x -mx-1 w-full min-w-0 overflow-x-auto px-1 sm:w-auto">
      <div
        role="tablist"
        aria-label={label}
        className={cn("inline-flex items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5", size === "sm" && "text-sm")}
      >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "h-7 text-sm" : "h-8 text-base",
              active ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("tabular text-2xs", active ? "text-ink-muted" : "text-ink-subtle")}>
                {option.count.toLocaleString()}
              </span>
            ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Removable summary of the filters currently narrowing a table. */
export function ActiveFilters({
  filters, onRemove, onClearAll,
}: {
  filters: { key: string; label: string }[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-ink-muted">Filtered by</span>
      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex items-center gap-1 rounded-md bg-brand-soft py-0.5 pr-1 pl-2 text-sm font-medium text-brand-ink"
        >
          {filter.label}
          <button
            type="button"
            onClick={() => onRemove(filter.key)}
            aria-label={`Remove filter: ${filter.label}`}
            className="rounded p-0.5 hover:bg-brand/15"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="ml-1 text-sm font-medium text-ink-muted hover:text-ink hover:underline">
        Clear all
      </button>
    </div>
  );
}
