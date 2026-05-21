/*
  Compose-context authorization tests (C1, H7).
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

async function countPrivate(client, ownerId) {
  const r = await client.query(
    `SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE owning_user_id = $1 AND visibility_level = 'private'`,
    [ownerId]
  );
  return r.rows[0].n;
}

test('system with GUC but no granted compose_authorizations row sees zero private rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const n = await withRole(
    client,
    { role: 'system', userId: ids.users.a.system, pilotInstanceId: ids.pilots.a, composeTargetUserId: ids.users.a.senior },
    (c) => countPrivate(c, ids.users.a.senior)
  );
  assert.equal(n, 0, 'compose target GUC alone must not grant read access');
});

test('system grants compose_authorization then reads target senior private', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const n = await withRole(
    client,
    { role: 'system', userId: ids.users.a.system, pilotInstanceId: ids.pilots.a, composeTargetUserId: ids.users.a.senior },
    async (c) => {
      await c.query(`SELECT lylo_test.grant_compose_authorization($1, $2, $3)`,
        [ids.users.a.senior, 'daily-log compose', 5]);
      return countPrivate(c, ids.users.a.senior);
    }
  );
  assert.equal(n, 1, 'system with grant must see the target senior’s private row');
});

test('non-system role cannot grant compose_authorization', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(`SELECT lylo_test.grant_compose_authorization($1, $2, $3)`,
          [ids.users.a.senior, 'admin trying to compose', 5]),
        /requires the system role/i
      );
    }
  );
});

test('system cannot grant compose_authorization for a target in another pilot', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await withRole(
    client,
    { role: 'system', userId: ids.users.a.system, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(`SELECT lylo_test.grant_compose_authorization($1, $2, $3)`,
          [ids.users.b.senior, 'cross-pilot grant attempt', 5]),
        /not in the session pilot/i
      );
    }
  );
});

test('grant_compose_authorization writes an audit row', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  // Grant in one transaction (committed via withRoleCommitted-like flow).
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'system'`);
  await client.query(`SET LOCAL app.user_id = '${ids.users.a.system}'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '${ids.pilots.a}'`);
  await client.query(`SELECT lylo_test.grant_compose_authorization($1, $2, $3)`,
    [ids.users.a.senior, 'daily-log run 2026-05-21', 5]);
  await client.query('COMMIT');

  // Read the audit row as admin.
  await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT event_type, actor_user_id, target_user_id, reason
           FROM memory_visibility_audit_log
           WHERE event_type = 'compose_context_granted'`
      );
      assert.equal(r.rowCount, 1, 'exactly one compose_context_granted audit row');
      assert.equal(r.rows[0].actor_user_id, ids.users.a.system);
      assert.equal(r.rows[0].target_user_id, ids.users.a.senior);
      assert.match(r.rows[0].reason, /daily-log run/);
    }
  );
});

test('expired compose_authorization stops granting access', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  // Insert an already-expired authorization via the seeder bypass.
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'seeder'`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(
    `INSERT INTO compose_authorizations (pilot_instance_id, target_user_id, authorized_actor_id, reason, expires_at)
       VALUES ($1, $2, $3, 'expired test', now() - interval '1 minute')`,
    [ids.pilots.a, ids.users.a.senior, ids.users.a.system]
  );
  await client.query('COMMIT');

  const n = await withRole(
    client,
    { role: 'system', userId: ids.users.a.system, pilotInstanceId: ids.pilots.a, composeTargetUserId: ids.users.a.senior },
    (c) => countPrivate(c, ids.users.a.senior)
  );
  assert.equal(n, 0, 'expired compose_authorization must not grant access');
});
