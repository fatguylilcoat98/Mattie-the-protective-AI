/*
  Senior sees own data only.

  An unqualified SELECT on memory_store as the senior returns ONLY their
  own rows in their own pilot. Nothing from the other pilot's senior,
  nothing from another user in the same pilot.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('senior unqualified SELECT returns only their own rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Add an extra row owned by a different user in the same pilot to make
  // the test stronger.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      // Family contact in pilot A also has a user_id; give them a row of
      // their own to confirm the senior doesn't see it. The schema
      // permits any user to be the owning_user_id; the FK is satisfied.
      await c.query(
        `INSERT INTO lylo_test.memory_store
           (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
           VALUES ($1, $2, $3, 'USER_STATED', 'private')`,
        [ids.pilots.a, ids.users.a.family, 'memory owned by the family user']
      );
    }
  );

  const rows = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT owning_user_id, pilot_instance_id, visibility_level
           FROM lylo_test.memory_store`
      );
      return r.rows;
    }
  );

  assert.ok(rows.length > 0, 'senior should see at least their own rows');
  for (const row of rows) {
    assert.equal(row.owning_user_id, ids.users.a.senior,
      'every visible row must be owned by the senior');
    assert.equal(row.pilot_instance_id, ids.pilots.a,
      'every visible row must be in the senior’s pilot');
    assert.ok(['private', 'family_shared'].includes(row.visibility_level),
      `senior without vault session must not see password_locked; got ${row.visibility_level}`);
  }
});

test('senior cannot read inactive (soft-deleted) own rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Soft-delete the senior's private row.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await c.query(
        `UPDATE lylo_test.memory_store SET active = false WHERE id = $1`,
        [ids.memories.a.private]
      );
    }
  );

  const seenPrivate = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_store
           WHERE id = $1`,
        [ids.memories.a.private]
      );
      return r.rows[0].n;
    }
  );
  assert.equal(seenPrivate, 0,
    'senior must not see their own row once active = false');
});
