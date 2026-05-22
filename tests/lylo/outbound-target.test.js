/*
  C4 outbound_messages SELECT path for family / caregiver targets.
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

async function seedFamilySharedDraft(client, ids, target) {
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await c.query(
        `INSERT INTO lylo_test.outbound_messages (pilot_instance_id, target_user_id, body, used_memory_ids, visibility_level, status)
           VALUES ($1, $2, 'hello family', $3::uuid[], 'family_shared', 'drafted')`,
        [ids.pilots.a, target, [ids.memories.a.familyShared]]
      );
    }
  );
}

test('family target can SELECT a family_shared outbound draft addressed to them', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await seedFamilySharedDraft(client, ids, ids.users.a.family);

  const n = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.outbound_messages`);
      return r.rows[0].n;
    }
  );
  assert.equal(n, 1, 'family target should see the family_shared draft addressed to them');
});

test('caregiver target can SELECT a family_shared outbound draft addressed to them', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await seedFamilySharedDraft(client, ids, ids.users.a.caregiver);

  const n = await withRole(
    client,
    { role: 'caregiver', userId: ids.users.a.caregiver, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.outbound_messages`);
      return r.rows[0].n;
    }
  );
  assert.equal(n, 1, 'caregiver target should see the family_shared draft addressed to them');
});

test('family role does NOT see private outbound drafts (none should exist for them; defensive)', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  // C3 means a private draft targeting a family member would not be insertable.
  // We re-verify here that the trigger refuses such an attempt.
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL ROLE lylo_seeder`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);

  await assert.rejects(
    client.query(
      `INSERT INTO outbound_messages (pilot_instance_id, target_user_id, body, used_memory_ids, visibility_level)
         VALUES ($1, $2, 'private to family - should refuse', $3::uuid[], 'private')`,
      [ids.pilots.a, ids.users.a.family, [ids.memories.a.private]]
    ),
    /must target the owning senior/,
    'private outbound draft addressed to a family member must be refused by the trigger'
  );
  await client.query('ROLLBACK');
});

test('private outbound draft with empty used_memory_ids must target the session user (C3)', (t) => {
  // D2 made RLS genuinely enforced (it was previously bypassed by the
  // superuser connection). outbound_messages has no INSERT policy for any
  // non-seeder role: per owner decision D5, outbound-message creation is
  // deferred to a later PR (D5 second pass / PR-F). Until that write policy
  // is contracted, a non-seeder role cannot INSERT an outbound draft at all,
  // so this scenario cannot be exercised through a real role path. The C3
  // trigger itself (a mis-targeted private draft is refused) stays covered
  // by 'family role does NOT see private outbound drafts' above and by
  // inheritance.test.js, both via the seeder bypass.
  t.skip('TODO D5/PR-F: outbound_messages INSERT policy not yet contracted');
});
