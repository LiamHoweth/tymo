/**
 * Shared DTOs between the booking engine (src/server/booking) and the UI
 * (src/app). Instants are ISO 8601 strings in UTC; "local" strings are
 * already formatted in the facility's time zone for display.
 */

export type BookingStatus =
  | "checking_out"
  | "abandoned"
  | "requested"
  | "approved"
  | "declined"
  | "expired"
  | "payment_failed"
  | "cancelled_by_customer"
  | "cancelled_by_facility"
  | "completed";

export type PaymentStatus =
  | "none"
  | "pending"
  | "authorized"
  | "captured"
  | "canceled"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type StaffRole = "owner" | "staff";

/** What a customer sees for a booking state (spec: "The life of one booking"). */
export type CustomerStatusLabel = "Requested" | "Booked" | "Not booked" | "Expired" | "Cancelled";

export interface Brand {
  primary: string; // hex
  accent: string; // hex
  logoUrl: string | null;
}

export interface FacilityPublic {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  timeZone: string; // IANA, e.g. "America/Chicago"
  timeZoneLabel: string; // "CT"
  brand: Brand;
  waiverText: string;
  waiverVersion: number;
  cancellationPolicyText: string | null;
  cancelCutoffMinutes: number;
  bookingWindowDays: number;
  leadTimeMinutes: number;
  checkoutHoldMinutes: number;
  bookingsEnabled: boolean;
  payments: {
    mode: "stripe" | "fake";
    /** Stripe connected account id; the Payment Element must be created with it. */
    stripeAccountId: string | null;
    publishableKey: string | null;
  };
}

/** One choice inside a field card: "Full field", "Half A", or the only option. */
export interface ResourceOption {
  id: string;
  code: string; // "N1A"
  name: string; // "N1 · Half A"
  /** 'full' = parent of halves, 'part' = a half/third, 'single' = no splits. */
  kind: "full" | "part" | "single";
  /** Label for the choice button: "Full field", "Half A", "Indoor Field". */
  choiceLabel: string;
  description: string | null;
  priceCentsPerHour: number;
  slotMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

/** A card on the Choose field screen: a field and its full/half options. */
export interface FieldCard {
  id: string; // parent resource id (or the single resource id)
  code: string; // "N1"
  name: string; // "N1"
  groupLabel: string; // "Grass fields"
  surface: string | null;
  indoor: boolean;
  description: string | null;
  fromPriceCentsPerHour: number;
  /** 'split2' draws a rectangle split in two; 'single' draws one block. */
  layout: "single" | "split2" | "split3" | "split4";
  options: ResourceOption[];
}

/** A row on the landing page: "Grass fields · North and South · from $30/hr". */
export interface FieldGroup {
  label: string;
  detail: string;
  fromPriceCentsPerHour: number;
  cards: FieldCard[];
}

export type SlotUnavailableReason = "taken" | "closed" | "too_soon" | "too_far" | "outside_hours";

export interface SlotOption {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  startLocal: string; // "5:00 PM"
  endLocal: string; // "6:30 PM"
  /** "Morning" before 12:00, "Afternoon" before 17:00, else "Evening". */
  period: "Morning" | "Afternoon" | "Evening";
  available: boolean;
  reason?: SlotUnavailableReason;
  priceCents: number;
}

export interface DayAvailability {
  date: string; // "2026-12-05" (facility-local date)
  dateLabel: string; // "Sat, Dec 5"
  resourceId: string;
  durationMinutes: number;
  /** Whole day closed (closure block or no hours). */
  closed: boolean;
  /** Customer-safe reason for a closure, e.g. "Thanksgiving". Never a block label. */
  closedReason?: string;
  /** Set when the whole date is outside the booking window. */
  dayReason?: "too_soon" | "too_far";
  slots: SlotOption[];
}

export interface DateChip {
  date: string;
  label: string; // "Sat Dec 5"
  closed: boolean;
  bookable: boolean;
}

export interface CheckoutHold {
  bookingId: string;
  /** Opaque token the browser keeps; required to continue the checkout. */
  checkoutToken: string;
  expiresAt: string;
  resourceId: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  whenLabel: string; // "Sat, Dec 5 · 5:00–6:30 PM CT"
  priceCents: number;
}

export type StartCheckoutError = "slot_taken" | "too_soon" | "too_far" | "closed" | "outside_hours" | "invalid" | "bookings_off";

export type StartCheckoutResult = { ok: true; hold: CheckoutHold } | { ok: false; error: StartCheckoutError };

export interface CustomerDetailsInput {
  name: string;
  email: string;
  phone: string;
  team?: string;
  waiverAccepted: boolean;
}

export type SaveDetailsResult =
  | { ok: true }
  | { ok: false; error: "hold_expired" | "invalid"; fieldErrors?: Partial<Record<keyof CustomerDetailsInput, string>> };

export type PreparePaymentResult =
  | { ok: true; mode: "stripe"; clientSecret: string; stripeAccountId: string }
  | { ok: true; mode: "fake" }
  | { ok: false; error: "hold_expired" | "missing_details" | "payment_error"; message?: string };

export interface SubmitRequestInput {
  checkoutToken: string;
  /** Fake payments only: the card number typed into the fake card field. */
  fakeCardNumber?: string;
}

export type SubmitRequestResult =
  | { ok: true; bookingId: string; publicToken: string; approvalDeadlineAt: string }
  | {
      ok: false;
      error: "hold_expired" | "card_declined" | "card_not_confirmed" | "already_submitted" | "invalid" | "payment_error";
      message?: string;
      /** Set for already_submitted so the UI can link to the booking page. */
      publicToken?: string;
    };

/** The customer's private booking page (/book/[slug]/b/[token]). */
export interface BookingPublicView {
  bookingId: string;
  facility: FacilityPublic;
  status: BookingStatus;
  statusLabel: CustomerStatusLabel;
  resourceName: string;
  whenLabel: string; // "Saturday, December 5, 5:00 to 6:30 PM CT"
  startsAt: string;
  endsAt: string;
  priceCents: number;
  amountRefundedCents: number;
  cardLabel: string | null; // "Visa ending 4242"
  customerName: string;
  customerEmail: string;
  team: string | null;
  approvalDeadlineLabel: string | null; // "Tue, Nov 24 at 8:00 PM CT"
  /** "Thu, Dec 3 at 5:00 PM CT", or null if already past at request time. */
  freeCancelUntilLabel: string | null;
  declineReason: string | null;
  cancelReason: string | null;
  /** 'request' = no charge yet; 'refund' = full refund; 'call' = past cutoff; 'none' = final state. */
  cancelMode: "request" | "refund" | "call" | "none";
  refundIfCancelledCents: number;
}

export type CancelByTokenResult =
  | { ok: true; status: BookingStatus; refundedCents: number }
  | { ok: false; error: "not_found" | "not_cancellable" | "past_cutoff" | "payment_error" };

// ------------------------------------------------------------- staff

export interface StaffContext {
  tenantId: string;
  userId: string;
  role: StaffRole;
}

export interface ApprovalQueueItem {
  bookingId: string;
  resourceCode: string; // "N1A"
  resourceLabel: string; // "N1A · half of N1"
  whenLabel: string; // "Sat Dec 5 · 10:00 to 11:30 AM (1.5 hr)"
  startsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  team: string | null;
  priceCents: number;
  cardLabel: string | null;
  waiverAccepted: boolean;
  approvalDeadlineAt: string;
  /** "1 day 22 hr" / "1 hr 40 min". */
  expiresInLabel: string;
  urgent: boolean; // under 2 hours left
}

export type StaffActionError =
  | "not_found"
  | "already_handled"
  | "forbidden"
  | "capture_failed"
  | "payment_error"
  | "invalid";

export type StaffActionResult =
  | { ok: true; status: BookingStatus; message: string }
  | { ok: false; error: StaffActionError; message: string; handledBy?: string };

export type CalendarItemKind = "booking" | "request" | "block" | "closure" | "hold";

export interface CalendarItem {
  id: string; // booking id or block id
  kind: CalendarItemKind;
  resourceId: string;
  /** Which lanes it covers on the row: unit codes it occupies. */
  unitCodes: string[];
  startsAt: string;
  endsAt: string;
  startLocal: string;
  endLocal: string;
  label: string; // customer name / team, or staff-only block label
  bookingId?: string;
  blockId?: string;
  /** For weekly blocks: the local date of this occurrence. */
  occurrenceDate?: string;
}

export interface CalendarLane {
  resourceId: string;
  code: string; // "N1A"
  label: string; // "Half A"
  unitCodes: string[];
}

export interface CalendarRow {
  resourceId: string; // parent resource
  code: string;
  name: string;
  /** Halves under the parent; empty for unsplit fields. */
  lanes: CalendarLane[];
  unitCodes: string[];
  items: CalendarItem[];
}

export interface CalendarDay {
  date: string;
  dateLabel: string;
  /** Local display window, e.g. "07:00".."21:00". */
  dayStartLocal: string;
  dayEndLocal: string;
  timeZoneLabel: string;
  rows: CalendarRow[];
}

export interface StaffBookingDetail {
  bookingId: string;
  status: BookingStatus;
  statusLabel: string; // staff wording: "Requested", "Approved", "Refunded"...
  paymentStatus: PaymentStatus;
  resourceId: string;
  resourceLabel: string;
  whenLabel: string;
  startsAt: string;
  endsAt: string;
  customer: { name: string; email: string; phone: string };
  team: string | null;
  priceCents: number;
  amountCapturedCents: number;
  amountRefundedCents: number;
  /** Owner only; null for staff. */
  tymoFeeCents: number | null;
  payoutCents: number | null;
  cardLabel: string | null;
  waiverAcceptedLabel: string | null; // "Accepted Sun, Nov 22 at 6:04 PM CT (v1)"
  approvalDeadlineLabel: string | null;
  declineReason: string | null;
  cancelReason: string | null;
  staffNotes: string | null;
  history: { at: string; atLabel: string; actor: string; action: string; reason: string | null }[];
  canApprove: boolean;
  canDecline: boolean;
  /** Staff: full refund only. Owner: full, partial or none. */
  cancelOptions: ("full" | "partial" | "none")[];
}

export interface CancelBookingInput {
  bookingId: string;
  refund: "full" | "partial" | "none";
  amountCents?: number; // partial only
  message?: string;
}

export interface BlockInput {
  kind: "one_time" | "weekly" | "closure";
  label: string;
  /** null = whole venue (closures only). */
  resourceId: string | null;
  /** one_time / closure: local date + times ("2026-12-12", "13:00", "16:00"); allDay for closures. */
  date?: string;
  endDate?: string; // closures spanning days, inclusive
  startLocal?: string;
  endLocal?: string;
  allDay?: boolean;
  /** weekly */
  weekdays?: number[]; // ISO 1..7
  startDate?: string;
  untilDate?: string;
  /** Customer-safe reason shown on closed days ("Thanksgiving"); closures only. */
  publicReason?: string;
}

export interface BlockConflict {
  bookingId: string;
  status: BookingStatus;
  customerName: string;
  resourceLabel: string;
  whenLabel: string;
  priceCents: number;
  occurrenceDate?: string;
}

export interface BlockPreview {
  /** Human summary: "Every Monday, Dec 7 to May 24: 25 dates." */
  summary: string;
  occurrenceCount: number;
  /** Also-blocks note: "Also blocks N1A and N1B". */
  overlapNote: string | null;
  conflicts: BlockConflict[];
  /** weekly: dates that would be skipped because of conflicts. */
  conflictDates: string[];
  /** one_time / closure with conflicts can't be saved until resolved. */
  canSave: boolean;
  /** weekly with conflicts: "Save the other 23?" */
  canSaveSkippingConflicts: boolean;
}

export type CreateBlockResult =
  | { ok: true; blockId: string; savedCount: number; skippedDates: string[] }
  | { ok: false; error: "conflicts" | "invalid"; preview?: BlockPreview; message?: string };

export interface BlockListItem {
  blockId: string;
  kind: "one_time" | "weekly" | "closure";
  label: string;
  resourceLabel: string; // "N1" or "Whole venue"
  summary: string;
}

export interface SetupChecklist {
  fieldsConfirmed: boolean;
  payoutsConnected: boolean;
  testBookingDone: boolean;
  bookingsEnabled: boolean;
  bookingLink: string;
}

export interface SettingsView {
  facility: FacilityPublic;
  resources: {
    id: string;
    code: string;
    name: string;
    groupLabel: string;
    priceCentsPerHour: number;
    minMinutes: number;
    maxMinutes: number;
    slotMinutes: number;
  }[];
  hours: { resourceId: string | null; weekday: number; opensAt: string; closesAt: string }[];
  staff: { userId: string; name: string; email: string; role: StaffRole }[];
  payouts: { connected: boolean; chargesEnabled: boolean; detailsSubmitted: boolean };
  canEdit: boolean; // owner only
}
