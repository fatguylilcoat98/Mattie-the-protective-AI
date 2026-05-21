-- ============================================================================
-- Lylo synthetic test schema (hardened)
-- ============================================================================
--
-- Purpose: Minimal schema sufficient to exercise the visibility model from
--          docs/lylo-memory-privacy-model.md against a throwaway Postgres.
--
-- This is the binding RLS / privacy contract that PR E will implement against
-- the live database. Every policy, trigger, and constraint here is the
-- intended production shape (modulo Postgres-role plumbing).
--
-- Hardening fixes (from the PR #20 review):
--   1. Seeder-safe policies (a `seeder` role can do everything; tests use it
--      only during setup, never during assertions).
--   2. Senior INSERT/UPDATE on memory_store (own rows, own pilot only).
--   3. Audit-log INSERT requires actor_user_id = self AND actor_role = self.
--   4. memory_visibility_audit_log.actor_user_id is NOT NULL.
--   5. Every policy filters on pilot_instance_id from app.pilot_instance_id.
--   6. System role can read `private` only when app.compose_target_user_id
--      is set to a real user_id in the same pilot. Audit row required.
--   7. Family permission_scope is default-deny: empty/missing scope means
--      "not yet granted", not "allow all".
--   8. Senior audit-log SELECT returns rows about their own memories AND
--      rows where they are the actor.
--   9. New tables: episodes, memory_summaries, reflection_archive,
--      outbound_messages, memory_vaults.
--
-- Not for production. Do not load against a live database.
-- ============================================================================

DROP SCHEMA IF EXISTS lylo_test CASCADE;
CREATE SCHEMA lylo_test;
SET search_path TO lylo_test;

-- ============================================================================
-- 1. GUC accessors
-- ============================================================================

CREATE FUNCTION current_app_user_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN current_setting('app.user_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

CREATE FUNCTION current_app_user_role() RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN current_setting('app.user_role', true);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

CREATE FUNCTION current_app_pilot_instance_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN current_setting('app.pilot_instance_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

CREATE FUNCTION current_app_compose_target_user_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN current_setting('app.compose_target_user_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

-- ============================================================================
-- 2. Tables
-- ============================================================================

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
  -- Default-deny scope: empty array means "no visibility levels granted".
  -- The senior must explicitly populate visibility_levels for the contact
  -- to see any rows. This matches caregiver semantics and avoids the
  -- accidental-leak pattern of "empty scope = allow all".
  permission_scope    JSONB NOT NULL DEFAULT '{"visibility_levels": []}'::jsonb,
  UNIQUE (senior_user_id, contact_user_id)
);

CREATE TABLE memory_vaults (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id       UUID NOT NULL REFERENCES pilot_instances(id),
  user_id                 UUID NOT NULL REFERENCES users(id) UNIQUE,
  pin_hash                TEXT NOT NULL,
  pin_salt                TEXT NOT NULL,
  lockout_until           TIMESTAMPTZ,
  failed_attempt_count    INT NOT NULL DEFAULT 0,
  last_unlocked_at        TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_vault_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id      UUID NOT NULL REFERENCES memory_vaults(id) ON DELETE CASCADE,
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
  vault_id            UUID REFERENCES memory_vaults(id),
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A password_locked row must reference a vault.
  CHECK (visibility_level <> 'password_locked' OR vault_id IS NOT NULL)
);

CREATE TABLE memory_visibility_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  memory_id           UUID NOT NULL REFERENCES memory_store(id),
  event_type          TEXT NOT NULL
    CHECK (event_type IN (
      'visibility_changed','visibility_read',
      'vault_unlock_attempt','vault_unlock_success','vault_unlock_failure',
      'vault_session_expired','export_filtered','family_view'
    )),
  actor_user_id       UUID NOT NULL REFERENCES users(id),
  actor_role          TEXT NOT NULL
    CHECK (actor_role IN ('senior','family','caregiver','admin','system','seeder')),
  old_visibility      TEXT,
  new_visibility      TEXT,
  reason              TEXT,
  outcome             TEXT NOT NULL
    CHECK (outcome IN ('allowed','denied','masked','partial')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE episodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  owning_user_id      UUID NOT NULL REFERENCES users(id),
  summary             TEXT NOT NULL,
  source_memory_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
  -- Populated by inheritance trigger; settable explicitly for tests.
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  requires_recompute  BOOLEAN NOT NULL DEFAULT false,
  superseded_by       UUID REFERENCES episodes(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_summaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  owning_user_id      UUID NOT NULL REFERENCES users(id),
  summary             TEXT NOT NULL,
  source_memory_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  requires_recompute  BOOLEAN NOT NULL DEFAULT false,
  superseded_by       UUID REFERENCES memory_summaries(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reflection_archive (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  owning_user_id      UUID NOT NULL REFERENCES users(id),
  content             TEXT NOT NULL,
  source_memory_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbound_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  target_user_id      UUID NOT NULL REFERENCES users(id),
  body                TEXT NOT NULL,
  used_memory_ids     UUID[] NOT NULL DEFAULT '{}'::uuid[],
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  status              TEXT NOT NULL DEFAULT 'drafted'
    CHECK (status IN ('drafted','sent','aborted')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. Inheritance helpers + triggers
-- ============================================================================

-- Returns the most-restrictive visibility across a set of source memory ids.
-- Ranking (most restrictive first): password_locked > private > family_shared.
CREATE FUNCTION compute_inherited_visibility(p_source_memory_ids UUID[])
RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result TEXT;
BEGIN
  IF p_source_memory_ids IS NULL OR array_length(p_source_memory_ids, 1) IS NULL THEN
    -- No sources: caller's chosen visibility stands.
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM lylo_test.memory_store m
    WHERE m.id = ANY(p_source_memory_ids)
      AND m.visibility_level = 'password_locked'
  ) THEN
    RETURN 'password_locked';
  END IF;
  IF EXISTS (
    SELECT 1 FROM lylo_test.memory_store m
    WHERE m.id = ANY(p_source_memory_ids)
      AND m.visibility_level = 'private'
  ) THEN
    RETURN 'private';
  END IF;
  RETURN 'family_shared';
END $$;

CREATE FUNCTION trg_apply_inherited_visibility() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_inherited TEXT;
BEGIN
  v_inherited := lylo_test.compute_inherited_visibility(NEW.source_memory_ids);
  IF v_inherited IS NOT NULL THEN
    NEW.visibility_level := v_inherited;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER episodes_inherit_visibility
  BEFORE INSERT OR UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION trg_apply_inherited_visibility();

CREATE TRIGGER memory_summaries_inherit_visibility
  BEFORE INSERT OR UPDATE ON memory_summaries
  FOR EACH ROW EXECUTE FUNCTION trg_apply_inherited_visibility();

CREATE TRIGGER reflection_archive_inherit_visibility
  BEFORE INSERT OR UPDATE ON reflection_archive
  FOR EACH ROW EXECUTE FUNCTION trg_apply_inherited_visibility();

-- outbound_messages also inherits, but additionally enforces that a
-- private or password_locked draft must be addressed to the owning senior.
CREATE FUNCTION trg_outbound_messages_enforce() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_inherited TEXT;
  v_first_owner UUID;
BEGIN
  v_inherited := lylo_test.compute_inherited_visibility(NEW.used_memory_ids);
  IF v_inherited IS NOT NULL THEN
    NEW.visibility_level := v_inherited;
  END IF;

  IF NEW.visibility_level IN ('private','password_locked')
     AND array_length(NEW.used_memory_ids, 1) > 0 THEN
    -- All used memories must be owned by the same user, and the target must be
    -- that user. This is the "senior-addressed only" rule.
    SELECT owning_user_id INTO v_first_owner
    FROM lylo_test.memory_store WHERE id = NEW.used_memory_ids[1];
    IF EXISTS (
      SELECT 1 FROM lylo_test.memory_store
      WHERE id = ANY(NEW.used_memory_ids)
        AND owning_user_id IS DISTINCT FROM v_first_owner
    ) THEN
      RAISE EXCEPTION 'outbound_messages: private/locked drafts cannot mix owners';
    END IF;
    IF NEW.target_user_id IS DISTINCT FROM v_first_owner THEN
      RAISE EXCEPTION 'outbound_messages: private/locked drafts must target the owning senior, not %', NEW.target_user_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER outbound_messages_enforce
  BEFORE INSERT OR UPDATE ON outbound_messages
  FOR EACH ROW EXECUTE FUNCTION trg_outbound_messages_enforce();

-- ============================================================================
-- 4. Vault helpers + lockout enforcement
-- ============================================================================

CREATE FUNCTION has_active_vault_session(p_user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM lylo_test.memory_vault_sessions
    WHERE user_id = p_user
      AND now() BETWEEN unlocked_at AND expires_at
      AND revoked_at IS NULL
  );
$$;

-- Records a failed PIN attempt. After max_attempts consecutive failures,
-- the vault is locked for lockout_minutes. Returns the new state.
CREATE FUNCTION record_failed_unlock(
  p_vault_id UUID,
  p_max_attempts INT DEFAULT 5,
  p_lockout_minutes INT DEFAULT 30
) RETURNS TABLE (failed_attempt_count INT, lockout_until TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE lylo_test.memory_vaults
  SET
    failed_attempt_count = memory_vaults.failed_attempt_count + 1,
    lockout_until = CASE
      WHEN memory_vaults.failed_attempt_count + 1 >= p_max_attempts
      THEN now() + (p_lockout_minutes || ' minutes')::interval
      ELSE memory_vaults.lockout_until
    END,
    updated_at = now()
  WHERE id = p_vault_id
  RETURNING memory_vaults.failed_attempt_count, memory_vaults.lockout_until;
END $$;

CREATE FUNCTION record_successful_unlock(p_vault_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE lylo_test.memory_vaults
  SET
    failed_attempt_count = 0,
    lockout_until = NULL,
    last_unlocked_at = now(),
    updated_at = now()
  WHERE id = p_vault_id;
END $$;

-- Enforce: a session row cannot be inserted while the vault is locked out.
CREATE FUNCTION trg_vault_session_lockout_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_lockout TIMESTAMPTZ;
BEGIN
  SELECT lockout_until INTO v_lockout
  FROM lylo_test.memory_vaults WHERE id = NEW.vault_id;
  IF v_lockout IS NOT NULL AND v_lockout > now() THEN
    RAISE EXCEPTION 'vault % is locked until %', NEW.vault_id, v_lockout
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER vault_session_lockout_check
  BEFORE INSERT ON memory_vault_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_vault_session_lockout_check();

-- ============================================================================
-- 5. Visibility-change audit trigger
-- ============================================================================

CREATE FUNCTION trg_memory_store_visibility_change_audit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.visibility_level IS DISTINCT FROM NEW.visibility_level THEN
    INSERT INTO lylo_test.memory_visibility_audit_log
      (pilot_instance_id, memory_id, event_type,
       actor_user_id, actor_role,
       old_visibility, new_visibility, reason, outcome)
    VALUES (
      NEW.pilot_instance_id, NEW.id, 'visibility_changed',
      coalesce(lylo_test.current_app_user_id(), NEW.owning_user_id),
      coalesce(lylo_test.current_app_user_role(), 'system'),
      OLD.visibility_level, NEW.visibility_level,
      current_setting('app.visibility_change_reason', true),
      'allowed'
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER memory_store_visibility_change_audit
  AFTER UPDATE OF visibility_level ON memory_store
  FOR EACH ROW EXECUTE FUNCTION trg_memory_store_visibility_change_audit();

-- ============================================================================
-- 6. RLS: enable + FORCE on every table
-- ============================================================================

ALTER TABLE pilot_instances              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_instances              FORCE  ROW LEVEL SECURITY;
ALTER TABLE users                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                        FORCE  ROW LEVEL SECURITY;
ALTER TABLE family_contacts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_contacts              FORCE  ROW LEVEL SECURITY;
ALTER TABLE memory_vaults                ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_vaults                FORCE  ROW LEVEL SECURITY;
ALTER TABLE memory_vault_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_vault_sessions        FORCE  ROW LEVEL SECURITY;
ALTER TABLE memory_store                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_store                 FORCE  ROW LEVEL SECURITY;
ALTER TABLE memory_visibility_audit_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_visibility_audit_log  FORCE  ROW LEVEL SECURITY;
ALTER TABLE episodes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes                     FORCE  ROW LEVEL SECURITY;
ALTER TABLE memory_summaries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summaries             FORCE  ROW LEVEL SECURITY;
ALTER TABLE reflection_archive           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflection_archive           FORCE  ROW LEVEL SECURITY;
ALTER TABLE outbound_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_messages            FORCE  ROW LEVEL SECURITY;

-- ============================================================================
-- 7. Seeder policies (test-only)
--
-- The synthetic test suite needs to bootstrap data. The seeder uses
-- SET LOCAL app.user_role = 'seeder' in a setup transaction. The seeder is
-- NEVER used during assertions; tests use senior/family/caregiver/admin/
-- system roles, which have their own narrower policies.
-- ============================================================================

CREATE POLICY seeder_all ON pilot_instances             FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON users                       FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON family_contacts             FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON memory_vaults               FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON memory_vault_sessions       FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON memory_store                FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON memory_visibility_audit_log FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON episodes                    FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON memory_summaries            FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON reflection_archive          FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');
CREATE POLICY seeder_all ON outbound_messages           FOR ALL TO PUBLIC
  USING (current_app_user_role() = 'seeder') WITH CHECK (current_app_user_role() = 'seeder');

-- ============================================================================
-- 8. Lookup tables (pilot_instances, users, family_contacts, vaults, sessions)
--
-- These tables are read by the RLS policies on memory_store and friends, so
-- the application roles need narrow read access for the lookups to work
-- inside policy evaluation.
-- ============================================================================

CREATE POLICY pilot_instances_session_pilot ON pilot_instances FOR SELECT
USING (id = current_app_pilot_instance_id());

CREATE POLICY users_session_pilot ON users FOR SELECT
USING (pilot_instance_id = current_app_pilot_instance_id());

CREATE POLICY family_contacts_session_pilot ON family_contacts FOR SELECT
USING (pilot_instance_id = current_app_pilot_instance_id());

CREATE POLICY memory_vaults_senior_self ON memory_vaults FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND (
    (current_app_user_role() = 'senior' AND user_id = current_app_user_id())
    OR current_app_user_role() = 'admin'
  )
);

CREATE POLICY memory_vault_sessions_senior_self ON memory_vault_sessions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM lylo_test.memory_vaults v
    WHERE v.id = memory_vault_sessions.vault_id
      AND v.pilot_instance_id = current_app_pilot_instance_id()
      AND (
        (current_app_user_role() = 'senior' AND v.user_id = current_app_user_id())
        OR current_app_user_role() = 'admin'
      )
  )
);

-- ============================================================================
-- 9. memory_store policies
-- ============================================================================

-- Senior SELECT: own pilot, own rows, with visibility constraints.
CREATE POLICY memory_store_senior_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND owning_user_id = current_app_user_id()
  AND active = true
  AND (
    visibility_level IN ('private', 'family_shared')
    OR (
      visibility_level = 'password_locked'
      AND has_active_vault_session(owning_user_id)
    )
  )
);

-- Senior INSERT: own pilot, own user as owner.
CREATE POLICY memory_store_senior_insert ON memory_store FOR INSERT
WITH CHECK (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND owning_user_id = current_app_user_id()
);

-- Senior UPDATE: own pilot, own rows. Includes visibility changes.
CREATE POLICY memory_store_senior_update ON memory_store FOR UPDATE
USING (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND owning_user_id = current_app_user_id()
)
WITH CHECK (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND owning_user_id = current_app_user_id()
);

-- Family SELECT: pilot-scoped, family_shared only, granted by explicit
-- permission_scope. Default-deny: empty visibility_levels means "not granted".
CREATE POLICY memory_store_family_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'family'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND active = true
  AND visibility_level = 'family_shared'
  AND EXISTS (
    SELECT 1 FROM lylo_test.family_contacts fc
    WHERE fc.senior_user_id  = memory_store.owning_user_id
      AND fc.contact_user_id = current_app_user_id()
      AND fc.pilot_instance_id = current_app_pilot_instance_id()
      AND fc.permission_scope->'visibility_levels' ? 'family_shared'
  )
);

-- Caregiver SELECT: same shape as family. Default-deny by design.
CREATE POLICY memory_store_caregiver_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'caregiver'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND active = true
  AND visibility_level = 'family_shared'
  AND EXISTS (
    SELECT 1 FROM lylo_test.family_contacts fc
    WHERE fc.senior_user_id  = memory_store.owning_user_id
      AND fc.contact_user_id = current_app_user_id()
      AND fc.pilot_instance_id = current_app_pilot_instance_id()
      AND fc.permission_scope->'visibility_levels' ? 'family_shared'
  )
);

-- Admin SELECT: pilot-scoped, family_shared content only. Private and
-- password_locked content is invisible at the base table. (A redacted
-- admin view for metadata-only access to those rows will land alongside
-- PR E's production schema; out of scope for this synthetic suite.)
CREATE POLICY memory_store_admin_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'admin'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND active = true
  AND visibility_level = 'family_shared'
);

-- System SELECT (general): pilot-scoped, family_shared only.
CREATE POLICY memory_store_system_select_family ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'system'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND active = true
  AND visibility_level = 'family_shared'
);

-- System SELECT (compose context): when the worker is composing a
-- senior-addressed outbound message, it MAY read that senior's private
-- rows. The carve-out requires app.compose_target_user_id to be set and
-- to match the row's owning_user_id. password_locked is NEVER readable
-- by system, even with a compose context.
CREATE POLICY memory_store_system_select_compose_private ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'system'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND active = true
  AND visibility_level = 'private'
  AND owning_user_id = current_app_compose_target_user_id()
);

-- ============================================================================
-- 10. memory_visibility_audit_log policies
-- ============================================================================

-- INSERT: any role may write, but the row MUST attribute the action to
-- the session's own actor_user_id and actor_role. This prevents an admin
-- from forging a row attributed to a senior, etc.
CREATE POLICY visibility_audit_insert_self ON memory_visibility_audit_log
FOR INSERT WITH CHECK (
  pilot_instance_id = current_app_pilot_instance_id()
  AND actor_user_id = current_app_user_id()
  AND actor_role = current_app_user_role()
);

-- SELECT admin: pilot-scoped, can read every row's metadata. (Real
-- content of underlying memory rows remains gated by memory_store's
-- own admin policy.)
CREATE POLICY visibility_audit_select_admin ON memory_visibility_audit_log
FOR SELECT USING (
  current_app_user_role() = 'admin'
  AND pilot_instance_id = current_app_pilot_instance_id()
);

-- SELECT senior: rows where the senior is the actor, OR rows about a
-- memory the senior owns. This gives the senior transparency about who
-- has accessed their data.
CREATE POLICY visibility_audit_select_senior ON memory_visibility_audit_log
FOR SELECT USING (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND (
    actor_user_id = current_app_user_id()
    OR memory_id IN (
      SELECT id FROM lylo_test.memory_store
      WHERE owning_user_id = current_app_user_id()
    )
  )
);

-- No UPDATE policy. No DELETE policy. Append-only by absence.

-- ============================================================================
-- 11. Derived-table policies (mirror memory_store visibility rules)
-- ============================================================================

-- A single function returns whether the current session can see a derived
-- row with the given owning_user_id and visibility_level. Mirrors the
-- memory_store SELECT rules.
CREATE FUNCTION can_read_derived(
  p_pilot_instance_id UUID,
  p_owning_user_id UUID,
  p_visibility_level TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_role TEXT := current_app_user_role();
BEGIN
  IF p_pilot_instance_id IS DISTINCT FROM current_app_pilot_instance_id() THEN
    RETURN false;
  END IF;

  -- senior: own derived rows; password_locked requires vault session.
  IF v_role = 'senior' THEN
    IF p_owning_user_id IS DISTINCT FROM current_app_user_id() THEN
      RETURN false;
    END IF;
    IF p_visibility_level IN ('private','family_shared') THEN
      RETURN true;
    END IF;
    IF p_visibility_level = 'password_locked' THEN
      RETURN has_active_vault_session(p_owning_user_id);
    END IF;
    RETURN false;
  END IF;

  -- family / caregiver: family_shared only, scoped by family_contacts.
  IF v_role IN ('family','caregiver') THEN
    IF p_visibility_level <> 'family_shared' THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM lylo_test.family_contacts fc
      WHERE fc.senior_user_id  = p_owning_user_id
        AND fc.contact_user_id = current_app_user_id()
        AND fc.pilot_instance_id = current_app_pilot_instance_id()
        AND fc.permission_scope->'visibility_levels' ? 'family_shared'
    );
  END IF;

  -- admin: family_shared only.
  IF v_role = 'admin' THEN
    RETURN p_visibility_level = 'family_shared';
  END IF;

  -- system: family_shared by default; private only with compose context.
  IF v_role = 'system' THEN
    IF p_visibility_level = 'family_shared' THEN
      RETURN true;
    END IF;
    IF p_visibility_level = 'private' THEN
      RETURN p_owning_user_id = current_app_compose_target_user_id();
    END IF;
    RETURN false;
  END IF;

  RETURN false;
END $$;

CREATE POLICY episodes_can_read ON episodes FOR SELECT
USING (can_read_derived(pilot_instance_id, owning_user_id, visibility_level));

CREATE POLICY memory_summaries_can_read ON memory_summaries FOR SELECT
USING (can_read_derived(pilot_instance_id, owning_user_id, visibility_level));

CREATE POLICY reflection_archive_can_read ON reflection_archive FOR SELECT
USING (can_read_derived(pilot_instance_id, owning_user_id, visibility_level));

-- outbound_messages: target user can read their own; admin can read
-- family_shared only.
CREATE POLICY outbound_messages_select_target ON outbound_messages FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND (
    (current_app_user_role() = 'senior' AND target_user_id = current_app_user_id())
    OR (current_app_user_role() = 'admin' AND visibility_level = 'family_shared')
  )
);

-- ============================================================================
-- Schema ready.
-- ============================================================================
