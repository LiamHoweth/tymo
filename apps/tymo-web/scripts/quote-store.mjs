import { randomUUID } from "node:crypto";
import pg from "pg";

/** Startup schema: idempotent, run under an advisory lock by every instance. */
export const schema = `
  CREATE TABLE IF NOT EXISTS public.tymo_quote_requests (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    name varchar(100) NOT NULL,
    business varchar(140) NOT NULL,
    business_type varchar(100) NOT NULL,
    email varchar(254) NOT NULL,
    phone varchar(40),
    message varchar(2000)
  );
  CREATE INDEX IF NOT EXISTS tymo_quote_requests_received
    ON public.tymo_quote_requests (created_at DESC, id DESC);
  -- The request email's outcome (see quote-notify.mjs emailRecord): null until recorded.
  ALTER TABLE public.tymo_quote_requests
    ADD COLUMN IF NOT EXISTS email_status varchar(20),
    ADD COLUMN IF NOT EXISTS email_detail varchar(200),
    ADD COLUMN IF NOT EXISTS email_to varchar(500),
    ADD COLUMN IF NOT EXISTS email_at timestamptz;
  -- Company intake (demo) requests share this table: kind says which form sent the row.
  -- kind: 'quote' | 'company_intake'. Quote rows leave the intake answers null and
  -- intake rows leave business_type, phone and message null.
  ALTER TABLE public.tymo_quote_requests
    ADD COLUMN IF NOT EXISTS kind varchar(30) NOT NULL DEFAULT 'quote',
    ADD COLUMN IF NOT EXISTS website varchar(300),
    ADD COLUMN IF NOT EXISTS offerings varchar(4000),
    ADD COLUMN IF NOT EXISTS booking_workflow varchar(4000),
    ADD COLUMN IF NOT EXISTS availability varchar(3000),
    ADD COLUMN IF NOT EXISTS pricing_and_policies varchar(3000),
    ADD COLUMN IF NOT EXISTS demo_priorities varchar(3000);
  -- Widen business and name to the intake form's limits. Only ever widens, so reruns are no-ops.
  DO $$
  DECLARE
    business_length integer;
    name_length integer;
    business_type_nullable text;
  BEGIN
    SELECT character_maximum_length INTO business_length FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tymo_quote_requests' AND column_name = 'business';
    SELECT character_maximum_length INTO name_length FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tymo_quote_requests' AND column_name = 'name';
    SELECT is_nullable INTO business_type_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tymo_quote_requests' AND column_name = 'business_type';
    IF business_length < 160 THEN
      ALTER TABLE public.tymo_quote_requests ALTER COLUMN business TYPE varchar(160);
    END IF;
    IF name_length < 120 THEN
      ALTER TABLE public.tymo_quote_requests ALTER COLUMN name TYPE varchar(120);
    END IF;
    IF business_type_nullable = 'NO' THEN
      ALTER TABLE public.tymo_quote_requests ALTER COLUMN business_type DROP NOT NULL;
    END IF;
  END $$;
`;

/** Every column, in the row contract's order (the admin pages read these). */
export const columns = [
  "id", "created_at", "kind", "name", "business", "business_type", "email", "phone", "message",
  "website", "offerings", "booking_workflow", "availability", "pricing_and_policies", "demo_priorities",
  "email_status", "email_detail", "email_to", "email_at",
].join(", ");

export const intakeInsert = `INSERT INTO public.tymo_quote_requests
  (id, kind, name, business, email, website, offerings, booking_workflow, availability, pricing_and_policies, demo_priorities)
  VALUES ($1, 'company_intake', $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO NOTHING`;

/** intakeInsert's parameters from a validated intake (see intake-http.mjs); blank optional answers become null. */
export function intakeValues(intake) {
  return [
    intake.id ?? randomUUID(),
    intake.name,
    intake.business,
    intake.email,
    intake.website || null,
    intake.offerings,
    intake.bookingWorkflow,
    intake.availability || null,
    intake.pricingAndPolicies || null,
    intake.demoPriorities || null,
  ];
}

async function createSchema(pool) {
  const client = await pool.connect();
  let failure;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('tymo:quote-schema'))");
    await client.query(schema);
    await client.query("COMMIT");
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // Failed migrations discard the connection, rolling back its transaction.
    client.release(failure);
  }
}

/** This store connects only to the dedicated Tymo marketing database. */
export function openQuoteStore(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  });
  pool.on("error", () => console.warn("[quotes] Idle database connection closed unexpectedly."));

  let initialized;
  function initialize() {
    initialized ??= createSchema(pool).catch((error) => {
      initialized = undefined;
      throw error;
    });
    return initialized;
  }

  return {
    initialize,
    async ready() {
      await initialize();
      await pool.query("SELECT id FROM public.tymo_quote_requests LIMIT 0");
    },
    /** Resolves true when this saved a new request, false for a retried form (same id). */
    async save({ id, name, business, businessType, email, phone, message }) {
      await initialize();
      const result = await pool.query(
        `INSERT INTO public.tymo_quote_requests (id, kind, name, business, business_type, email, phone, message)
         VALUES ($1, 'quote', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [id ?? randomUUID(), name, business, businessType, email, phone, message],
      );
      return result.rowCount > 0;
    },
    /** Saves a company intake (demo request). Resolves true for a new row, false for a retried form (same id). */
    async saveIntake(intake) {
      await initialize();
      const result = await pool.query(intakeInsert, intakeValues(intake));
      return result.rowCount > 0;
    },
    async list(limit) {
      const result = await pool.query(
        `SELECT ${columns} FROM public.tymo_quote_requests ORDER BY created_at DESC, id DESC LIMIT $1`,
        [limit],
      );
      return result.rows;
    },
    /** One request by id, or null. */
    async get(id) {
      const result = await pool.query(`SELECT ${columns} FROM public.tymo_quote_requests WHERE id = $1`, [id]);
      return result.rows[0] ?? null;
    },
    /** Saves how the request email went: { status, detail, to } from emailRecord, stamped now. */
    async recordEmail(id, { status, detail, to }) {
      await initialize();
      await pool.query(
        `UPDATE public.tymo_quote_requests
         SET email_status = $2, email_detail = $3, email_to = $4, email_at = now()
         WHERE id = $1`,
        [id, status, detail, to],
      );
    },
    close: () => pool.end(),
  };
}
