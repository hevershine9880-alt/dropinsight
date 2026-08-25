"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { startEbayConnectAction } from "@/server/actions/ebay";
import { setRefundAttributionAction, completeOnboardingAction } from "@/server/actions/workspace";
import { REFUND_ATTRIBUTION_COPY, type RefundAttribution } from "@/lib/finance/types";
import { cn } from "@/lib/cn";
import {
  Check, Link2, CalendarClock, CalendarRange, Loader2, ArrowRight,
  TrendingUp, ShieldCheck, Package, FlaskConical, PartyPopper, AlertTriangle,
} from "lucide-react";

/**
 * First-run setup.
 *
 * Four steps, and the third is a real wait: the history import genuinely takes
 * a while, so it shows progress rather than a spinner, and lets the user carry
 * on to the dashboard while it finishes.
 */

type Step = "welcome" | "connect" | "importing" | "settings" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "welcome", label: "Welcome" },
  { key: "connect", label: "Connect eBay" },
  { key: "importing", label: "Import orders" },
  { key: "settings", label: "One decision" },
];

export function OnboardingFlow({
  workspaceName, userName, currency, refundAttribution, accounts,
  orderCount, latestJob, usingMockAdapter, initialStep, justConnectedAccountId,
}: {
  workspaceName: string;
  userName: string;
  currency: string;
  refundAttribution: RefundAttribution;
  accounts: { id: string; username: string; marketplaceId: string; currency: string; lastSyncAt: string | null }[];
  orderCount: number;
  latestJob: { id: string; status: string; type: string; ordersImported: number; error: string | null } | null;
  usingMockAdapter: boolean;
  initialStep: string | null;
  justConnectedAccountId: string | null;
}) {
  const [step, setStep] = React.useState<Step>(() => {
    if (initialStep === "importing" || justConnectedAccountId) return "importing";
    if (accounts.length > 0) return orderCount > 0 ? "settings" : "importing";
    return "welcome";
  });

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Wordmark size="sm" tagline />
          <p className="hidden text-sm text-ink-muted sm:block">{workspaceName}</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <ol className="mb-8 flex items-center gap-2" aria-label="Setup progress">
          {STEPS.map((entry, index) => {
            const done = stepIndex > index;
            const current = stepIndex === index;
            return (
              <li key={entry.key} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                    done ? "bg-positive text-white" : current ? "bg-brand text-white" : "bg-surface-sunken text-ink-subtle",
                  )}
                  aria-current={current ? "step" : undefined}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                <span className={cn("hidden text-sm sm:block", current ? "font-medium text-ink" : "text-ink-muted")}>
                  {entry.label}
                </span>
                {index < STEPS.length - 1 ? (
                  <span className={cn("h-px flex-1", done ? "bg-positive" : "bg-line")} aria-hidden />
                ) : null}
              </li>
            );
          })}
        </ol>

        {step === "welcome" ? <WelcomeStep userName={userName} onNext={() => setStep("connect")} /> : null}
        {step === "connect" ? <ConnectStep usingMockAdapter={usingMockAdapter} /> : null}
        {step === "importing" ? (
          <ImportingStep
            accounts={accounts}
            orderCount={orderCount}
            latestJob={latestJob}
            onNext={() => setStep("settings")}
          />
        ) : null}
        {step === "settings" ? (
          <SettingsStep
            currency={currency}
            current={refundAttribution}
            accountCount={accounts.length}
            orderCount={orderCount}
          />
        ) : null}
      </div>
    </div>
  );
}

function WelcomeStep({ userName, onNext }: { userName: string; onNext: () => void }) {
  const points = [
    {
      icon: TrendingUp,
      title: "Real profit, not turnover",
      body: "DropInsight subtracts eBay's fees, your supplier's price and the refunds you have given, so the number you see is the one that reaches your bank.",
    },
    {
      icon: ShieldCheck,
      title: "The money suppliers owe you",
      body: "When you refund a buyer, DropInsight asks whether your supplier paid you back — and keeps asking until you answer. That is usually where the missing profit is.",
    },
    {
      icon: Package,
      title: "One place for every store",
      body: "Connect as many eBay accounts as your plan allows and see them together, or one at a time.",
    },
  ];

  return (
    <Card>
      <CardBody className="p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {userName.split(" ")[0]}
        </h1>
        <p className="mt-2 text-md text-ink-muted">
          Three minutes of setup and you will know exactly what your eBay business earns.
        </p>

        <ul className="mt-6 space-y-4">
          {points.map((point) => (
            <li key={point.title} className="flex gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <point.icon className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-ink">{point.title}</span>
                <span className="block text-sm leading-relaxed text-ink-muted">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <Button variant="primary" size="lg" className="mt-7 w-full sm:w-auto" onClick={onNext}>
          Get started
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </CardBody>
    </Card>
  );
}

function ConnectStep({ usingMockAdapter }: { usingMockAdapter: boolean }) {
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    const result = await startEbayConnectAction();
    if (!result.ok) {
      setConnecting(false);
      setError(result.error ?? "We couldn't start the connection. Try again.");
      return;
    }
    window.location.href = result.data!.url;
  };

  return (
    <Card>
      <CardBody className="p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Link2 className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Connect your eBay account</h1>
        <p className="mt-2 max-w-xl text-md text-ink-muted">
          You will be sent to eBay to approve read access. DropInsight can see your orders, fees and
          seller standards — it cannot list, relist, message a buyer or change a price. Your tokens are
          encrypted and never leave our servers.
        </p>

        {usingMockAdapter ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-caution-soft px-3 py-2.5 text-sm text-caution-ink">
            <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Running with <code className="rounded bg-surface px-1">EBAY_ADAPTER=mock</code>, so you will
              pick from demo stores instead of signing in to eBay. Everything after this point is the
              real application.
            </span>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-negative-soft px-3 py-2.5 text-sm text-negative-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <Button variant="primary" size="lg" className="mt-6 w-full sm:w-auto" onClick={() => void connect()} loading={connecting}>
          {usingMockAdapter ? "Choose a demo store" : "Continue to eBay"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>

        <p className="mt-4 text-sm text-ink-subtle">
          DropInsight imports the last 90 days automatically. You can pull more history afterwards.
        </p>
      </CardBody>
    </Card>
  );
}

function ImportingStep({
  accounts, orderCount, latestJob, onNext,
}: {
  accounts: { id: string; username: string; marketplaceId: string; currency: string }[];
  orderCount: number;
  latestJob: { status: string; type: string; ordersImported: number; error: string | null } | null;
  onNext: () => void;
}) {
  const router = useRouter();
  const [ticking, setTicking] = React.useState(true);

  // Drive the worker while the user watches, so the import actually progresses
  // rather than waiting for the next scheduled tick.
  React.useEffect(() => {
    if (!ticking) return;
    let cancelled = false;

    const run = async () => {
      try {
        await fetch("/api/jobs/tick", { method: "POST" });
        if (!cancelled) router.refresh();
      } catch {
        // The next interval retries.
      }
    };

    void run();
    const timer = setInterval(run, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [ticking, router]);

  const failed = latestJob?.status === "FAILED";
  const finished = latestJob?.status === "SUCCESS" || orderCount > 0;

  React.useEffect(() => {
    if (finished || failed) setTicking(false);
  }, [finished, failed]);

  return (
    <Card>
      <CardBody className="p-8">
        <span
          className={cn(
            "grid size-12 place-items-center rounded-2xl",
            failed ? "bg-negative-soft text-negative" : finished ? "bg-positive-soft text-positive" : "bg-brand-soft text-brand",
          )}
        >
          {failed ? (
            <AlertTriangle className="size-6" aria-hidden />
          ) : finished ? (
            <Check className="size-6" aria-hidden />
          ) : (
            <Loader2 className="size-6 animate-spin-slow" aria-hidden />
          )}
        </span>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {failed ? "The import ran into a problem" : finished ? "Your orders are in" : "Importing your orders"}
        </h1>

        <p className="mt-2 max-w-xl text-md text-ink-muted" aria-live="polite">
          {failed
            ? `${latestJob?.error ?? "eBay did not respond as expected."} Nothing was lost — you can retry from the eBay accounts page.`
            : finished
              ? `${orderCount.toLocaleString()} orders imported from ${accounts.map((a) => a.username).join(", ")}. Fees and refunds came with them.`
              : "This usually takes under a minute for 90 days of orders. You can leave this page — it will carry on in the background."}
        </p>

        {accounts.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center gap-3 rounded-lg bg-surface-sunken px-3 py-2.5">
                <Check className="size-4 shrink-0 text-positive" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{account.username}</span>
                  <span className="block text-xs text-ink-muted">
                    {account.marketplaceId.replace("EBAY_", "")} · reporting in {account.currency}
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm text-ink-muted">
                  {orderCount > 0 ? `${orderCount.toLocaleString()} orders` : "importing…"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={onNext} disabled={!finished && !failed}>
            {finished ? "Continue" : failed ? "Continue anyway" : "Waiting for orders…"}
            {finished || failed ? <ArrowRight className="size-4" aria-hidden /> : null}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function SettingsStep({
  currency, current, accountCount, orderCount,
}: {
  currency: string;
  current: RefundAttribution;
  accountCount: number;
  orderCount: number;
}) {
  const [choice, setChoice] = React.useState<RefundAttribution>(current);
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const finish = async () => {
    setSaving(true);

    if (choice !== current) {
      const result = await setRefundAttributionAction(choice);
      if (!result.ok) {
        setSaving(false);
        toast({ tone: "error", title: "Couldn't save that", description: result.error });
        return;
      }
    }

    const done = await completeOnboardingAction();
    setSaving(false);

    if (!done.ok) {
      toast({ tone: "error", title: "Couldn't finish setup", description: done.error });
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  const options: { value: RefundAttribution; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "REFUND_MONTH", icon: CalendarClock },
    { value: "ORDER_MONTH", icon: CalendarRange },
  ];

  return (
    <Card>
      <CardBody className="p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-positive-soft text-positive">
          <PartyPopper className="size-6" aria-hidden />
        </span>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">One decision, then you&rsquo;re in</h1>
        <p className="mt-2 max-w-2xl text-md text-ink-muted">
          When a refund happens in a later month than the sale, which month should carry the loss?
          This is the one accounting choice that changes every figure in DropInsight, so it is worth
          thirty seconds. You can change it later in Settings, and nothing stored is altered either way.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {options.map(({ value, icon: Icon }) => {
            const copy = REFUND_ATTRIBUTION_COPY[value];
            const selected = choice === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setChoice(value)}
                aria-pressed={selected}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  selected ? "border-brand bg-brand-soft ring-1 ring-brand/25" : "border-line hover:border-line-strong hover:bg-surface-hover",
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="text-base font-semibold text-ink">{copy.title}</span>
                  {value === "REFUND_MONTH" ? (
                    <span className="rounded bg-surface px-1.5 py-0.5 text-2xs font-medium text-ink-muted">
                      most common
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 block text-sm leading-relaxed text-ink-muted">
                  <strong className="font-medium text-ink">{copy.example}</strong> {copy.rationale}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-lg bg-surface-sunken p-4">
          <h2 className="text-sm font-semibold">Set from your eBay account</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field label="Reporting currency" htmlFor="onboarding-currency" hint="Taken from your marketplace. Amounts are never converted.">
              <Select id="onboarding-currency" value={currency} disabled>
                <option value={currency}>{currency}</option>
              </Select>
            </Field>
            <div>
              <p className="text-sm font-medium">Imported so far</p>
              <p className="mt-1.5 text-lg font-semibold">
                {orderCount.toLocaleString()} orders
                <span className="ml-1.5 text-sm font-normal text-ink-muted">
                  from {accountCount} account{accountCount === 1 ? "" : "s"}
                </span>
              </p>
            </div>
          </div>
        </div>

        <Button variant="primary" size="lg" className="mt-7 w-full sm:w-auto" onClick={() => void finish()} loading={saving}>
          Go to my dashboard
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </CardBody>
    </Card>
  );
}
