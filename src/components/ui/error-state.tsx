"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./button";

/**
 * Error copy answers the three questions a user actually has:
 * what happened, is my data safe, and what do I do now.
 */
export function ErrorState({
  title = "We couldn't load this",
  detail,
  reassurance = "Your data is safe — nothing was changed.",
  onRetry,
  retryLabel = "Try again",
  action,
}: {
  title?: string;
  detail?: string;
  reassurance?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-negative-soft text-negative">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {detail ? <p className="mt-1.5 max-w-md text-balance text-md text-ink-muted">{detail}</p> : null}
      <p className="mt-1 max-w-md text-balance text-sm text-ink-subtle">{reassurance}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            <RotateCcw className="size-4" aria-hidden />
            {retryLabel}
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}
