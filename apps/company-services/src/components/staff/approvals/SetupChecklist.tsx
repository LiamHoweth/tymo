"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import type { SetupChecklist as Checklist } from "@tymo/shared/types";
import { cn } from "@tymo/shared/cn";
import { Button, buttonClass } from "@tymo/ui";
import { CopyLinkButton } from "../CopyLinkButton";
import { useStaff } from "../StaffProvider";
import { CheckIcon } from "../icons";

type Result = { ok: boolean; message: string };

/**
 * Owner's first-run card on Approvals: "3 steps before you take bookings",
 * then "Turn on bookings", then the live link with Copy link. Stays mounted
 * after bookings go on so the link panel survives the refresh.
 */
export function SetupChecklist({
  checklist,
  confirmAction,
  enableAction,
}: {
  checklist: Checklist;
  confirmAction: () => Promise<Result>;
  enableAction: (enabled: boolean) => Promise<Result>;
}) {
  const { toast, online } = useStaff();
  const [justEnabled, setJustEnabled] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [confirming, startConfirm] = useTransition();
  const [enabling, startEnable] = useTransition();

  if (checklist.bookingsEnabled && !justEnabled) return null;

  const steps = [checklist.fieldsConfirmed, checklist.payoutsConnected, checklist.testBookingDone];
  const done = steps.filter(Boolean).length;
  const ready = done === 3;

  function confirm() {
    startConfirm(async () => {
      try {
        const r = await confirmAction();
        if (!r.ok) toast(r.message, "error");
      } catch {
        toast("No connection. Try Looks right again.", "error");
      }
    });
  }

  function enable() {
    setEnableError(null);
    startEnable(async () => {
      try {
        const r = await enableAction(true);
        if (r.ok) setJustEnabled(true);
        else setEnableError(r.message);
      } catch {
        setEnableError("No connection. Bookings are still off. Try again.");
      }
    });
  }

  if (justEnabled) {
    return (
      <section aria-labelledby="live-heading" className="ink-card rise-in mb-7 rounded-card p-5 sm:p-7">
        <p className="kicker text-white/60">Bookings are on</p>
        <h2 id="live-heading" className="display mt-2 text-[clamp(1.4rem,5vw,2rem)]">
          Your page <span className="text-outline">is live</span>
        </h2>
        <p className="mt-3 max-w-md text-[15px] leading-snug text-white/75">
          Put this link on your website and send it to your renters. New requests show up here and in your email.
        </p>
        <CopyLinkButton link={checklist.bookingLink} tone="dark" className="mt-5" />
      </section>
    );
  }

  return (
    <section aria-labelledby="setup-heading" className="ink-card mb-7 overflow-hidden rounded-card">
      <div className="p-5 sm:p-7">
        <div className="flex items-baseline justify-between gap-3">
          <p className="kicker text-white/60">Before you go live</p>
          <p className="text-[13px] font-semibold tabular-nums text-white/70">{done} of 3 done</p>
        </div>
        <h2 id="setup-heading" className="display mt-2 text-[clamp(1.4rem,5vw,2rem)]">
          3 steps <span className="text-outline">before you take bookings</span>
        </h2>

        <ol className="mt-6 flex flex-col gap-2.5">
          <Step n={1} done={checklist.fieldsConfirmed} title="Check fields and prices">
            <p>Scroll your fields, hours and prices. Edit a price in Settings, or tap Looks right.</p>
            {!checklist.fieldsConfirmed ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="white" size="sm" className="min-h-11" onClick={confirm} disabled={confirming || !online}>
                  {confirming ? "Saving…" : "Looks right"}
                </Button>
                <Link href="/staff/settings#prices" className={buttonClass({ variant: "ghostDark", size: "sm" }, "min-h-11")}>
                  Open Settings
                </Link>
              </div>
            ) : null}
          </Step>

          <Step n={2} done={checklist.payoutsConnected} title="Connect payouts">
            <p>Stripe asks for your bank account and EIN, then pays approved bookings out to you.</p>
            {!checklist.payoutsConnected ? (
              <div className="mt-3">
                {/* Plain link: the route redirects to Stripe's own form. */}
                <a href="/api/stripe/connect/start" className={buttonClass({ variant: "white", size: "sm" }, "min-h-11")}>
                  Connect payouts
                </a>
              </div>
            ) : null}
          </Step>

          <Step n={3} done={checklist.testBookingDone} title="Try a test booking">
            <p>Make a real $1 booking on your phone, approve it here, then refund it from the booking.</p>
            {!checklist.testBookingDone ? (
              <div className="mt-3">
                <a
                  href={checklist.bookingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "ghostDark", size: "sm" }, "min-h-11")}
                >
                  Open your booking page
                </a>
              </div>
            ) : null}
          </Step>
        </ol>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-5 py-4 sm:px-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] leading-snug text-white/70">
            {ready ? "All set. Turning on bookings takes your page live." : "Finish the 3 steps to turn on bookings."}
          </p>
          <Button variant="accent" onClick={enable} disabled={!ready || enabling || !online} className="shrink-0">
            {enabling ? "Turning on…" : "Turn on bookings"}
          </Button>
        </div>
        {enableError ? (
          <p role="alert" className="mt-3 text-[14px] font-medium text-[#ffb3bc]">
            {enableError}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li className={cn("flex gap-3.5 rounded-2xl p-3.5 sm:p-4", done ? "bg-white/[0.04]" : "bg-white/[0.08]")}>
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold",
          done ? "bg-[#7ee2a8] text-ink" : "border-[1.5px] border-white/40 text-white",
        )}
        aria-hidden
      >
        {done ? <CheckIcon className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className={cn("text-[15.5px] font-semibold", done && "text-white/60")}>
          {title}
          <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
          {done ? <span className="ml-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[#7ee2a8]">Done</span> : null}
        </h3>
        {!done ? <div className="mt-1 text-[14px] leading-snug text-white/70">{children}</div> : null}
      </div>
    </li>
  );
}
