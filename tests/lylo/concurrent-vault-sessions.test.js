/*
  Concurrent vault sessions per user are allowed (M4).
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed, grantVaultSession } = require('./fixtures/synthetic-data');

test('a senior may hold multiple concurrent active vault sessions', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await grantVaultSession(client, ids.vaults.a, ids.users.a.senior, ids.pilots.a, 5);
  await grantVaultSession(client, ids.vaults.a, ids.users.a.senior, ids.pilots.a, 10);

  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_vault_sessions WHERE user_id = $1 AND revoked_at IS NULL`,
        [ids.users.a.senior]);
      assert.equal(r.rows[0].n, 2, 'two active sessions allowed');
    }
  );
});
