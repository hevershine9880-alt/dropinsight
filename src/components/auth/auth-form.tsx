"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";

/**
 * Shared wrapper for the auth forms.
 *
 * Handles the three things every one of them needs: a form-level error region
 * that is announced, the redirect on success, and the pending state — so the
 * individual pages only describe their own fields.
 */
export function AuthForm({
  action, children, onSuccess,
}: {
  action: (prev: unknown, formData: FormData) => Promise<ActionResult>;
  children: (state: { errors: Record<string, string>; pending: boolean }) => React.ReactNode;
  onSuccess?: (result: ActionResult) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => action(prev, formData),
    null,
  );

  React.useEffect(() => {
    if (!state?.ok) return;
    onSuccess?.(state);
    if (state.redirectTo) {
      router.push(state.redirectTo);
      router.refresh();
    }
  }, [state, router, onSuccess]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok && state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-negative/25 bg-negative-soft px-3 py-2.5 text-sm text-negative-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      ) : null}

      {children({ errors: state?.fieldErrors ?? {}, pending })}
    </form>
  );
}

/** Password input with a show/hide control that stays accessible. */
export function PasswordInput({
  id, name, placeholder, autoComplete, invalid, required,
}: {
  id: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  invalid?: boolean;
  required?: boolean;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={invalid || undefined}
        className={[
          "h-9.5 w-full rounded-lg border bg-surface px-3 pr-10 text-base text-ink",
          "transition-[border-color,box-shadow] duration-150 hover:border-line-strong",
          "focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none",
          invalid ? "border-negative" : "border-line",
        ].join(" ")}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
