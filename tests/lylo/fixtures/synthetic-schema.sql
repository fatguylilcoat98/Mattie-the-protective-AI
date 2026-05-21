-- ============================================================================
-- Lylo synthetic test schema (constitutional contract, hardened v3)
-- ============================================================================
--
-- Hardening pass per the PR #20 final adversarial review. This schema is the
-- binding RLS / privacy contract that PR E will translate into production
-- Postgres roles.
--
-- Changes since v2:
--   C1 compose-context is no longer just a GUC. A session must INSERT a
--      compose_authorizations row (via grant_compose_authorization()) and
--      the memory_store policy joins against it.
--   C2 cross-pilot row orphans are blocked at the schema layer via
--      composite foreign keys against users(pilot_instance_id, id).
--   C3 outbound_messages private/locked drafts must target the session
--      user even when used_memory_ids is empty.
--   C4 outbound_messages SELECT allows family/caregiver targets to read
--      family_shared drafts addressed to them.
--   C5 admin SELECT on memory_vaults and memory_vault_sessions is dropped
--      so pin_hash / pin_salt are unreachable by admin. Admin reads vault
--      state via memory_visibility_audit_log.
--   H1 family_contacts SELECT is scoped to the row's senior, the row's
--      contact, or admin.
--   H2 users SELECT is scoped to self, contacts of self / contacts whose
--      senior is self, or admin.
--   H3 senior UPDATE on memory_store requires active = true (no undelete
--      via UPDATE).
--   H4 the vault-session lockout-check trigger SELECTs memory_vaults FOR
--      UPDATE so it serializes with record_failed_unlock().
--   H5 hard-delete or soft-delete of a memory_store row marks every
--      derived row referencing it as requires_recompute = true.
--   H6 record_failed_unlock revokes existing active sessions when the
--      lockout threshold is crossed.
--   H7 grant_compose_authorization() writes an audit row in the same
--      transaction; the subsequent compose-context SELECT is gated by an
--      EXISTS on compose_authorizations, so audit precedes read.
--   M1 visibility-change audit trigger raises if session GUCs are missing.
--   M2 caregiver default-deny is tested in caregiver-default-deny.test.js.
--   M3 expire_vault_sessions() helper writes vault_session_expired audit
--      rows; production schedules this; documented.
--   M4 concurrent active vault sessions per user are explicitly allowed;
--      tested in concurrent-vault-sessions.test.js.
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
BEGIN RETURN current_setting('app.user_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;

CREATE FUNCTION current_app_user_role() RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
BEGIN RETURN current_setting('app.user_role', true);
EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;

CREATE FUNCTION current_app_pilot_instance_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
BEGIN RETURN current_setting('app.pilot_instance_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;

CREATE FUNCTION current_app_compose_target_user_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
BEGIN RETURN current_setting('app.compose_target_user_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;

-- ============================================================================
-- 2. Tables
-- ============================================================================

CREATE TABLE pilot_instances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  username            TEXT NOT NULL,
  role                TEXT NOT NULL
    CHECK (role IN ('senior', 'family', 'caregiver', 'admin', 'system')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  -- Composite uniqueness so other tables can FK on (pilot_instance_id, id)
  -- to enforce that the referenced user lives in the same pilot. (C2)
  UNIQUE (pilot_instance_id, id),
  UNIQUE (pilot_instance_id, username)
);

CREATE TABLE family_contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  senior_user_id      UUID NOT NULL,
  contact_user_id     UUID NOT NULL,
  permission_scope    JSONB NOT NULL DEFAULT '{"visibility_levels": []}'::jsonb,
  UNIQUE (senior_user_id, contact_user_id),
  -- C2: both endpoints must be in the same pilot as the row.
  FOREIGN KEY (pilot_instance_id, senior_user_id)
    REFERENCES users (pilot_instance_id, id),
  FOREIGN KEY (pilot_instance_id, contact_user_id)
    REFERENCES users (pilot_instance_id, id)
);

CREATE TABLE memory_vaults (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id       UUID NOT NULL REFERENCES pilot_instances(id),
  user_id                 UUID NOT NULL,
  pin_hash                TEXT NOT NULL,
  pin_salt                TEXT NOT NULL,
  lockout_until           TIMESTAMPTZ,
  failed_attempt_count    INT NOT NULL DEFAULT 0,
  last_unlocked_at        TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  -- C2: vault's user lives in the same pilot as the vault.
  FOREIGN KEY (pilot_instance_id, user_id)
    REFERENCES users (pilot_instance_id, id),
  -- Allow other tables to FK on (pilot_instance_id, id).
  UNIQUE (pilot_instance_id, id)
);

CREATE TABLE memory_vault_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id      UUID NOT NULL REFERENCES memory_vaults(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  pilot_instance_id UUID NOT NULL,
  unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  -- C2: session's user lives in the same pilot.
  FOREIGN KEY (pilot_instance_id, user_id)
    REFERENCES users (pilot_instance_id, id),
  -- And the vault is in the same pilot too.
  FOREIGN KEY (pilot_instance_id, vault_id)
    REFERENCES memory_vaults (pilot_instance_id, id)
);

CREATE TABLE memory_store (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  owning_user_id      UUID NOT NULL,
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
  CHECK (visibility_level <> 'password_locked' OR vault_id IS NOT NULL),
  -- C2: owner lives in the same pilot.
  FOREIGN KEY (pilot_instance_id, owning_user_id)
    REFERENCES users (pilot_instance_id, id),
  -- Allow derived-table composite FKs.
  UNIQUE (pilot_instance_id, id)
);

CREATE TABLE memory_visibility_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  -- C1/H7: compose_context_granted rows are not tied to a memory row,
  -- so memory_id is nullable but constrained by event_type below.
  memory_id           UUID REFERENCES memory_store(id),
  target_user_id      UUID,
  event_type          TEXT NOT NULL
    CHECK (event_type IN (
      'visibility_changed','visibility_read',
      'vault_unlock_attempt','vault_unlock_success','vault_unlock_failure',
      'vault_session_expired','export_filtered','family_view',
      'compose_context_granted','compose_context_revoked'
    )),
  actor_user_id       UUID NOT NULL,
  actor_role          TEXT NOT NULL
    CHECK (actor_role IN ('senior','family','caregiver','admin','system','seeder')),
  old_visibility      TEXT,
  new_visibility      TEXT,
  reason              TEXT,
  outcome             TEXT NOT NULL
    CHECK (outcome IN ('allowed','denied','masked','partial')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- C2: actor must be in the same pilot as the row.
  FOREIGN KEY (pilot_instance_id, actor_user_id)
    REFERENCES users (pilot_instance_id, id),
  -- Shape constraint: memory events need memory_id; compose events need
  -- target_user_id.
  CHECK (
    (event_type IN ('visibility_changed','visibility_read','family_view','export_filtered') AND memory_id IS NOT NULL)
    OR (event_type IN ('compose_context_granted','compose_context_revoked') AND target_user_id IS NOT NULL)
    OR (event_type IN ('vault_unlock_attempt','vault_unlock_success','vault_unlock_failure','vault_session_expired'))
  )
);

-- C1: a system worker must INSERT an authorization here before reading a
-- senior's private rows via compose context. The memory_store policy gates
-- on EXISTS over this table.
CREATE TABLE compose_authorizations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id        UUID NOT NULL REFERENCES pilot_instances(id),
  target_user_id           UUID NOT NULL,
  authorized_actor_id      UUID NOT NULL,
  reason                   TEXT NOT NULL,
  authorized_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at               TIMESTAMPTZ NOT NULL,
  -- C2: both target and actor live in this pilot.
  FOREIGN KEY (pilot_instance_id, target_user_id)
    REFERENCES users (pilot_instance_id, id),
  FOREIGN KEY (pilot_instance_id, authorized_actor_id)
    REFERENCES users (pilot_instance_id, id)
);

CREATE TABLE episodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  owning_user_id      UUID NOT NULL,
  summary             TEXT NOT NULL,
  source_memory_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  requires_recompute  BOOLEAN NOT NULL DEFAULT false,
  superseded_by       UUID REFERENCES episodes(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (pilot_instance_id, owning_user_id)
    REFERENCES users (pilot_instance_id, id)
);

CREATE TABLE memory_summaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  owning_user_id      UUID NOT NULL,
  summary             TEXT NOT NULL,
  source_memory_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  requires_recompute  BOOLEAN NOT NULL DEFAULT false,
  superseded_by       UUID REFERENCES memory_summaries(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (pilot_instance_id, owning_user_id)
    REFERENCES users (pilot_instance_id, id)
);

CREATE TABLE reflection_archive (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  owning_user_id      UUID NOT NULL,
  content             TEXT NOT NULL,
  source_memory_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  requires_recompute  BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (pilot_instance_id, owning_user_id)
    REFERENCES users (pilot_instance_id, id)
);

CREATE TABLE outbound_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_instance_id   UUID NOT NULL REFERENCES pilot_instances(id),
  target_user_id      UUID NOT NULL,
  body                TEXT NOT NULL,
  used_memory_ids     UUID[] NOT NULL DEFAULT '{}'::uuid[],
  visibility_level    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility_level IN ('private','family_shared','password_locked')),
  status              TEXT NOT NULL DEFAULT 'drafted'
    CHECK (status IN ('drafted','sent','aborted')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (pilot_instance_id, target_user_id)
    REFERENCES users (pilot_instance_id, id)
);

-- ============================================================================
-- 3. Inheritance helpers + triggers
-- ============================================================================

CREATE FUNCTION compute_inherited_visibility(p_source_memory_ids UUID[])
RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_source_memory_ids IS NULL OR array_length(p_source_memory_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM lylo_test.memory_store m
    WHERE m.id = ANY(p_source_memory_ids)
      AND m.visibility_level = 'password_locked'
  ) THEN RETURN 'password_locked'; END IF;
  IF EXISTS (
    SELECT 1 FROM lylo_test.memory_store m
    WHERE m.id = ANY(p_source_memory_ids)
      AND m.visibility_level = 'private'
  ) THEN RETURN 'private'; END IF;
  RETURN 'family_shared';
END $$;

CREATE FUNCTION trg_apply_inherited_visibility() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_inherited TEXT;
BEGIN
  v_inherited := lylo_test.compute_inherited_visibility(NEW.source_memory_ids);
  IF v_inherited IS NOT NULL THEN NEW.visibility_level := v_inherited; END IF;
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

-- C3: outbound_messages trigger enforces target ownership for private/locked
-- drafts, INCLUDING the empty-sources case.
CREATE FUNCTION trg_outbound_messages_enforce() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_inherited TEXT;
  v_first_owner UUID;
  v_session_user UUID := lylo_test.current_app_user_id();
BEGIN
  v_inherited := lylo_test.compute_inherited_visibility(NEW.used_memory_ids);
  IF v_inherited IS NOT NULL THEN NEW.visibility_level := v_inherited; END IF;

  IF NEW.visibility_level IN ('private','password_locked') THEN
    IF array_length(NEW.used_memory_ids, 1) IS NULL
       OR array_length(NEW.used_memory_ids, 1) = 0 THEN
      -- No sources: target must be the session user.
      IF v_session_user IS NULL THEN
        RAISE EXCEPTION 'outbound_messages: private/locked draft requires authenticated session';
      END IF;
      IF NEW.target_user_id IS DISTINCT FROM v_session_user THEN
        RAISE EXCEPTION 'outbound_messages: private/locked draft without sources must target session user; got %', NEW.target_user_id;
      END IF;
    ELSE
      -- Sources present: all must share an owner; target must equal owner.
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
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER outbound_messages_enforce
  BEFORE INSERT OR UPDATE ON outbound_messages
  FOR EACH ROW EXECUTE FUNCTION trg_outbound_messages_enforce();

-- H5: invalidate derived rows when their source memory is deleted or
-- soft-deleted.
CREATE FUNCTION trg_memory_store_invalidate_derived() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_old_id UUID;
BEGIN
  v_old_id := OLD.id;
  UPDATE lylo_test.episodes
    SET requires_recompute = true
    WHERE v_old_id = ANY(source_memory_ids);
  UPDATE lylo_test.memory_summaries
    SET requires_recompute = true
    WHERE v_old_id = ANY(source_memory_ids);
  UPDATE lylo_test.reflection_archive
    SET requires_recompute = true
    WHERE v_old_id = ANY(source_memory_ids);
  RETURN OLD;
END $$;

CREATE TRIGGER memory_store_invalidate_derived_delete
  AFTER DELETE ON memory_store
  FOR EACH ROW EXECUTE FUNCTION trg_memory_store_invalidate_derived();

CREATE FUNCTION trg_memory_store_invalidate_derived_update() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_old_id UUID;
BEGIN
  IF OLD.active = true AND NEW.active = false THEN
    v_old_id := NEW.id;
    UPDATE lylo_test.episodes
      SET requires_recompute = true
      WHERE v_old_id = ANY(source_memory_ids);
    UPDATE lylo_test.memory_summaries
      SET requires_recompute = true
      WHERE v_old_id = ANY(source_memory_ids);
    UPDATE lylo_test.reflection_archive
      SET requires_recompute = true
      WHERE v_old_id = ANY(source_memory_ids);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER memory_store_invalidate_derived_soft
  AFTER UPDATE OF active ON memory_store
  FOR EACH ROW EXECUTE FUNCTION trg_memory_store_invalidate_derived_update();

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

-- H6: when failed attempts crosses the lockout threshold, revoke active
-- vault sessions in addition to setting lockout_until.
CREATE FUNCTION record_failed_unlock(
  p_vault_id UUID,
  p_max_attempts INT DEFAULT 5,
  p_lockout_minutes INT DEFAULT 30
) RETURNS TABLE (failed_attempt_count INT, lockout_until TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
  v_new_count INT;
  v_new_lockout TIMESTAMPTZ;
BEGIN
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
  RETURNING memory_vaults.failed_attempt_count, memory_vaults.lockout_until
    INTO v_new_count, v_new_lockout;

  -- H6: lockout just activated -> revoke all active sessions for this vault.
  IF v_new_lockout IS NOT NULL AND v_new_lockout > now() THEN
    UPDATE lylo_test.memory_vault_sessions
    SET revoked_at = now()
    WHERE vault_id = p_vault_id
      AND revoked_at IS NULL
      AND expires_at > now();
  END IF;

  RETURN QUERY SELECT v_new_count, v_new_lockout;
END $$;

CREATE FUNCTION record_successful_unlock(p_vault_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE lylo_test.memory_vaults
  SET failed_attempt_count = 0, lockout_until = NULL,
      last_unlocked_at = now(), updated_at = now()
  WHERE id = p_vault_id;
END $$;

-- H4: lockout-check trigger SELECTs FOR UPDATE so it serializes against
-- concurrent record_failed_unlock UPDATEs on the same vault row.
CREATE FUNCTION trg_vault_session_lockout_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE v_lockout TIMESTAMPTZ;
BEGIN
  SELECT lockout_until INTO v_lockout
  FROM lylo_test.memory_vaults
  WHERE id = NEW.vault_id
  FOR UPDATE;
  IF v_lockout IS NOT NULL AND v_lockout > now() THEN
    RAISE EXCEPTION 'vault % is locked until %', NEW.vault_id, v_lockout
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER vault_session_lockout_check
  BEFORE INSERT ON memory_vault_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_vault_session_lockout_check();

-- M3: production schedules a job that expires sessions past expires_at
-- and writes vault_session_expired audit rows. The synthetic helper does
-- the same on demand; the schedule itself is out of scope here.
CREATE FUNCTION expire_vault_sessions() RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  v_row RECORD;
  v_count INT := 0;
BEGIN
  FOR v_row IN
    SELECT s.id, s.vault_id, s.user_id, v.pilot_instance_id
    FROM lylo_test.memory_vault_sessions s
    JOIN lylo_test.memory_vaults v ON v.id = s.vault_id
    WHERE s.expires_at <= now()
      AND s.revoked_at IS NULL
  LOOP
    UPDATE lylo_test.memory_vault_sessions
    SET revoked_at = now()
    WHERE id = v_row.id;
    INSERT INTO lylo_test.memory_visibility_audit_log
      (pilot_instance_id, event_type, actor_user_id, actor_role, outcome, reason)
    VALUES (
      v_row.pilot_instance_id, 'vault_session_expired',
      v_row.user_id, 'system', 'allowed', 'expired by retention worker'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- ============================================================================
-- 5. Visibility-change audit trigger (M1: fail-closed on missing GUCs)
-- ============================================================================

CREATE FUNCTION trg_memory_store_visibility_change_audit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.visibility_level IS DISTINCT FROM NEW.visibility_level THEN
    -- M1: fail-closed.
    IF lylo_test.current_app_user_id() IS NULL
       OR lylo_test.current_app_user_role() IS NULL
       OR lylo_test.current_app_pilot_instance_id() IS NULL THEN
      RAISE EXCEPTION 'visibility change requires authenticated session context (user_id, role, pilot_instance_id)';
    END IF;
    INSERT INTO lylo_test.memory_visibility_audit_log
      (pilot_instance_id, memory_id, event_type,
       actor_user_id, actor_role,
       old_visibility, new_visibility, reason, outcome)
    VALUES (
      NEW.pilot_instance_id, NEW.id, 'visibility_changed',
      lylo_test.current_app_user_id(),
      lylo_test.current_app_user_role(),
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
-- 6. Compose-context grant helper (C1, H7)
-- ============================================================================

-- A system worker calls this BEFORE setting app.compose_target_user_id and
-- reading the senior's private memory. The helper writes the
-- compose_authorizations row AND the audit row in one transaction. The
-- memory_store policy gates on the compose_authorizations row.
CREATE FUNCTION grant_compose_authorization(
  p_target_user_id UUID,
  p_reason TEXT,
  p_ttl_minutes INT DEFAULT 5
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_auth_id UUID;
BEGIN
  IF lylo_test.current_app_user_role() <> 'system' THEN
    RAISE EXCEPTION 'compose authorization requires the system role; got %', lylo_test.current_app_user_role();
  END IF;
  IF p_reason IS NULL OR length(p_reason) < 4 THEN
    RAISE EXCEPTION 'compose authorization requires a non-trivial reason';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM lylo_test.users
    WHERE id = p_target_user_id
      AND pilot_instance_id = lylo_test.current_app_pilot_instance_id()
  ) THEN
    RAISE EXCEPTION 'compose target % is not in the session pilot', p_target_user_id;
  END IF;

  INSERT INTO lylo_test.compose_authorizations
    (pilot_instance_id, target_user_id, authorized_actor_id, reason, expires_at)
  VALUES (
    lylo_test.current_app_pilot_instance_id(),
    p_target_user_id,
    lylo_test.current_app_user_id(),
    p_reason,
    now() + (p_ttl_minutes || ' minutes')::interval
  ) RETURNING id INTO v_auth_id;

  INSERT INTO lylo_test.memory_visibility_audit_log
    (pilot_instance_id, event_type, target_user_id,
     actor_user_id, actor_role, reason, outcome)
  VALUES (
    lylo_test.current_app_pilot_instance_id(),
    'compose_context_granted', p_target_user_id,
    lylo_test.current_app_user_id(),
    lylo_test.current_app_user_role(),
    p_reason, 'allowed'
  );

  RETURN v_auth_id;
END $$;

-- ============================================================================
-- 7. RLS: enable + FORCE
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
ALTER TABLE compose_authorizations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE compose_authorizations       FORCE  ROW LEVEL SECURITY;
ALTER TABLE episodes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes                     FORCE  ROW LEVEL SECURITY;
ALTER TABLE memory_summaries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summaries             FORCE  ROW LEVEL SECURITY;
ALTER TABLE reflection_archive           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflection_archive           FORCE  ROW LEVEL SECURITY;
ALTER TABLE outbound_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_messages            FORCE  ROW LEVEL SECURITY;

-- ============================================================================
-- 8. Seeder policies
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
CREATE POLICY seeder_all ON compose_authorizations      FOR ALL TO PUBLIC
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
-- 9. Lookup policies (H1, H2: narrowed from "everyone in pilot")
-- ============================================================================

CREATE POLICY pilot_instances_session_pilot ON pilot_instances FOR SELECT
USING (id = current_app_pilot_instance_id());

-- H2: users sees self; or users that are linked via family_contacts (either
-- direction); or admin sees all in pilot.
CREATE POLICY users_self_or_admin_or_linked ON users FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND (
    id = current_app_user_id()
    OR current_app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM lylo_test.family_contacts fc
      WHERE fc.pilot_instance_id = current_app_pilot_instance_id()
        AND (
          (fc.contact_user_id = current_app_user_id() AND fc.senior_user_id = users.id)
          OR (fc.senior_user_id = current_app_user_id() AND fc.contact_user_id = users.id)
        )
    )
    OR current_app_user_role() = 'system'
  )
);

-- H1: family_contacts row visible to its senior, its contact, or admin.
CREATE POLICY family_contacts_endpoints_or_admin ON family_contacts FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND (
    senior_user_id = current_app_user_id()
    OR contact_user_id = current_app_user_id()
    OR current_app_user_role() = 'admin'
  )
);

-- C5: memory_vaults senior-only SELECT. Admin has NO direct access; admin
-- reads vault state via memory_visibility_audit_log.
CREATE POLICY memory_vaults_senior_self ON memory_vaults FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND current_app_user_role() = 'senior'
  AND user_id = current_app_user_id()
);

-- C5 (consistent): memory_vault_sessions senior-only SELECT.
CREATE POLICY memory_vault_sessions_senior_self ON memory_vault_sessions FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND current_app_user_role() = 'senior'
  AND user_id = current_app_user_id()
);

-- ============================================================================
-- 10. compose_authorizations policies (C1)
-- ============================================================================

CREATE POLICY compose_auth_system_insert_self ON compose_authorizations FOR INSERT
WITH CHECK (
  current_app_user_role() = 'system'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND authorized_actor_id = current_app_user_id()
);

CREATE POLICY compose_auth_system_select_self ON compose_authorizations FOR SELECT
USING (
  current_app_user_role() = 'system'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND authorized_actor_id = current_app_user_id()
);

CREATE POLICY compose_auth_admin_select ON compose_authorizations FOR SELECT
USING (
  current_app_user_role() = 'admin'
  AND pilot_instance_id = current_app_pilot_instance_id()
);

-- ============================================================================
-- 11. memory_store policies
-- ============================================================================

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

CREATE POLICY memory_store_senior_insert ON memory_store FOR INSERT
WITH CHECK (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND owning_user_id = current_app_user_id()
);

-- H3: senior UPDATE requires active = true (no undelete via UPDATE).
CREATE POLICY memory_store_senior_update ON memory_store FOR UPDATE
USING (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND owning_user_id = current_app_user_id()
  AND active = true
)
WITH CHECK (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND owning_user_id = current_app_user_id()
);

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

CREATE POLICY memory_store_admin_select ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'admin'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND active = true
  AND visibility_level = 'family_shared'
);

CREATE POLICY memory_store_system_select_family ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'system'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND active = true
  AND visibility_level = 'family_shared'
);

-- C1: system reads of private memory require a valid compose_authorizations
-- row written by the same system actor for the same target.
CREATE POLICY memory_store_system_select_compose_private ON memory_store FOR SELECT
USING (
  current_app_user_role() = 'system'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND active = true
  AND visibility_level = 'private'
  AND owning_user_id = current_app_compose_target_user_id()
  AND EXISTS (
    SELECT 1 FROM lylo_test.compose_authorizations ca
    WHERE ca.pilot_instance_id = current_app_pilot_instance_id()
      AND ca.target_user_id = current_app_compose_target_user_id()
      AND ca.authorized_actor_id = current_app_user_id()
      AND now() < ca.expires_at
  )
);

-- ============================================================================
-- 12. memory_visibility_audit_log policies
-- ============================================================================

CREATE POLICY visibility_audit_insert_self ON memory_visibility_audit_log
FOR INSERT WITH CHECK (
  pilot_instance_id = current_app_pilot_instance_id()
  AND actor_user_id = current_app_user_id()
  AND actor_role = current_app_user_role()
);

CREATE POLICY visibility_audit_select_admin ON memory_visibility_audit_log
FOR SELECT USING (
  current_app_user_role() = 'admin'
  AND pilot_instance_id = current_app_pilot_instance_id()
);

CREATE POLICY visibility_audit_select_senior ON memory_visibility_audit_log
FOR SELECT USING (
  current_app_user_role() = 'senior'
  AND pilot_instance_id = current_app_pilot_instance_id()
  AND (
    actor_user_id = current_app_user_id()
    OR target_user_id = current_app_user_id()
    OR memory_id IN (
      SELECT id FROM lylo_test.memory_store
      WHERE owning_user_id = current_app_user_id()
    )
  )
);

-- No UPDATE, no DELETE policy. Append-only by absence.

-- ============================================================================
-- 13. Derived-table policies
-- ============================================================================

CREATE FUNCTION can_read_derived(
  p_pilot_instance_id UUID,
  p_owning_user_id UUID,
  p_visibility_level TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE v_role TEXT := current_app_user_role();
BEGIN
  IF p_pilot_instance_id IS DISTINCT FROM current_app_pilot_instance_id() THEN
    RETURN false;
  END IF;
  IF v_role = 'senior' THEN
    IF p_owning_user_id IS DISTINCT FROM current_app_user_id() THEN RETURN false; END IF;
    IF p_visibility_level IN ('private','family_shared') THEN RETURN true; END IF;
    IF p_visibility_level = 'password_locked' THEN
      RETURN has_active_vault_session(p_owning_user_id);
    END IF;
    RETURN false;
  END IF;
  IF v_role IN ('family','caregiver') THEN
    IF p_visibility_level <> 'family_shared' THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM lylo_test.family_contacts fc
      WHERE fc.senior_user_id  = p_owning_user_id
        AND fc.contact_user_id = current_app_user_id()
        AND fc.pilot_instance_id = current_app_pilot_instance_id()
        AND fc.permission_scope->'visibility_levels' ? 'family_shared'
    );
  END IF;
  IF v_role = 'admin' THEN RETURN p_visibility_level = 'family_shared'; END IF;
  IF v_role = 'system' THEN
    IF p_visibility_level = 'family_shared' THEN RETURN true; END IF;
    IF p_visibility_level = 'private'
       AND p_owning_user_id = current_app_compose_target_user_id() THEN
      RETURN EXISTS (
        SELECT 1 FROM lylo_test.compose_authorizations ca
        WHERE ca.pilot_instance_id = current_app_pilot_instance_id()
          AND ca.target_user_id = current_app_compose_target_user_id()
          AND ca.authorized_actor_id = current_app_user_id()
          AND now() < ca.expires_at
      );
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

-- C4: outbound_messages target SELECT covers senior, family, caregiver,
-- and admin (admin only for family_shared content).
CREATE POLICY outbound_messages_select_senior_target ON outbound_messages FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND current_app_user_role() = 'senior'
  AND target_user_id = current_app_user_id()
);
CREATE POLICY outbound_messages_select_family_target ON outbound_messages FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND current_app_user_role() = 'family'
  AND target_user_id = current_app_user_id()
  AND visibility_level = 'family_shared'
);
CREATE POLICY outbound_messages_select_caregiver_target ON outbound_messages FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND current_app_user_role() = 'caregiver'
  AND target_user_id = current_app_user_id()
  AND visibility_level = 'family_shared'
);
CREATE POLICY outbound_messages_select_admin ON outbound_messages FOR SELECT
USING (
  pilot_instance_id = current_app_pilot_instance_id()
  AND current_app_user_role() = 'admin'
  AND visibility_level = 'family_shared'
);

-- ============================================================================
-- Schema ready.
-- ============================================================================
