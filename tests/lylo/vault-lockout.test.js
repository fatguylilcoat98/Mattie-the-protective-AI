/*
  Vault lockout behavior.

  Spec:
    - 5 consecutive failed unlock attempts -> vault is locked for 30 minutes.
    - A subsequent attempt to insert a memory_vault_sessions row is refused
      by the lockout trigger (regardless of role, because the trigger fires
      on the row not on the policy).
    - A successful unlock resets the counter.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole, withRoleCommitted } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

async function getVaultState(client, vaultId) {
  const r = await client.query(
    `SELECT failed_attempt_count, lockout_until FROM lylo_test.memory_vaults WHERE id = $1`,
    [vaultId]
  );
  return r.rows[0];
}

test('5 failed unlock attempts trigger lockout; 6th session insert is refused', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Simulate 5 failed unlocks via the helper function.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      for (let i = 0; i < 5; i++) {
        await c.query(`SELECT lylo_test.record_failed_unlock($1)`, [ids.vaults.a]);
      }
    }
  );

  // Vault should now be locked.
  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const state = await getVaultState(c, ids.vaults.a);
      assert.equal(state.failed_attempt_count, 5, 'failed_attempt_count should be 5');
      assert.ok(state.lockout_until, 'lockout_until should be set');
      assert.ok(new Date(state.lockout_until) > new Date(),
        'lockout_until should be in the future');
    }
  );

  // A 6th session insert should be refused by the trigger, even via
  // the seeder role - the trigger fires regardless of policy.
  await withRole(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await assert.rejects(
        c.query(
          `INSERT INTO lylo_test.memory_vault_sessions (vault_id, user_id, expires_at)
             VALUES ($1, $2, now() + interval '5 minutes')`,
          [ids.vaults.a, ids.users.a.senior]
        ),
        /locked until|check_violation/i,
        'inserting a vault session during lockout must be refused by the trigger'
      );
    }
  );
});

test('successful unlock resets the counter and clears lockout', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Fail 3 times, then succeed.
  await withRoleCommitted(
    client,
    { role: 'seeder', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      for (let i = 0; i < 3; i++) {
        await c.query(`SELECT lylo_test.record_failed_unlock($1)`, [ids.vaults.a]);
      }
      await c.query(`SELECT lylo_test.record_successful_unlock($1)`, [ids.vaults.a]);
    }
  );

  await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const state = await getVaultState(c, ids.vaults.a);
      assert.equal(state.failed_attempt_count, 0, 'counter must reset after success');
      assert.equal(state.lockout_until, null, 'lockout_until must clear');
    }
  );
});

test('vault-session lockout check applies to the seeder role too (defense in depth)', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Directly set lockout_until in the future via the seeder.
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.user_role = 'seeder'`);
  await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);
  await client.query(
    `UPDATE memory_vaults SET lockout_until = now() + interval '30 minutes' WHERE id = $1`,
    [ids.vaults.a]
  );
  // Even though the seeder has FOR-ALL policies, the trigger still fires.
  await assert.rejects(
    client.query(
      `INSERT INTO memory_vault_sessions (vault_id, user_id, expires_at)
         VALUES ($1, $2, now() + interval '5 minutes')`,
      [ids.vaults.a, ids.users.a.senior]
    ),
    /locked until|check_violation/i,
    'trigger applies even to the seeder role'
  );
  await client.query('ROLLBACK');
});
