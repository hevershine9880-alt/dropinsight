"use client";

import * as React from "react";
import { MailCheck } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { requestPasswordResetAction } from "@/server/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);

  if (sent) {
    return (
      <div className="rounded-xl border border-positive/25 bg-positive-soft p-5 text-center" role="status">
        <MailCheck className="mx-auto size-7 text-positive" aria-hidden />
        <h2 className="mt-2.5 text-lg font-semibold text-ink">Check your inbox</h2>
        <p className="mt-1.5 text-md text-ink-muted">
          If that address has an account, a reset link is on its way. It expires in an hour.
        </p>
        <p className="mt-3 text-sm text-ink-subtle">
          Nothing arrived? Check spam, or{" "}
          <button type="button" onClick={() => setSent(false)} className="font-medium text-brand hover:underline">
            try another address
          </button>.
        </p>
      </div>
    );
  }

  return (
    <AuthForm action={requestPasswordResetAction} onSuccess={() => setSent(true)}>
      {({ errors, pending }) => (
        <>
          <Field label="Email address" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              invalid={!!errors.email}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} loadingLabel="Sending…">
            Send reset link
          </Button>
        </>
      )}
    </AuthForm>
  );
}
