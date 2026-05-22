/*
  Role-scoped session helpers.

  Binds the actor's ROLE to a real, non-superuser database role via
  SET ROLE (D2: the role is not a GUC and cannot be spoofed by a SQL
  session). Also sets:
    app.user_id                - the requesting user's UUID
    app.pilot_instance_id      - the pilot scope for the session
    app.compose_target_user_id - (optional) the target user id when a system
                                 worker is composing a senior-addressed
                                 outbound message and needs to read that
                                 senior's private memory. Never set for any
                                 non-system flow.
    app.visibility_change_reason - (optional) free text supplied by the
                                 actor when changing a memory's
                                 visibility_level; the audit trigger picks
                                 it up automatically.

  Every call runs inside a transaction and rolls back at the end, so
  read-only assertions cannot leak state across tests.
*/

'use strict';

const ROLES = ['senior', 'family', 'caregiver', 'admin', 'system', 'seeder'];

// D2: each logical role maps to a real, non-superuser Postgres role. The
// schema's current_app_user_role() reads current_user, so adopting one of
// these via SET ROLE is the unforgeable role binding.
const DB_ROLE = {
  senior: 'lylo_senior',
  family: 'lylo_family',
  caregiver: 'lylo_caregiver',
  admin: 'lylo_admin',
  system: 'lylo_system',
  seeder: 'lylo_seeder',
};

function dbRoleFor(role) {
  const dbRole = DB_ROLE[role];
  if (!dbRole) throw new Error(`withRole: no database role mapped for "${role}"`);
  return dbRole;
}

function validateWho(who) {
  if (!who || typeof who !== 'object') {
    throw new Error('withRole: who must be an object');
  }
  if (typeof who.role !== 'string' || !ROLES.includes(who.role)) {
    throw new Error(`withRole: unknown role "${who.role}"`);
  }
  if (typeof who.userId !== 'string') {
    throw new Error('withRole: who.userId must be a UUID string');
  }
  if (typeof who.pilotInstanceId !== 'string') {
    throw new Error('withRole: who.pilotInstanceId must be a UUID string');
  }
}

function quoteUuid(s) {
  // We never accept user input here; tests pass us our own seeded ids.
  // Still cheap to refuse anything that doesn't look like a UUID.
  if (!/^[0-9a-f-]{36}$/i.test(s)) {
    throw new Error(`withRole: expected a UUID, got "${s}"`);
  }
  return s;
}

async function setLocalsForSession(client, who) {
  await client.query(`SET LOCAL search_path TO lylo_test, public`);
  // app.user_id / app.pilot_instance_id are test inputs only. They stand in
  // for values production derives from verified auth. They are NOT the
  // authority for the actor's role.
  await client.query(`SET LOCAL app.user_id = '${quoteUuid(who.userId)}'`);
  await client.query(`SET LOCAL app.pilot_instance_id = '${quoteUuid(who.pilotInstanceId)}'`);
  if (who.composeTargetUserId) {
    await client.query(`SET LOCAL app.compose_target_user_id = '${quoteUuid(who.composeTargetUserId)}'`);
  }
  if (who.visibilityChangeReason) {
    // GUC values must be quoted; this is a synthetic test, no SQL-injection
    // adversary, but we escape single quotes anyway.
    const safe = String(who.visibilityChangeReason).replace(/'/g, "''");
    await client.query(`SET LOCAL app.visibility_change_reason = '${safe}'`);
  }
  // D2: bind the role last. SET LOCAL ROLE is transaction-scoped and resets
  // on COMMIT/ROLLBACK. dbRoleFor() only ever yields one of six fixed,
  // validated identifiers, so this interpolation cannot inject.
  await client.query(`SET LOCAL ROLE ${dbRoleFor(who.role)}`);
}

/**
 * Run a function inside a transaction with the given session context.
 * The transaction is rolled back at the end.
 */
async function withRole(client, who, fn) {
  validateWho(who);
  await client.query('BEGIN');
  try {
    await setLocalsForSession(client, who);
    return await fn(client);
  } finally {
    try { await client.query('ROLLBACK'); } catch (_err) {}
  }
}

/**
 * Like withRole, but COMMITs at the end. Used by the seeder to persist
 * rows that subsequent withRole calls assert against. Never use this from
 * an assertion path.
 */
async function withRoleCommitted(client, who, fn) {
  validateWho(who);
  await client.query('BEGIN');
  let committed = false;
  try {
    await setLocalsForSession(client, who);
    const result = await fn(client);
    await client.query('COMMIT');
    committed = true;
    return result;
  } finally {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch (_err) {}
    }
  }
}

module.exports = { withRole, withRoleCommitted, ROLES };
