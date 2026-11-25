"use client";

import { useActionState } from "react";
import { buttonClass, inputClass } from "./controls";

export interface AdminSignInState {
  error: "missing" | "mismatch" | "off" | null;
  /** Kept so a failed attempt doesn't wipe the username. */
  user: string;
}

const MESSAGES: Record<NonNullable<AdminSignInState["error"]>, string> = {
  missing: "Enter your username and password.",
  mismatch: "That username and password don't match.",
  off: "Admin sign-in is off on this server. Set TYMO_ADMIN_USER, TYMO_ADMIN_PASSWORD and SESSION_SECRET on Tymo services.",
};

const initial: AdminSignInState = { error: null, user: "" };

export function AdminLoginForm({
  action,
}: {
  action: (prev: AdminSignInState, formData: FormData) => Promise<AdminSignInState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const message = state.error ? MESSAGES[state.error] : null;
  const invalid = state.error === "missing" || state.error === "mismatch";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="admin-user" className="mb-1 block text-[14px] font-medium text-text">
          Username
        </label>
        <input
          id="admin-user"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.user}
          aria-invalid={invalid || undefined}
          aria-describedby={message ? "admin-signin-error" : undefined}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="admin-password" className="mb-1 block text-[14px] font-medium text-text">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={invalid || undefined}
          aria-describedby={message ? "admin-signin-error" : undefined}
          className={inputClass}
        />
      </div>
      <p
        id="admin-signin-error"
        aria-live="polite"
        className={message ? "border-l-2 border-danger pl-3 text-[14px] font-medium leading-snug text-danger" : "sr-only"}
      >
        {message}
      </p>
      <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
