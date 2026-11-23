"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, TextField } from "@/components/ui";
import { requestSignInLink, type LoginState } from "./actions";

const LINK_ERRORS = {
  expired: "That sign-in link expired. Links work for 15 minutes, so get a new one below.",
  used: "That sign-in link was already used. Each link works once, so get a new one below.",
  invalid: "That sign-in link doesn't work. Get a new one below.",
} as const;

export type LinkError = keyof typeof LINK_ERRORS;

const initial: LoginState = { status: "idle" };

export function LoginForm({ linkError, devHint }: { linkError: LinkError | null; devHint: boolean }) {
  // Bumping the key resets the form after "Use a different email".
  const [attempt, setAttempt] = useState(0);
  return (
    <LoginFormInner
      key={attempt}
      linkError={attempt === 0 ? linkError : null}
      devHint={devHint}
      onReset={() => setAttempt((n) => n + 1)}
    />
  );
}

function LoginFormInner({
  linkError,
  devHint,
  onReset,
}: {
  linkError: LinkError | null;
  devHint: boolean;
  onReset: () => void;
}) {
  const [state, formAction, pending] = useActionState(requestSignInLink, initial);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-bold leading-snug">Check your email.</h2>
          <p className="mt-1 text-[15px] text-text">The link works for 15 minutes.</p>
        </div>
        <p className="text-[14px] text-muted">
          If <span className="font-semibold text-text">{state.email}</span> is on a Tymo team, a sign-in link is on its
          way. It can be used once.
        </p>
        <Button variant="ghost" block onClick={onReset}>
          Use a different email
        </Button>
        {devHint ? <DevHint /> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {linkError && state.status === "idle" ? (
        <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] font-medium text-warn">
          {LINK_ERRORS[linkError]}
        </p>
      ) : null}
      <TextField
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        placeholder="you@example.com"
        defaultValue={state.email}
        error={state.status === "error" ? state.message : null}
      />
      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Sending..." : "Email me a sign-in link"}
      </Button>
      <p className="text-center text-[13px] text-muted">No password. We email you a link that signs you in.</p>
      {devHint ? <DevHint /> : null}
    </form>
  );
}

function DevHint() {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-3 text-[13px] text-muted">
      Running locally? Emails aren&apos;t sent; sign-in links land in the{" "}
      <Link href="/dev/outbox" className="font-semibold text-brand underline underline-offset-2">
        dev outbox
      </Link>
      .
    </p>
  );
}
