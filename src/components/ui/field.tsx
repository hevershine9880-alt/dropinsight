"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { AlertCircle } from "lucide-react";

/**
 * Form field. The label, hint and error are wired to the control by id, so a
 * screen-reader user hears the same three things a sighted user reads — and the
 * error is announced when it appears rather than only drawn in red.
 */
export function Field({
  label, hint, error, required, children, className, htmlFor,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-negative" aria-hidden>*</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-sm text-negative">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL = [
  "w-full rounded-lg border bg-surface px-3 text-base text-ink",
  "transition-[border-color,box-shadow] duration-150",
  "hover:border-line-strong",
  "focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle",
].join(" ");

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, "h-9.5", invalid ? "border-negative focus:border-negative focus:ring-negative/20" : "border-line", className)}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, "min-h-20 py-2 leading-relaxed", invalid ? "border-negative" : "border-line", className)}
        {...props}
      />
    );
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            CONTROL,
            "h-9.5 cursor-pointer appearance-none pr-9",
            invalid ? "border-negative" : "border-line",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-subtle"
          viewBox="0 0 16 16" fill="none" aria-hidden
        >
          <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  },
);

export function Checkbox({
  label, description, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode }) {
  const id = React.useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong text-brand accent-[var(--brand)]"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={props.id ?? id} className="cursor-pointer text-base text-ink">{label}</label>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
    </div>
  );
}

export function Toggle({
  checked, onChange, label, description, disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-base font-medium text-ink">{label}</p>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5.5 w-9.5 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}
