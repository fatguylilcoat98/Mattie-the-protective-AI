/*
  D2 — role source of truth.

  Proves the actor's role is bound to the database role (current_user, set
  via SET ROLE), not the legacy app.user_role GUC. Setting that GUC to a
  privileged value has zero effect on policy evaluation.

  This is the test that makes D2 falsifiable: if a future change re-keyed
  any policy on a GUC, the first test below would fail.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('setting the legacy app.user_role GUC cannot escalate the actor role', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Adopt the family role, then spoof the removed GUC to claim 'admin'.
  const result = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      await c.query(`SET LOCAL app.user_role = 'admin'`);
      const role = await c.query(`SELECT lylo_test.current_app_user_role() AS r`);
      const priv = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_store
           WHERE owning_user_id = $1 AND visibility_level = 'private'`,
        [ids.users.a.senior]
      );
      return { role: role.rows[0].r, privateRows: priv.rows[0].n };
    }
  );

  assert.equal(result.role, 'family',
    'current_app_user_role() must derive from the database role, not the GUC');
  assert.equal(result.privateRows, 0,
    'spoofing app.user_role must not grant access to another user’s private rows');
});

test('current_user is the role authority for every caller role', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  for (const role of ['senior', 'family', 'caregiver', 'admin', 'system']) {
    await t.test(`${role} -> current_user = lylo_${role}, role = ${role}`, async () => {
      const got = await withRole(
        client,
        { role, userId: ids.users.a[role], pilotInstanceId: ids.pilots.a },
        async (c) => {
          const r = await c.query(
            `SELECT lylo_test.current_app_user_role() AS r, current_user AS u`
          );
          return r.rows[0];
        }
      );
      assert.equal(got.u, `lylo_${role}`, 'session must run as the mapped database role');
      assert.equal(got.r, role, 'logical role must derive from current_user');
    });
  }
});
