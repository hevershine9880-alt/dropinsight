"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { AuthForm, PasswordInput } from "@/components/auth/auth-form";
import { signUpAction } from "@/server/actions/auth";
import { Field, Input, Checkbox } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Live, non-blocking feedback. The server re-checks all of it. */
function PasswordMeter({ value }: { value: string }) {
  const checks = [
    { label: "At least 10 characters", pass: value.length >= 10 },
    { label: "Mixes letters and numbers", pass: /[a-z]/i.test(value) && /\d/.test(value) },
    { label: "Not an obvious password", pass: value.length > 0 && !/^(password|12345678|qwerty)/i.test(value) },
  ];
  const score = checks.filter((c) => c.pass).length;

  if (value.length === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1" role="presentation">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              i < score ? (score === 3 ? "bg-positive" : score === 2 ? "bg-caution" : "bg-negative") : "bg-line",
            )}
          />
        ))}
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {checks.map((check) => (
          <li key={check.label} className={cn("flex items-center gap-1.5 text-xs", check.pass ? "text-positive-ink" : "text-ink-subtle")}>
            <Check className={cn("size-3 shrink-0", !check.pass && "opacity-30")} aria-hidden />
            {check.label}
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        Password strength: {score} of 3 requirements met.
      </p>
    </div>
  );
}

export function SignUpForm() {
  const [password, setPassword] = React.useState("");

  return (
    <AuthForm action={signUpAction}>
      {({ errors, pending }) => (
        <>
          <Field label="Your name" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" autoComplete="name" placeholder="Alex Turner" required invalid={!!errors.name} />
          </Field>

          <Field
            label="Business name"
            htmlFor="workspaceName"
            error={errors.workspaceName}
            hint="This names your workspace. You can change it later."
          >
            <Input
              id="workspaceName"
              name="workspaceName"
              autoComplete="organization"
              placeholder="Northbridge Retail"
              required
              invalid={!!errors.workspaceName}
            />
          </Field>

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
            <div onInput={(e) => setPassword((e.target as HTMLInputElement).value)}>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                placeholder="At least 10 characters"
                required
                invalid={!!errors.password}
              />
            </div>
            <PasswordMeter value={password} />
          </Field>

          <Checkbox
            name="acceptedTerms"
            label={
              <span className="text-sm">
                I agree to the{" "}
                <Link href="/legal/terms" className="font-medium text-brand hover:underline">terms of service</Link>
                {" "}and{" "}
                <Link href="/legal/privacy" className="font-medium text-brand hover:underline">privacy policy</Link>.
              </span>
            }
          />
          {errors.acceptedTerms ? <p className="text-sm text-negative">{errors.acceptedTerms}</p> : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} loadingLabel="Creating your account…">
            Create account
            {!pending ? <ArrowRight className="size-4" aria-hidden /> : null}
          </Button>

          <p className="text-center text-xs text-ink-subtle">No card needed for the trial.</p>
        </>
      )}
    </AuthForm>
  );
}
