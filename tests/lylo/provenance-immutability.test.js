/*
  D1 — locked 3-class provenance model.
  F1 — provenance / content immutability (source-of-truth-memory-policy §10).
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('D1: a retired provenance value (INFERRED) is rejected', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(
          `INSERT INTO lylo_test.memory_store
             (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
             VALUES ($1, $2, 'legacy provenance', 'INFERRED', 'private')`,
          [ids.pilots.a, ids.users.a.senior]
        ),
        /check constraint|violates/i,
        'the retired INFERRED value must be rejected by the provenance CHECK'
      );
    }
  );
});

test('D1: the three locked provenance classes are accepted', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      for (const p of ['VERIFIED_FACT', 'USER_STATED', 'AI_INFERRED']) {
        const r = await c.query(
          `INSERT INTO lylo_test.memory_store
             (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
             VALUES ($1, $2, $3, $4, 'private') RETURNING id`,
          [ids.pilots.a, ids.users.a.senior, `mem ${p}`, p]
        );
        assert.equal(r.rowCount, 1, `${p} must be accepted`);
      }
    }
  );
});

test('F1: a senior cannot UPDATE the provenance of an existing memory', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(`UPDATE lylo_test.memory_store SET provenance = 'VERIFIED_FACT' WHERE id = $1`,
          [ids.memories.a.private]),
        /immutable/i,
        'provenance is immutable — no in-place self-promotion to VERIFIED_FACT'
      );
    }
  );
});

test('F1: a senior cannot UPDATE the content of an existing memory', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(`UPDATE lylo_test.memory_store SET content = 'rewritten' WHERE id = $1`,
          [ids.memories.a.private]),
        /immutable/i,
        'content is immutable — correction is supersession, not in-place edit'
      );
    }
  );
});

test('F1: visibility_level remains mutable (immutability is column-scoped)', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a, visibilityChangeReason: 'share' },
    async (c) => {
      const r = await c.query(
        `UPDATE lylo_test.memory_store SET visibility_level = 'family_shared' WHERE id = $1`,
        [ids.memories.a.private]
      );
      assert.equal(r.rowCount, 1, 'visibility_level is still mutable');
    }
  );
});
