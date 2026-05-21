/*
  INSERT / UPDATE restrictions on memory_store.

  Seniors can write their own rows. Family / caregiver / admin / system
  cannot write any rows on memory_store (no INSERT/UPDATE policy for them).
  Senior can update their own rows (and trigger a visibility change audit
  row); other roles cannot update.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('senior INSERT into memory_store succeeds for own row in own pilot', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  const result = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `INSERT INTO lylo_test.memory_store
           (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
           VALUES ($1, $2, $3, 'USER_STATED', 'private') RETURNING id`,
        [ids.pilots.a, ids.users.a.senior, 'new senior-written memory']
      );
      return r.rowCount;
    }
  );
  assert.equal(result, 1, 'senior must be able to insert their own row');
});

test('senior INSERT attributing the row to another user is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(
          `INSERT INTO lylo_test.memory_store
             (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
             VALUES ($1, $2, $3, 'USER_STATED', 'private')`,
          [ids.pilots.a, ids.users.a.family, 'attribute to family - should fail']
        ),
        /row-level security|new row violates|policy/i
      );
    }
  );
});

test('senior INSERT into another pilot is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(
          `INSERT INTO lylo_test.memory_store
             (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
             VALUES ($1, $2, $3, 'USER_STATED', 'private')`,
          [ids.pilots.b, ids.users.a.senior, 'cross-pilot insert - should fail']
        ),
        /row-level security|new row violates|policy/i
      );
    }
  );
});

test('family INSERT into memory_store is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(
          `INSERT INTO lylo_test.memory_store
             (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
             VALUES ($1, $2, $3, 'USER_STATED', 'family_shared')`,
          [ids.pilots.a, ids.users.a.senior, 'family attempting to write']
        ),
        /row-level security|new row violates|policy/i
      );
    }
  );
});

test('senior can update own row visibility; family cannot', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Senior: update own row succeeds (and fires the visibility-change audit
  // trigger; we assert the audit row in visibility-change-audit.test.js).
  await withRole(
    client,
    {
      role: 'senior',
      userId: ids.users.a.senior,
      pilotInstanceId: ids.pilots.a,
      visibilityChangeReason: 'senior chose to share',
    },
    async (c) => {
      const r = await c.query(
        `UPDATE lylo_test.memory_store SET visibility_level = 'family_shared'
           WHERE id = $1`,
        [ids.memories.a.private]
      );
      assert.equal(r.rowCount, 1, 'senior update should succeed');
    }
  );

  // Family: cannot UPDATE (no policy).
  await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `UPDATE lylo_test.memory_store SET visibility_level = 'private'
           WHERE id = $1`,
        [ids.memories.a.familyShared]
      );
      assert.equal(r.rowCount, 0, 'family update must be silently filtered to 0 rows');
    }
  );
});
