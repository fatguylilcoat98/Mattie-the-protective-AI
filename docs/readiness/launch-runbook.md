# Lylo — Launch Runbook

**Audience:** the operator running a Lylo pilot launch.
**Use it:** on the day a pilot goes live with a new pilot
organization.

This runbook assumes the
`docs/readiness/pilot-readiness-checklist.md` is complete and
signed off. It does not relitigate readiness; it sequences the
launch-day operations.

## T − 7 days

- [ ] Final review of `docs/readiness/pilot-readiness-checklist.md`
      with the owner.
- [ ] Confirm pilot partner contact and primary on-call schedule.
- [ ] Snapshot the production database
      (`pg_dump --schema-only > db/schema.sql` + a full data
      backup to off-site storage).
- [ ] Snapshot the Pinecone index for the pilot's namespace.
- [ ] Verify Render env vars are populated for the new pilot.
- [ ] Verify `RLS_ENFORCED=true` and that the previous shadow
      period had `<0.01%` mismatch rate.
- [ ] Verify the language-audit grep returns zero matches in
      user-facing files.

## T − 24 hours

- [ ] Run a fresh dry-run of
      `scripts/create-pilot-instance.js --dry-run` against
      production. Review the output with the owner.
- [ ] Mail the pilot partner the
      `docs/pilot/security-overview.md` one-pager. Confirm
      they have read it.
- [ ] Schedule the launch call with the pilot partner.
- [ ] Open a tracking ticket / issue for the launch.
- [ ] Notify on-call.

## T − 1 hour

- [ ] Verify `/health` returns the expected JSON shape.
- [ ] Verify Render is on the intended deploy SHA.
- [ ] Verify Supabase is reachable and the role-scoped clients
      authenticate as expected.
- [ ] Have the pilot partner's primary contact on the line.

## T − 0 (launch)

- [ ] Run `scripts/create-pilot-instance.js --confirm` for the
      new pilot.
- [ ] Verify the pilot instance row exists, locked_at is null
      (setup not yet complete), and `pilot_instances.org_name`
      matches the partner.
- [ ] Walk the pilot partner through the Setup Mode wizard.
      Record companion name, senior name, family contacts,
      preferences, optional vault PIN. Do NOT enter these
      values yourself — the senior or their family member
      does, so the audit log shows the correct actor.
- [ ] On `POST /api/setup/complete`, verify:
      - `companion_profiles.locked_at` is set.
      - `user_profiles.locked_at` is set.
      - An audit row exists in `audit_log` recording the
        completion.
- [ ] Do a single chat round-trip. Confirm the companion
      greets by the chosen name, uses the configured tone,
      and does not reference any other pilot's data.

## T + 0 to T + 24 hours

- [ ] On-call has the pilot's audit-log view open and is
      checking it every 4 hours.
- [ ] Watch Render logs for any error spike.
- [ ] Watch `memory_visibility_audit_log` for any
      `outcome = 'denied'` or `outcome = 'masked'` rows that
      look like the application is hitting the wrong role
      (e.g. trying to read `private` as `lylo_family`).
- [ ] Respond to any user-side question within the documented
      SLA.

## T + 7 days

- [ ] Pull the audit-log summary for the pilot.
- [ ] Review with the owner.
- [ ] Note any operational lessons in this runbook for the
      next pilot.

## Abort / rollback

If at any point during T − 1 hour through T + 24 hours the
launch must be aborted:

- [ ] Set `RLS_ENFORCED=false` if RLS is suspect.
- [ ] Set `SETUP_MODE_ENABLED=false` if setup is corrupting
      state.
- [ ] Set `LEGACY_MODE_ENABLED=false` if Legacy mode is
      misbehaving.
- [ ] If the pilot row itself is bad, run
      `scripts/delete-pilot-instance.js --pilot-instance-id
      <id> --confirm --confirm-token <ack>`. This is the
      **only** row-deletion CLI in Lylo; it is scoped strictly
      by `pilot_instance_id` and refuses to run if more than
      one instance matches.
- [ ] Restore from the T − 7 days snapshot if data corruption
      is suspected. The restore procedure lives in
      `docs/security/data-handling.md`.
- [ ] Notify the pilot partner immediately. Use the comms
      template in `docs/security/incident-response.md`.

— End of launch runbook.
