import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { columns, intakeInsert, intakeValues, openQuoteStore, schema } from "./quote-store.mjs";

const intake = {
  id: "3f9c1a2b-7d4e-4c8f-a1b2-c3d4e5f60718",
  kind: "company_intake",
  business: "Example Fieldhouse",
  name: "Avery Tester",
  email: "avery@example.test",
  website: "example.test/book",
  offerings: "Two turf fields",
  bookingWorkflow: "Email, then a call",
  availability: null,
  pricingAndPolicies: "Half up front",
  demoPriorities: "",
};

test("lists and gets every column of the row contract, in order", () => {
  assert.equal(columns, [
    "id", "created_at", "kind", "name", "business", "business_type", "email", "phone", "message",
    "website", "offerings", "booking_workflow", "availability", "pricing_and_policies", "demo_priorities",
    "email_status", "email_detail", "email_to", "email_at",
  ].join(", "));
});

test("extends the quote table additively, and only ever widens", () => {
  for (const statement of [
    "ADD COLUMN IF NOT EXISTS kind varchar(30) NOT NULL DEFAULT 'quote'",
    "ADD COLUMN IF NOT EXISTS website varchar(300)",
    "ADD COLUMN IF NOT EXISTS offerings varchar(4000)",
    "ADD COLUMN IF NOT EXISTS booking_workflow varchar(4000)",
    "ADD COLUMN IF NOT EXISTS availability varchar(3000)",
    "ADD COLUMN IF NOT EXISTS pricing_and_policies varchar(3000)",
    "ADD COLUMN IF NOT EXISTS demo_priorities varchar(3000)",
    "ADD COLUMN IF NOT EXISTS email_status varchar(20)",
  ]) {
    assert.ok(schema.includes(statement), statement);
  }
  assert.match(schema, /IF business_length < 160 THEN\s+ALTER TABLE public\.tymo_quote_requests ALTER COLUMN business TYPE varchar\(160\);/);
  assert.match(schema, /IF name_length < 120 THEN\s+ALTER TABLE public\.tymo_quote_requests ALTER COLUMN name TYPE varchar\(120\);/);
  assert.match(schema, /IF business_type_nullable = 'NO' THEN\s+ALTER TABLE public\.tymo_quote_requests ALTER COLUMN business_type DROP NOT NULL;/);
  assert.doesNotMatch(schema, /DROP (?:TABLE|COLUMN|INDEX)|RENAME|SET NOT NULL/i);
});

test("maps a validated intake to the insert's parameters, blank optional answers as null", () => {
  assert.match(intakeInsert, /VALUES \(\$1, 'company_intake', \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10\)\s+ON CONFLICT \(id\) DO NOTHING$/);
  assert.deepEqual(intakeValues(intake), [
    intake.id, "Avery Tester", "Example Fieldhouse", "avery@example.test", "example.test/book",
    "Two turf fields", "Email, then a call", null, "Half up front", null,
  ]);
  const [generated, ...rest] = intakeValues({ ...intake, id: null, website: "" });
  assert.match(generated, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.equal(rest[3], null);
});

test("prepares the schema once under the advisory lock, saves intakes once per id and reads full rows", async (t) => {
  const log = [];
  let rowCount = 1;
  const client = {
    query: async (text) => { log.push(text); return {}; },
    release: (error) => { log.push(error ? "RELEASE (discarded)" : "RELEASE"); },
  };
  t.mock.method(pg.Pool.prototype, "connect", async () => client);
  t.mock.method(pg.Pool.prototype, "query", async (text, values) => {
    log.push({ text, values });
    return { rowCount, rows: [{ id: intake.id, kind: "company_intake" }] };
  });
  const store = openQuoteStore("postgres://tester@127.0.0.1:1/example");
  t.after(() => store.close());

  assert.equal(await store.saveIntake(intake), true);
  rowCount = 0;
  assert.equal(await store.saveIntake(intake), false, "a retried form saves nothing new");
  assert.deepEqual(log.slice(0, 5), [
    "BEGIN", "SELECT pg_advisory_xact_lock(hashtext('tymo:quote-schema'))", schema, "COMMIT", "RELEASE",
  ]);
  assert.deepEqual(log[5], { text: intakeInsert, values: intakeValues(intake) });
  assert.equal(log.filter((entry) => entry === schema).length, 1, "the schema runs once per process");

  await store.save({ id: intake.id, name: "Avery Tester", business: "Example Rink", businessType: "Sports facility", email: "avery@example.test", phone: null, message: null });
  assert.match(log.at(-1).text, /\(id, kind, name, business, business_type, email, phone, message\)\s+VALUES \(\$1, 'quote', /);

  assert.deepEqual(await store.list(5), [{ id: intake.id, kind: "company_intake" }]);
  assert.deepEqual(log.at(-1), {
    text: `SELECT ${columns} FROM public.tymo_quote_requests ORDER BY created_at DESC, id DESC LIMIT $1`, values: [5],
  });
  await store.get(intake.id);
  assert.deepEqual(log.at(-1), { text: `SELECT ${columns} FROM public.tymo_quote_requests WHERE id = $1`, values: [intake.id] });
});
