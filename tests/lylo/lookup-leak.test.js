/*
  Lookup-table leak prevention (H1, H2).
*/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('H1: family contact sees only family_contacts rows they are an endpoint of', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const rows = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT senior_user_id, contact_user_id FROM lylo_test.family_contacts`);
      return r.rows;
    }
  );
  for (const row of rows) {
    assert.ok(
      row.senior_user_id === ids.users.a.family || row.contact_user_id === ids.users.a.family,
      'family contact must only see family_contacts rows they are an endpoint of'
    );
  }
});

test('H1: caregiver does not see family_contacts rows for other contacts', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const rows = await withRole(
    client,
    { role: 'caregiver', userId: ids.users.a.caregiver, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT contact_user_id FROM lylo_test.family_contacts`);
      return r.rows;
    }
  );
  for (const row of rows) {
    assert.equal(row.contact_user_id, ids.users.a.caregiver,
      'caregiver must only see family_contacts rows where they are the contact');
  }
});

test('H2: family user does not see unrelated users in the same pilot', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const usernames = await withRole(
    client,
    { role: 'family', userId: ids.users.a.family, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT username FROM lylo_test.users ORDER BY username`);
      return r.rows.map(x => x.username);
    }
  );
  // Family A is linked to senior A. They should see themselves and the
  // senior; they must NOT see admin / system / caregiver / pilot B users.
  assert.ok(usernames.includes('alpha-family'), 'family sees self');
  assert.ok(usernames.includes('alpha-senior'), 'family sees their senior');
  assert.ok(!usernames.includes('alpha-admin'),    'family must not see admin');
  assert.ok(!usernames.includes('alpha-system'),   'family must not see system');
  assert.ok(!usernames.includes('alpha-caregiver'),'family must not see caregiver');
  assert.ok(!usernames.some(u => u.startsWith('beta-')), 'family must not see other pilot users');
});

test('H2: admin in pilot A can list all pilot A users', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) { t.skip(`Skipped: ${conn.reason}`); return; }
  const { client, teardown } = conn; t.after(teardown);
  const ids = await seed(client);

  const usernames = await withRole(
    client,
    { role: 'admin', userId: ids.users.a.admin, pilotInstanceId: ids.pilots.a },
    async (c) => {
      const r = await c.query(`SELECT username FROM lylo_test.users ORDER BY username`);
      return r.rows.map(x => x.username);
    }
  );
  for (const u of ['alpha-admin','alpha-caregiver','alpha-family','alpha-senior','alpha-system']) {
    assert.ok(usernames.includes(u), `admin should see ${u}`);
  }
  assert.ok(!usernames.some(u => u.startsWith('beta-')), 'admin in pilot A must not see pilot B users');
});
