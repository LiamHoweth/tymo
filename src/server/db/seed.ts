/**
 * Demo data: the fictional "Redbud Soccer Complex" (23 bookable spaces,
 * weekly holds, a holiday closure, sample requests) and a minimal second
 * tenant, "Cedar Park Courts", for isolation checks. No real facilities or
 * people. Re-running replaces both tenants.
 *
 * No `server-only` here: scripts/seed.ts (tsx) and tests import it.
 */
import { inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Db } from "./client";
import {
  auditLog,
  blocks,
  bookings,
  customers,
  operatingHours,
  resourceUnits,
  resources,
  tenants,
  unitOccupancy,
  units,
  users,
} from "./schema";
import { materializeBlock, materializeHorizon } from "@/server/booking/core/blocks";
import { approvalDeadline } from "@/server/booking/core/rules";
import { addDays, atLocal, localDate, startOfLocalDate, weekdayOf } from "@/server/booking/core/time";
import { rangeLiteral } from "@/server/booking/core/util";

export interface SeededTenant {
  tenantId: string;
  slug: string;
  ownerId: string;
  staffId: string | null;
  /** resource code -> id ("N1A" -> uuid) */
  resources: Record<string, string>;
  /** unit code -> id ("N1-a" -> uuid) */
  units: Record<string, string>;
  /** sample bookings by key (r1..r3 requested, a1..a3 approved, d1 declined) */
  bookings: Record<string, { id: string; publicToken: string | null; paymentIntentId: string | null }>;
  /** block label -> id */
  blocks: Record<string, string>;
}

export interface SeedResult {
  redbud: SeededTenant;
  cedar: SeededTenant;
}

export interface SeedOptions {
  /** Clock for relative dates (sample bookings, block start). Default: now. */
  now?: Date;
  /** Insert sample bookings (default true). Tests usually turn this off. */
  sampleBookings?: boolean;
}

const ZONE = "America/Chicago";
const SEED_SLUGS = ["redbud", "cedar"];

const WAIVER_TEXT = `Redbud Soccer Complex rental waiver

By booking a field, you agree on behalf of yourself, your team and every player and guest in your group that:

1. Soccer and other field sports involve risk of injury, including sprains, broken bones, concussions and, rarely, more serious harm. You take part voluntarily and accept these risks.
2. You will inspect the field before play, stop if conditions are unsafe, and follow staff instructions, posted rules and weather calls (lightning means everyone leaves the field).
3. You release Redbud Youth Soccer Association, its staff and volunteers from claims for injury, loss or damage arising from ordinary use of the facility, except where caused by gross negligence or willful misconduct.
4. A parent or guardian must accept this waiver for any player under 18.
5. You are responsible for damage your group causes beyond normal wear.`;

const CANCELLATION_POLICY = `Your card is held when you send a request and charged only when the front desk confirms. Cancel free of charge until 48 hours before your start time for a full refund. After that, call the front desk; refunds are at their discretion. If we close a field for weather or maintenance, you get a full refund. No refunds for no-shows. Charges appear on your statement as REDBUD SOCCER.`;

/** Delete the seed tenants (and everything they own) so seeding can repeat. */
export async function clearSeedTenants(db: Db): Promise<void> {
  const existing = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.slug, SEED_SLUGS));
  if (!existing.length) return;
  const ids = existing.map((t) => t.id);
  const list = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const tables = [
    "email_outbox",
    "audit_log",
    "unit_occupancy",
    "rate_bands",
    "operating_hours",
    "resource_units",
    "units",
    "magic_links",
    "staff_sessions",
  ];
  for (const t of tables) await db.execute(sql`delete from ${sql.identifier(t)} where tenant_id in (${list})`);
  await db.execute(sql`update blocks set split_from_block_id = null where tenant_id in (${list})`);
  await db.execute(sql`delete from blocks where tenant_id in (${list})`);
  await db.execute(sql`delete from bookings where tenant_id in (${list})`);
  await db.execute(sql`delete from customers where tenant_id in (${list})`);
  await db.execute(sql`update resources set parent_id = null where tenant_id in (${list})`);
  await db.execute(sql`delete from resources where tenant_id in (${list})`);
  await db.execute(sql`delete from users where tenant_id in (${list})`);
  await db.execute(sql`delete from tenants where id in (${list})`);
}

interface ResourceSpec {
  code: string;
  name: string;
  parent?: string;
  groupLabel: string;
  surface: string;
  indoor?: boolean;
  description?: string;
  priceCentsPerHour: number;
  units: string[];
  sortOrder: number;
}

function redbudResources(): ResourceSpec[] {
  const list: ResourceSpec[] = [
    {
      code: "Indoor",
      name: "Indoor Field",
      groupLabel: "Indoor",
      surface: "Turf",
      indoor: true,
      description: "Climate-controlled turf field with netting on all sides",
      priceCentsPerHour: 8000,
      units: ["Indoor"],
      sortOrder: 0,
    },
  ];
  let order = 10;
  for (const side of ["N", "S"]) {
    for (const n of [1, 2, 3]) {
      const code = `${side}${n}`;
      const where = side === "N" ? "North" : "South";
      list.push({
        code,
        name: code,
        groupLabel: "Grass fields",
        surface: "Natural grass",
        description: `${where} complex, full-size field`,
        priceCentsPerHour: 6000,
        units: [`${code}-a`, `${code}-b`],
        sortOrder: order,
      });
      list.push({
        code: `${code}A`,
        name: `${code} · Half A`,
        parent: code,
        groupLabel: "Grass fields",
        surface: "Natural grass",
        description: side === "N" ? "West side, by the parking lot" : "West side, by the walking trail",
        priceCentsPerHour: 3000,
        units: [`${code}-a`],
        sortOrder: order + 1,
      });
      list.push({
        code: `${code}B`,
        name: `${code} · Half B`,
        parent: code,
        groupLabel: "Grass fields",
        surface: "Natural grass",
        description: side === "N" ? "East side, by the playground" : "East side, nearest the concession stand",
        priceCentsPerHour: 3000,
        units: [`${code}-b`],
        sortOrder: order + 2,
      });
      order += 10;
    }
  }
  for (const n of [1, 2, 3]) {
    list.push({
      code: `C${n}`,
      name: `C${n}`,
      groupLabel: "Turf fields",
      surface: "Artificial turf",
      description: "Mid-size turf field with lights",
      priceCentsPerHour: 6000,
      units: [`C${n}`],
      sortOrder: order,
    });
    order += 10;
  }
  list.push({
    code: "Champ",
    name: "Championship Field",
    groupLabel: "Turf fields",
    surface: "Artificial turf",
    description: "Press box, scoreboard and covered seating",
    priceCentsPerHour: 9000,
    units: ["Champ"],
    sortOrder: order,
  });
  return list;
}

async function insertResources(db: Db, tenantId: string, specs: ResourceSpec[]) {
  const unitIds: Record<string, string> = {};
  const unitCodes = [...new Set(specs.flatMap((s) => s.units))];
  const unitRows = await db
    .insert(units)
    .values(unitCodes.map((code) => ({ tenantId, code })))
    .returning({ id: units.id, code: units.code });
  for (const u of unitRows) unitIds[u.code] = u.id;

  const resourceIds: Record<string, string> = {};
  for (const s of specs) {
    const [row] = await db
      .insert(resources)
      .values({
        tenantId,
        code: s.code,
        name: s.name,
        parentId: s.parent ? resourceIds[s.parent] : null,
        groupLabel: s.groupLabel,
        surface: s.surface,
        indoor: s.indoor ?? false,
        description: s.description ?? null,
        sortOrder: s.sortOrder,
        priceCentsPerHour: s.priceCentsPerHour,
      })
      .returning({ id: resources.id });
    resourceIds[s.code] = row.id;
  }
  await db.insert(resourceUnits).values(
    specs.flatMap((s) => s.units.map((u) => ({ tenantId, resourceId: resourceIds[s.code], unitId: unitIds[u] }))),
  );
  return { resourceIds, unitIds };
}

function nextMonday(today: string): string {
  let d = addDays(today, 1);
  while (weekdayOf(d) !== 1) d = addDays(d, 1);
  return d;
}

const token = () => randomBytes(32).toString("base64url");

/** Seed both demo tenants. Replaces them if they already exist. */
export async function seed(db: Db, opts: SeedOptions = {}): Promise<SeedResult> {
  const now = opts.now ?? new Date();
  const withSamples = opts.sampleBookings ?? true;
  await clearSeedTenants(db);
  const redbud = await seedRedbud(db, now, withSamples);
  const cedar = await seedCedar(db, now, withSamples);
  return { redbud, cedar };
}

async function seedRedbud(db: Db, now: Date, withSamples: boolean): Promise<SeededTenant> {
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: "redbud",
      name: "Redbud Soccer Complex",
      legalName: "Redbud Youth Soccer Association",
      timeZone: ZONE,
      city: "Guthrie, OK",
      address: "1500 Redbud Park Road, Guthrie, OK 73044",
      contactPhone: "(405) 555-0142",
      contactEmail: "frontdesk@redbud.example",
      websiteUrl: "https://redbud.example",
      brandPrimary: "#12305f",
      brandAccent: "#e0343c",
      waiverText: WAIVER_TEXT,
      waiverVersion: 1,
      cancellationPolicyText: CANCELLATION_POLICY,
      bookingsEnabled: true,
      fieldsConfirmedAt: now,
      testBookingDoneAt: now,
      stripeAccountId: "acct_fake_redbud",
      stripeChargesEnabled: true,
      stripeDetailsSubmitted: true,
      statementDescriptor: "REDBUD SOCCER",
      createdAt: now,
    })
    .returning();
  const tenantId = tenant.id;

  const [owner, staff] = await db
    .insert(users)
    .values([
      { tenantId, email: "owner@redbud.example", name: "Dana Reyes", role: "owner" },
      { tenantId, email: "staff@redbud.example", name: "Taylor Brooks", role: "staff" },
    ])
    .returning({ id: users.id });

  const { resourceIds, unitIds } = await insertResources(db, tenantId, redbudResources());

  await db.insert(operatingHours).values(
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ tenantId, resourceId: null, weekday, opensAt: "09:00", closesAt: "21:00" })),
  );

  // Blocks: two weekly holds and the Thanksgiving closure.
  const today = localDate(now, ZONE);
  const monday = nextMonday(today);
  const blockIds: Record<string, string> = {};
  const blockSpecs: (typeof blocks.$inferInsert)[] = [
    {
      tenantId,
      kind: "weekly",
      label: "Guthrie High School",
      resourceId: resourceIds.N1,
      weekdays: [1],
      startLocal: "15:00",
      endLocal: "17:30",
      startDate: monday,
      endDate: "2027-05-24",
      createdByUserId: owner.id,
    },
    {
      tenantId,
      kind: "weekly",
      label: "Adult pickup league",
      resourceId: resourceIds.Indoor,
      weekdays: [1],
      startLocal: "19:30",
      endLocal: "21:00",
      startDate: monday,
      endDate: "2027-05-24",
      createdByUserId: owner.id,
    },
    {
      tenantId,
      kind: "closure",
      label: "Thanksgiving closure",
      publicReason: "Thanksgiving",
      resourceId: resourceIds.Indoor,
      startsAt: startOfLocalDate("2026-11-26", ZONE).toJSDate(),
      endsAt: startOfLocalDate("2026-11-29", ZONE).toJSDate(),
      createdByUserId: owner.id,
    },
  ];
  const resourceUnitCodes: Record<string, string[]> = Object.fromEntries(
    redbudResources().map((r) => [r.code, r.units]),
  );
  const horizon = materializeHorizon(now, ZONE, tenant.bookingWindowDays);
  for (const spec of blockSpecs) {
    const [block] = await db.insert(blocks).values(spec).returning();
    blockIds[block.label] = block.id;
    const code = Object.entries(resourceIds).find(([, id]) => id === block.resourceId)?.[0] ?? "";
    await materializeBlock(db, {
      tenantId,
      block,
      zone: ZONE,
      unitIds: (resourceUnitCodes[code] ?? []).map((u) => unitIds[u]),
      ...(block.kind === "weekly"
        ? { from: startOfLocalDate(today, ZONE).toJSDate(), to: startOfLocalDate(addDays(horizon, 1), ZONE).toJSDate() }
        : {}),
      mode: "skip",
    });
    await db.insert(auditLog).values({
      tenantId,
      actorType: "staff",
      actorId: owner.id,
      action: "block.create",
      targetType: "block",
      targetId: block.id,
      createdAt: now,
    });
  }

  const sample: SeededTenant["bookings"] = {};
  if (withSamples) {
    const people = [
      { name: "Jordan Avery", email: "jordan.avery@example.com", phone: "(405) 555-0118" },
      { name: "Sam Patel", email: "sam.patel@example.com", phone: "(405) 555-0123" },
      { name: "Morgan Lee", email: "morgan.lee@example.com", phone: "(405) 555-0131" },
      { name: "Casey Nguyen", email: "casey.nguyen@example.com", phone: "(405) 555-0147" },
      { name: "Riley Chen", email: "riley.chen@example.com", phone: "(405) 555-0152" },
      { name: "Avery Johnson", email: "avery.johnson@example.com", phone: "(405) 555-0166" },
      { name: "Drew Martinez", email: "drew.martinez@example.com", phone: "(405) 555-0175" },
    ];
    const customerRows = await db
      .insert(customers)
      .values(people.map((p) => ({ tenantId, ...p, createdAt: now })))
      .returning({ id: customers.id });

    type Spec = {
      key: string;
      code: string;
      day: number;
      start: string;
      end: string;
      status: "requested" | "approved" | "declined";
      customer: number;
      team?: string;
      /** minutes before now the request was sent */
      requestedAgoMin: number;
      card: [string, string];
      decidedBy?: string;
      declineReason?: string;
    };
    const specs: Spec[] = [
      // Requested: deadlines about 1.5 h, 18 h and 44 h away.
      { key: "r1", code: "N1A", day: 2, start: "10:00", end: "11:30", status: "requested", customer: 0, team: "Cimarron Kickers U11", requestedAgoMin: 46 * 60 + 30, card: ["visa", "4242"] },
      { key: "r2", code: "S2B", day: 5, start: "18:00", end: "19:30", status: "requested", customer: 1, requestedAgoMin: 30 * 60, card: ["mastercard", "4444"] },
      { key: "r3", code: "Champ", day: 3, start: "17:00", end: "19:00", status: "requested", customer: 2, team: "Prairie Storm U14", requestedAgoMin: 4 * 60, card: ["visa", "1881"] },
      // Approved.
      { key: "a1", code: "N2", day: 1, start: "09:00", end: "10:30", status: "approved", customer: 3, team: "Redbud Rockets U12", requestedAgoMin: 30 * 60, card: ["visa", "4242"], decidedBy: owner.id },
      { key: "a2", code: "C1", day: 4, start: "18:00", end: "20:00", status: "approved", customer: 4, requestedAgoMin: 20 * 60, card: ["mastercard", "5100"], decidedBy: staff.id },
      { key: "a3", code: "S1", day: 6, start: "10:00", end: "12:00", status: "approved", customer: 5, team: "Logan County Lightning U9", requestedAgoMin: 8 * 60, card: ["visa", "0077"], decidedBy: staff.id },
      // Declined.
      { key: "d1", code: "N3", day: 2, start: "13:00", end: "14:00", status: "declined", customer: 6, requestedAgoMin: 10 * 60, card: ["visa", "4242"], decidedBy: staff.id, declineReason: "N3 is being reseeded that week." },
    ];
    const prices: Record<string, number> = Object.fromEntries(redbudResources().map((r) => [r.code, r.priceCentsPerHour]));
    let n = 0;
    for (const s of specs) {
      n++;
      const date = addDays(today, s.day);
      const startsAt = atLocal(date, s.start, ZONE)!;
      const endsAt = atLocal(date, s.end, ZONE)!;
      const requestedAt = new Date(now.getTime() - s.requestedAgoMin * 60_000);
      const captureBefore = new Date(requestedAt.getTime() + 7 * 24 * 3600_000);
      const priceCents = Math.round((prices[s.code] * (endsAt.getTime() - startsAt.getTime())) / 3_600_000);
      const fee = Math.floor((priceCents * 200 + 5_000) / 10_000);
      const decidedAt = s.decidedBy ? new Date(Math.min(now.getTime(), requestedAt.getTime() + 2 * 3600_000)) : null;
      const publicToken = token();
      const paymentIntentId = `pi_fake_seed_redbud_${n}`;
      const [b] = await db
        .insert(bookings)
        .values({
          tenantId,
          resourceId: resourceIds[s.code],
          customerId: customerRows[s.customer].id,
          status: s.status,
          startsAt,
          endsAt,
          priceCents,
          team: s.team ?? null,
          publicToken,
          checkoutToken: token(),
          approvalDeadlineAt: approvalDeadline(tenant, requestedAt, startsAt, captureBefore),
          waiverAcceptedAt: requestedAt,
          waiverVersion: 1,
          declineReason: s.declineReason ?? null,
          paymentStatus: s.status === "approved" ? "captured" : s.status === "requested" ? "authorized" : "canceled",
          paymentIntentId,
          applicationFeeCents: fee,
          amountCapturedCents: s.status === "approved" ? priceCents : 0,
          cardBrand: s.card[0],
          cardLast4: s.card[1],
          captureBefore,
          decidedAt,
          decidedByUserId: s.decidedBy ?? null,
          createdAt: new Date(requestedAt.getTime() - 3 * 60_000),
          updatedAt: decidedAt ?? requestedAt,
          version: s.decidedBy ? 3 : 2,
        })
        .returning({ id: bookings.id });
      sample[s.key] = { id: b.id, publicToken, paymentIntentId };
      if (s.status !== "declined") {
        await db.insert(unitOccupancy).values(
          resourceUnitCodes[s.code].map((u) => ({
            tenantId,
            unitId: unitIds[u],
            during: rangeLiteral(startsAt, endsAt),
            kind: "booking" as const,
            bookingId: b.id,
          })),
        );
      }
      const audit: (typeof auditLog.$inferInsert)[] = [
        { tenantId, actorType: "customer", actorId: customerRows[s.customer].id, action: "booking.request", targetType: "booking", targetId: b.id, createdAt: requestedAt },
      ];
      if (s.status === "approved")
        audit.push({ tenantId, actorType: "staff", actorId: s.decidedBy!, action: "booking.approve", targetType: "booking", targetId: b.id, data: { amountCents: priceCents }, createdAt: decidedAt! });
      if (s.status === "declined")
        audit.push({ tenantId, actorType: "staff", actorId: s.decidedBy!, action: "booking.decline", targetType: "booking", targetId: b.id, reason: s.declineReason, createdAt: decidedAt! });
      await db.insert(auditLog).values(audit);
    }
  }

  return {
    tenantId,
    slug: "redbud",
    ownerId: owner.id,
    staffId: staff.id,
    resources: resourceIds,
    units: unitIds,
    bookings: sample,
    blocks: blockIds,
  };
}

async function seedCedar(db: Db, now: Date, withSamples: boolean): Promise<SeededTenant> {
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: "cedar",
      name: "Cedar Park Courts",
      timeZone: ZONE,
      city: "Stillwater, OK",
      contactPhone: "(405) 555-0190",
      contactEmail: "hello@cedar.example",
      brandPrimary: "#1f4d3a",
      brandAccent: "#d98e04",
      waiverText: "Play at your own risk. Follow posted court rules.",
      bookingsEnabled: true,
      fieldsConfirmedAt: now,
      stripeAccountId: "acct_fake_cedar",
      stripeChargesEnabled: true,
      stripeDetailsSubmitted: true,
      createdAt: now,
    })
    .returning();
  const tenantId = tenant.id;
  const [owner] = await db
    .insert(users)
    .values({ tenantId, email: "owner@cedar.example", name: "Pat Kim", role: "owner" })
    .returning({ id: users.id });
  const specs: ResourceSpec[] = [1, 2].map((n) => ({
    code: `Ct${n}`,
    name: `Court ${n}`,
    groupLabel: "Courts",
    surface: "Hard court",
    priceCentsPerHour: 4000,
    units: [`Ct${n}`],
    sortOrder: n * 10,
  }));
  const { resourceIds, unitIds } = await insertResources(db, tenantId, specs);
  await db.insert(operatingHours).values(
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ tenantId, resourceId: null, weekday, opensAt: "08:00", closesAt: "22:00" })),
  );
  const sample: SeededTenant["bookings"] = {};
  if (withSamples) {
    const [customer] = await db
      .insert(customers)
      .values({ tenantId, name: "Lee Walker", email: "lee.walker@example.com", phone: "(405) 555-0191", createdAt: now })
      .returning({ id: customers.id });
    const date = addDays(localDate(now, ZONE), 2);
    const startsAt = atLocal(date, "18:00", ZONE)!;
    const endsAt = atLocal(date, "19:00", ZONE)!;
    const publicToken = token();
    const [b] = await db
      .insert(bookings)
      .values({
        tenantId,
        resourceId: resourceIds.Ct1,
        customerId: customer.id,
        status: "approved",
        startsAt,
        endsAt,
        priceCents: 4000,
        publicToken,
        waiverAcceptedAt: now,
        waiverVersion: 1,
        paymentStatus: "captured",
        paymentIntentId: "pi_fake_seed_cedar_1",
        applicationFeeCents: 80,
        amountCapturedCents: 4000,
        cardBrand: "visa",
        cardLast4: "4242",
        decidedAt: now,
        decidedByUserId: owner.id,
        createdAt: now,
        version: 3,
      })
      .returning({ id: bookings.id });
    await db.insert(unitOccupancy).values({
      tenantId,
      unitId: unitIds.Ct1,
      during: rangeLiteral(startsAt, endsAt),
      kind: "booking",
      bookingId: b.id,
    });
    sample.a1 = { id: b.id, publicToken, paymentIntentId: "pi_fake_seed_cedar_1" };
  }
  return {
    tenantId,
    slug: "cedar",
    ownerId: owner.id,
    staffId: null,
    resources: resourceIds,
    units: unitIds,
    bookings: sample,
    blocks: {},
  };
}
