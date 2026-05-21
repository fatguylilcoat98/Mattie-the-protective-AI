/*
  Senior UPDATE policy gates on active = true (H3).
  Tests that soft-deleted rows cannot be updated by the senior, which means
  the 30-day grace-period semantics of soft-delete are enforced at the RLS
  layer.
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('senior INSERT into memory_store succeeds for own row in own pilot', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  const result = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `INSERT INTO lylo_test.memory_store (pilot_instance_id, owning_user_id, content, provenance, visibility_level) VALUES ($1, $2, $3, 'USER_STATED', 'private') RETURNING id`,
        [ids.pilots.a, ids.users.a.senior, 'new senior-written memory']
      );
      return r.rowCount;
    }
  );
  assert.equal(result, 1);
});

test('senior INSERT attributing the row to another user is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(`INSERT INTO lylo_test.memory_store (pilot_instance_id, owning_user_id, content, provenance, visibility_level) VALUES ($1, $2, $3, 'USER_STATED', 'private')`,
          [ids.pilots.a, ids.users.a.family, 'wrong attribution']),
        /row-level security|new row violates|policy/i
      );
    }
  );
});

test('family INSERT into memory_store is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(`INSERT INTO lylo_test.memory_store (pilot_instance_id, owning_user_id, content, provenance, visibility_level) VALUES ($1, $2, $3, 'USER_STATED', 'family_shared')`,
          [ids.pilots.a, ids.users.a.senior, 'family writing']),
        /row-level security|new row violates|policy/i
      );
    }
  );
});

test('senior can update own active row visibility; family cannot', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a, visibilityChangeReason: 'sharing' },
    async (c) => {
      const r = await c.query(`UPDATE lylo_test.memory_store SET visibility_level = 'family_shared' WHERE id = $1`, [ids.memories.a.private]);
      assert.equal(r.rowCount, 1);
    }
  );
  await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`UPDATE lylo_test.memory_store SET visibility_level = 'private' WHERE id = $1`, [ids.memories.a.familyShared]);
      assert.equal(r.rowCount, 0, 'family UPDATE must filter to 0 rows');
    }
  );
});

test('H3: senior cannot UPDATE soft-deleted (active = false) rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  // Soft-delete the senior's private row via seeder.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => c.query(`UPDATE lylo_test.memory_store SET active = false WHERE id = $1`, [ids.memories.a.private])
  );

  // Senior attempts to undelete by UPDATE: must be filtered to 0 rows.
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`UPDATE lylo_test.memory_store SET active = true WHERE id = $1`, [ids.memories.a.private]);
      assert.equal(r.rowCount, 0, 'senior cannot UPDATE a soft-deleted row (active = false)');
    }
  );

  // And cannot change its visibility either.
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a, visibilityChangeReason: 'attempt' },
    async (c) => {
      const r = await c.query(`UPDATE lylo_test.memory_store SET visibility_level = 'family_shared' WHERE id = $1`, [ids.memories.a.private]);
      assert.equal(r.rowCount, 0, 'senior cannot UPDATE visibility of a soft-deleted row');
    }
  );
});
