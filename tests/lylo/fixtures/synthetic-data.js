/*
  Synthetic data seeder.

  Two fake pilots, four fake users per pilot (one of each role), and
  a memory_store row at each of the three visibility levels owned by
  each pilot's senior. Family-contact links between the senior and
  the family/caregiver of the same pilot.

  No real identifiers - every name is generic.
*/

'use strict';

/**
 * Seeds the synthetic schema. Returns the ids that tests assert on.
 *
 * @param {import('pg').Client} client
 * @returns {Promise<{
 *   pilots: { a: string, b: string },
 *   users: {
 *     a: { senior: string, family: string, caregiver: string, admin: string, system: string },
 *     b: { senior: string, family: string, caregiver: string, admin: string, system: string },
 *   },
 *   memories: {
 *     a: { private: string, familyShared: string, passwordLocked: string },
 *     b: { private: string, familyShared: string, passwordLocked: string },
 *   },
 * }>}
 */
async function seed(client) {
  await client.query(`SET search_path TO lylo_test, public`);

  const ids = {
    pilots: { a: null, b: null },
    users: { a: {}, b: {} },
    memories: { a: {}, b: {} },
  };

  const pilotA = await client.query(
    `INSERT INTO pilot_instances (org_name) VALUES ($1) RETURNING id`,
    ['Pilot Alpha (synthetic)']
  );
  const pilotB = await client.query(
    `INSERT INTO pilot_instances (org_name) VALUES ($1) RETURNING id`,
    ['Pilot Beta (synthetic)']
  );
  ids.pilots.a = pilotA.rows[0].id;
  ids.pilots.b = pilotB.rows[0].id;

  async function seedUser(pilotId, role, slot, label) {
    const r = await client.query(
      `INSERT INTO users (pilot_instance_id, username, role)
         VALUES ($1, $2, $3) RETURNING id`,
      [pilotId, `${label}-${role}`, role]
    );
    ids.users[slot][role] = r.rows[0].id;
  }

  for (const role of ['senior', 'family', 'caregiver', 'admin', 'system']) {
    await seedUser(ids.pilots.a, role, 'a', 'alpha');
    await seedUser(ids.pilots.b, role, 'b', 'beta');
  }

  // Family-contact links: family + caregiver in each pilot can see
  // the senior's family_shared memories.
  await client.query(
    `INSERT INTO family_contacts (pilot_instance_id, senior_user_id, contact_user_id, permission_scope)
       VALUES ($1, $2, $3, $4::jsonb)`,
    [ids.pilots.a, ids.users.a.senior, ids.users.a.family,
      JSON.stringify({ visibility_levels: ['family_shared'] })]
  );
  await client.query(
    `INSERT INTO family_contacts (pilot_instance_id, senior_user_id, contact_user_id, permission_scope)
       VALUES ($1, $2, $3, $4::jsonb)`,
    [ids.pilots.a, ids.users.a.senior, ids.users.a.caregiver,
      JSON.stringify({ visibility_levels: ['family_shared'] })]
  );
  await client.query(
    `INSERT INTO family_contacts (pilot_instance_id, senior_user_id, contact_user_id, permission_scope)
       VALUES ($1, $2, $3, $4::jsonb)`,
    [ids.pilots.b, ids.users.b.senior, ids.users.b.family,
      JSON.stringify({ visibility_levels: ['family_shared'] })]
  );

  async function seedMemory(pilotId, ownerId, slot, visibility, contentLabel) {
    const r = await client.query(
      `INSERT INTO memory_store (pilot_instance_id, owning_user_id, content, provenance, visibility_level)
         VALUES ($1, $2, $3, 'USER_STATED', $4) RETURNING id`,
      [pilotId, ownerId, contentLabel, visibility]
    );
    ids.memories[slot][
      visibility === 'private' ? 'private'
      : visibility === 'family_shared' ? 'familyShared'
      : 'passwordLocked'
    ] = r.rows[0].id;
  }

  await seedMemory(ids.pilots.a, ids.users.a.senior, 'a', 'private',
    'Pilot Alpha private memory (synthetic, never quote in any test assertion text)');
  await seedMemory(ids.pilots.a, ids.users.a.senior, 'a', 'family_shared',
    'Pilot Alpha family-shared memory (synthetic)');
  await seedMemory(ids.pilots.a, ids.users.a.senior, 'a', 'password_locked',
    'Pilot Alpha password-locked memory (synthetic)');
  await seedMemory(ids.pilots.b, ids.users.b.senior, 'b', 'private',
    'Pilot Beta private memory (synthetic)');
  await seedMemory(ids.pilots.b, ids.users.b.senior, 'b', 'family_shared',
    'Pilot Beta family-shared memory (synthetic)');
  await seedMemory(ids.pilots.b, ids.users.b.senior, 'b', 'password_locked',
    'Pilot Beta password-locked memory (synthetic)');

  return ids;
}

/**
 * Adds an active vault session for the given user. Used by the
 * "senior with active vault session" tests.
 */
async function grantVaultSession(client, userId, ttlMinutes = 5) {
  await client.query(
    `INSERT INTO memory_vault_sessions (user_id, expires_at)
       VALUES ($1, now() + ($2 || ' minutes')::interval)`,
    [userId, String(ttlMinutes)]
  );
}

module.exports = { seed, grantVaultSession };
