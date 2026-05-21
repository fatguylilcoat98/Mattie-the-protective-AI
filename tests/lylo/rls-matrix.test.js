/*
  RLS matrix tests (hardened).

  Maps onto docs/lylo-memory-privacy-model.md §5.1. Every combination of
  role x visibility level for the role's own pilot. The expected counts
  are taken verbatim from §5.1.

  Cross-pilot isolation is tested in cross-pilot-isolation.test.js.
  Insert / update restrictions are in insert-update-restrictions.test.js.
  Forgery is in audit-forgery.test.js.
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
    // SENIOR - own pilot, own rows.
    { role: 'senior',    userId: a.senior,    visibility: 'private',         expected: 1, pilot: P },
    { role: 'senior',    userId: a.senior,    visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'senior',    userId: a.senior,    visibility: 'password_locked', expected: 0, pilot: P }, // no vault session yet
    // FAMILY - family_shared only.
    { role: 'family',    userId: a.family,    visibility: 'private',         expected: 0, pilot: P },
    { role: 'family',    userId: a.family,    visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'family',    userId: a.family,    visibility: 'password_locked', expected: 0, pilot: P },
    // CAREGIVER - family_shared only (granted in seed).
    { role: 'caregiver', userId: a.caregiver, visibility: 'private',         expected: 0, pilot: P },
    { role: 'caregiver', userId: a.caregiver, visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'caregiver', userId: a.caregiver, visibility: 'password_locked', expected: 0, pilot: P },
    // ADMIN - family_shared only at the base table.
    { role: 'admin',     userId: a.admin,     visibility: 'private',         expected: 0, pilot: P },
    { role: 'admin',     userId: a.admin,     visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'admin',     userId: a.admin,     visibility: 'password_locked', expected: 0, pilot: P },
    // SYSTEM (no compose context) - family_shared only.
    { role: 'system',    userId: a.system,    visibility: 'private',         expected: 0, pilot: P },
    { role: 'system',    userId: a.system,    visibility: 'family_shared',   expected: 1, pilot: P },
    { role: 'system',    userId: a.system,    visibility: 'password_locked', expected: 0, pilot: P },
  ];
}

async function countVisible(client, ownerId, visibility) {
  const r = await client.query(
    `SELECT count(*)::int AS n FROM lylo_test.memory_store
      WHERE owning_user_id = $1 AND visibility_level = $2`,
    [ownerId, visibility]
  );
  return r.rows[0].n;
}

test('RLS matrix: role x visibility per privacy model §5.1', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);
  const ownerA = ids.users.a.senior;

  for (const row of matrix(ids)) {
    await t.test(
      `${row.role} viewing ${row.visibility} -> count = ${row.expected}`,
      async () => {
        const got = await withRole(
          client,
          { role: row.role, userId: row.userId, pilotInstanceId: row.pilot },
          (c) => countVisible(c, ownerA, row.visibility)
        );
        assert.equal(got, row.expected,
          `role=${row.role} visibility=${row.visibility}: expected ${row.expected}, got ${got}`);
      }
    );
  }
});

test('senior with active vault session: password_locked becomes visible', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);
  await grantVaultSession(client, ids.vaults.a, ids.users.a.senior, ids.pilots.a, 5);

  const visible = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => countVisible(c, ids.users.a.senior, 'password_locked')
  );
  assert.equal(visible, 1, 'senior with active vault session should see the locked row');
});

test('system role with compose context: private memory of target user becomes visible; locked never', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Without compose context: system cannot see private.
  const withoutCompose = await withRole(
    client,
    { role: 'system', userId: ids.users.a.system, pilotInstanceId: ids.pilots.a },
    (c) => countVisible(c, ids.users.a.senior, 'private')
  );
  assert.equal(withoutCompose, 0, 'system without compose context must not see private');

  // With compose context: system can see this senior's private rows.
  const withCompose = await withRole(
    client,
    {
      role: 'system',
      userId: ids.users.a.system,
      pilotInstanceId: ids.pilots.a,
      composeTargetUserId: ids.users.a.senior,
    },
    (c) => countVisible(c, ids.users.a.senior, 'private')
  );
  assert.equal(withCompose, 1, 'system with compose context targeting the senior must see private');

  // Even with compose context, system never sees password_locked.
  const lockedWithCompose = await withRole(
    client,
    {
      role: 'system',
      userId: ids.users.a.system,
      pilotInstanceId: ids.pilots.a,
      composeTargetUserId: ids.users.a.senior,
    },
    (c) => countVisible(c, ids.users.a.senior, 'password_locked')
  );
  assert.equal(lockedWithCompose, 0, 'system must NEVER see password_locked, even with compose context');
});

test('family default-deny: a family contact with empty permission_scope sees zero family_shared rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Strip the family contact's scope back to the default empty array.
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'seeder'`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(
    `UPDATE family_contacts SET permission_scope = '{"visibility_levels": []}'::jsonb
       WHERE contact_user_id = $1`,
    [ids.users.a.family]
  );
  await client.query('COMMIT');

  const visible = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    (c) => countVisible(c, ids.users.a.senior, 'family_shared')
  );
  assert.equal(visible, 0,
    'a family contact with empty permission_scope must see zero family_shared rows (default-deny)');
});
