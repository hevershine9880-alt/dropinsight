import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1.5 text-md text-ink-muted">
          Tell us the email on your account and we&rsquo;ll send a link to set a new password.
        </p>
      </header>

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-md text-ink-muted">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-brand hover:underline">Back to sign in</Link>
      </p>
    </>
  );
}
