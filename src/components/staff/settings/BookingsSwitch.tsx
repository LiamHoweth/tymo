"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button, Sheet } from "@/components/ui";
import { useStaff } from "../StaffProvider";

type Result = { ok: boolean; message: string };

/** Owner switch for the public booking page. Turning off asks first. */
export function BookingsSwitch({ enabled, enableAction }: { enabled: boolean; enableAction: (enabled: boolean) => Promise<Result> }) {
  const { toast, online } = useStaff();
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(next: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await enableAction(next);
        if (r.ok) toast(r.message || (next ? "Bookings are on." : "Bookings are off."), "ok");
        else setError(r.message);
        setConfirmOff(false);
      } catch {
        setError("No connection. Nothing changed.");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p id="bookings-switch-label" className="text-[15px] font-semibold text-ink">
            Take bookings online
          </p>
          <p className="text-[13.5px] leading-snug text-muted">
            {enabled ? "Your booking page is taking requests." : "Your booking page isn't taking requests."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="bookings-switch-label"
          disabled={pending || !online}
          onClick={() => (enabled ? setConfirmOff(true) : set(true))}
          className={cn(
            "relative inline-flex h-11 w-[4.25rem] shrink-0 items-center rounded-full p-1 transition-colors disabled:opacity-50",
            enabled ? "bg-ok" : "bg-[#c3c9d4]",
          )}
        >
          <span className="sr-only">{enabled ? "On" : "Off"}</span>
          <span
            aria-hidden
            className={cn("h-9 w-9 rounded-full bg-white shadow transition-transform", enabled ? "translate-x-[1.5rem]" : "translate-x-0")}
          />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Sheet open={confirmOff} onClose={() => setConfirmOff(false)} title="Turn off bookings?">
        <div className="flex flex-col gap-5">
          <p className="text-[15px] leading-snug text-muted">
            Your booking page stops taking new requests. Requests already waiting stay in Approvals, and booked times stay booked.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="ink" block onClick={() => set(false)} disabled={pending}>
              {pending ? "Turning off…" : "Turn off bookings"}
            </Button>
            <Button variant="ghost" block onClick={() => setConfirmOff(false)}>
              Keep bookings on
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
