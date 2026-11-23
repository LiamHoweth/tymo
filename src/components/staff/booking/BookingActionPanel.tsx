"use client";

import { useState } from "react";
import type { CancelBookingInput, StaffActionResult, StaffBookingDetail } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { useStaff } from "../StaffProvider";
import { DeclineSheet, type DeclineTarget } from "../DeclineSheet";
import { CancelSheet } from "./CancelSheet";
import { firstName } from "../format";

/**
 * The dark action card on booking detail: Approve/Decline while requested,
 * Cancel once approved. Approve uses the same 5-second undo as the queue.
 */
export function BookingActionPanel({
  className,
  detail,
  dateShort,
  declineAction,
  cancelAction,
}: {
  className?: string;
  detail: Pick<
    StaffBookingDetail,
    | "bookingId"
    | "customer"
    | "priceCents"
    | "amountCapturedCents"
    | "amountRefundedCents"
    | "canApprove"
    | "canDecline"
    | "cancelOptions"
    | "approvalDeadlineLabel"
  >;
  dateShort: string;
  declineAction: (bookingId: string, reason: string) => Promise<StaffActionResult>;
  cancelAction: (input: CancelBookingInput) => Promise<StaffActionResult>;
}) {
  const { approve, isApproving, isHidden, online } = useStaff();
  const [declining, setDeclining] = useState<DeclineTarget | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const first = firstName(detail.customer.name);
  const price = formatCents(detail.priceCents);
  const approving = isApproving(detail.bookingId);
  const approved = isHidden(detail.bookingId);
  const refundable = detail.amountCapturedCents > 0 ? detail.amountCapturedCents - detail.amountRefundedCents : detail.priceCents;
  const canCancel = detail.cancelOptions.length > 0 && refundable >= 0;

  if (!detail.canApprove && !detail.canDecline && !canCancel) return null;

  return (
    <section aria-label="Actions" className={cn("ink-card rounded-card p-5 sm:p-6", className)}>
      {detail.canApprove || detail.canDecline ? (
        <>
          <p className="kicker text-white/60">Waiting for you</p>
          <p className="mt-2 text-[28px] font-bold leading-none tabular-nums">{price}</p>
          <p className="mt-1.5 text-[14.5px] text-white/70">Card held, not charged</p>
          {detail.approvalDeadlineLabel ? (
            <p className="mt-3 text-[14px] font-semibold text-[#f5c26b]">Approve by {detail.approvalDeadlineLabel}</p>
          ) : null}
          <div className="mt-5 flex flex-col gap-2">
            {detail.canApprove ? (
              <Button
                variant="accent"
                block
                disabled={!online || approving || approved}
                onClick={() => approve({ bookingId: detail.bookingId, customerName: detail.customer.name, priceCents: detail.priceCents })}
              >
                {approving ? "Charging in 5 seconds…" : approved ? "Approved" : `Approve and charge ${price}`}
              </Button>
            ) : null}
            {detail.canDecline ? (
              <Button
                variant="ghostDark"
                block
                disabled={!online || approving || approved}
                onClick={() => setDeclining({ bookingId: detail.bookingId, customerName: detail.customer.name, priceCents: detail.priceCents })}
              >
                Decline
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="kicker text-white/60">Need to cancel?</p>
          <p className="mt-2 text-[15px] leading-snug text-white/75">
            Cancelling emails {first}. To move a booking, cancel it and {first} books the new time.
          </p>
          <Button variant="ghostDark" block className="mt-5" disabled={!online} onClick={() => setCancelling(true)}>
            Cancel booking
          </Button>
          {detail.cancelOptions.length === 1 ? (
            <p className="mt-3 text-[13px] text-white/60">Only the owner can give a partial refund or none.</p>
          ) : null}
        </>
      )}

      <DeclineSheet target={declining} onClose={() => setDeclining(null)} declineAction={declineAction} />
      {canCancel ? (
        <CancelSheet
          open={cancelling}
          onClose={() => setCancelling(false)}
          bookingId={detail.bookingId}
          first={first}
          dateShort={dateShort}
          refundableCents={refundable}
          options={detail.cancelOptions}
          cancelAction={cancelAction}
        />
      ) : null}
    </section>
  );
}
