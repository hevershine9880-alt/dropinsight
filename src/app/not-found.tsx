import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <Wordmark size="md" className="justify-center" />

        <div className="mt-8 grid size-12 place-items-center justify-self-center rounded-2xl bg-surface-sunken text-ink-subtle">
          <Compass className="size-6" aria-hidden />
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">We couldn&rsquo;t find that page</h1>
        <p className="mt-2 text-md text-ink-muted">
          The link may be out of date, or the order, product or supplier may belong to a different
          workspace. Nothing is wrong with your data.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-base font-medium text-white hover:bg-brand-hover"
          >
            Go to the dashboard
          </Link>
          <Link
            href="/orders"
            className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-base font-medium shadow-sm hover:bg-surface-hover"
          >
            Browse orders
          </Link>
        </div>
      </div>
    </main>
  );
}
