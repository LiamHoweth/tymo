/**
 * Tymo v1 database schema (the shared contract for every module).
 *
 * Rules that live outside this file, in hand-written SQL migrations:
 *  - btree_gist + an EXCLUDE constraint on unit_occupancy (no overlapping
 *    occupancy of the same unit), see docs/ARCHITECTURE.md.
 *  - Row-level security on every table that has tenant_id, keyed on
 *    current_setting('app.tenant_id'), enforced for role tymo_app.
 *    Exceptions (no RLS, always filtered in code): tenants, users,
 *    staff_sessions, magic_links, stripe_events.
 *
 * Conventions: money in integer cents, instants as timestamptz (UTC),
 * local wall-clock times as 'HH:MM' text interpreted in tenants.time_zone,
 * weekdays as ISO numbers (1 = Monday ... 7 = Sunday).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** Postgres tstzrange, read and written as its text form: '[start,end)'. */
export const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tstzrange";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---------------------------------------------------------------- enums

export const bookingStatus = pgEnum("booking_status", [
  "checking_out", // slot soft-held while the customer fills details and card
  "abandoned", // checkout hold timed out
  "requested", // card authorized (held), waiting for staff
  "approved", // staff approved and the hold was captured
  "declined", // staff said no; hold released
  "expired", // nobody decided before the approval deadline; hold released
  "payment_failed", // capture failed at approval (hold lapsed or voided)
  "cancelled_by_customer",
  "cancelled_by_facility",
  "completed", // end time passed on an approved booking
]);

/** Refunds are a payment status, not a booking status: a cancelled booking
 *  with payment_status 'refunded' is shown to people as "Refunded". */
export const paymentStatus = pgEnum("payment_status", [
  "none",
  "pending", // payment prepared, customer has not confirmed the card yet
  "authorized", // hold placed (Stripe: requires_capture)
  "captured",
  "canceled", // hold released
  "failed",
  "refunded",
  "partially_refunded",
]);

export const staffRole = pgEnum("staff_role", ["owner", "staff"]);
export const blockKind = pgEnum("block_kind", ["one_time", "weekly", "closure"]);
export const occupancyKind = pgEnum("occupancy_kind", ["hold", "booking", "block"]);
export const bookingSource = pgEnum("booking_source", ["online", "staff"]);

// -------------------------------------------------------------- tenants

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  timeZone: text("time_zone").notNull().default("America/Chicago"),
  city: text("city"), // "Enid, OK"
  address: text("address"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  websiteUrl: text("website_url"),
  logoUrl: text("logo_url"),
  brandPrimary: text("brand_primary").notNull().default("#0a2d5b"),
  brandAccent: text("brand_accent").notNull().default("#d0353d"),
  waiverText: text("waiver_text").notNull().default(""),
  waiverVersion: integer("waiver_version").notNull().default(1),
  cancellationPolicyText: text("cancellation_policy_text"),

  // Booking rules (per facility). Minutes unless named otherwise.
  bookingWindowDays: integer("booking_window_days").notNull().default(60),
  leadTimeMinutes: integer("lead_time_minutes").notNull().default(1440),
  approvalWindowMinutes: integer("approval_window_minutes").notNull().default(2880),
  approvalCutoffBeforeStartMinutes: integer("approval_cutoff_before_start_minutes")
    .notNull()
    .default(120),
  /** Hard cap; must stay under Visa's 4 d 18 h customer-initiated hold. */
  approvalWindowCapMinutes: integer("approval_window_cap_minutes").notNull().default(5760),
  cancelCutoffMinutes: integer("cancel_cutoff_minutes").notNull().default(2880),
  checkoutHoldMinutes: integer("checkout_hold_minutes").notNull().default(10),

  bookingsEnabled: boolean("bookings_enabled").notNull().default(false),
  fieldsConfirmedAt: ts("fields_confirmed_at"),
  testBookingDoneAt: ts("test_booking_done_at"),

  stripeAccountId: text("stripe_account_id").unique(),
  stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
  stripeDetailsSubmitted: boolean("stripe_details_submitted").notNull().default(false),
  statementDescriptor: text("statement_descriptor"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------- staff + auth

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(), // stored lower-cased
    name: text("name").notNull(),
    role: staffRole("role").notNull().default("staff"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_tenant_email").on(t.tenantId, t.email), index("users_email").on(t.email)],
);

export const staffSessions = pgTable("staff_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const magicLinks = pgTable("magic_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

// ---------------------------------------------------- spaces and units

/**
 * A bookable thing a customer picks (N1, N1A, Indoor Field).
 * parentId groups halves under their full field for display only;
 * conflicts come from resource_units, never from parentId.
 */
export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(), // "N1A"
    name: text("name").notNull(), // "N1 · Half A"
    parentId: uuid("parent_id").references((): AnyPgColumn => resources.id),
    groupLabel: text("group_label").notNull(), // "Grass fields"
    surface: text("surface"), // "Natural grass"
    indoor: boolean("indoor").notNull().default(false),
    description: text("description"), // "West side, by the parking lot"
    sortOrder: integer("sort_order").notNull().default(0),
    slotMinutes: integer("slot_minutes").notNull().default(30),
    minMinutes: integer("min_minutes").notNull().default(60),
    maxMinutes: integer("max_minutes").notNull().default(240),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    priceCentsPerHour: integer("price_cents_per_hour").notNull(),
    requestOnly: boolean("request_only").notNull().default(true),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("resources_tenant_code").on(t.tenantId, t.code)],
);

/** Indivisible piece of space. N1 occupies N1-a + N1-b; N1A occupies N1-a. */
export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(), // "N1-a"
  },
  (t) => [uniqueIndex("units_tenant_code").on(t.tenantId, t.code)],
);

export const resourceUnits = pgTable(
  "resource_units",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.unitId] })],
);

/** resourceId null = venue default hours; a resource row overrides the venue for that weekday. */
export const operatingHours = pgTable("operating_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  resourceId: uuid("resource_id").references(() => resources.id),
  weekday: smallint("weekday").notNull(), // 1 = Mon ... 7 = Sun
  opensAt: text("opens_at").notNull(), // "09:00"
  closesAt: text("closes_at").notNull(), // "21:00"
});

/** Optional time-of-day pricing; falls back to resources.price_cents_per_hour. */
export const rateBands = pgTable("rate_bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  resourceId: uuid("resource_id")
    .notNull()
    .references(() => resources.id),
  weekdays: smallint("weekdays").array().notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  priceCentsPerHour: integer("price_cents_per_hour").notNull(),
});

// ------------------------------------------------------------ bookings

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("customers_tenant_email").on(t.tenantId, t.email)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id),
    customerId: uuid("customer_id").references(() => customers.id),
    source: bookingSource("source").notNull().default("online"),
    status: bookingStatus("status").notNull().default("checking_out"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    team: text("team"),

    /** Opaque capability for the customer's private link (/book/[slug]/b/[token]). */
    publicToken: text("public_token").unique(),
    /** Opaque capability that lets one browser finish its own checkout. */
    checkoutToken: text("checkout_token").unique(),
    checkoutExpiresAt: ts("checkout_expires_at"),
    approvalDeadlineAt: ts("approval_deadline_at"),
    /** Reminder hours already sent to staff, e.g. {24,2}. */
    remindersSent: integer("reminders_sent").array().notNull().default(sql`'{}'::integer[]`),
    waiverAcceptedAt: ts("waiver_accepted_at"),
    waiverVersion: integer("waiver_version"),

    declineReason: text("decline_reason"),
    cancelReason: text("cancel_reason"),
    staffNotes: text("staff_notes"),

    paymentStatus: paymentStatus("payment_status").notNull().default("none"),
    paymentIntentId: text("payment_intent_id"),
    applicationFeeCents: integer("application_fee_cents"),
    amountCapturedCents: integer("amount_captured_cents").notNull().default(0),
    amountRefundedCents: integer("amount_refunded_cents").notNull().default(0),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    captureBefore: ts("capture_before"),

    decidedAt: ts("decided_at"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    cancelledAt: ts("cancelled_at"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    /** Optimistic concurrency: bump on every state change. */
    version: integer("version").notNull().default(0),
  },
  (t) => [
    index("bookings_tenant_status").on(t.tenantId, t.status),
    index("bookings_tenant_starts").on(t.tenantId, t.startsAt),
  ],
);

// -------------------------------------------------------------- blocks

/**
 * one_time / closure: startsAt..endsAt instants.
 * weekly: weekdays + startLocal..endLocal on every matching date from
 *   startDate to endDate (inclusive, venue-local), minus skipDates.
 * resourceId null = every resource (whole venue).
 */
export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  kind: blockKind("kind").notNull(),
  label: text("label").notNull(), // staff-only, never shown to customers
  resourceId: uuid("resource_id").references(() => resources.id),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  weekdays: smallint("weekdays").array(),
  startLocal: text("start_local"),
  endLocal: text("end_local"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  skipDates: text("skip_dates").array().notNull().default(sql`'{}'::text[]`),
  /** "This and later dates" edits end the old series and point the new one here. */
  splitFromBlockId: uuid("split_from_block_id").references((): AnyPgColumn => blocks.id),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: createdAt(),
  deletedAt: ts("deleted_at"),
});

// ----------------------------------------------------------- occupancy

/**
 * One row per unit per hold / booking / block occurrence.
 * The EXCLUDE constraint (custom SQL) makes overlapping rows for the same
 * unit impossible, which is what prevents double booking.
 */
export const unitOccupancy = pgTable(
  "unit_occupancy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    during: tstzrange("during").notNull(),
    kind: occupancyKind("kind").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    blockId: uuid("block_id").references(() => blocks.id),
    occurrenceDate: date("occurrence_date", { mode: "string" }),
    holdExpiresAt: ts("hold_expires_at"),
  },
  (t) => [index("occupancy_booking").on(t.bookingId), index("occupancy_block").on(t.blockId)],
);

// ------------------------------------------------------ audit + email

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actorType: text("actor_type").notNull(), // 'staff' | 'customer' | 'system'
    actorId: text("actor_id"),
    action: text("action").notNull(), // 'booking.approve', 'block.create', ...
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    reason: text("reason"),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_tenant_created").on(t.tenantId, t.createdAt)],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    kind: text("kind").notNull(),
    toEmail: text("to_email").notNull(),
    fromName: text("from_name").notNull(),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
  },
  (t) => [index("outbox_tenant_created").on(t.tenantId, t.createdAt)],
);

/** Stripe webhook de-duplication. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  accountId: text("account_id"),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
});
