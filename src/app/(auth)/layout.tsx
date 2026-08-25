import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { Wordmark } from "@/components/brand/logo";
import { TrendingUp, Link2, Package, Bell, ShieldCheck, BarChart3, Lock } from "lucide-react";

/**
 * The split-screen auth shell.
 *
 * Left: the product argument, plus a live-looking preview so a first-time
 * visitor knows what they are signing into. Right: the form, and nothing else.
 * On small screens the left panel collapses to a single line — the form is what
 * matters on a phone.
 */

const PROOF = [
  { icon: TrendingUp, title: "Real-time profit tracking", body: "See what you earn after fees, costs and refunds." },
  { icon: Link2, title: "Multiple eBay accounts", body: "Manage every store from one place." },
  { icon: Package, title: "Order & inventory sync", body: "New orders arrive on their own, every minute." },
  { icon: Bell, title: "Smart notifications", body: "Alerts for orders, refunds and thin margins." },
  { icon: ShieldCheck, title: "Refund & loss recovery", body: "Never miss money a supplier owes you." },
  { icon: BarChart3, title: "Detailed reports", body: "Accountant-ready CSV and PDF exports." },
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Someone already signed in has no business on the sign-in page.
  const auth = await getAuth();
  if (auth) redirect("/dashboard");

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="aurora relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <Link href="/" className="relative z-10 inline-flex w-fit rounded-lg">
          <Wordmark tagline size="md" />
        </Link>

        <div className="relative z-10 max-w-xl">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance text-ink">
            Your eBay dropshipping business,{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-mint-500 bg-clip-text text-transparent">
              fully in sight
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-md leading-relaxed text-ink-muted">
            Connect your eBay accounts, track every order, and see the profit that is left
            after eBay&rsquo;s fees, your supplier&rsquo;s price and the refunds you have given.
          </p>

          <ul className="mt-9 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {PROOF.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface shadow-sm ring-1 ring-line">
                  <item.icon className="size-4.5 text-brand" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-ink">{item.title}</span>
                  <span className="block text-sm text-ink-muted">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 flex items-center gap-2 text-sm text-ink-muted">
          <Lock className="size-3.5" aria-hidden />
          Secure · Reliable · Built for dropshippers
        </p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Wordmark tagline size="md" />
          </div>
          {children}
        </div>

        <footer className="mx-auto mt-10 flex w-full max-w-sm flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
          <Link href="/legal/terms" className="hover:text-ink-muted">Terms of service</Link>
          <span aria-hidden>·</span>
          <Link href="/legal/privacy" className="hover:text-ink-muted">Privacy policy</Link>
          <span aria-hidden>·</span>
          <Link href="/support" className="hover:text-ink-muted">Contact support</Link>
        </footer>
      </section>
    </div>
  );
}
