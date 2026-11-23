"use client";

import { useState } from "react";
import type { BookingPublicView } from "@/lib/types";
import { Button, Notice, Sheet } from "@/components/ui";
import type { CancelResult } from "./action-types";

interface Props {
  mode: BookingPublicView["cancelMode"];
  cancelAction: () => Promise<CancelResult>;
  /** "Cancel your request for Sat, Dec 5?" / "Cancel N1 · Half A on Sat, Dec 5?" */
  sheetTitle: string;
  /** "You haven't been charged." / "We'll refund $120.00 to your Visa ending 4242." */
  sheetBody: string;
  /** Shown when mode is 'call' (past the cutoff). */
  callText: string;
  /** Policy line above the button. */
  policyText: string | null;
}

/**
 * Cancel from the private link: two taps, and it says exactly how much money
 * comes back. Stays mounted across the refresh so the result stays on screen.
 */
export function CancelSection({ mode, cancelAction, sheetTitle, sheetBody, callText, policyText }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const isRequest = mode === "request";

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await cancelAction();
      if (result.ok) {
        setDone(result.message);
        setOpen(false);
      } else {
        setError(result.message);
      }
    } catch {
      setError("Your connection dropped. Check your signal and try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <Notice tone="ok" live="polite" title="Cancelled">
        {done}
      </Notice>
    );
  }

  if (mode === "call") {
    return <Notice title="Need to cancel?">{callText}</Notice>;
  }

  if (mode !== "request" && mode !== "refund") return null;

  return (
    <div className="rounded-[22px] border border-line bg-white p-5">
      <p className="text-[17px] font-semibold text-text">{isRequest ? "Change of plans?" : "Need to cancel?"}</p>
      {policyText ? <p className="mt-1 text-[15px] leading-relaxed text-muted">{policyText}</p> : null}
      <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>
        {isRequest ? "Cancel request" : "Cancel booking"}
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title={sheetTitle}>
        <p className="text-[15px] leading-relaxed text-text">{sheetBody}</p>
        {error ? (
          <p role="alert" className="mt-3 text-[14px] font-medium text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button block variant="danger" onClick={confirm} aria-disabled={pending || undefined}>
            {pending ? "Cancelling..." : isRequest ? "Cancel request" : "Cancel and refund"}
          </Button>
          <Button block variant="ink" onClick={() => setOpen(false)} disabled={pending}>
            {isRequest ? "Keep request" : "Keep booking"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
