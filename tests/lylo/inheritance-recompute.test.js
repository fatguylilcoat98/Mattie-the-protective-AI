/*
  Inheritance staleness on source delete (H5).
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

async function makeEpisode(client, ids, sources) {
  const r = await client.query(
    `INSERT INTO lylo_test.episodes (pilot_instance_id, owning_user_id, summary, source_memory_ids, visibility_level)
       VALUES ($1, $2, $3, $4::uuid[], 'family_shared') RETURNING id, visibility_level`,
    [ids.pilots.a, ids.users.a.senior, 'inheritance test ep', sources]
  );
  return r.rows[0];
}

test('soft-deleting a source memory marks derived episode as requires_recompute', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const ep = await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => makeEpisode(c, ids, [ids.memories.a.familyShared])
  );

  // Soft-delete the source.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => c.query(`UPDATE lylo_test.memory_store SET active = false WHERE id = $1`, [ids.memories.a.familyShared])
  );

  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT requires_recompute FROM lylo_test.episodes WHERE id = $1`, [ep.id]);
      assert.equal(r.rows[0].requires_recompute, true,
        'derived episode must be marked requires_recompute when a source is soft-deleted');
    }
  );
});

test('hard-deleting a source memory cascades into requires_recompute on memory_summaries and reflection_archive', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  // Build derived rows for both tables.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await c.query(
        `INSERT INTO lylo_test.memory_summaries (pilot_instance_id, owning_user_id, summary, source_memory_ids, visibility_level)
           VALUES ($1, $2, 'sum', $3::uuid[], 'family_shared')`,
        [ids.pilots.a, ids.users.a.senior, [ids.memories.a.familyShared]]
      );
      await c.query(
        `INSERT INTO lylo_test.reflection_archive (pilot_instance_id, owning_user_id, content, source_memory_ids, visibility_level)
           VALUES ($1, $2, 'r', $3::uuid[], 'family_shared')`,
        [ids.pilots.a, ids.users.a.senior, [ids.memories.a.familyShared]]
      );
    }
  );

  // Hard-delete the source via seeder.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => c.query(`DELETE FROM lylo_test.memory_store WHERE id = $1`, [ids.memories.a.familyShared])
  );

  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      // We use the seeder role to read summaries / reflection (admin can't read all of them by visibility), but here the rows were family_shared so admin can see them.
      const sums = await c.query(`SELECT requires_recompute FROM lylo_test.memory_summaries`);
      assert.ok(sums.rows.every(r => r.requires_recompute === true),
        'all memory_summaries referencing the deleted source must be flagged');
      const refs = await c.query(`SELECT requires_recompute FROM lylo_test.reflection_archive`);
      assert.ok(refs.rows.every(r => r.requires_recompute === true),
        'all reflection_archive rows referencing the deleted source must be flagged');
    }
  );
});
