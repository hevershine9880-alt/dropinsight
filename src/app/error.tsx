"use client";

import * as React from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * The top-level error boundary.
 *
 * Shows the digest rather than the message: a production build's error text can
 * leak internals, while the digest is what support needs to find the log line.
 */
export default function GlobalError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[dropinsight] unhandled error", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <Wordmark size="md" className="justify-center" />

        <div className="mt-8 grid size-12 place-items-center justify-self-center rounded-2xl bg-negative-soft text-negative">
          <AlertTriangle className="size-6" aria-hidden />
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Something went wrong on our side</h1>
        <p className="mt-2 text-md text-ink-muted">
          Your orders, costs and refund answers are all safe — nothing was changed. Try again, and if
          it keeps happening, send us the reference below.
        </p>

        {error.digest ? (
          <p className="tabular mt-3 rounded-lg bg-surface-sunken px-3 py-2 font-mono text-sm text-ink-muted">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover"
          >
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/support"
            className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-base font-medium shadow-sm hover:bg-surface-hover"
          >
            Contact support
          </Link>
        </div>
      </div>
    </main>
  );
}
