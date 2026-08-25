import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <>
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Start tracking your profit</h1>
        <p className="mt-1.5 text-md text-ink-muted">
          14 days free. Connect an eBay account and see your real numbers in minutes.
        </p>
      </header>

      <SignUpForm />

      <p className="mt-6 text-center text-md text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
