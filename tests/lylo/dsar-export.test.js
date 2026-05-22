/*
  F8 — DSAR / soft-delete export path.

  A soft-deleted memory is invisible to every normal SELECT policy. The data
  subject must still reach their own retained data through the explicit,
  audited dsar_export_memories() function, which does not widen any policy.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

async function softDeletePrivate(client, ids) {
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => c.query(`UPDATE lylo_test.memory_store SET active = false WHERE id = $1`,
      [ids.memories.a.private])
  );
}

test('F8: a senior DSAR-exports their own memories, including soft-deleted ones', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await softDeletePrivate(client, ids);

  const rows = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT id, active FROM lylo_test.dsar_export_memories($1)`,
        [ids.users.a.senior]);
      return r.rows;
    }
  );
  const deleted = rows.find((r) => r.id === ids.memories.a.private);
  assert.ok(deleted, 'DSAR export must include the soft-deleted memory');
  assert.equal(deleted.active, false, 'the exported row is the soft-deleted one');
  assert.ok(rows.length >= 3, 'DSAR export returns all of the senior’s memories');
});

test('F8: DSAR does not widen the normal SELECT — soft-deleted rows stay hidden', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await softDeletePrivate(client, ids);

  const n = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE id = $1`,
        [ids.memories.a.private]);
      return r.rows[0].n;
    }
  );
  assert.equal(n, 0, 'the normal senior SELECT still hides the soft-deleted row');
});

test('F8: a senior cannot DSAR-export another user’s memories', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(`SELECT * FROM lylo_test.dsar_export_memories($1)`, [ids.users.b.senior]),
        /data subject/i,
        'DSAR export must refuse a target other than the calling data subject'
      );
    }
  );
});

test('F8: DSAR export writes exactly one export_filtered audit row', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRoleCommitted(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => c.query(`SELECT * FROM lylo_test.dsar_export_memories($1)`, [ids.users.a.senior])
  );
  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_visibility_audit_log
           WHERE event_type = 'export_filtered' AND target_user_id = $1`,
        [ids.users.a.senior]
      );
      assert.equal(r.rows[0].n, 1, 'exactly one export_filtered audit row');
    }
  );
});
