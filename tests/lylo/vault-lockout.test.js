/*
  Vault lockout behavior (hardened): H6 revocation, H4 serialization.
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed, grantVaultSession } = require('./fixtures/synthetic-data');

test('5 failed unlock attempts trigger lockout; 6th session insert is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      for (let i = 0; i < 5; i++) {
        await c.query(`SELECT lylo_test.record_failed_unlock($1)`, [ids.vaults.a]);
      }
    }
  );

  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const state = await c.query(`SELECT failed_attempt_count, lockout_until FROM lylo_test.memory_vaults WHERE id = $1`, [ids.vaults.a]);
      assert.equal(state.rows[0].failed_attempt_count, 5);
      assert.ok(state.rows[0].lockout_until);
    }
  );

  await withRole(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(`INSERT INTO lylo_test.memory_vault_sessions (vault_id, user_id, pilot_instance_id, expires_at) VALUES ($1, $2, $3, now() + interval '5 minutes')`,
          [ids.vaults.a, ids.users.a.senior, ids.pilots.a]),
        /locked until|check_violation/i
      );
    }
  );
});

test('successful unlock resets the counter and clears lockout', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      for (let i = 0; i < 3; i++) await c.query(`SELECT lylo_test.record_failed_unlock($1)`, [ids.vaults.a]);
      await c.query(`SELECT lylo_test.record_successful_unlock($1)`, [ids.vaults.a]);
    }
  );

  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const state = await c.query(`SELECT failed_attempt_count, lockout_until FROM lylo_test.memory_vaults WHERE id = $1`, [ids.vaults.a]);
      assert.equal(state.rows[0].failed_attempt_count, 0);
      assert.equal(state.rows[0].lockout_until, null);
    }
  );
});

test('H6: lockout revokes any active vault sessions', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  // Establish an active session.
  await grantVaultSession(client, ids.vaults.a, ids.users.a.senior, ids.pilots.a, 30);

  // Confirm there's exactly one active session.
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_vault_sessions WHERE vault_id = $1 AND revoked_at IS NULL`, [ids.vaults.a]);
      assert.equal(r.rows[0].n, 1, 'one active session before lockout');
    }
  );

  // Trip lockout.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      for (let i = 0; i < 5; i++) await c.query(`SELECT lylo_test.record_failed_unlock($1)`, [ids.vaults.a]);
    }
  );

  // Active session should now be revoked.
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_vault_sessions WHERE vault_id = $1 AND revoked_at IS NULL`, [ids.vaults.a]);
      assert.equal(r.rows[0].n, 0, 'no active sessions after lockout');
    }
  );

  // And the password_locked memory must no longer be visible.
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE owning_user_id = $1 AND visibility_level = 'password_locked'`, [ids.users.a.senior]);
      assert.equal(r.rows[0].n, 0, 'locked memory invisible to senior after lockout-revocation');
    }
  );
});
