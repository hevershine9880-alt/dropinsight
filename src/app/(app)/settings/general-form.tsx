"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { updateWorkspaceAction } from "@/server/actions/workspace";
import { REFUND_ATTRIBUTION, REFUND_ATTRIBUTION_COPY, type RefundAttribution } from "@/lib/finance/types";
import type { ActionResult } from "@/lib/action-result";
import { AlertCircle, Info } from "lucide-react";

const CURRENCIES = ["GBP", "USD", "EUR", "AUD", "CAD"];

export function GeneralSettingsForm({
  name, currency, refundAttribution,
}: {
  name: string;
  currency: string;
  refundAttribution: RefundAttribution;
}) {
  const [attribution, setAttribution] = React.useState<RefundAttribution>(refundAttribution);
  const { toast } = useToast();
  const router = useRouter();

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => updateWorkspaceAction(prev, formData),
    null,
  );

  React.useEffect(() => {
    if (state?.ok) {
      toast({ tone: "success", title: "Settings saved" });
      router.refresh();
    }
  }, [state, toast, router]);

  const copy = REFUND_ATTRIBUTION_COPY[attribution];

  return (
    <form action={formAction}>
      <Card>
        <CardHeader title="General" description="Workspace name, reporting currency and how refund losses are dated." />
        <CardBody className="max-w-xl space-y-5">
          {state && !state.ok && state.error ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-negative-soft px-3 py-2.5 text-sm text-negative-ink">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          ) : null}

          <Field label="Workspace name" htmlFor="ws-name" error={state?.fieldErrors?.name}>
            <Input id="ws-name" name="name" defaultValue={name} required invalid={!!state?.fieldErrors?.name} />
          </Field>

          <Field
            label="Display currency"
            htmlFor="ws-currency"
            hint="Set automatically from your eBay marketplace when you connect your first account — a UK marketplace reports GBP, a US one USD. Change it only if you have a reason to report in a different currency; amounts are not converted."
          >
            <Select id="ws-currency" name="currency" defaultValue={currency} className="max-w-40">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>

          <Field
            label="Refund losses count in"
            htmlFor="ws-attribution"
            hint="Changes how dashboards, analytics and reports date a refund loss. Nothing stored is altered."
          >
            <Select
              id="ws-attribution"
              name="refundAttribution"
              value={attribution}
              onChange={(e) => setAttribution(e.target.value as RefundAttribution)}
            >
              {REFUND_ATTRIBUTION.map((value) => (
                <option key={value} value={value}>{REFUND_ATTRIBUTION_COPY[value].title}</option>
              ))}
            </Select>
          </Field>

          <p className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-medium text-ink">{copy.example}</strong> {copy.rationale}
            </span>
          </p>
        </CardBody>
        <CardFooter className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending}>Save changes</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
