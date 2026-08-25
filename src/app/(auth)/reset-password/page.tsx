import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="rounded-xl border border-negative/25 bg-negative-soft p-5 text-center" role="alert">
        <h1 className="text-lg font-semibold text-ink">This link is incomplete</h1>
        <p className="mt-1.5 text-md text-ink-muted">
          The reset link is missing its token. Open the link from your email again, or request a new one.
        </p>
        <Link href="/forgot-password" className="mt-3 inline-block font-medium text-brand hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-1.5 text-md text-ink-muted">
          Choosing a new password signs out every other device.
        </p>
      </header>
      <ResetPasswordForm token={token} />
    </>
  );
}
