"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { useStaff } from "../StaffProvider";
import { MailIcon } from "../icons";

/** Re-sends the customer's private booking link. */
export function ResendLinkButton({
  bookingId,
  email,
  resendAction,
}: {
  bookingId: string;
  email: string;
  resendAction: (bookingId: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast, online } = useStaff();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 px-4"
      disabled={pending || !online}
      onClick={() =>
        startTransition(async () => {
          try {
            const r = await resendAction(bookingId);
            toast(r.ok ? `Link sent to ${email}.` : r.message, r.ok ? "ok" : "error");
          } catch {
            toast("No connection. The link wasn't sent. Try again.", "error");
          }
        })
      }
    >
      <MailIcon className="h-4 w-4" />
      {pending ? "Sending…" : "Resend link"}
    </Button>
  );
}
