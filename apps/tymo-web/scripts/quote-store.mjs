import { randomUUID } from "node:crypto";
import pg from "pg";

const schema = `
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
`;

const columns = "id, created_at, name, business, business_type, email, phone, message, email_status, email_detail, email_to, email_at";

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
        `INSERT INTO public.tymo_quote_requests (id, name, business, business_type, email, phone, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [id ?? randomUUID(), name, business, businessType, email, phone, message],
      );
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
