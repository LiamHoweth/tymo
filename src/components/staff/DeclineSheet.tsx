"use client";

import { useState, useTransition } from "react";
import type { StaffActionResult } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { Button, Sheet } from "@/components/ui";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { useStaff } from "./StaffProvider";
import { firstName, possessive } from "./format";

export interface DeclineTarget {
  bookingId: string;
  customerName: string;
  priceCents: number;
}

/** "Decline Jordan's request?" with an optional reason for the customer. */
export function DeclineSheet({
  target,
  onClose,
  declineAction,
}: {
  target: DeclineTarget | null;
  onClose: () => void;
  declineAction: (bookingId: string, reason: string) => Promise<StaffActionResult>;
}) {
  const { toast, online } = useStaff();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = target ? firstName(target.customerName) : "";

  function close() {
    // If a decline is in flight it still finishes and reports in a toast.
    setReason("");
    setError(null);
    onClose();
  }

  function submit() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await declineAction(target.bookingId, reason);
        if (result.ok) {
          toast(result.message || `Declined. Hold released and ${first} emailed.`, "ok");
        } else {
          toast(result.message || "This request was already handled.", result.error === "already_handled" ? "warn" : "error");
        }
        setReason("");
        onClose();
      } catch {
        setError("No connection. The request is still waiting. Try again.");
      }
    });
  }

  return (
    <Sheet open={target !== null} onClose={close} title={target ? `Decline ${possessive(first)} request?` : "Decline request?"}>
      {target ? (
        <div className="flex flex-col gap-5">
          <p className="text-[15px] leading-snug text-muted">
            We&apos;ll release the {formatCents(target.priceCents)} hold and email {first}.
          </p>
          <TextAreaField
            label={`Reason for ${first}`}
            optional
            placeholder="Example: N1 is being reseeded that week."
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="ink" block onClick={submit} disabled={pending || !online} aria-busy={pending}>
              {pending ? "Declining…" : "Decline request"}
            </Button>
            <Button variant="ghost" block onClick={close} disabled={pending}>
              Keep request
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
