"use client";

import { useState, useTransition } from "react";
import type { CancelBookingInput, StaffActionResult } from "@tymo/shared/types";
import { formatCents } from "@tymo/shared/format";
import { cn } from "@tymo/shared/cn";
import { Button, Sheet } from "@tymo/ui";
import { TextAreaField } from "@tymo/ui/TextAreaField";
import { useStaff } from "../StaffProvider";
import { possessive } from "../format";

type Refund = CancelBookingInput["refund"];

/** Dollars typed by a person -> cents, or null if it isn't an amount. */
function toCents(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/**
 * "Cancel Jordan's booking on Sat Dec 5?" Full refund is the default;
 * owners can also give part or no refund. The button names the outcome.
 */
export function CancelSheet({
  open,
  onClose,
  bookingId,
  first,
  dateShort,
  refundableCents,
  options,
  cancelAction,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  first: string;
  dateShort: string;
  refundableCents: number;
  options: Refund[];
  cancelAction: (input: CancelBookingInput) => Promise<StaffActionResult>;
}) {
  const { toast, online } = useStaff();
  const [refund, setRefund] = useState<Refund>("full");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const full = formatCents(refundableCents);
  const partialCents = toCents(amount);
  const partialValid = partialCents !== null && partialCents > 0 && partialCents <= refundableCents;
  const ownerChoices = options.length > 1;

  const label =
    refund === "full"
      ? `Cancel booking and refund ${full}`
      : refund === "partial"
        ? `Cancel booking and refund ${partialValid ? formatCents(partialCents) : "part"}`
        : "Cancel booking without a refund";

  function close() {
    setRefund("full");
    setAmount("");
    setMessage("");
    setError(null);
    onClose();
  }

  function submit() {
    if (refund === "partial" && !partialValid) {
      setError(`Enter an amount from $0.01 to ${full}.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const r = await cancelAction({
          bookingId,
          refund,
          amountCents: refund === "partial" ? partialCents ?? undefined : undefined,
          message: message.trim() || undefined,
        });
        if (r.ok) {
          toast(r.message || `Cancelled. ${first} was emailed.`, "ok");
          close();
        } else {
          setError(r.message || "This booking couldn't be cancelled. Refresh and try again.");
        }
      } catch {
        setError("No connection. The booking is still on. Try again.");
      }
    });
  }

  const choices: { value: Refund; title: string }[] = [
    { value: "full", title: `Full refund, ${full}` },
    { value: "partial", title: "Part refund" },
    { value: "none", title: "No refund" },
  ];

  return (
    <Sheet open={open} onClose={close} title={`Cancel ${possessive(first)} booking on ${dateShort}?`}>
      <div className="flex flex-col gap-5">
        {ownerChoices ? (
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-text">Refund</legend>
            <div className="flex flex-col gap-2">
              {choices
                .filter((c) => options.includes(c.value))
                .map((c) => (
                  <div
                    key={c.value}
                    className={cn("rounded-xl border-[1.5px] transition-colors", refund === c.value ? "border-ink bg-paper" : "border-line")}
                  >
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 text-[15px] font-medium">
                      <input
                        type="radio"
                        name="refund"
                        value={c.value}
                        checked={refund === c.value}
                        onChange={() => setRefund(c.value)}
                        className="h-5 w-5 accent-[var(--ink)]"
                      />
                      {c.title}
                    </label>
                    {c.value === "partial" && refund === "partial" ? (
                      <div className="px-4 pb-3.5 pl-12">
                        <label htmlFor="refund-amount" className="sr-only">
                          Amount to refund
                        </label>
                        <div className="relative max-w-[11rem]">
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-muted">$</span>
                          <input
                            id="refund-amount"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="h-12 w-full rounded-xl border-[1.5px] border-line bg-white pl-7 pr-3 text-[16px] tabular-nums outline-none focus:border-brand"
                          />
                        </div>
                        <p className="mt-1.5 text-[13px] text-muted">Up to {full}</p>
                      </div>
                    ) : null}
                  </div>
                ))}
            </div>
          </fieldset>
        ) : (
          <div className="rounded-xl border-[1.5px] border-ink bg-paper px-4 py-3">
            <p className="text-[15px] font-semibold">Full refund, {full}</p>
            <p className="mt-0.5 text-[13.5px] text-muted">Only the owner can give a partial refund or none.</p>
          </div>
        )}

        <TextAreaField
          label={`Message to ${first}`}
          optional
          placeholder="Example: Lightning in the forecast. Sorry, and we hope to see you soon."
          value={message}
          maxLength={1000}
          onChange={(e) => setMessage(e.target.value)}
        />

        {refund !== "none" ? (
          <p className="-mt-2 text-[13.5px] text-muted">Refunds reach {possessive(first)} card in 5 to 10 business days.</p>
        ) : null}

        {error ? (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button variant="ink" block onClick={submit} disabled={pending || !online}>
            {pending ? "Cancelling…" : label}
          </Button>
          <Button variant="ghost" block onClick={close}>
            Keep booking
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
