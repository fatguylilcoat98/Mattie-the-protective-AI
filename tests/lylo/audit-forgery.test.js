/*
  Audit-log forgery refusal.

  Every audit-log INSERT must attribute the action to the session's own
  actor_user_id and actor_role. This prevents a compromised or malicious
  admin from forging an audit row attributed to a senior.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

async function attemptInsert(client, sourceMemoryId, pilotInstanceId, actorUserId, actorRole) {
  return client.query(
    `INSERT INTO lylo_test.memory_visibility_audit_log
       (pilot_instance_id, memory_id, event_type, actor_user_id, actor_role, outcome)
       VALUES ($1, $2, 'visibility_read', $3, $4, 'allowed')`,
    [pilotInstanceId, sourceMemoryId, actorUserId, actorRole]
  );
}

test('admin cannot forge an audit row attributed to a senior', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        attemptInsert(c, ids.memories.a.familyShared, ids.pilots.a, ids.users.a.senior, 'admin'),
        /new row violates|row-level security|policy/i,
        'admin trying to insert with actor_user_id = senior must be refused'
      );
    }
  );
});

test('family cannot forge an audit row with actor_role = admin', async (t) => {
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
        attemptInsert(c, ids.memories.a.familyShared, ids.pilots.a, ids.users.a.family, 'admin'),
        /new row violates|row-level security|policy/i,
        'family trying to claim actor_role=admin must be refused'
      );
    }
  );
});

test('senior cannot forge an audit row attributed to a different senior', async (t) => {
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
        attemptInsert(c, ids.memories.a.familyShared, ids.pilots.a, ids.users.b.senior, 'senior'),
        /new row violates|row-level security|policy/i,
        'senior trying to attribute an action to another senior must be refused'
      );
    }
  );
});

test('truthful insert (actor_user_id = session, actor_role = session) succeeds for every role', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  for (const role of ['senior', 'family', 'caregiver', 'admin', 'system']) {
    await t.test(`${role} can INSERT a truthful audit row`, async () => {
      await withRole(
        client,
        { role, userId: ids.users.a[role], pilotInstanceId: ids.pilots.a },
        async (c) => {
          const r = await attemptInsert(
            c, ids.memories.a.familyShared, ids.pilots.a,
            ids.users.a[role], role
          );
          assert.equal(r.rowCount, 1, `${role} truthful insert should succeed`);
        }
      );
    });
  }
});

test('F7: a session cannot hand-write an integrity event (visibility_changed)', async (t) => {
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
          `INSERT INTO lylo_test.memory_visibility_audit_log
             (pilot_instance_id, memory_id, event_type, actor_user_id, actor_role,
              old_visibility, new_visibility, outcome)
             VALUES ($1, $2, 'visibility_changed', $3, 'senior', 'private', 'family_shared', 'allowed')`,
          [ids.pilots.a, ids.memories.a.private, ids.users.a.senior]
        ),
        /new row violates|row-level security|policy/i,
        'a direct session INSERT may not forge an integrity event'
      );
    }
  );
});

test('F7: a session may still hand-write an attestation event (visibility_read)', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `INSERT INTO lylo_test.memory_visibility_audit_log
           (pilot_instance_id, memory_id, event_type, actor_user_id, actor_role, outcome)
           VALUES ($1, $2, 'visibility_read', $3, 'senior', 'allowed') RETURNING id`,
        [ids.pilots.a, ids.memories.a.private, ids.users.a.senior]
      );
      assert.equal(r.rowCount, 1,
        'visibility_read is an attestation event a session may write directly');
    }
  );
});
