"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/auth/auth-form";
import { useToast } from "@/components/ui/toast";
import { updateProfileAction, changePasswordAction } from "@/server/actions/profile";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/cn";
import { AlertCircle, Check } from "lucide-react";

const COLORS = [
  { value: "indigo", className: "bg-indigo-600" },
  { value: "emerald", className: "bg-mint-600" },
  { value: "amber", className: "bg-amber-500" },
  { value: "rose", className: "bg-rose-500" },
  { value: "navy", className: "bg-navy-600" },
];

export function ProfileForm({
  name, email, avatarColor,
}: {
  name: string;
  email: string;
  avatarColor: string;
}) {
  const [color, setColor] = React.useState(avatarColor);
  const { toast } = useToast();
  const router = useRouter();

  const [profileState, profileAction, profilePending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => updateProfileAction(prev, formData),
    null,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => changePasswordAction(prev, formData),
    null,
  );

  React.useEffect(() => {
    if (profileState?.ok) {
      toast({ tone: "success", title: "Profile saved" });
      router.refresh();
    }
  }, [profileState, toast, router]);

  React.useEffect(() => {
    if (passwordState?.ok) {
      toast({ tone: "success", title: "Password changed", description: "Use it next time you sign in." });
    }
  }, [passwordState, toast]);

  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <form action={profileAction}>
        <Card>
          <CardHeader title="Your profile" description="How you appear to the rest of your team." />
          <CardBody className="max-w-xl space-y-5">
            <Field label="Name" htmlFor="profile-name" error={profileState?.fieldErrors?.name}>
              <Input id="profile-name" name="name" defaultValue={name} required />
            </Field>

            <Field
              label="Email"
              htmlFor="profile-email"
              hint="Your email is how you sign in and cannot be changed here. Contact support if you need to."
            >
              <Input id="profile-email" value={email} disabled readOnly />
            </Field>

            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-ink">Avatar colour</legend>
              <input type="hidden" name="avatarColor" value={color} />
              <div className="flex items-center gap-2">
                {COLORS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setColor(option.value)}
                    aria-pressed={color === option.value}
                    aria-label={`${option.value} avatar`}
                    className={cn(
                      "grid size-10 place-items-center rounded-full text-xs font-semibold text-white transition-transform",
                      option.className,
                      color === option.value && "ring-2 ring-brand ring-offset-2 ring-offset-surface",
                    )}
                  >
                    {color === option.value ? <Check className="size-4" aria-hidden /> : initials}
                  </button>
                ))}
              </div>
            </fieldset>
          </CardBody>
          <CardFooter className="flex justify-end">
            <Button type="submit" variant="primary" loading={profilePending}>Save profile</Button>
          </CardFooter>
        </Card>
      </form>

      <form action={passwordAction}>
        <Card>
          <CardHeader
            title="Change password"
            description="Use at least 10 characters. Changing it here does not sign out your other devices."
          />
          <CardBody className="max-w-xl space-y-4">
            {passwordState && !passwordState.ok && passwordState.error ? (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-negative-soft px-3 py-2.5 text-sm text-negative-ink">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {passwordState.error}
              </p>
            ) : null}

            <Field label="Current password" htmlFor="pw-current" error={passwordState?.fieldErrors?.current}>
              <PasswordInput id="pw-current" name="current" autoComplete="current-password" required />
            </Field>
            <Field label="New password" htmlFor="pw-next" error={passwordState?.fieldErrors?.next}>
              <PasswordInput id="pw-next" name="next" autoComplete="new-password" required />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm" error={passwordState?.fieldErrors?.confirm}>
              <PasswordInput id="pw-confirm" name="confirm" autoComplete="new-password" required />
            </Field>
          </CardBody>
          <CardFooter className="flex justify-end">
            <Button type="submit" variant="secondary" loading={passwordPending}>Change password</Button>
          </CardFooter>
        </Card>
      </form>
    </>
  );
}
