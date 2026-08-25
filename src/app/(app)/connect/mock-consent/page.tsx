import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { isMockAdapter, MOCK_ACCOUNTS } from "@/lib/ebay";
import { PageContainer } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/logo";
import { FlaskConical, Store, ArrowRight, ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Choose a demo store" };

/**
 * The development stand-in for eBay's consent screen.
 *
 * It exists so the connection flow is a genuine round trip in development: you
 * pick a store, get redirected back with a code, and the callback exchanges it
 * exactly as it would against eBay. Refuses to render when the live adapter is
 * configured, so it can never appear in production.
 */
export default async function MockConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  await requirePermission("accounts.manage");
  if (!isMockAdapter()) redirect("/ebay-accounts");

  const { state } = await searchParams;
  if (!state) redirect("/ebay-accounts?connect_error=Missing+authorisation+state");

  return (
    <PageContainer className="max-w-2xl">
      <div className="mt-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-caution-soft px-3 py-1.5 text-sm font-medium text-caution-ink">
          <FlaskConical className="size-3.5" aria-hidden />
          Development adapter — this is not eBay
        </div>
        <Wordmark size="lg" className="justify-center" />
      </div>

      <Card className="mt-6">
        <CardBody>
          <h1 className="text-xl font-semibold">Choose a store to connect</h1>
          <p className="mt-1.5 text-md text-ink-muted">
            <code className="rounded bg-surface-sunken px-1 py-0.5 text-sm">EBAY_ADAPTER=mock</code> is set, so
            there are no real eBay credentials in play. Picking a store here redirects back to the same
            callback the live integration uses, with a code the mock adapter can exchange — so every
            screen you see afterwards is driven by the real sync engine.
          </p>

          <ul className="mt-5 space-y-2">
            {MOCK_ACCOUNTS.map((account) => (
              <li key={account.ebayUserId}>
                <Link
                  href={`/connect/callback?code=${account.ebayUserId}&state=${encodeURIComponent(state)}`}
                  className="group flex items-center gap-3 rounded-xl border border-line p-4 transition-colors hover:border-brand hover:bg-brand-soft/40"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-sunken text-ink-muted">
                    <Store className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-ink">{account.username}</span>
                    <span className="block text-sm text-ink-muted">
                      {account.marketplaceId.replace("EBAY_", "")} · about {account.ordersPerDay} orders a day ·{" "}
                      {account.historyDays} days of history
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-ink-subtle transition-colors group-hover:text-brand" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-5 flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Accounts connected this way are flagged as demo data throughout the app, and are refused
            outright when <code className="rounded bg-surface px-1">EBAY_ADAPTER=live</code>.
          </p>
        </CardBody>
      </Card>

      <p className="text-center">
        <Link href="/ebay-accounts" className="text-sm font-medium text-ink-muted hover:text-ink">
          Cancel and go back
        </Link>
      </p>
    </PageContainer>
  );
}
