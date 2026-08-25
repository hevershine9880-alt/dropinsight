import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-md text-ink-muted">Sign in to pick up where you left off.</p>
      </header>

      <SignInForm />

      <p className="mt-6 text-center text-md text-ink-muted">
        New to DropInsight?{" "}
        <Link href="/sign-up" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
