-- Tymo hand-written SQL. Applied by runMigrations() (src/server/db/client.ts)
-- after the drizzle-kit migrations, on EVERY run, so every statement here
-- must be idempotent. See docs/ARCHITECTURE.md (double booking, tenant isolation).

-- 1. Double booking is impossible at the database level.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unit_occupancy_no_overlap') THEN
    ALTER TABLE unit_occupancy ADD CONSTRAINT unit_occupancy_no_overlap
      EXCLUDE USING gist (tenant_id WITH =, unit_id WITH =, during WITH &&);
  END IF;
  -- An empty or unbounded range would slip past the exclusion constraint.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unit_occupancy_during_bounded') THEN
    ALTER TABLE unit_occupancy ADD CONSTRAINT unit_occupancy_during_bounded
      CHECK (NOT isempty(during) AND NOT lower_inf(during) AND NOT upper_inf(during));
  END IF;
END $$;

-- 2. The application role. withTenant() runs SET LOCAL ROLE tymo_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tymo_app') THEN
    CREATE ROLE tymo_app NOLOGIN;
  END IF;
END $$;

-- The connecting role must be able to SET ROLE tymo_app (no-op for superusers).
DO $$
BEGIN
  EXECUTE format('GRANT tymo_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

GRANT USAGE ON SCHEMA public TO tymo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tymo_app;
-- The audit log is append-only for the app.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM tymo_app;

-- 3. Row-level security on every tenant-owned table, except the ones that are
--    read before a tenant is known (always filtered in code).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('tenants', 'users', 'staff_sessions', 'magic_links', 'stripe_events')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO tymo_app '
      'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t.table_name
    );
    -- The migrating role (the table owner, used by withSystem, seed and
    -- migrations) keeps access despite FORCE. tymo_app is not a member of it.
    EXECUTE format('DROP POLICY IF EXISTS system_access ON %I', t.table_name);
    EXECUTE format(
      'CREATE POLICY system_access ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
      t.table_name,
      current_user
    );
  END LOOP;
END $$;
