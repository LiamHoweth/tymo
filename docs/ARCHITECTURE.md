# Tymo v1 architecture and build rules

Tymo v1 carries one booking end to end: a renter requests a field on the
facility's branded page, the card is **held** (not charged), staff approve
from a phone, the hold is **captured**, and Stripe pays the facility, minus
Tymo's 2% application fee.

## Stack

| Layer | Choice |
| --- | --- |
| Apps | Next.js 16 (App Router, React 19, server actions), TypeScript, npm workspaces; Tymo website is static HTML |
| Styling | Tailwind CSS v4 + CSS variables (`packages/ui/src/theme.css`) |
| Database | PostgreSQL via Drizzle ORM. Local dev and tests use embedded PGlite (no Docker) |
| Payments | Stripe Connect, direct charges, `capture_method=manual`, application fee |
| Dates | Luxon, facility time zone (`tenants.time_zone`) |
| Email | Outbox table + Resend when `RESEND_API_KEY` is set |
| Tests | Vitest (`npm test`), PGlite-backed integration tests |

## Module map and ownership

Four apps, split by audience: Tymo's website and services, and each
company's (facility's) website and services. Logic lives in packages.

| Path | What it is |
| --- | --- |
| `apps/tymo-web/` | Tymo's marketing site: static HTML/CSS/JS, published as-is |
| `apps/tymo-services/` | Stripe webhook (`/api/stripe/webhook`), sweep (`/api/cron/tick` + optional in-process scheduler), dev outbox |
| `apps/company-web/` | Renter booking flow and private booking page (`/book/[slug]`) |
| `apps/company-services/` | Staff app (`/staff`), staff sign-in, owner Stripe Connect onboarding (`/api/stripe/connect/*`) |
| `packages/db/src/schema.ts` | The schema: the contract every module codes against |
| `packages/db/src/index.ts` | `getDb`, `withTenant`, `withSystem` |
| `packages/db/drizzle/` | Migrations (generated + hand-written SQL in `custom/`) |
| `packages/company/src/public.ts` | Customer-facing engine API |
| `packages/company/src/staff.ts` | Staff engine API |
| `packages/company/src/jobs.ts` | Sweeper: holds, expiry, reminders, completion, recurring blocks |
| `packages/company/src/seed.ts` + `scripts/` | Demo seed data, dev database server, reset and prepare scripts |
| `packages/platform/src/payments/` | `PaymentProvider` interface, fake provider, Stripe provider, fees, Connect |
| `packages/platform/src/email/` | `notify()` + templates + outbox delivery |
| `packages/platform/src/auth/` | Staff magic-link sign-in and sessions |
| `packages/shared/src/` | DTOs (`types.ts`), formatting, server config (`env.ts`) |
| `packages/ui/src/` | Design-system primitives and `theme.css` tokens |

Dependency direction: apps → `company` → `platform` → `db` → (nothing);
`ui` and `shared` are used by everything. Apps never import each other.

**URLs.** Each app has its own base URL (`COMPANY_WEB_URL`,
`COMPANY_SERVICES_URL`, `TYMO_SERVICES_URL`, `TYMO_WEB_URL`; local
defaults ports 3000, 3001, 3002, 3003). Booking links in emails use the
company website; sign-in, staff and Stripe return links use company services.

**Local database.** `npm run dev` serves one embedded PGlite over the
Postgres protocol on 127.0.0.1:5433 (`packages/company/scripts/dev-db.ts`);
every app connects to it. Its multiplexer queues other clients while one is
in a transaction, so tenant settings never leak between apps. Tests use
in-memory PGlite directly.

## Booking rules (from the v1 spec; these are final)

**Spaces and units.** Customers book *resources* (N1, N1A). Each resource
occupies one or more indivisible *units* (N1 = N1-a + N1-b; N1A = N1-a).
Two reservations conflict only when they share a unit and overlap in time.
`parentId` is for display grouping only.

**Double booking is impossible at the database level.** Every hold,
booking and block occurrence writes one `unit_occupancy` row per unit,
guarded by:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE unit_occupancy ADD CONSTRAINT unit_occupancy_no_overlap
  EXCLUDE USING gist (tenant_id WITH =, unit_id WITH =, during WITH &&);
```

A booking's unit rows insert in one transaction. Rows are deleted when a
booking leaves a slot-holding state. Expired holds are purged inside the
inserting transaction and by the sweeper. A conflict surfaces as SQLSTATE
`23P01`.

**States.** `checking_out` (10-minute soft hold) -> `requested` (card
authorized, slot held) -> `approved` (captured) -> `completed`. From
`requested`: `declined`, `expired`, `payment_failed`, `cancelled_by_customer`.
From `approved`: `cancelled_by_customer`, `cancelled_by_facility`.
`checking_out` -> `abandoned` on timeout. Refunds are `payment_status`
(`refunded` / `partially_refunded`), shown to people as "Refunded".

| Booking state | Customer sees |
| --- | --- |
| requested | Requested |
| approved, completed | Booked |
| declined, payment_failed | Not booked |
| expired | Expired |
| cancelled_* | Cancelled (plus "Refunded $X" when money went back) |

**Payment failed has no retry.** If capture fails at approval, the booking
becomes `payment_failed`, the slot reopens, and the customer gets "Not
booked: card didn't go through" with a link to book again.

**Approval deadline** = earliest of: request + `approval_window_minutes`
(48 h), start - `approval_cutoff_before_start_minutes` (2 h), Stripe
`capture_before` - 1 h, and request + `approval_window_cap_minutes` (96 h).
At the deadline the request expires and the hold is released. Staff
reminders at 24 h and 2 h left, once each.

**Defaults** (per facility, `tenants` columns): 60-day booking window, 24 h
lead time, 30-minute slots, 1 h min / 4 h max, 10-minute checkout hold,
free cancellation until 48 h before start (then "call the front desk").
If a booking is requested inside the cancellation cutoff, its page says it
can't be cancelled online.

**Pending requests block the slot** until decided or expired.

**Blocks never cancel anything.** A block that overlaps a Requested or
Approved booking is refused for those dates. One-time blocks and closures
can't be saved until staff resolve each listed booking. Weekly blocks offer
"Save the other N dates" (conflicting dates go into `skip_dates`). Checkout
holds in the way are removed (holds yield to staff). Block labels are
staff-only; customers see "Not available", or "Closed" with a customer-safe
reason for closures.

**Roles.** Staff: approve, decline, blocks, notes, cancel with a FULL
refund. Owner only: partial or no refund, prices, hours, rules, payouts,
staff invites.

**Undo on approve** is client-side: the app waits 5 seconds before sending
the approval; closing the app in that window cancels it.

**Time.** Store UTC (`timestamptz`); rules and display use the facility's
zone. Show "CT"-style short zone labels. Generate slots per local date
with Luxon so DST days (Mar 14 2027: 2-3 AM missing; Nov 7 2027: 1-2 AM
twice) are right; price by elapsed minutes.

**Tenant isolation.** Every tenant-owned table has `tenant_id NOT NULL`.
RLS is enabled and forced for role `tymo_app` with policy
`tenant_id = current_setting('app.tenant_id', true)::uuid`. `withTenant()`
runs `SET LOCAL ROLE tymo_app` and sets `app.tenant_id`. Tables without
RLS (always filtered in code): `tenants`, `users`, `staff_sessions`,
`magic_links`, `stripe_events`. Audit log is insert/select only for
`tymo_app`.

**Links.** Customer private link `/book/[slug]/b/[publicToken]` works
until 30 days after the booking ends. Staff sign-in links: 15 minutes, one
use. Staff sessions: 30 days.

## Payments

Direct charges on the facility's connected account (Stripe Connect,
Accounts v2, full Dashboard, Stripe liable for losses). Flow:

1. `preparePayment` creates a PaymentIntent on the connected account with
   `capture_method=manual` and `application_fee_amount` (2%, rounded half
   up). The browser confirms it with the Payment Element.
2. `submitRequest` verifies status `requires_capture`, stores card brand,
   last 4 and `capture_before`, and moves the booking to `requested`.
3. Approve: capture. Decline / expire / abandon: cancel (free).
4. Refunds come from the facility's balance; Tymo returns its fee in
   proportion (`refund_application_fee=true`).

Without Stripe keys the fake provider (`packages/platform/src/payments/fake.ts`)
simulates all of this; card `4000 0000 0000 0002` declines.

## Emails

Every email is a `NotifyEvent` in `packages/platform/src/email/notify.ts`. From name
= facility name, from address = `EMAIL_FROM`, reply-to = facility email.
Each customer email repeats field, date and time with the zone label and
the private link.

## Public repository hygiene

This repo is public. Never commit secrets or real customer data. Seed data
uses a fictional facility ("Redbud Soccer Complex"); do not use real
facility names, staff names or phone numbers in code, seeds or tests.
