/*
  Admin cannot read pin_hash / pin_salt (C5).
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('admin SELECT on memory_vaults returns zero rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const n = await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_vaults`);
      return r.rows[0].n;
    }
  );
  assert.equal(n, 0, 'admin must have zero direct access to memory_vaults rows');
});

test('admin SELECT on memory_vault_sessions returns zero rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const n = await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_vault_sessions`);
      return r.rows[0].n;
    }
  );
  assert.equal(n, 0, 'admin must have zero direct access to memory_vault_sessions rows');
});
