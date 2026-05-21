/*
  RLS matrix tests (hardened, v3).
  Updated for the new compose_authorizations gate (C1).
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed, grantVaultSession } = require('./fixtures/synthetic-data');

function matrix(ids) {
  const a = ids.users.a;
  const P = ids.pilots.a;
  return [
    { role: 'senior',    userId: a.senior,    visibility: 'private',         expected: 1, pilot: P },
    { role: 'senior',    userId: a.senior,    visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'senior',    userId: a.senior,    visibility: 'password_locked', expected: 0, pilot: P },
    { role: 'family',    userId: a.family,    visibility: 'private',         expected: 0, pilot: P },
    { role: 'family',    userId: a.family,    visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'family',    userId: a.family,    visibility: 'password_locked', expected: 0, pilot: P },
    { role: 'caregiver', userId: a.caregiver, visibility: 'private',         expected: 0, pilot: P },
    { role: 'caregiver', userId: a.caregiver, visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'caregiver', userId: a.caregiver, visibility: 'password_locked', expected: 0, pilot: P },
    { role: 'admin',     userId: a.admin,     visibility: 'private',         expected: 0, pilot: P },
    { role: 'admin',     userId: a.admin,     visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'admin',     userId: a.admin,     visibility: 'password_locked', expected: 0, pilot: P },
    { role: 'system',    userId: a.system,    visibility: 'private',         expected: 0, pilot: P },
    { role: 'system',    userId: a.system,    visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'system',    userId: a.system,    visibility: 'password_locked', expected: 0, pilot: P },
  ];
}

async function countVisible(client, ownerId, visibility) {
  const r = await client.query(
    `SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE owning_user_id = $1 AND visibility_level = $2`,
    [ownerId, visibility]
  );
  return r.rows[0].n;
}

test('RLS matrix: role x visibility per privacy model §5.1', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  const ownerA = ids.users.a.senior;
  for (const row of matrix(ids)) {
    await t.test(`${row.role} viewing ${row.visibility} -> count = ${row.expected}`, async () => {
      const got = await withRole(
        client,
        { role: row.role, userId: row.userId, pilotInstanceId: row.pilot },
        (c) => countVisible(c, ownerA, row.visibility)
      );
      assert.equal(got, row.expected, `${row.role}/${row.visibility} expected ${row.expected}, got ${got}`);
    });
  }
});

test('senior with active vault session: password_locked becomes visible', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await grantVaultSession(client, ids.vaults.a, ids.users.a.senior, ids.pilots.a, 5);
  const visible = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => countVisible(c, ids.users.a.senior, 'password_locked')
  );
  assert.equal(visible, 1, 'senior with active vault session should see the locked row');
});

test('family default-deny: empty permission_scope yields zero family_shared', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'seeder'`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`UPDATE family_contacts SET permission_scope = '{"visibility_levels": []}'::jsonb WHERE contact_user_id = $1`, [ids.users.a.family]);
  await client.query('COMMIT');
  const n = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    (c) => countVisible(c, ids.users.a.senior, 'family_shared')
  );
  assert.equal(n, 0, 'empty permission_scope must mean zero family_shared rows');
});
