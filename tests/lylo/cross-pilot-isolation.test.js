/*
  Cross-pilot isolation.

  A senior of pilot A may not see any row scoped to pilot B, regardless of
  visibility or whether they share a username. Same for family/caregiver/
  admin/system.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('pilot A senior cannot see any pilot B row, regardless of visibility', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // Pilot A senior, scoped to pilot A, querying pilot B rows.
  const visibleAcrossPilots = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE pilot_instance_id = $1`,
        [ids.pilots.b]
      );
      return r.rows[0].n;
    }
  );
  assert.equal(visibleAcrossPilots, 0,
    'pilot A senior must not see any pilot B row via pilot_instance_id filter');
});

test('attempting to spoof pilot scope by setting app.pilot_instance_id to another pilot still respects user_id ownership', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // A malicious or misconfigured session: pilot A's senior, but the
  // session's pilot_instance_id is set to pilot B. The senior's own
  // user_id does not exist in pilot B's user table (we seeded separate
  // users per pilot), so the senior policy's owning_user_id =
  // current_app_user_id() clause excludes all rows. The policy returns
  // zero rows.
  const cnt = await withRole(
    client,
    {
      role: 'senior',
      userId: ids.users.a.senior,            // A's user id
      pilotInstanceId: ids.pilots.b,         // but pretending to be in pilot B
    },
    async (c) => {
      const r = await c.query(`SELECT count(*)::int AS n FROM lylo_test.memory_store`);
      return r.rows[0].n;
    }
  );
  assert.equal(cnt, 0,
    'spoofed pilot scope must not allow reading the other pilot’s rows');
});

test('family across pilots: pilot A family cannot see pilot B family_shared rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  const cnt = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE pilot_instance_id = $1`,
        [ids.pilots.b]
      );
      return r.rows[0].n;
    }
  );
  assert.equal(cnt, 0, 'pilot A family must not see any pilot B row');
});

test('admin across pilots: admin scoped to pilot A cannot see pilot B rows', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  const cnt = await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE pilot_instance_id = $1`,
        [ids.pilots.b]
      );
      return r.rows[0].n;
    }
  );
  assert.equal(cnt, 0, 'pilot-scoped admin must not see other pilots’ rows');
});
