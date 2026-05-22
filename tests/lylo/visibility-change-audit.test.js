/*
  Visibility-change audit and fail-closed semantics (M1).
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
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRoleCommitted(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a, visibilityChangeReason: 'sharing garden notes' },
    (c) => c.query(`UPDATE lylo_test.memory_store SET visibility_level = 'family_shared' WHERE id = $1`, [ids.memories.a.private])
  );
  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT event_type, old_visibility, new_visibility, actor_user_id, actor_role, reason FROM lylo_test.memory_visibility_audit_log WHERE memory_id = $1 AND event_type = 'visibility_changed' ORDER BY created_at DESC`, [ids.memories.a.private]);
      assert.equal(r.rowCount, 1);
      assert.equal(r.rows[0].old_visibility, 'private');
      assert.equal(r.rows[0].new_visibility, 'family_shared');
      assert.equal(r.rows[0].actor_user_id, ids.users.a.senior);
      assert.equal(r.rows[0].actor_role, 'senior');
      assert.equal(r.rows[0].reason, 'sharing garden notes');
    }
  );
});

test('updating without changing visibility writes no audit row', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRoleCommitted(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => c.query(`UPDATE lylo_test.memory_store SET visibility_level = visibility_level WHERE id = $1`, [ids.memories.a.private])
  );
  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_visibility_audit_log WHERE memory_id = $1 AND event_type = 'visibility_changed'`, [ids.memories.a.private]);
      assert.equal(r.rows[0].n, 0);
    }
  );
});

test('senior can read audit rows about their own memories even if they were not the actor', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRoleCommitted(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    (c) => c.query(`INSERT INTO lylo_test.memory_visibility_audit_log (pilot_instance_id, memory_id, event_type, actor_user_id, actor_role, outcome) VALUES ($1, $2, 'visibility_read', $3, 'family', 'allowed')`,
      [ids.pilots.a, ids.memories.a.familyShared, ids.users.a.family])
  );
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_visibility_audit_log WHERE memory_id = $1`, [ids.memories.a.familyShared]);
      assert.ok(r.rows[0].n >= 1);
    }
  );
});

test('M1: visibility-change trigger raises when session GUCs are missing', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  // Attempt the visibility change WITHOUT setting GUCs (no withRole wrapper)
  // but inside a transaction so SET LOCAL is meaningful. We deliberately
  // skip the user/role/pilot GUCs to simulate a misconfigured request.
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  // No SET LOCAL of app.* (or set to NULL by leaving them unset).
  // We need a seeder bypass to even SELECT/UPDATE memory_store, so set
  // the seeder role but leave the other two GUCs unset to test the trigger.
  await client.query(`SET LOCAL ROLE lylo_seeder`);
  // Intentionally NOT setting app.user_id or app.pilot_instance_id.
  await assert.rejects(
    client.query(`UPDATE memory_store SET visibility_level = 'family_shared' WHERE id = $1`, [ids.memories.a.private]),
    /authenticated session context|user_id, role, pilot_instance_id/i,
    'visibility-change trigger must fail-close when actor GUCs are missing'
  );
  await client.query('ROLLBACK');
});
