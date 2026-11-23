import "server-only";
import { notImplemented } from "@/server/not-implemented";

/**
 * Every email Tymo sends (spec: Customer booking flow > Emails table).
 * The booking engine calls notify() AFTER its transaction commits; the
 * email module loads what it needs, renders the facility-branded template,
 * writes an email_outbox row, and delivers via Resend when configured.
 * notify() must never throw into the caller: log and record the error.
 */
export type NotifyEvent =
  // to the customer
  | { kind: "request_received"; bookingId: string }
  | { kind: "approved"; bookingId: string } // doubles as the receipt
  | { kind: "declined"; bookingId: string }
  | { kind: "expired"; bookingId: string }
  | { kind: "payment_failed"; bookingId: string } // "Not booked: card didn't go through"
  | { kind: "cancelled_by_customer"; bookingId: string }
  | { kind: "cancelled_by_facility"; bookingId: string }
  | { kind: "customer_link"; bookingId: string } // staff "Resend link"
  // to staff
  | { kind: "staff_new_request"; bookingId: string } // owner + all staff
  | { kind: "staff_reminder"; bookingId: string; hoursLeft: 24 | 2 } // all staff
  | { kind: "staff_request_expired"; bookingId: string } // owner
  | { kind: "staff_customer_cancelled"; bookingId: string } // owner + all staff
  | { kind: "staff_sign_in"; userId: string; url: string } // the person signing in
  | { kind: "staff_invite"; userId: string; url: string; invitedByName: string };

export async function notify(tenantId: string, event: NotifyEvent): Promise<void> {
  return notImplemented("notify", tenantId, event);
}
