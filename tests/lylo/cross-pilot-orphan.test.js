/*
  Cross-pilot orphan prevention (C2).
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { seed } = require('./fixtures/synthetic-data');

test('memory_store INSERT with owning_user_id from another pilot is refused by composite FK', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'seeder'`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);

  await assert.rejects(
    client.query(
      `INSERT INTO memory_store (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
         VALUES ($1, $2, 'cross-pilot orphan attempt', 'USER_STATED', 'private')`,
      [ids.pilots.b, ids.users.a.senior] // pilot B + pilot A's user
    ),
    /foreign key|violates/i,
    'composite FK must refuse owning_user_id from a different pilot'
  );
  await client.query('ROLLBACK');
});

test('family_contacts cross-pilot row is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'seeder'`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);

  await assert.rejects(
    client.query(
      `INSERT INTO family_contacts (pilot_instance_id, senior_user_id, contact_user_id, permission_scope)
         VALUES ($1, $2, $3, $4::jsonb)`,
      [ids.pilots.a, ids.users.a.senior, ids.users.b.family, JSON.stringify({ visibility_levels: ['family_shared'] })]
    ),
    /foreign key|violates/i,
    'family_contacts must refuse contact_user_id from another pilot'
  );
  await client.query('ROLLBACK');
});

test('memory_vaults cross-pilot user is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'seeder'`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);

  await assert.rejects(
    client.query(
      `INSERT INTO memory_vaults (pilot_instance_id, user_id, pin_hash, pin_salt) VALUES ($1, $2, 'h', 's')`,
      [ids.pilots.a, ids.users.b.senior]
    ),
    /foreign key|violates/i,
    'memory_vaults must refuse user_id from another pilot'
  );
  await client.query('ROLLBACK');
});
