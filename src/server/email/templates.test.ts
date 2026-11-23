import { describe, expect, it } from "vitest";
import {
  receiptNumber,
  renderApproved,
  renderCancelledByCustomer,
  renderCancelledByFacility,
  renderCustomerLink,
  renderDeclined,
  renderExpired,
  renderPaymentFailed,
  renderRequestReceived,
  renderStaffCustomerCancelled,
  renderStaffInvite,
  renderStaffNewRequest,
  renderStaffReminder,
  renderStaffRequestExpired,
  renderStaffSignIn,
  type BookingEmailContext,
  type EmailBooking,
  type EmailFacility,
  type RenderedEmail,
} from "./templates";
import { zoneLabel } from "./format";

const APP = "https://app.test";

const facility: EmailFacility = {
  name: "Redbud Soccer Complex",
  slug: "redbud",
  timeZone: "America/Chicago",
  brandPrimary: "#0a2d5b",
  brandAccent: "#d0353d",
  contactEmail: "frontdesk@redbud.example",
  contactPhone: "5805550100",
  address: "100 Field Rd",
  city: "Enid, OK",
  cancelCutoffMinutes: 2880,
};

// Sat Dec 5 2026, 5:00-6:30 PM CST (UTC-6); requested Sun Nov 22 at 2:00 PM CT.
const booking: EmailBooking = {
  id: "1a2b3c4d-0000-4000-8000-000000000001",
  status: "requested",
  publicToken: "tok_abc123",
  resourceCode: "IF",
  resourceName: "Indoor Field",
  startsAt: new Date("2026-12-05T23:00:00Z"),
  endsAt: new Date("2026-12-06T00:30:00Z"),
  priceCents: 12000,
  amountCapturedCents: 0,
  amountRefundedCents: 0,
  cardBrand: "visa",
  cardLast4: "4242",
  approvalDeadlineAt: new Date("2026-11-25T02:00:00Z"), // Tue Nov 24, 8:00 PM CT
  createdAt: new Date("2026-11-22T20:00:00Z"),
  decidedAt: null,
  declineReason: null,
  cancelReason: null,
  customerName: "Jamie Sample",
  customerEmail: "jamie@example.com",
  customerPhone: "5805550142",
  team: "Redbud U12 Blue",
  waiverAccepted: true,
};

const ctx = (over: Partial<EmailBooking> = {}): BookingEmailContext => ({
  appUrl: APP,
  facility,
  booking: { ...booking, ...over },
});

// N1A, Sat Dec 5, 10:00-11:30 AM CT, $45.
const halfCtx = (over: Partial<EmailBooking> = {}) =>
  ctx({
    resourceCode: "N1A",
    resourceName: "N1 · Half A",
    startsAt: new Date("2026-12-05T16:00:00Z"),
    endsAt: new Date("2026-12-05T17:30:00Z"),
    priceCents: 4500,
    customerName: "Jordan Sample",
    ...over,
  });

const PRIVATE = `${APP}/book/redbud/b/tok_abc123`;
const BOOK = `${APP}/book/redbud`;

const staffCtx = {
  appUrl: APP,
  facility,
  user: { name: "Pat Example", email: "pat@redbud.example", role: "staff" as const },
  url: `${APP}/staff/auth/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE`,
};

function expectCustomerBasics(email: RenderedEmail) {
  // Every customer email repeats field, date and time with the zone label, plus the private link.
  expect(email.text).toContain("Indoor Field");
  expect(email.text).toContain("Sat, Dec 5");
  expect(email.text).toContain("5:00–6:30 PM CT");
  expect(email.text).toContain(PRIVATE);
  expect(email.html).toContain(PRIVATE);
}

describe("every template", () => {
  const all: [string, RenderedEmail][] = [
    ["request_received", renderRequestReceived(ctx())],
    ["approved", renderApproved(ctx({ status: "approved", amountCapturedCents: 12000, decidedAt: new Date("2026-11-23T15:00:00Z") }))],
    ["declined", renderDeclined(ctx({ status: "declined" }))],
    ["expired", renderExpired(ctx({ status: "expired" }))],
    ["payment_failed", renderPaymentFailed(ctx({ status: "payment_failed" }))],
    ["cancelled_by_customer", renderCancelledByCustomer(ctx({ status: "cancelled_by_customer" }))],
    ["cancelled_by_facility", renderCancelledByFacility(ctx({ status: "cancelled_by_facility" }))],
    ["customer_link", renderCustomerLink(ctx())],
    ["staff_new_request", renderStaffNewRequest(halfCtx())],
    ["staff_reminder", renderStaffReminder(halfCtx(), 24)],
    ["staff_request_expired", renderStaffRequestExpired(halfCtx())],
    ["staff_customer_cancelled", renderStaffCustomerCancelled(halfCtx())],
    ["staff_sign_in", renderStaffSignIn(staffCtx)],
    ["staff_invite", renderStaffInvite({ ...staffCtx, invitedByName: "Dana Example" })],
  ];

  it.each(all)("%s is branded, complete and has a plain-text part", (_kind, email) => {
    expect(email.subject.length).toBeGreaterThan(5);
    expect(email.html.startsWith("<!doctype html>")).toBe(true);
    expect(email.html).toContain("REDBUD SOCCER COMPLEX"); // header band
    expect(email.html).toContain("background:#0a2d5b"); // brand band
    expect(email.html).toContain('<meta name="viewport"');
    expect(email.html).not.toMatch(/<img|<link|<style/); // inline styles only, no images
    expect(email.text).toContain("REDBUD SOCCER COMPLEX");
    expect(email.html).not.toMatch(/undefined|NaN|\bnull\b/);
    expect(email.text).not.toMatch(/undefined|NaN|\bnull\b/);
    // Exactly one accent button.
    expect(email.html.match(/border-radius:999px;background:/g)?.length).toBe(1);
    expect(email.actionUrl).toMatch(/^https:\/\/app\.test\//);
  });
});

describe("customer emails", () => {
  it("request received", () => {
    const email = renderRequestReceived(ctx());
    expect(email.subject).toBe("Request sent: Indoor Field, Sat Dec 5");
    expectCustomerBasics(email);
    expect(email.text).toContain("Hi Jamie, Redbud Soccer Complex has your request");
    expect(email.text).toContain("You won't be charged until they confirm.");
    expect(email.text).toContain("If there's no answer by Tue, Nov 24 at 8:00 PM CT, it expires");
    expect(email.text).toContain("$120.00, held on your Visa ending 4242, not charged");
    expect(email.text).toContain("Team: Redbud U12 Blue");
    expect(email.actionUrl).toBe(PRIVATE);
    expect(email.text).toContain(`View or cancel request: ${PRIVATE}`);
  });

  it("approved doubles as the receipt", () => {
    const email = renderApproved(
      ctx({ status: "approved", amountCapturedCents: 12000, decidedAt: new Date("2026-11-23T15:00:00Z") }),
    );
    expect(email.subject).toBe("You're booked: Indoor Field, Sat Dec 5");
    expectCustomerBasics(email);
    expect(email.text).toContain("Redbud Soccer Complex confirmed your booking. We charged $120.00 to your Visa ending 4242.");
    expect(email.text).toContain("Free cancellation until Thu, Dec 3 at 5:00 PM CT.");
    expect(email.text).toContain(`Receipt number: ${receiptNumber(booking.id)}`);
    expect(receiptNumber(booking.id)).toBe("TY-1A2B3C4D");
    expect(email.text).toContain("Charged on: Mon, Nov 23");
    expect(email.text).toContain("Paid to: Redbud Soccer Complex · 100 Field Rd, Enid, OK");
  });

  it("approved inside the cancellation cutoff says to call", () => {
    const email = renderApproved(
      ctx({ status: "approved", amountCapturedCents: 12000, createdAt: new Date("2026-12-04T15:00:00Z") }),
    );
    expect(email.text).toContain("This booking can't be cancelled online. To cancel, call the front desk at (580) 555-0100.");
    expect(email.text).not.toContain("Free cancellation");
  });

  it("declined includes the facility's note and no charge", () => {
    const email = renderDeclined(ctx({ status: "declined", declineReason: "Field is set up for a tournament." }));
    expect(email.subject).toBe("Not booked: Indoor Field, Sat Dec 5");
    expectCustomerBasics(email);
    expect(email.text).toContain("Redbud Soccer Complex can't take your request");
    expect(email.text).toContain("You haven't been charged");
    expect(email.text).toContain("Their note: Field is set up for a tournament.");
    expect(email.actionUrl).toBe(BOOK);
  });

  it("expired offers the phone number", () => {
    const email = renderExpired(ctx({ status: "expired" }));
    expect(email.subject).toBe("Request expired: Indoor Field, Sat Dec 5");
    expectCustomerBasics(email);
    expect(email.text).toContain("didn't answer in time");
    expect(email.text).toContain("You haven't been charged.");
    expect(email.text).toContain("call (580) 555-0100");
  });

  it("payment failed: not booked, book again, no retry", () => {
    const email = renderPaymentFailed(ctx({ status: "payment_failed" }));
    expect(email.subject).toBe("Not booked: card didn't go through");
    expectCustomerBasics(email);
    expect(email.text).toContain("your Visa ending 4242 didn't go through, so the time wasn't booked");
    expect(email.text).toContain("You haven't been charged.");
    expect(email.text).toContain(`Book again: ${BOOK}`);
    expect(email.actionUrl).toBe(BOOK);
    expect(email.text.toLowerCase()).not.toMatch(/update your card|retry|try again with/);
  });

  it("cancelled by customer before approval: not charged", () => {
    const email = renderCancelledByCustomer(ctx({ status: "cancelled_by_customer" }));
    expect(email.subject).toBe("Cancelled: Indoor Field, Sat Dec 5");
    expectCustomerBasics(email);
    expect(email.text).toContain("You cancelled your request for Indoor Field");
    expect(email.text).toContain("You weren't charged.");
  });

  it("cancelled by customer after approval: refund on its way", () => {
    const email = renderCancelledByCustomer(
      ctx({ status: "cancelled_by_customer", amountCapturedCents: 12000, amountRefundedCents: 12000 }),
    );
    expect(email.text).toContain("You cancelled your booking for Indoor Field");
    expect(email.text).toContain("$120.00 is on its way back to your Visa ending 4242. Allow 5 to 10 business days.");
  });

  it("cancelled by facility: full refund with note", () => {
    const email = renderCancelledByFacility(
      ctx({
        status: "cancelled_by_facility",
        amountCapturedCents: 12000,
        amountRefundedCents: 12000,
        cancelReason: "Fields closed after heavy rain.",
      }),
    );
    expect(email.subject).toBe("Redbud Soccer Complex cancelled Sat Dec 5");
    expectCustomerBasics(email);
    expect(email.text).toContain("Sorry, Jamie. Redbud Soccer Complex had to cancel Indoor Field");
    expect(email.text).toContain("Their note: Fields closed after heavy rain.");
    expect(email.text).toContain("We refunded all $120.00 to your Visa ending 4242; allow 5 to 10 business days.");
  });

  it("cancelled by facility: partial and no refund", () => {
    const partial = renderCancelledByFacility(
      ctx({ status: "cancelled_by_facility", amountCapturedCents: 12000, amountRefundedCents: 6000 }),
    );
    expect(partial.text).toContain("We refunded $60.00 of $120.00 to your Visa ending 4242");
    const none = renderCancelledByFacility(ctx({ status: "cancelled_by_facility", amountCapturedCents: 12000 }));
    expect(none.text).toContain("No refund was issued.");
  });

  it("customer link shows the status", () => {
    const email = renderCustomerLink(ctx({ status: "approved" }));
    expect(email.subject).toBe("Your booking link: Indoor Field, Sat Dec 5");
    expectCustomerBasics(email);
    expect(email.text).toContain("Status: Booked");
  });

  it("escapes customer-supplied text in HTML", () => {
    const email = renderDeclined(ctx({ declineReason: '<script>alert("x")</script>', team: "A & B" }));
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(email.html).toContain("A &amp; B");
  });
});

describe("staff emails", () => {
  it("new request has everything needed to decide", () => {
    const email = renderStaffNewRequest(halfCtx());
    expect(email.subject).toBe("New request: N1A, Sat Dec 5, 10:00 to 11:30 AM");
    expect(email.text).toContain("Customer: Jordan Sample");
    expect(email.text).toContain("Phone: (580) 555-0142");
    expect(email.text).toContain("Email: jamie@example.com");
    expect(email.text).toContain("Field: N1A (N1 · Half A)");
    expect(email.text).toContain("When: Sat, Dec 5, 10:00–11:30 AM CT");
    expect(email.text).toContain("Amount: $45.00, card held, not charged");
    expect(email.text).toContain("Card: Visa ending 4242");
    expect(email.text).toContain("Waiver: Waiver accepted");
    expect(email.text).toContain("Approve by Tue Nov 24, 8:00 PM CT");
    expect(email.text).toContain(`Review request: ${APP}/staff`);
    expect(email.actionUrl).toBe(`${APP}/staff`);
  });

  it("reminders at 24 h and 2 h", () => {
    const day = renderStaffReminder(halfCtx(), 24);
    expect(day.subject).toBe("24 hours left to approve N1A, Sat Dec 5");
    expect(day.text).toContain("Approve by Tue Nov 24, 8:00 PM CT");
    expect(day.text).toContain("Review request");
    const two = renderStaffReminder(halfCtx(), 2);
    expect(two.subject).toBe("2 hours left to approve N1A, Sat Dec 5");
  });

  it("request expired (owner)", () => {
    const email = renderStaffRequestExpired(halfCtx({ status: "expired" }));
    expect(email.subject).toBe("Request expired: N1A, Sat Dec 5");
    expect(email.text).toContain("Hold released and Jordan told");
  });

  it("customer cancelled", () => {
    const email = renderStaffCustomerCancelled(
      halfCtx({ status: "cancelled_by_customer", amountCapturedCents: 4500, amountRefundedCents: 4500 }),
    );
    expect(email.subject).toBe("Cancelled by customer: N1A, Sat Dec 5, 10:00 to 11:30 AM");
    expect(email.text).toContain("The time is open again.");
    expect(email.text).toContain("$45.00 was refunded to their Visa ending 4242.");
  });

  it("sign-in link: 15 minutes, one use", () => {
    const email = renderStaffSignIn(staffCtx);
    expect(email.subject).toBe("Sign in to Redbud Soccer Complex on Tymo");
    expect(email.text).toContain("15 minutes");
    expect(email.text).toContain(staffCtx.url);
    expect(email.html).toContain(staffCtx.url);
    expect(email.actionUrl).toBe(staffCtx.url);
  });

  it("invite", () => {
    const email = renderStaffInvite({ ...staffCtx, invitedByName: "Dana Example" });
    expect(email.subject).toBe("Dana Example invited you to Redbud Soccer Complex on Tymo");
    expect(email.text).toContain("as staff");
    expect(email.text).toContain(`${APP}/staff/login`);
    expect(email.actionUrl).toBe(staffCtx.url);
  });
});

describe("zone labels", () => {
  it("uses CT-style labels all year in US zones", () => {
    expect(zoneLabel("America/Chicago", new Date("2026-12-05T23:00:00Z"))).toBe("CT");
    expect(zoneLabel("America/Chicago", new Date("2027-07-04T18:00:00Z"))).toBe("CT");
    expect(zoneLabel("America/New_York", new Date("2027-07-04T18:00:00Z"))).toBe("ET");
    expect(zoneLabel("America/Denver", new Date("2026-12-05T18:00:00Z"))).toBe("MT");
    expect(zoneLabel("America/Los_Angeles", new Date("2026-12-05T18:00:00Z"))).toBe("PT");
  });

  it("formats times across the DST change in the facility zone", () => {
    // Sun Nov 7 2027, 9:00-10:30 AM CST (after fall back).
    const email = renderRequestReceived(
      ctx({ startsAt: new Date("2027-11-07T15:00:00Z"), endsAt: new Date("2027-11-07T16:30:00Z") }),
    );
    expect(email.subject).toBe("Request sent: Indoor Field, Sun Nov 7");
    expect(email.text).toContain("9:00–10:30 AM CT");
  });

  it("spans AM and PM", () => {
    const email = renderRequestReceived(
      ctx({ startsAt: new Date("2026-12-05T17:00:00Z"), endsAt: new Date("2026-12-05T19:00:00Z") }),
    );
    expect(email.text).toContain("11:00 AM–1:00 PM CT");
  });
});
