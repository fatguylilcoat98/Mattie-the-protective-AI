/*
  Caregiver default-deny (M2).
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('caregiver with empty permission_scope sees zero family_shared rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL ROLE lylo_seeder`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(
    `UPDATE family_contacts SET permission_scope = '{"visibility_levels": []}'::jsonb WHERE contact_user_id = $1`,
    [ids.users.a.caregiver]
  );
  await client.query('COMMIT');

  const n = await withRole(
    client,
    { role: 'caregiver', userId: ids.users.a.caregiver, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE owning_user_id = $1 AND visibility_level = 'family_shared'`,
        [ids.users.a.senior]
      );
      return r.rows[0].n;
    }
  );
  assert.equal(n, 0, 'caregiver default-deny: empty permission_scope means zero rows');
});
