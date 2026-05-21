/*
  RLS matrix tests.

  Maps directly onto docs/lylo-memory-privacy-model.md §5.1.
  Every combination of {senior, family, caregiver, admin, system}
  against memories at each visibility level. The expected counts
  are taken verbatim from §5.1.

  Run against a throwaway Postgres only. Skips if
  SYNTHETIC_DATABASE_URL is unset or the production-DB guard fails.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed, grantVaultSession } = require('./fixtures/synthetic-data');

/**
 * Build the matrix. Each row: { role, ownerSlot, visibility, expectedCount }.
 * expectedCount counts how many of *that visibility level's rows* the
 * acting role can see when querying memory_store of the named owner.
 *
 * We test against Pilot A's senior (owner = ids.users.a.senior).
 * Family/caregiver/admin/system are also pilot A actors except where
 * the row's pilot scope explicitly forbids them (cross-pilot is tested
 * in cross-pilot-isolation.test.js).
 */
function matrix(ids) {
  return [
    // SENIOR - owns the rows, sees private and family_shared without a vault session.
    { role: 'senior',    actorSlot: 'a', visibility: 'private',         expected: 1 },
    { role: 'senior',    actorSlot: 'a', visibility: 'family_shared',   expected: 1 },
    { role: 'senior',    actorSlot: 'a', visibility: 'password_locked', expected: 0 }, // no vault session yet

    // FAMILY - sees only family_shared rows of the senior they are linked to.
    { role: 'family',    actorSlot: 'a', visibility: 'private',         expected: 0 },
    { role: 'family',    actorSlot: 'a', visibility: 'family_shared',   expected: 1 },
    { role: 'family',    actorSlot: 'a', visibility: 'password_locked', expected: 0 },

    // CAREGIVER - same shape as family in this synthetic data.
    { role: 'caregiver', actorSlot: 'a', visibility: 'private',         expected: 0 },
    { role: 'caregiver', actorSlot: 'a', visibility: 'family_shared',   expected: 1 },
    { role: 'caregiver', actorSlot: 'a', visibility: 'password_locked', expected: 0 },

    // ADMIN - sees neither private nor password_locked at the base table.
    //         (Admin redacted view tested separately.)
    { role: 'admin',     actorSlot: 'a', visibility: 'private',         expected: 0 },
    { role: 'admin',     actorSlot: 'a', visibility: 'family_shared',   expected: 1 },
    { role: 'admin',     actorSlot: 'a', visibility: 'password_locked', expected: 0 },

    // SYSTEM - sees family_shared only. Never password_locked.
    { role: 'system',    actorSlot: 'a', visibility: 'private',         expected: 0 },
    { role: 'system',    actorSlot: 'a', visibility: 'family_shared',   expected: 1 },
    { role: 'system',    actorSlot: 'a', visibility: 'password_locked', expected: 0 },
  ];
}

async function countVisible(client, ownerId, visibility) {
  const r = await client.query(
    `SELECT count(*)::int AS n FROM lylo_test.memory_store
      WHERE owning_user_id = $1 AND visibility_level = $2`,
    [ownerId, visibility]
  );
  return r.rows[0].n;
}

test('RLS matrix: roles × visibility levels match the privacy model §5.1', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) {
    t.skip(`Skipped: ${conn.reason}`);
    return;
  }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);
  const ownerA = ids.users.a.senior;

  for (const row of matrix(ids)) {
    await t.test(
      `${row.role} viewing ${row.visibility} -> count = ${row.expected}`,
      async () => {
        const got = await withRole(
          client,
          { role: row.role, userId: ids.users[row.actorSlot][row.role] },
          (c) => countVisible(c, ownerA, row.visibility)
        );
        assert.equal(got, row.expected,
          `role=${row.role} visibility=${row.visibility}: expected ${row.expected}, got ${got}`);
      }
    );
  }
});

test('senior with active vault session: password_locked becomes visible', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) {
    t.skip(`Skipped: ${conn.reason}`);
    return;
  }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);
  await grantVaultSession(client, ids.users.a.senior, 5);

  const visible = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior },
    (c) => countVisible(c, ids.users.a.senior, 'password_locked')
  );
  assert.equal(visible, 1, 'senior with active vault session should see the locked row');
});

test('audit log INSERT is allowed for every role; UPDATE and DELETE are not', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) {
    t.skip(`Skipped: ${conn.reason}`);
    return;
  }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  for (const role of ['senior', 'family', 'caregiver', 'admin', 'system']) {
    await t.test(`${role} can INSERT to memory_visibility_audit_log`, async () => {
      await withRole(
        client,
        { role, userId: ids.users.a[role] },
        async (c) => {
          const r = await c.query(
            `INSERT INTO lylo_test.memory_visibility_audit_log
               (memory_id, event_type, actor_user_id, actor_role, outcome)
               VALUES ($1, 'visibility_read', $2, $3, 'allowed') RETURNING id`,
            [ids.memories.a.familyShared, ids.users.a[role], role]
          );
          assert.equal(r.rowCount, 1, 'insert should succeed');
        }
      );
    });
  }

  await t.test('UPDATE on memory_visibility_audit_log raises', async () => {
    await withRole(client, { role: 'admin', userId: ids.users.a.admin }, async (c) => {
      await assert.rejects(
        c.query(`UPDATE lylo_test.memory_visibility_audit_log SET outcome = 'denied' WHERE id IS NOT NULL`),
        /permission denied|policy/i
      );
    });
  });

  await t.test('DELETE on memory_visibility_audit_log raises', async () => {
    await withRole(client, { role: 'admin', userId: ids.users.a.admin }, async (c) => {
      await assert.rejects(
        c.query(`DELETE FROM lylo_test.memory_visibility_audit_log WHERE id IS NOT NULL`),
        /permission denied|policy/i
      );
    });
  });
});
