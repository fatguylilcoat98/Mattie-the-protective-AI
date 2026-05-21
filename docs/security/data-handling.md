# Lylo — Data Handling

**Owner:** project lead.
**Reviewers:** owner + pilot partner legal/compliance contact.
**Cadence:** review before every pilot launch.

## What data Lylo holds

- **Identity:** user names, family-contact names and contact
  details, companion name, pilot organization name.
- **Memory store:** conversational history, user-stated facts,
  preferences, routines, family/relationship context, preserved
  Legacy stories. Provenance-tracked and visibility-classified.
- **Voice recordings:** optional, for Legacy mode only. Stored
  as references to opaque blob storage.
- **Audit log:** every visibility change, every privileged read,
  every setup-mode action, every admin action.
- **Vault material:** salted hashes of user PINs; never the
  PIN itself.
- **API credentials:** never in the repo. Stored only in
  Render env vars.

## What data Lylo does NOT hold

- Government identifiers (SSN, driver's license, passport).
- Payment information.
- Medical records, diagnoses, prescriptions.
- Biometric data beyond optional voice (which is treated as
  identity data under §3 below).

If a pilot wants to add any of the above, **stop and consult
the owner.** Lylo's threat model and current schema are not
sized for those categories.

## Encryption

- **In transit:** TLS 1.2 or higher for every external
  connection (Supabase, Pinecone, Anthropic, OpenAI, etc.).
  HTTPS-only for `/api/*` and the admin surface.
- **At rest:**
  - Supabase Postgres: native encryption at rest (verified
    annually).
  - Pinecone: native encryption at rest.
  - Voice blob storage: server-side encryption with the storage
    provider's KMS.
  - Backups: encrypted with a key held outside the storage
    provider's KMS; rotated quarterly.

## Backup posture

- **`pg_dump` daily** of the live database. Output stored
  off-site (separate provider from Supabase) with 30-day
  retention.
- **`pg_dump --schema-only` per migration** as part of the
  PR-A2 / migration checklist; the dump is checked into
  `db/schema.sql`.
- **Pinecone snapshot weekly** of each pilot's namespace.
- **Backup restore drill quarterly.** Restore a recent backup
  to a throwaway Supabase project; run the test suite against
  it; document the restore SLA achieved.

## Identity data (the senior, family, and operator)

- Names and relationships are stored in `user_profiles` and
  `family_contacts`. Read access is gated by RLS: only the
  owning pilot's senior and the senior's authorized family
  contacts can see this data.
- Operator identity (the Lylo administrator running a pilot)
  is stored in `users` with `role = 'admin'`. Admin role can
  read audit logs and metadata but never `content` of
  `private` or `password_locked` memory rows.
- Owner identity (Christopher's role in the current Sandy
  deployment) is set via a Render env var
  (`SPLENDOR_OWNER_EMAIL` today; renamed to `LYLO_OWNER_EMAIL`
  in a future breaking rename).

## Sender / outbound communication

- The companion's sender email address (real value) is set
  only in Render env vars
  (`GMAIL_USER`, `SPLENDOR_EMAIL_FROM`, `USER_EMAIL`). It is
  **never** committed to the repo.
- In documentation and examples, the placeholder
  `<companion-sender-email>` is used.

## Retention

Documented in `docs/privacy/retention-policy.md`. Highlights:

- Per-memory soft delete (default): a `deleted_at` timestamp
  and `deletion_reason` are set; the row is excluded from
  reads.
- Per-memory hard delete: senior may request; runs after a
  30-day grace period or immediately on request.
- `memory_visibility_audit_log` retention: 7 years.
- Vault material on user delete: hard-deleted within 24 hours.
- Pinecone vector records: synced delete — when a memory row
  is hard-deleted, its Pinecone record is deleted in the same
  transaction (best-effort with a reconciliation job).

## Restore SLA

- **SEV-1 data corruption / accidental hard-delete:** restore
  to a known good state within 4 hours.
- **SEV-2 schema drift / migration rollback:** restore within
  24 hours.
- **DSAR data export (senior right to portability):** 30 days
  by default; faster on request.

## Out of scope for v1

- Customer-managed encryption keys (BYOK).
- Cross-region failover.
- Active-active multi-region deployment.
- HIPAA covered-entity posture (Lylo is not a covered entity
  and does not market itself as medical).

— End of data handling policy.
