"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AuthForm, PasswordInput } from "@/components/auth/auth-form";
import { signInAction } from "@/server/actions/auth";
import { Field, Input, Checkbox } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DemoAccounts } from "@/components/auth/demo-accounts";

export function SignInForm() {
  return (
    <>
      <AuthForm action={signInAction}>
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

            <Field label="Password" htmlFor="password" error={errors.password}>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                invalid={!!errors.password}
              />
            </Field>

            <div className="flex items-center justify-between gap-3">
              <Checkbox name="remember" label={<span className="text-sm">Keep me signed in</span>} defaultChecked />
              <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} loadingLabel="Signing in…">
              Sign in
              {!pending ? <ArrowRight className="size-4" aria-hidden /> : null}
            </Button>
          </>
        )}
      </AuthForm>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-subtle">
        <ShieldCheck className="size-3.5" aria-hidden />
        Your eBay tokens are encrypted and never leave our servers.
      </p>

      <DemoAccounts />
    </>
  );
}
