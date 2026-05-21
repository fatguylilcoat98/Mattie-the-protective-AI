-- ============================================================================
-- Lylo schema baseline
-- ============================================================================
--
-- Purpose: pin the live database state as of the start of the Lylo cleanup.
--          No DDL. Documents that as of this commit, db/schema.sql reflects
--          the live database, and from this point forward all schema changes
--          go through db/migrations/.
--
-- Why no-op: the live schema is whatever it currently is. We do not attempt
--            to recreate it from this migration. db/schema.sql (regenerated
--            via pg_dump --schema-only) is the source of truth for the
--            baseline state. This file exists so the numbered-migration
--            chain has a 001 to anchor on.
--
-- Run by:    no one. This is read-only history.
-- ============================================================================

SELECT 1 AS baseline_recorded;
