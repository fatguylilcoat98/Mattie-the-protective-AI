/*
  Derived-row visibility inheritance.

  An episode / summary / reflection_archive row composed from source
  memories inherits the most restrictive source visibility. Family role
  reading the derived table sees only rows that resolve to family_shared.

  The inheritance is enforced by a BEFORE INSERT/UPDATE trigger on each
  derived table (see synthetic-schema.sql).
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

async function makeEpisode(client, ids, sourceMemoryIds) {
  const r = await client.query(
    `INSERT INTO lylo_test.episodes
       (pilot_instance_id, owning_user_id, summary, source_memory_ids,
        visibility_level)
       VALUES ($1, $2, $3, $4::uuid[], 'family_shared')
       RETURNING id, visibility_level`,
    [ids.pilots.a, ids.users.a.senior, 'derived episode', sourceMemoryIds]
  );
  return r.rows[0];
}

test('episode composed only of family_shared sources stays family_shared', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  const ep = await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => makeEpisode(c, ids, [ids.memories.a.familyShared])
  );
  assert.equal(ep.visibility_level, 'family_shared');

  const seen = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.episodes WHERE id = $1`, [ep.id]);
      return r.rows[0].n;
    }
  );
  assert.equal(seen, 1, 'family must see the family_shared-derived episode');
});

test('episode that mixes a private source is downgraded to private', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  const ep = await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => makeEpisode(c, ids, [ids.memories.a.familyShared, ids.memories.a.private])
  );
  assert.equal(ep.visibility_level, 'private',
    'trigger must downgrade to the most restrictive source visibility');

  // Family must NOT see this row.
  const seenByFamily = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.episodes WHERE id = $1`, [ep.id]);
      return r.rows[0].n;
    }
  );
  assert.equal(seenByFamily, 0, 'family must not see a derived row inheriting private');

  // Senior must see it (they own the underlying private source).
  const seenBySenior = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.episodes WHERE id = $1`, [ep.id]);
      return r.rows[0].n;
    }
  );
  assert.equal(seenBySenior, 1, 'senior must see their own derived row');
});

test('episode that mixes a password_locked source is downgraded to password_locked', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  const ep = await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    (c) => makeEpisode(c, ids, [ids.memories.a.familyShared, ids.memories.a.passwordLocked])
  );
  assert.equal(ep.visibility_level, 'password_locked',
    'trigger must downgrade to password_locked when any source is locked');

  // Senior without an active vault session: cannot see.
  const seenWithoutVault = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.episodes WHERE id = $1`, [ep.id]);
      return r.rows[0].n;
    }
  );
  assert.equal(seenWithoutVault, 0,
    'senior without vault session must not see a password_locked-inheriting episode');
});

test('outbound message composed from a private memory must be addressed to the owning senior', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Composing a draft addressed to the senior with a private source: OK.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await c.query(
        `INSERT INTO lylo_test.outbound_messages
           (pilot_instance_id, target_user_id, body, used_memory_ids,
            visibility_level)
           VALUES ($1, $2, 'hi', $3::uuid[], 'family_shared')`,
        [ids.pilots.a, ids.users.a.senior, [ids.memories.a.private]]
      );
    }
  );

  // Composing a draft addressed to a family member with a private source: refused by trigger.
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'seeder'`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);
  await assert.rejects(
    client.query(
      `INSERT INTO outbound_messages
         (pilot_instance_id, target_user_id, body, used_memory_ids, visibility_level)
         VALUES ($1, $2, 'hi', $3::uuid[], 'family_shared')`,
      [ids.pilots.a, ids.users.a.family, [ids.memories.a.private]]
    ),
    /must target the owning senior/,
    'outbound trigger must refuse private-content drafts addressed to non-owners'
  );
  await client.query('ROLLBACK');
});
