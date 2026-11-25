import type { BookingStatus, StaffRole } from "@tymo/shared/types";
import { formatCard, formatCents, formatPhone } from "@tymo/shared/format";
import { renderLayout, type Block } from "./layout";
import { dateLabel, dateShort, dateTimeLabel, dateTimeShort, firstName, timeRange, zoneLabel } from "./format";

/**
 * One pure render function per NotifyEvent kind: plain data in,
 * { subject, html, text } out. notify.ts loads the data; these never touch
 * the database, so they are unit tested with fixtures.
 */

export interface EmailFacility {
  name: string;
  slug: string;
  timeZone: string;
  brandPrimary: string;
  brandAccent: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  city: string | null;
  cancelCutoffMinutes: number;
}

export interface EmailBooking {
  id: string;
  status: BookingStatus;
  publicToken: string | null;
  resourceCode: string; // "N1A"
  resourceName: string; // "N1 · Half A" / "Indoor Field"
  startsAt: Date;
  endsAt: Date;
  priceCents: number;
  amountCapturedCents: number;
  amountRefundedCents: number;
  cardBrand: string | null;
  cardLast4: string | null;
  approvalDeadlineAt: Date | null;
  createdAt: Date;
  decidedAt: Date | null;
  declineReason: string | null;
  cancelReason: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  team: string | null;
  waiverAccepted: boolean;
}

export interface BookingEmailContext {
  /** Company website base URL (booking pages). */
  appUrl: string;
  /** Company services base URL (staff app); defaults to appUrl. */
  staffBaseUrl?: string;
  facility: EmailFacility;
  booking: EmailBooking;
}

export interface StaffEmailContext {
  appUrl: string;
  facility: EmailFacility;
  user: { name: string; email: string; role: StaffRole };
  /** Single-use sign-in URL. */
  url: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  /** The main link (the button), logged in development. */
  actionUrl: string | null;
}

// ------------------------------------------------------------- helpers

export function customerBookingUrl(appUrl: string, slug: string, publicToken: string | null): string {
  return publicToken ? `${appUrl}/book/${slug}/b/${publicToken}` : `${appUrl}/book/${slug}`;
}

function facts(ctx: BookingEmailContext) {
  const { facility: f, booking: b, appUrl } = ctx;
  const tz = f.timeZone;
  const zone = zoneLabel(tz, b.startsAt);
  const freeCancelUntil = new Date(b.startsAt.getTime() - f.cancelCutoffMinutes * 60_000);
  return {
    zone,
    date: dateLabel(b.startsAt, tz), // "Sat, Dec 5"
    dateShort: dateShort(b.startsAt, tz), // "Sat Dec 5"
    time: `${timeRange(b.startsAt, b.endsAt, tz)} ${zone}`, // "5:00–6:30 PM CT"
    timeStaff: timeRange(b.startsAt, b.endsAt, tz, " to "), // "10:00 to 11:30 AM"
    card: formatCard(b.cardBrand, b.cardLast4) ?? "card",
    deadline: b.approvalDeadlineAt ? dateTimeLabel(b.approvalDeadlineAt, tz) : null,
    deadlineStaff: b.approvalDeadlineAt ? dateTimeShort(b.approvalDeadlineAt, tz) : null,
    // Requested inside the cutoff: the booking page says it can't be cancelled online.
    freeCancelUntil: freeCancelUntil > b.createdAt ? dateTimeLabel(freeCancelUntil, tz) : null,
    first: firstName(b.customerName),
    privateUrl: customerBookingUrl(appUrl, f.slug, b.publicToken),
    bookUrl: `${appUrl}/book/${f.slug}`,
    staffUrl: `${ctx.staffBaseUrl ?? appUrl}/staff`,
    resourceLabel: b.resourceName && b.resourceName !== b.resourceCode ? `${b.resourceCode} (${b.resourceName})` : b.resourceCode,
    phone: f.contactPhone ? formatPhone(f.contactPhone) : null,
  };
}

function whatRows(ctx: BookingEmailContext): [string, string][] {
  const x = facts(ctx);
  const rows: [string, string][] = [
    ["Field", ctx.booking.resourceName],
    ["Date", x.date],
    ["Time", x.time],
  ];
  if (ctx.booking.team) rows.push(["Team", ctx.booking.team]);
  return rows;
}

function facilityLine(f: EmailFacility): string {
  return [f.name, [f.address, f.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

function customerFooter(f: EmailFacility): string[] {
  const lines = [facilityLine(f)];
  lines.push(`Questions? Reply to this email to reach ${f.name}${f.contactPhone ? `, or call ${formatPhone(f.contactPhone)}` : ""}.`);
  lines.push(`Sent by Tymo for ${f.name}.`);
  return lines;
}

function staffFooter(f: EmailFacility): string[] {
  return [`You're getting this because you're on the ${f.name} team in Tymo.`, `Sent by Tymo for ${f.name}.`];
}

function build(
  f: EmailFacility,
  parts: { subject: string; preheader: string; heading: string; blocks: Block[]; footer: string[] },
): RenderedEmail {
  const { html, text } = renderLayout({
    brand: { name: f.name, brandPrimary: f.brandPrimary, brandAccent: f.brandAccent },
    ...parts,
  });
  const button = parts.blocks.find((b) => b.kind === "button");
  return { subject: parts.subject, html, text, actionUrl: button && button.kind === "button" ? button.url : null };
}

const CUSTOMER_STATUS: Record<BookingStatus, string> = {
  checking_out: "Not sent",
  abandoned: "Not sent",
  requested: "Requested",
  approved: "Booked",
  completed: "Booked",
  declined: "Not booked",
  payment_failed: "Not booked",
  expired: "Expired",
  cancelled_by_customer: "Cancelled",
  cancelled_by_facility: "Cancelled",
};

// ------------------------------------------------------ customer emails

export function renderRequestReceived(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const blocks: Block[] = [
    {
      kind: "p",
      text: `Hi ${x.first}, ${f.name} has your request for ${b.resourceName} on ${x.date}, ${x.time}. You won't be charged until they confirm.`,
    },
  ];
  if (x.deadline) blocks.push({ kind: "p", text: `If there's no answer by ${x.deadline}, it expires and the hold on your card is released.` });
  blocks.push({
    kind: "details",
    rows: [...whatRows(ctx), ["Total", `${formatCents(b.priceCents)}, held on your ${x.card}, not charged`]],
  });
  blocks.push({ kind: "button", label: "View or cancel request", url: x.privateUrl });
  return build(f, {
    subject: `Request sent: ${b.resourceName}, ${x.dateShort}`,
    preheader: `You won't be charged until ${f.name} confirms.`,
    heading: "Request sent",
    blocks,
    footer: customerFooter(f),
  });
}

export function renderApproved(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const charged = b.amountCapturedCents || b.priceCents;
  const chargedOn = b.decidedAt ? dateLabel(b.decidedAt, f.timeZone) : null;
  const blocks: Block[] = [
    {
      kind: "p",
      text: `${f.name} confirmed your booking. We charged ${formatCents(charged)} to your ${x.card}. Check in at the front desk.`,
    },
    {
      kind: "p",
      text: x.freeCancelUntil
        ? `Free cancellation until ${x.freeCancelUntil}.`
        : `This booking can't be cancelled online. To cancel, call the front desk${x.phone ? ` at ${x.phone}` : ""}.`,
    },
    { kind: "details", rows: whatRows(ctx) },
    { kind: "p", text: "Receipt", strong: true },
    {
      kind: "details",
      rows: [
        ["Receipt number", receiptNumber(b.id)],
        ["Amount", formatCents(charged)],
        ["Card", x.card],
        ...(chargedOn ? ([["Charged on", chargedOn]] as [string, string][]) : []),
        ["Paid to", facilityLine(f)],
      ],
    },
    { kind: "button", label: "View booking", url: x.privateUrl },
  ];
  return build(f, {
    subject: `You're booked: ${b.resourceName}, ${x.dateShort}`,
    preheader: `${f.name} confirmed ${b.resourceName}, ${x.date}, ${x.time}.`,
    heading: "You're booked",
    blocks,
    footer: customerFooter(f),
  });
}

/** "TY-1A2B3C4D": short, stable reference for receipts. */
export function receiptNumber(bookingId: string): string {
  return `TY-${bookingId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function renderDeclined(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const blocks: Block[] = [
    {
      kind: "p",
      text: `${f.name} can't take your request for ${b.resourceName} on ${x.date}, ${x.time}. You haven't been charged, and the hold on your card is released.`,
    },
  ];
  if (b.declineReason) blocks.push({ kind: "p", text: `Their note: ${b.declineReason}` });
  blocks.push({ kind: "details", rows: whatRows(ctx) });
  blocks.push({ kind: "button", label: "Book another time", url: x.bookUrl });
  blocks.push({ kind: "link", label: "Your request", url: x.privateUrl });
  return build(f, {
    subject: `Not booked: ${b.resourceName}, ${x.dateShort}`,
    preheader: `You haven't been charged.`,
    heading: "Not booked",
    blocks,
    footer: customerFooter(f),
  });
}

export function renderExpired(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const blocks: Block[] = [
    {
      kind: "p",
      text: `${f.name} didn't answer in time, so your request for ${b.resourceName} on ${x.date}, ${x.time} expired. You haven't been charged.`,
    },
    {
      kind: "p",
      text: x.phone ? `To try again, call ${x.phone} or pick another time online.` : "To try again, pick another time online.",
    },
    { kind: "details", rows: whatRows(ctx) },
    { kind: "button", label: "Book another time", url: x.bookUrl },
    { kind: "link", label: "Your request", url: x.privateUrl },
  ];
  return build(f, {
    subject: `Request expired: ${b.resourceName}, ${x.dateShort}`,
    preheader: `You haven't been charged.`,
    heading: "Request expired",
    blocks,
    footer: customerFooter(f),
  });
}

/** Capture failed at approval. No retry: the slot reopened; the customer books again. */
export function renderPaymentFailed(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const blocks: Block[] = [
    {
      kind: "p",
      text: `${f.name} approved your request for ${b.resourceName} on ${x.date}, ${x.time}, but your ${x.card} didn't go through, so the time wasn't booked. You haven't been charged.`,
    },
    { kind: "p", text: "The time is open again. To book it, send a new request with another card." },
    { kind: "details", rows: whatRows(ctx) },
    { kind: "button", label: "Book again", url: x.bookUrl },
    { kind: "link", label: "Your request", url: x.privateUrl },
  ];
  return build(f, {
    subject: "Not booked: card didn't go through",
    preheader: `${b.resourceName}, ${x.date}, ${x.time}. You haven't been charged.`,
    heading: "Not booked",
    blocks,
    footer: customerFooter(f),
  });
}

export function renderCancelledByCustomer(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  let money: string;
  if (b.amountRefundedCents > 0) {
    money = `${formatCents(b.amountRefundedCents)} is on its way back to your ${x.card}. Allow 5 to 10 business days.`;
  } else if (b.amountCapturedCents > 0) {
    money = `No refund was issued. Questions? Reply to this email to reach ${f.name}.`;
  } else {
    money = "You weren't charged.";
  }
  const what = b.amountCapturedCents > 0 ? "booking" : "request";
  const blocks: Block[] = [
    { kind: "p", text: `You cancelled your ${what} for ${b.resourceName} on ${x.date}, ${x.time}. ${money}` },
    { kind: "details", rows: whatRows(ctx) },
    { kind: "button", label: "Book another time", url: x.bookUrl },
    { kind: "link", label: `Your ${what}`, url: x.privateUrl },
  ];
  return build(f, {
    subject: `Cancelled: ${b.resourceName}, ${x.dateShort}`,
    preheader: money,
    heading: "Cancelled",
    blocks,
    footer: customerFooter(f),
  });
}

export function renderCancelledByFacility(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  let money: string;
  if (b.amountCapturedCents <= 0) money = "You weren't charged.";
  else if (b.amountRefundedCents >= b.amountCapturedCents)
    money = `We refunded all ${formatCents(b.amountRefundedCents)} to your ${x.card}; allow 5 to 10 business days.`;
  else if (b.amountRefundedCents > 0)
    money = `We refunded ${formatCents(b.amountRefundedCents)} of ${formatCents(b.amountCapturedCents)} to your ${x.card}; allow 5 to 10 business days.`;
  else money = `No refund was issued. Questions? Reply to this email to reach ${f.name}.`;
  const blocks: Block[] = [
    { kind: "p", text: `Sorry, ${x.first}. ${f.name} had to cancel ${b.resourceName} on ${x.date}, ${x.time}.` },
  ];
  if (b.cancelReason) blocks.push({ kind: "p", text: `Their note: ${b.cancelReason}` });
  blocks.push({ kind: "p", text: money });
  blocks.push({ kind: "details", rows: whatRows(ctx) });
  blocks.push({ kind: "button", label: "Book another time", url: x.bookUrl });
  blocks.push({ kind: "link", label: "Your booking", url: x.privateUrl });
  return build(f, {
    subject: `${f.name} cancelled ${x.dateShort}`,
    preheader: money,
    heading: "Booking cancelled",
    blocks,
    footer: customerFooter(f),
  });
}

/** Staff "Resend link". */
export function renderCustomerLink(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const blocks: Block[] = [
    {
      kind: "p",
      text: `Hi ${x.first}, here's the link to your booking at ${f.name}. Open it any time to check the status or cancel.`,
    },
    { kind: "details", rows: [...whatRows(ctx), ["Status", CUSTOMER_STATUS[b.status]]] },
    { kind: "button", label: "View booking", url: x.privateUrl },
  ];
  return build(f, {
    subject: `Your booking link: ${b.resourceName}, ${x.dateShort}`,
    preheader: `${b.resourceName}, ${x.date}, ${x.time}`,
    heading: "Your booking",
    blocks,
    footer: customerFooter(f),
  });
}

// --------------------------------------------------------- staff emails

export function renderStaffNewRequest(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const rows: [string, string][] = [
    ["Customer", b.customerName],
    ["Phone", formatPhone(b.customerPhone)],
    ["Email", b.customerEmail],
  ];
  if (b.team) rows.push(["Team", b.team]);
  rows.push(
    ["Field", x.resourceLabel],
    ["When", `${x.date}, ${x.time}`],
    ["Amount", `${formatCents(b.priceCents)}, card held, not charged`],
    ["Card", x.card],
    ["Waiver", b.waiverAccepted ? "Waiver accepted" : "Waiver not accepted"],
  );
  const blocks: Block[] = [
    { kind: "p", text: `${b.customerName} wants ${x.resourceLabel} on ${x.date}, ${x.time}.` },
    { kind: "details", rows },
  ];
  if (x.deadlineStaff) {
    blocks.push({ kind: "p", text: `Approve by ${x.deadlineStaff}`, strong: true });
    blocks.push({ kind: "note", text: "If nobody approves by then, the request expires and the hold is released." });
  }
  blocks.push({ kind: "button", label: "Review request", url: x.staffUrl });
  return build(f, {
    subject: `New request: ${b.resourceCode}, ${x.dateShort}, ${x.timeStaff}`,
    preheader: `${b.customerName} · ${formatCents(b.priceCents)}${x.deadlineStaff ? ` · approve by ${x.deadlineStaff}` : ""}`,
    heading: "New request",
    blocks,
    footer: staffFooter(f),
  });
}

/**
 * Copy of a new request for an inbox outside the facility team
 * (TYMO_REQUEST_COPY_TO): every detail in one table, readable without a
 * staff sign-in, with an optional link to the admin console.
 */
export function renderRequestCopy(ctx: BookingEmailContext, adminUrl: string | null): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const rows: [string, string][] = [
    ["Facility", f.name],
    ["Field", x.resourceLabel],
    ["When", `${x.date}, ${x.time}`],
    ["Customer", b.customerName],
    ["Phone", formatPhone(b.customerPhone)],
    ["Email", b.customerEmail],
  ];
  if (b.team) rows.push(["Team", b.team]);
  rows.push(
    ["Amount", `${formatCents(b.priceCents)}, card held, not charged`],
    ["Card", x.card],
    ["Waiver", b.waiverAccepted ? "Waiver accepted" : "Waiver not accepted"],
  );
  if (x.deadlineStaff) rows.push(["Approve by", x.deadlineStaff]);
  const blocks: Block[] = [
    { kind: "p", text: `${b.customerName} requested ${x.resourceLabel} at ${f.name}.` },
    { kind: "details", rows },
    { kind: "note", text: `The ${f.name} team got this request too. They approve or decline it in the staff app.` },
  ];
  if (adminUrl) blocks.push({ kind: "button", label: "Open in admin console", url: adminUrl });
  return build(f, {
    subject: `New request at ${f.name}: ${b.resourceCode}, ${x.dateShort}, ${x.timeStaff}`,
    preheader: `${b.customerName} · ${formatCents(b.priceCents)} · ${x.date}, ${x.time}`,
    heading: "New booking request",
    blocks,
    footer: [`You're getting a copy of every new request at ${f.name}.`, "Sent by Tymo."],
  });
}

export function renderStaffReminder(ctx: BookingEmailContext, hoursLeft: 24 | 2): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const left = hoursLeft === 2 ? "2 hours" : "24 hours";
  const blocks: Block[] = [
    {
      kind: "p",
      text: `${b.customerName}'s request for ${x.resourceLabel} on ${x.date}, ${x.time} is still waiting.${x.deadlineStaff ? ` Approve by ${x.deadlineStaff} or it expires and the hold is released.` : ""}`,
    },
    {
      kind: "details",
      rows: [
        ["Customer", b.customerName],
        ["Phone", formatPhone(b.customerPhone)],
        ["Field", x.resourceLabel],
        ["When", `${x.date}, ${x.time}`],
        ["Amount", `${formatCents(b.priceCents)}, card held, not charged`],
      ],
    },
    { kind: "button", label: "Review request", url: x.staffUrl },
  ];
  return build(f, {
    subject: `${left} left to approve ${b.resourceCode}, ${x.dateShort}`,
    preheader: x.deadlineStaff ? `Approve by ${x.deadlineStaff}` : `${b.customerName}'s request is waiting.`,
    heading: `${left} left`,
    blocks,
    footer: staffFooter(f),
  });
}

export function renderStaffRequestExpired(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const blocks: Block[] = [
    {
      kind: "p",
      text: `Nobody approved ${b.customerName}'s request for ${x.resourceLabel} on ${x.date}, ${x.time} in time, so it expired. Hold released and ${x.first} told; they weren't charged.`,
    },
    { kind: "details", rows: [["Customer", b.customerName], ["Phone", formatPhone(b.customerPhone)], ["Email", b.customerEmail]] },
    { kind: "button", label: "Open Tymo", url: x.staffUrl },
  ];
  return build(f, {
    subject: `Request expired: ${b.resourceCode}, ${x.dateShort}`,
    preheader: `Hold released and ${x.first} told.`,
    heading: "Request expired",
    blocks,
    footer: staffFooter(f),
  });
}

export function renderStaffCustomerCancelled(ctx: BookingEmailContext): RenderedEmail {
  const { facility: f, booking: b } = ctx;
  const x = facts(ctx);
  const money =
    b.amountRefundedCents > 0
      ? `${formatCents(b.amountRefundedCents)} was refunded to their ${x.card}.`
      : b.amountCapturedCents > 0
        ? "No refund was issued."
        : "They hadn't been charged.";
  const blocks: Block[] = [
    { kind: "p", text: `${b.customerName} cancelled ${x.resourceLabel} on ${x.date}, ${x.time}. The time is open again. ${money}` },
    { kind: "details", rows: [["Customer", b.customerName], ["Phone", formatPhone(b.customerPhone)], ["Email", b.customerEmail]] },
    { kind: "button", label: "Open Tymo", url: x.staffUrl },
  ];
  return build(f, {
    subject: `Cancelled by customer: ${b.resourceCode}, ${x.dateShort}, ${x.timeStaff}`,
    preheader: `The time is open again. ${money}`,
    heading: "Customer cancelled",
    blocks,
    footer: staffFooter(f),
  });
}

export function renderStaffSignIn(ctx: StaffEmailContext): RenderedEmail {
  const { facility: f, user, url } = ctx;
  const blocks: Block[] = [
    {
      kind: "p",
      text: `Hi ${firstName(user.name)}, tap the button to sign in to Tymo for ${f.name}. The link works for 15 minutes, one time.`,
    },
    { kind: "button", label: "Sign in to Tymo", url },
    { kind: "link", label: "Or paste this link into your browser", url },
    { kind: "note", text: "Didn't ask to sign in? Ignore this email; nobody can sign in without the link." },
  ];
  return build(f, {
    subject: `Sign in to ${f.name} on Tymo`,
    preheader: "Your sign-in link works for 15 minutes.",
    heading: "Sign in",
    blocks,
    footer: staffFooter(f),
  });
}

export function renderStaffInvite(ctx: StaffEmailContext & { invitedByName: string }): RenderedEmail {
  const { facility: f, user, url, invitedByName, appUrl } = ctx;
  const blocks: Block[] = [
    {
      kind: "p",
      text: `Hi ${firstName(user.name)}, ${invitedByName} added you to ${f.name} on Tymo as ${user.role === "owner" ? "an owner" : "staff"}. Tymo is where you approve booking requests and keep the field calendar.`,
    },
    {
      kind: "p",
      text: `The button signs you in. It works for 15 minutes, one time; after that, sign in any time at ${appUrl}/staff/login.`,
    },
    { kind: "button", label: "Accept and sign in", url },
    { kind: "link", label: "Or paste this link into your browser", url },
  ];
  return build(f, {
    subject: `${invitedByName} invited you to ${f.name} on Tymo`,
    preheader: `Join ${f.name} on Tymo.`,
    heading: "You're invited",
    blocks,
    footer: staffFooter(f),
  });
}
