/*
  Role-scoped session helpers.

  Mirrors the design PR E will ship in production: a request opens
  a transaction, sets `app.user_role` and `app.user_id` via
  SET LOCAL, and runs all of its queries inside that transaction so
  RLS policies see the correct identity.

  Production will use real Postgres roles via SET LOCAL
  session_authorization. The synthetic schema uses GUC values
  because we run as a single superuser connection against a
  throwaway Postgres. Same policy shape, simpler test harness.
*/

'use strict';

/**
 * Run a function inside a transaction with `app.user_role` and
 * `app.user_id` set to the given values. The transaction is
 * rolled back at the end so a single connection can serve all
 * tests without state leakage.
 *
 * @param {import('pg').Client} client
 * @param {{ role: string, userId: string }} who
 * @param {(c: import('pg').Client) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withRole(client, who, fn) {
  if (!who || typeof who.role !== 'string' || typeof who.userId !== 'string') {
    throw new Error('withRole: who must be { role, userId }');
  }
  if (!['senior', 'family', 'caregiver', 'admin', 'system'].includes(who.role)) {
    throw new Error(`withRole: unknown role "${who.role}"`);
  }
  await client.query('BEGIN');
  try {
    // SET LOCAL is scoped to the current transaction; safer than SET.
    await client.query(`SET LOCAL app.user_role = '${who.role}'`);
    await client.query(`SET LOCAL app.user_id = '${who.userId}'`);
    await client.query(`SET LOCAL search_path TO lylo_test, public`);
    const result = await fn(client);
    return result;
  } finally {
    // Always rollback - tests should never persist state through a
    // role-scoped transaction.
    try { await client.query('ROLLBACK'); } catch (_err) {}
  }
}

module.exports = { withRole };
