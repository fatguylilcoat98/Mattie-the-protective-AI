/*
  Audit-log append-only invariant.

  - UPDATE on memory_visibility_audit_log raises for every role.
  - DELETE on memory_visibility_audit_log raises for every role.
  - Forgery refusal is in audit-forgery.test.js (separate file).
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

async function insertOneAudit(client, ids, role) {
  return withRole(
    client,
    { role, userId: ids.users.a[role], pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `INSERT INTO lylo_test.memory_visibility_audit_log
           (pilot_instance_id, memory_id, event_type, actor_user_id, actor_role, outcome)
           VALUES ($1, $2, 'visibility_read', $3, $4, 'allowed')
           RETURNING id`,
        [ids.pilots.a, ids.memories.a.familyShared, ids.users.a[role], role]
      );
      return r.rows[0].id;
    }
  );
}

test('UPDATE on memory_visibility_audit_log is silently filtered to 0 rows for every role', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);
  // The audit row is committed by the seeder so it survives the
  // role-scoped transactions below.
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL ROLE lylo_seeder`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(
    `INSERT INTO memory_visibility_audit_log
       (pilot_instance_id, memory_id, event_type, actor_user_id, actor_role, outcome)
       VALUES ($1, $2, 'visibility_read', $3, 'senior', 'allowed')`,
    [ids.pilots.a, ids.memories.a.familyShared, ids.users.a.senior]
  );
  await client.query('COMMIT');

  for (const role of ['senior', 'family', 'caregiver', 'admin', 'system']) {
    await t.test(`${role} UPDATE attempts return 0 rows`, async () => {
      await withRole(
        client,
        { role, userId: ids.users.a[role], pilotInstanceId: ids.pilots.a },
        async (c) => {
          const r = await c.query(`UPDATE memory_visibility_audit_log SET outcome = 'denied'`);
          assert.equal(r.rowCount, 0, `${role} should not be able to update any audit rows`);
        }
      );
    });
  }
});

test('DELETE on memory_visibility_audit_log is silently filtered to 0 rows for every role', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL ROLE lylo_seeder`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(
    `INSERT INTO memory_visibility_audit_log
       (pilot_instance_id, memory_id, event_type, actor_user_id, actor_role, outcome)
       VALUES ($1, $2, 'visibility_read', $3, 'senior', 'allowed')`,
    [ids.pilots.a, ids.memories.a.familyShared, ids.users.a.senior]
  );
  await client.query('COMMIT');

  for (const role of ['senior', 'family', 'caregiver', 'admin', 'system']) {
    await t.test(`${role} DELETE attempts return 0 rows`, async () => {
      await withRole(
        client,
        { role, userId: ids.users.a[role], pilotInstanceId: ids.pilots.a },
        async (c) => {
          const r = await c.query(`DELETE FROM memory_visibility_audit_log`);
          assert.equal(r.rowCount, 0, `${role} should not be able to delete any audit rows`);
        }
      );
    });
  }
});

// Scaffolded slower / less common cases:
test('audit log write failures fail-close the originating action (TODO PR D + PR E)', (t) => {
  t.skip('TODO PR D + PR E: write-failure injection scenario');
});

test('migration role can UPDATE / DELETE for retention (TODO PR E)', (t) => {
  t.skip('TODO PR E: synthetic schema must add a retention worker role');
});
