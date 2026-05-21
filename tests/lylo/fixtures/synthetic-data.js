/*
  Synthetic data seeder.

  Runs as the `seeder` role (which has FOR-ALL policies on every table)
  and commits its inserts so the role-scoped withRole() calls in tests
  can read them.

  Two pilots (alpha, beta), one user of each role per pilot, and a
  small but exhaustive set of memory rows + family-contact links +
  vaults + derived rows.

  No real-pilot identifiers. Every name is generic.
*/

'use strict';

const { withRoleCommitted } = require('./role-clients');

/**
 * Seeds the synthetic schema. Returns the ids tests assert on.
 */
async function seed(client) {
  const ids = {
    pilots: { a: null, b: null },
    users: { a: {}, b: {} },
    vaults: { a: null, b: null },
    memories: { a: {}, b: {} },
  };

  // Bootstrap step: we don't have a pilot_instance_id or user_id yet.
  // We connect as the seeder *without* a pilot scope, run the inserts
  // (the seeder policy is unconditional on the role only).
  await client.query(`SET search_path TO lylo_test, public`);
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL app.user_role = 'seeder'`);
    // Use a bogus uuid for user_id and pilot_instance_id so the lookup
    // policies on users/family_contacts/etc. that key on those GUCs do
    // not fall over. The seeder policy ignores them.
    await client.query(`SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'`);
    await client.query(`SET LOCAL app.pilot_instance_id = '00000000-0000-0000-0000-000000000000'`);

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

    for (const role of ['senior', 'family', 'caregiver', 'admin', 'system']) {
      const a = await client.query(
        `INSERT INTO users (pilot_instance_id, username, role) VALUES ($1, $2, $3) RETURNING id`,
        [ids.pilots.a, `alpha-${role}`, role]
      );
      ids.users.a[role] = a.rows[0].id;
      const b = await client.query(
        `INSERT INTO users (pilot_instance_id, username, role) VALUES ($1, $2, $3) RETURNING id`,
        [ids.pilots.b, `beta-${role}`, role]
      );
      ids.users.b[role] = b.rows[0].id;
    }

    // Family-contact links with the explicit family_shared scope.
    const fcScope = JSON.stringify({ visibility_levels: ['family_shared'] });
    await client.query(
      `INSERT INTO family_contacts (pilot_instance_id, senior_user_id, contact_user_id, permission_scope)
         VALUES ($1, $2, $3, $4::jsonb)`,
      [ids.pilots.a, ids.users.a.senior, ids.users.a.family, fcScope]
    );
    await client.query(
      `INSERT INTO family_contacts (pilot_instance_id, senior_user_id, contact_user_id, permission_scope)
         VALUES ($1, $2, $3, $4::jsonb)`,
      [ids.pilots.a, ids.users.a.senior, ids.users.a.caregiver, fcScope]
    );
    await client.query(
      `INSERT INTO family_contacts (pilot_instance_id, senior_user_id, contact_user_id, permission_scope)
         VALUES ($1, $2, $3, $4::jsonb)`,
      [ids.pilots.b, ids.users.b.senior, ids.users.b.family, fcScope]
    );

    // Vaults for the seniors.
    const vaultA = await client.query(
      `INSERT INTO memory_vaults (pilot_instance_id, user_id, pin_hash, pin_salt)
         VALUES ($1, $2, 'synthetic-hash', 'synthetic-salt') RETURNING id`,
      [ids.pilots.a, ids.users.a.senior]
    );
    const vaultB = await client.query(
      `INSERT INTO memory_vaults (pilot_instance_id, user_id, pin_hash, pin_salt)
         VALUES ($1, $2, 'synthetic-hash', 'synthetic-salt') RETURNING id`,
      [ids.pilots.b, ids.users.b.senior]
    );
    ids.vaults.a = vaultA.rows[0].id;
    ids.vaults.b = vaultB.rows[0].id;

    // Memories at every visibility level for both pilots.
    async function seedMemory(pilotId, ownerId, slot, visibility, vaultId, contentLabel) {
      const r = await client.query(
        `INSERT INTO memory_store (pilot_instance_id, owning_user_id, content, provenance, visibility_level, vault_id)
           VALUES ($1, $2, $3, 'USER_STATED', $4, $5) RETURNING id`,
        [pilotId, ownerId, contentLabel, visibility, visibility === 'password_locked' ? vaultId : null]
      );
      ids.memories[slot][
        visibility === 'private' ? 'private'
        : visibility === 'family_shared' ? 'familyShared'
        : 'passwordLocked'
      ] = r.rows[0].id;
    }
    await seedMemory(ids.pilots.a, ids.users.a.senior, 'a', 'private',         null,         'Alpha private memory');
    await seedMemory(ids.pilots.a, ids.users.a.senior, 'a', 'family_shared',   null,         'Alpha family-shared memory');
    await seedMemory(ids.pilots.a, ids.users.a.senior, 'a', 'password_locked', ids.vaults.a, 'Alpha password-locked memory');
    await seedMemory(ids.pilots.b, ids.users.b.senior, 'b', 'private',         null,         'Beta private memory');
    await seedMemory(ids.pilots.b, ids.users.b.senior, 'b', 'family_shared',   null,         'Beta family-shared memory');
    await seedMemory(ids.pilots.b, ids.users.b.senior, 'b', 'password_locked', ids.vaults.b, 'Beta password-locked memory');

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_err) {}
    throw err;
  }

  return ids;
}

/**
 * Inserts an active vault session row for the given user, committed.
 * Uses the seeder role so it bypasses the lockout trigger only by
 * not violating it (the trigger checks the vault's lockout_until
 * regardless of role - that is intentional).
 */
async function grantVaultSession(client, vaultId, userId, pilotInstanceId, ttlMinutes = 5) {
  await withRoleCommitted(
    client,
    { role: 'seeder', userId, pilotInstanceId },
    async (c) => {
      await c.query(
        `INSERT INTO memory_vault_sessions (vault_id, user_id, expires_at)
           VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
        [vaultId, userId, String(ttlMinutes)]
      );
    }
  );
}

module.exports = { seed, grantVaultSession };
