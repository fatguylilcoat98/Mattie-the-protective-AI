-- ============================================================================
-- Lylo synthetic test schema
-- ============================================================================
--
-- Purpose: Minimal schema sufficient to exercise the visibility model from
--          docs/lylo-memory-privacy-model.md against a throwaway Postgres.
--
-- Intentional differences from production-target schema:
--   - Compact: only the columns the tests assert on.
--   - Uses TEXT for role/visibility enums instead of CREATE TYPE, so the
--     schema is one file and easy to read.
--   - No triggers for updated_at (tests don't assert on it).
--   - No Pinecone sync table (out of scope for RLS matrix).
--
-- The RLS policy SHAPE here mirrors what PR E will ship in production
-- (`db/migrations/031_rls_memory_store.sql` etc.). If the policies here
-- diverge from production, the matrix tests will diverge too. PR E's
-- description will diff the two.
--
-- Not for production. Do not load against a live database.
-- ============================================================================

DROP SCHEMA IF EXISTS lylo_test CASCADE;
CREATE SCHEMA lylo_test;
SET search_path TO lylo_test;

-- ----------------------------------------------------------------------------
-- Roles (created in the public catalog, not in the schema)
-- ----------------------------------------------------------------------------

-- We use the SET LOCAL app.user_role pattern rather than real Postgres
-- roles, because the synthetic test runs against a single superuser
-- connection and RLS policies key off of session GUC values. The
-- production design (PR E) uses real Postgres roles via SET LOCAL
-- session_authorization; the policy shape is the same.

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

CREATE TABLE pilot_instances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  username            TEXT NOT NULL,
  role                TEXT NOT NULL
    CHECK (role IN ('senior', 'family', 'caregiver', 'admin', 'system')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pilot_instance_id, username)
);

CREATE TABLE family_contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  senior_user_id      UUID NOT NULL REFERENCES users(id),
  contact_user_id     UUID NOT NULL REFERENCES users(id),
  permission_scope    JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (senior_user_id, contact_user_id)
);

CREATE TABLE memory_vault_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);

CREATE TABLE memory_store (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  owning_user_id      UUID NOT NULL REFERENCES users(id),
  content             TEXT NOT NULL,
  provenance          TEXT NOT NULL
    CHECK (provenance IN (
      'USER_STATED','VERIFIED_FACT','INFERRED','GENERATED',
      'SYSTEM_EVENT','ADMIN_APPROVED'
    )),
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  vault_id            UUID,  -- not enforced in the synthetic schema
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_visibility_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id           UUID NOT NULL REFERENCES memory_store(id),
  event_type          TEXT NOT NULL
    CHECK (event_type IN (
      'visibility_changed','visibility_read',
      'vault_unlock_attempt','vault_unlock_success','vault_unlock_failure',
      'vault_session_expired','export_filtered','family_view'
    )),
  actor_user_id       UUID REFERENCES users(id),
  actor_role          TEXT NOT NULL,
  old_visibility      TEXT,
  new_visibility      TEXT,
  reason              TEXT,
  outcome             TEXT NOT NULL
    CHECK (outcome IN ('allowed','denied','masked','partial')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Helper: read the current session's user_id and role from GUCs.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN current_setting('app.user_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION current_app_user_role() RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN current_setting('app.user_role', true);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION has_active_vault_session(p_user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM lylo_test.memory_vault_sessions
    WHERE user_id = p_user
      AND now() BETWEEN unlocked_at AND expires_at
      AND revoked_at IS NULL
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS policies on memory_store
--
-- Mirrors docs/lylo-memory-privacy-model.md §5.1.
--
--  senior     : sees own rows; password_locked requires active vault
--               session for the senior.
--  family     : sees only family_shared rows of the senior they are
--               linked to via family_contacts, scoped by permission_scope.
--               private and password_locked are INVISIBLE.
--  caregiver  : same shape as family; permission_scope defaults empty.
--  admin      : sees row metadata. Reading `content` is gated through
--               a separate view that this synthetic schema models with a
--               restricted SELECT (admin policy here returns no rows on
--               SELECT against the base table for protected rows; admins
--               must use admin_memory_store_view).
--  system     : sees family_shared. May see private only when context
--               is 'outbound_message_to_self'. May NEVER see
--               password_locked.
--
-- The matrix tests assert exactly these expected counts.
-- ----------------------------------------------------------------------------

ALTER TABLE memory_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_store FORCE ROW LEVEL SECURITY;

CREATE POLICY memory_store_senior_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'senior'
  AND owning_user_id = current_app_user_id()
  AND (
    visibility_level IN ('private', 'family_shared')
    OR (
      visibility_level = 'password_locked'
      AND has_active_vault_session(owning_user_id)
    )
  )
);

CREATE POLICY memory_store_family_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'family'
  AND visibility_level = 'family_shared'
  AND EXISTS (
    SELECT 1 FROM lylo_test.family_contacts fc
    WHERE fc.senior_user_id  = memory_store.owning_user_id
      AND fc.contact_user_id = current_app_user_id()
      AND (fc.permission_scope->'visibility_levels' ? 'family_shared'
           OR fc.permission_scope = '{}'::jsonb)
  )
);

CREATE POLICY memory_store_caregiver_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'caregiver'
  AND visibility_level = 'family_shared'
  AND EXISTS (
    SELECT 1 FROM lylo_test.family_contacts fc
    WHERE fc.senior_user_id  = memory_store.owning_user_id
      AND fc.contact_user_id = current_app_user_id()
      AND fc.permission_scope->'visibility_levels' ? 'family_shared'
  )
);

CREATE POLICY memory_store_admin_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'admin'
  AND visibility_level NOT IN ('private','password_locked')
);

CREATE POLICY memory_store_system_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'system'
  AND visibility_level IN ('family_shared')
);

-- ----------------------------------------------------------------------------
-- RLS policies on memory_visibility_audit_log: append-only for app roles.
-- ----------------------------------------------------------------------------

ALTER TABLE memory_visibility_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_visibility_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY visibility_audit_select_admin ON memory_visibility_audit_log
FOR SELECT USING (current_app_user_role() = 'admin');

CREATE POLICY visibility_audit_select_own ON memory_visibility_audit_log
FOR SELECT USING (
  current_app_user_role() = 'senior'
  AND actor_user_id = current_app_user_id()
);

CREATE POLICY visibility_audit_insert_any ON memory_visibility_audit_log
FOR INSERT WITH CHECK (true);

-- No UPDATE policy. No DELETE policy. Append-only by absence.
