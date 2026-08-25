"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/table/filter-chips";
import { useToast } from "@/components/ui/toast";
import { changePlanAction, cancelPlanAction, resumePlanAction } from "@/server/actions/billing";
import { PURCHASABLE_PLANS, type PlanId } from "@/lib/plans";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Check, AlertTriangle, Info, Sparkles, CreditCard } from "lucide-react";

export function BillingClient({
  planId, planName, status, interval, trialDaysLeft, renewsAt, cancelAtPeriodEnd,
  accountsUsed, accountLimit, ordersThisMonth, stripeConfigured,
}: {
  planId: PlanId;
  planName: string;
  status: string;
  interval: string;
  trialDaysLeft: number | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  accountsUsed: number;
  accountLimit: number;
  ordersThisMonth: number;
  stripeConfigured: boolean;
}) {
  const [billingInterval, setBillingInterval] = React.useState(interval === "YEARLY" ? "YEARLY" : "MONTHLY");
  const [changing, setChanging] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const choose = async (plan: PlanId) => {
    setChanging(plan);
    const result = await changePlanAction({ plan, interval: billingInterval });
    setChanging(null);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't change your plan", description: result.error, durationMs: 9000 });
      return;
    }
    toast({
      tone: "success",
      title: `You're on ${plan === "SOLO" ? "Solo" : "Multi"}`,
      description: result.data!.stripeConfigured
        ? "Your card will be charged on the next cycle."
        : "No payment provider is configured on this deployment, so nothing was charged — your plan and limits are updated.",
      durationMs: 9000,
    });
    router.refresh();
  };

  const cancel = async () => {
    setBusy(true);
    const result = await cancelPlanAction();
    setBusy(false);
    setCancelling(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't cancel", description: result.error });
      return;
    }
    toast({
      tone: "success",
      title: "Cancellation scheduled",
      description: `You keep everything until ${renewsAt ?? "the end of the period"}. Nothing is deleted after that — syncing pauses.`,
    });
    router.refresh();
  };

  const resume = async () => {
    await resumePlanAction();
    toast({ tone: "success", title: "Cancellation reversed" });
    router.refresh();
  };

  const overLimit = accountsUsed > accountLimit;
  const atLimit = accountsUsed >= accountLimit;

  return (
    <>
      {!stripeConfigured ? (
        <p className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            No payment provider is configured on this deployment. Choosing a plan updates your limits
            and entitlements immediately, but takes no payment. Set{" "}
            <code className="rounded bg-surface px-1">STRIPE_SECRET_KEY</code> to enable real checkout.
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your plan" description="What you are on, and when it renews." />
          <CardBody>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-2xl font-semibold">{planName}</p>
              {status === "TRIALING" ? <Badge tone="brand" icon={Sparkles}>Trial</Badge> : null}
              {status === "ACTIVE" ? <Badge tone="positive" icon={Check}>Active</Badge> : null}
              {cancelAtPeriodEnd ? <Badge tone="caution" icon={AlertTriangle}>Ending</Badge> : null}
            </div>

            <p className={cn("mt-2 text-md", trialDaysLeft !== null && trialDaysLeft <= 2 ? "text-caution-ink" : "text-ink-muted")}>
              {status === "TRIALING" && trialDaysLeft !== null
                ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left on your trial. Nothing is deleted when it ends — syncing pauses until you subscribe.`
                : cancelAtPeriodEnd
                  ? `Ends ${renewsAt}. Until then everything works as normal.`
                  : renewsAt
                    ? `Renews ${renewsAt}, billed ${interval.toLowerCase()}.`
                    : "No renewal date recorded."}
            </p>

            {cancelAtPeriodEnd ? (
              <Button variant="secondary" className="mt-4" onClick={() => void resume()}>
                Keep my plan
              </Button>
            ) : status === "ACTIVE" ? (
              <Button variant="ghost" className="mt-4" onClick={() => setCancelling(true)}>
                Cancel plan
              </Button>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Usage" description="This billing period." />
          <CardBody className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-ink-muted">eBay accounts</p>
                <p className="tabular text-sm font-medium">{accountsUsed} / {accountLimit}</p>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken"
                role="progressbar"
                aria-valuenow={accountsUsed}
                aria-valuemin={0}
                aria-valuemax={accountLimit}
                aria-label="eBay accounts used"
              >
                <div
                  className={cn("h-full rounded-full transition-[width]", overLimit ? "bg-negative" : atLimit ? "bg-caution" : "bg-brand")}
                  style={{ width: `${Math.min(100, (accountsUsed / accountLimit) * 100)}%` }}
                />
              </div>
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-ink-muted">Orders this month</p>
              <p className="tabular text-sm font-medium">
                {ordersThisMonth.toLocaleString()}
                <span className="ml-1 font-normal text-ink-muted">unlimited</span>
              </p>
            </div>

            {atLimit ? (
              <p className="flex items-start gap-2 rounded-lg bg-caution-soft px-3 py-2.5 text-sm text-caution-ink">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                You are using every eBay account your plan covers. Move up a plan to connect another —
                the accounts you already have keep working either way.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Plans"
          description="Every plan includes full profit, fees and refund tracking. Orders are unlimited on all of them."
          action={
            <SegmentedControl
              label="Billing interval"
              size="sm"
              value={billingInterval}
              onChange={setBillingInterval}
              options={[
                { value: "MONTHLY", label: "Monthly" },
                { value: "YEARLY", label: "Yearly" },
              ]}
            />
          }
        />
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            {PURCHASABLE_PLANS.map((plan) => {
              const current = plan.id === planId;
              const priceMinor = billingInterval === "YEARLY" ? plan.yearlyMinor : plan.monthlyMinor;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex flex-col rounded-xl border p-5",
                    current ? "border-brand bg-brand-soft/30 ring-1 ring-brand/25" : "border-line",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {current ? <Badge tone="brand">Current</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{plan.blurb}</p>

                  <p className="mt-4">
                    {priceMinor === null ? (
                      <span className="text-2xl font-semibold">Contact us</span>
                    ) : (
                      <>
                        <span className="text-3xl font-semibold tracking-tight">
                          {formatMoney(priceMinor, plan.currency, { locale: "en-US" })}
                        </span>
                        <span className="text-sm text-ink-muted">
                          {billingInterval === "YEARLY" ? " / year" : " / month"}
                        </span>
                      </>
                    )}
                  </p>
                  {billingInterval === "YEARLY" && plan.monthlyMinor && plan.yearlyMinor ? (
                    <p className="text-xs text-positive-ink">
                      Saves {formatMoney(plan.monthlyMinor * 12 - plan.yearlyMinor, plan.currency, { locale: "en-US" })} a year
                    </p>
                  ) : null}

                  <ul className="mt-4 flex-1 space-y-1.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-ink-muted">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5">
                    {!plan.purchasable ? (
                      <a
                        href="mailto:sales@dropinsight.app?subject=Custom%20plan"
                        className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-line bg-surface text-base font-medium shadow-sm hover:bg-surface-hover"
                      >
                        Get in touch
                      </a>
                    ) : current ? (
                      <Button variant="subtle" className="w-full" disabled>
                        Your current plan
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        className="w-full"
                        loading={changing === plan.id}
                        onClick={() => void choose(plan.id)}
                      >
                        <CreditCard className="size-4" aria-hidden />
                        Choose {plan.name}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-sm text-ink-subtle">
            Prices are in USD. VAT is not added — DropInsight is not VAT registered.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={() => void cancel()}
        title="Cancel your plan?"
        message={`You keep full access until ${renewsAt ?? "the end of your billing period"}. After that nothing is deleted — your orders, costs and reports stay exactly where they are — but new orders stop syncing until you subscribe again.`}
        confirmLabel="Cancel at period end"
        loading={busy}
      />
    </>
  );
}
