import "server-only";
import { and, eq } from "drizzle-orm";
import { env } from "@tymo/shared/env";
import { withTenant, type Tx } from "@tymo/db";
import { bookings, customers, emailOutbox, resources, tenants, users } from "@tymo/db/schema";
import { sendViaResend } from "./deliver";
import {
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
  type EmailFacility,
  type RenderedEmail,
} from "./templates";

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

interface Message {
  to: string;
  bookingId: string | null;
  email: RenderedEmail;
}

interface Prepared {
  fromName: string;
  replyTo: string | null;
  messages: Message[];
}

export async function notify(tenantId: string, event: NotifyEvent): Promise<void> {
  let prepared: Prepared;
  try {
    prepared = await withTenant(tenantId, (tx) => prepare(tx, tenantId, event));
  } catch (err) {
    console.error(`[email] ${event.kind}: could not prepare`, err);
    await recordFailure(tenantId, event, err);
    return;
  }
  for (const message of prepared.messages) {
    await enqueueAndDeliver(tenantId, event.kind, prepared, message);
  }
}

// ------------------------------------------------------------- loading

async function prepare(tx: Tx, tenantId: string, event: NotifyEvent): Promise<Prepared> {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error(`tenant ${tenantId} not found`);
  const facility: EmailFacility = {
    name: tenant.name,
    slug: tenant.slug,
    timeZone: tenant.timeZone,
    brandPrimary: tenant.brandPrimary,
    brandAccent: tenant.brandAccent,
    contactEmail: tenant.contactEmail,
    contactPhone: tenant.contactPhone,
    address: tenant.address,
    city: tenant.city,
    cancelCutoffMinutes: tenant.cancelCutoffMinutes,
  };
  const base = { fromName: tenant.name, replyTo: tenant.contactEmail };

  if (event.kind === "staff_sign_in" || event.kind === "staff_invite") {
    const [user] = await tx
      .select({ name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(eq(users.id, event.userId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (!user) throw new Error(`user ${event.userId} not found`);
    const ctx = { appUrl: env.companyServicesUrl, facility, user, url: event.url };
    const email = event.kind === "staff_sign_in" ? renderStaffSignIn(ctx) : renderStaffInvite({ ...ctx, invitedByName: event.invitedByName });
    return { ...base, messages: [{ to: user.email, bookingId: null, email }] };
  }

  const ctx = await loadBookingContext(tx, tenantId, event.bookingId, facility);
  const customerTo = ctx.booking.customerEmail ? [ctx.booking.customerEmail] : [];

  const team = await tx
    .select({ email: users.email, role: users.role })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  const everyone = team.map((u) => u.email);
  const owners = team.filter((u) => u.role === "owner").map((u) => u.email);

  let email: RenderedEmail;
  let to: string[];
  switch (event.kind) {
    case "request_received":
      [email, to] = [renderRequestReceived(ctx), customerTo];
      break;
    case "approved":
      [email, to] = [renderApproved(ctx), customerTo];
      break;
    case "declined":
      [email, to] = [renderDeclined(ctx), customerTo];
      break;
    case "expired":
      [email, to] = [renderExpired(ctx), customerTo];
      break;
    case "payment_failed":
      [email, to] = [renderPaymentFailed(ctx), customerTo];
      break;
    case "cancelled_by_customer":
      [email, to] = [renderCancelledByCustomer(ctx), customerTo];
      break;
    case "cancelled_by_facility":
      [email, to] = [renderCancelledByFacility(ctx), customerTo];
      break;
    case "customer_link":
      [email, to] = [renderCustomerLink(ctx), customerTo];
      break;
    case "staff_new_request":
      [email, to] = [renderStaffNewRequest(ctx), everyone];
      break;
    case "staff_reminder":
      [email, to] = [renderStaffReminder(ctx, event.hoursLeft), everyone];
      break;
    case "staff_request_expired":
      [email, to] = [renderStaffRequestExpired(ctx), owners];
      break;
    case "staff_customer_cancelled":
      [email, to] = [renderStaffCustomerCancelled(ctx), everyone];
      break;
  }
  if (to.length === 0) console.warn(`[email] ${event.kind}: no recipients for booking ${event.bookingId}`);
  const unique = [...new Set(to.map((addr) => addr.trim().toLowerCase()).filter(Boolean))];
  return { ...base, messages: unique.map((addr) => ({ to: addr, bookingId: event.bookingId, email })) };
}

async function loadBookingContext(tx: Tx, tenantId: string, bookingId: string, facility: EmailFacility): Promise<BookingEmailContext> {
  const [row] = await tx
    .select({
      booking: bookings,
      resourceCode: resources.code,
      resourceName: resources.name,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .leftJoin(customers, eq(customers.id, bookings.customerId))
    .where(and(eq(bookings.id, bookingId), eq(bookings.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new Error(`booking ${bookingId} not found`);
  const b = row.booking;
  return {
    appUrl: env.companyWebUrl,
    staffBaseUrl: env.companyServicesUrl,
    facility,
    booking: {
      id: b.id,
      status: b.status,
      publicToken: b.publicToken,
      resourceCode: row.resourceCode,
      resourceName: row.resourceName,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      priceCents: b.priceCents,
      amountCapturedCents: b.amountCapturedCents,
      amountRefundedCents: b.amountRefundedCents,
      cardBrand: b.cardBrand,
      cardLast4: b.cardLast4,
      approvalDeadlineAt: b.approvalDeadlineAt,
      createdAt: b.createdAt,
      decidedAt: b.decidedAt,
      declineReason: b.declineReason,
      cancelReason: b.cancelReason,
      customerName: row.customerName ?? "Customer",
      customerEmail: row.customerEmail ?? "",
      customerPhone: row.customerPhone ?? "",
      team: b.team,
      waiverAccepted: b.waiverAcceptedAt !== null,
    },
  };
}

// --------------------------------------------------- outbox + delivery

async function enqueueAndDeliver(tenantId: string, kind: string, prepared: Prepared, message: Message): Promise<void> {
  let outboxId: string | null = null;
  try {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .insert(emailOutbox)
        .values({
          tenantId,
          bookingId: message.bookingId,
          kind,
          toEmail: message.to,
          fromName: prepared.fromName,
          replyTo: prepared.replyTo,
          subject: message.email.subject,
          html: message.email.html,
          text: message.email.text,
        })
        .returning({ id: emailOutbox.id }),
    );
    outboxId = row.id;

    if (!env.isProd) {
      console.info(`[email] ${kind} -> ${message.to}: ${message.email.subject}${message.email.actionUrl ? `\n        ${message.email.actionUrl}` : ""}`);
    }
    if (!env.resendApiKey) return; // dev: the row in /dev/outbox is the delivery

    const sent = await sendViaResend(env.resendApiKey, {
      fromName: prepared.fromName,
      fromAddress: env.emailFrom,
      to: message.to,
      replyTo: prepared.replyTo,
      subject: message.email.subject,
      html: message.email.html,
      text: message.email.text,
      idempotencyKey: `outbox-${outboxId}`,
    });
    const id = outboxId;
    await withTenant(tenantId, (tx) =>
      tx.update(emailOutbox).set({ sentAt: new Date(), providerMessageId: sent.id, error: null }).where(eq(emailOutbox.id, id)),
    );
  } catch (err) {
    console.error(`[email] ${kind} -> ${message.to}: delivery failed`, err);
    const id = outboxId;
    if (!id) return;
    await withTenant(tenantId, (tx) =>
      tx.update(emailOutbox).set({ error: errorMessage(err) }).where(eq(emailOutbox.id, id)),
    ).catch((e) => console.error("[email] could not record the delivery error", e));
  }
}

/** Leave a trace in the outbox when an email couldn't even be rendered. */
async function recordFailure(tenantId: string, event: NotifyEvent, err: unknown): Promise<void> {
  try {
    await withTenant(tenantId, (tx) =>
      tx.insert(emailOutbox).values({
        tenantId,
        kind: event.kind,
        toEmail: "(not sent)",
        fromName: "Tymo",
        subject: `Not sent: ${event.kind}`,
        html: "",
        text: JSON.stringify({ ...event, url: "url" in event ? "[redacted]" : undefined }),
        error: errorMessage(err),
      }),
    );
  } catch (e) {
    console.error("[email] could not record the failure", e);
  }
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}
