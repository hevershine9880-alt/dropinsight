"use client";

import { AuthForm, PasswordInput } from "@/components/auth/auth-form";
import { resetPasswordAction } from "@/server/actions/auth";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <AuthForm action={resetPasswordAction}>
      {({ errors, pending }) => (
        <>
          <input type="hidden" name="token" value={token} />

          <Field label="New password" htmlFor="password" error={errors.password} hint="At least 10 characters.">
            <PasswordInput id="password" name="password" autoComplete="new-password" required invalid={!!errors.password} />
          </Field>

          <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm}>
            <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required invalid={!!errors.confirm} />
          </Field>

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} loadingLabel="Saving…">
            Set new password
          </Button>
        </>
      )}
    </AuthForm>
  );
}
