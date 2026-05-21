/*
  Visibility-change audit.

  Every UPDATE that changes memory_store.visibility_level must write a row
  to memory_visibility_audit_log with old/new state and (when supplied) a
  reason. Enforced by an AFTER UPDATE trigger on memory_store.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('senior changing visibility writes a visibility_changed audit row', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  await withRoleCommitted(
    client,
    {
      role: 'senior',
      userId: ids.users.a.senior,
      pilotInstanceId: ids.pilots.a,
      visibilityChangeReason: 'wanting to share garden notes with Aubrey',
    },
    async (c) => {
      await c.query(
        `UPDATE lylo_test.memory_store SET visibility_level = 'family_shared'
           WHERE id = $1`,
        [ids.memories.a.private]
      );
    }
  );

  // Verify the audit row exists.
  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT event_type, old_visibility, new_visibility, actor_user_id, actor_role, reason
           FROM lylo_test.memory_visibility_audit_log
           WHERE memory_id = $1 AND event_type = 'visibility_changed'
           ORDER BY created_at DESC`,
        [ids.memories.a.private]
      );
      assert.equal(r.rowCount, 1, 'exactly one visibility_changed audit row must exist');
      const row = r.rows[0];
      assert.equal(row.old_visibility, 'private');
      assert.equal(row.new_visibility, 'family_shared');
      assert.equal(row.actor_user_id, ids.users.a.senior);
      assert.equal(row.actor_role, 'senior');
      assert.equal(row.reason, 'wanting to share garden notes with Aubrey');
    }
  );
});

test('updating a row without changing visibility does not write an audit row', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  await withRoleCommitted(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      // Touch updated_at by setting visibility to the same value.
      await c.query(
        `UPDATE lylo_test.memory_store SET visibility_level = visibility_level
           WHERE id = $1`,
        [ids.memories.a.private]
      );
    }
  );

  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_visibility_audit_log
           WHERE memory_id = $1 AND event_type = 'visibility_changed'`,
        [ids.memories.a.private]
      );
      assert.equal(r.rows[0].n, 0,
        'no audit row when visibility_level did not actually change');
    }
  );
});

test('senior can read audit rows about their own memories even if they were not the actor', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // A family member reads the senior's family_shared row, writing a
  // truthful audit row (visibility_read).
  await withRoleCommitted(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await c.query(
        `INSERT INTO lylo_test.memory_visibility_audit_log
           (pilot_instance_id, memory_id, event_type, actor_user_id, actor_role, outcome)
           VALUES ($1, $2, 'visibility_read', $3, 'family', 'allowed')`,
        [ids.pilots.a, ids.memories.a.familyShared, ids.users.a.family]
      );
    }
  );

  // The senior, querying their own audit log, should see that row.
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_visibility_audit_log
           WHERE memory_id = $1`,
        [ids.memories.a.familyShared]
      );
      assert.ok(r.rows[0].n >= 1,
        'senior must be able to see audit rows about their own memories');
    }
  );
});
