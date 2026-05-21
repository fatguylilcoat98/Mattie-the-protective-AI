/*
  Lylo test harness.

  Production-DB guard: refuses to run if SYNTHETIC_DATABASE_URL
  looks like production. The guard is intentionally conservative;
  if it false-positives on your local URL, fix the URL, do not
  edit the guard.

  Not for production. Lives only under tests/lylo/.
*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FORBIDDEN_HOST_FRAGMENTS = [
  'supabase.co',
  'supabase.io',
  'render.com',
  'onrender.com',
  'rds.amazonaws.com',
  'azure.com',
  'gcp.cloudsql',
  'production',
  'prod-',
];

const FORBIDDEN_USER_FRAGMENTS = [
  'supabase_admin',
  'service_role',
  'authenticator',
  'postgres@',  // postgres user on a remote host
];

function guardConnectionString(url) {
  if (!url || typeof url !== 'string') {
    return { ok: false, reason: 'SYNTHETIC_DATABASE_URL is not set' };
  }

  const lower = url.toLowerCase();
  for (const frag of FORBIDDEN_HOST_FRAGMENTS) {
    if (lower.includes(frag)) {
      return {
        ok: false,
        reason: `URL contains forbidden fragment "${frag}" - looks like production`,
      };
    }
  }

  for (const frag of FORBIDDEN_USER_FRAGMENTS) {
    if (lower.includes(frag)) {
      return {
        ok: false,
        reason: `URL contains forbidden user fragment "${frag}" - looks like production`,
      };
    }
  }

  // Cross-check with SUPABASE_URL if it is also set on this shell.
  const supabaseUrl = process.env.SUPABASE_URL;
  if (supabaseUrl && typeof supabaseUrl === 'string' && supabaseUrl.length > 0) {
    // The synthetic URL must not be the same as, or a substring of, the
    // production Supabase URL.
    const supabaseHost = supabaseUrl.replace(/^https?:\/\//, '').split('/')[0];
    if (supabaseHost && lower.includes(supabaseHost.toLowerCase())) {
      return {
        ok: false,
        reason: `URL host overlaps with SUPABASE_URL - refusing to connect`,
      };
    }
  }

  // Refuse non-localhost defaults to keep the radius tight.
  // Allow localhost, 127.0.0.1, and explicit synthetic-only IPs.
  const isLocal = /(\blocalhost\b|\b127\.0\.0\.1\b|\b::1\b|\bhost\.docker\.internal\b)/i.test(url);
  if (!isLocal) {
    return {
      ok: false,
      reason: 'URL does not point at localhost - synthetic test refuses to connect remotely',
    };
  }

  return { ok: true };
}

function loadSchemaSql() {
  const schemaPath = path.join(__dirname, 'synthetic-schema.sql');
  return fs.readFileSync(schemaPath, 'utf8');
}

/**
 * Try to lazily require pg. If it is not installed (likely - the
 * project's package.json does not list it as a dependency today),
 * tests skip with a clear message. We do not want this PR to add
 * any runtime dependency.
 */
function loadPgClient() {
  try {
    return require('pg');
  } catch (_err) {
    return null;
  }
}

async function applySchema(client) {
  const sql = loadSchemaSql();
  await client.query(sql);
}

async function tearDown(client) {
  try {
    await client.query('DROP SCHEMA IF EXISTS lylo_test CASCADE;');
  } catch (_err) {
    /* swallow - tests run inside isolated containers anyway */
  }
}

/**
 * Returns either:
 *   { skip: true, reason }  - the test should call test.skip(...) and exit clean
 *   { client, teardown }    - a connected pg.Client and a teardown function
 */
async function connectOrSkip() {
  const guard = guardConnectionString(process.env.SYNTHETIC_DATABASE_URL || '');
  if (!guard.ok) {
    return { skip: true, reason: guard.reason };
  }

  const pg = loadPgClient();
  if (!pg) {
    return {
      skip: true,
      reason: "'pg' module not installed - run `npm install pg` in a throwaway scratch dir to use this suite (we intentionally do not add pg to package.json in this PR)",
    };
  }

  const client = new pg.Client({ connectionString: process.env.SYNTHETIC_DATABASE_URL });
  await client.connect();
  await applySchema(client);

  return {
    skip: false,
    client,
    teardown: async () => {
      try { await tearDown(client); } catch (_err) {}
      try { await client.end(); } catch (_err) {}
    },
  };
}

module.exports = {
  guardConnectionString,        // exported for unit-testing the guard itself
  loadSchemaSql,
  connectOrSkip,
};
