/**
 * The shape every server action returns.
 *
 * `fieldErrors` puts a message next to the input that caused it; `error` is for
 * everything else. Actions never throw at the UI — a thrown error becomes an
 * opaque "something went wrong", which is exactly what we are trying to avoid.
 */
export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
  /** Where to go on success, when the action decides the destination. */
  redirectTo?: string;
}

export function ok<T>(data?: T, redirectTo?: string): ActionResult<T> {
  return { ok: true, data, redirectTo };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

import { ZodError } from "zod";

/** Flatten a Zod error into per-field messages. */
export function fromZod(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
}
