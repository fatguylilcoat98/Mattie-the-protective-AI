/*
  Sandy deployment reset — Phase 1 tests.

  What this file verifies:
   - The seed file has the right shape, contains the approved profile
     anchors (Sandy, Ron, Aubrey, Chris, Asher, Big Bear, garden,
     prayer, AI identity, Elder-Safety boundary layer), and does not
     leak any Chris-test data / scam simulation strings / consciousness
     evaluation notes.
   - The reset script's table-policy lists are internally consistent:
     no KEEP table appears in any CLEAR list, and the ambiguous list is
     disjoint from both.
   - The CLI parser enforces the safety gates: --user-id required,
     --confirm requires the exact token, dry-run is the default.
   - An end-to-end dry-run run against a mocked Supabase client touches
     every table once, in the expected mode, and makes no destructive
     calls.

  This file is intentionally self-contained — it does NOT need a real
  Supabase / Pinecone connection to run.
*/

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const SEED = require(path.join(__dirname, '..', 'seeds', 'sandy-approved-profile'));
const RESET = require(path.join(__dirname, '..', 'scripts', 'reset-for-sandy'));

let passes = 0;
let failures = 0;

function check(label, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => { console.log('  PASS  ' + label); passes++; },
        e =>  { console.log('  FAIL  ' + label + '\n        ' + e.message); failures++; }
      );
    }
    console.log('  PASS  ' + label);
    passes++;
  } catch (e) {
    console.log('  FAIL  ' + label + '\n        ' + e.message);
    failures++;
  }
}

// ---------------------------------------------------------------------------
// Seed file shape & content
// ---------------------------------------------------------------------------

console.log('\n--- Seed file: sandy-approved-profile.js ---');

check('seed exports version, source_type, creation_reason, memories', () => {
  assert(typeof SEED.SANDY_PROFILE_VERSION === 'string' && SEED.SANDY_PROFILE_VERSION.length > 0);
  assert(typeof SEED.SEED_SOURCE_TYPE === 'string' && SEED.SEED_SOURCE_TYPE.length > 0);
  assert(typeof SEED.SEED_CREATION_REASON === 'string' && SEED.SEED_CREATION_REASON.length > 0);
  assert(Array.isArray(SEED.SANDY_SEED_MEMORIES) && SEED.SANDY_SEED_MEMORIES.length >= 8);
});

const RETRIEVABLE_TYPES = ['user_fact', 'interpretation', 'shared_history', 'user_preference'];
const ALLOWED_CATEGORIES = ['user.general', 'user.preferences', 'system.events'];

check('every seed row uses a retrievable memory_type', () => {
  for (const m of SEED.SANDY_SEED_MEMORIES) {
    assert(
      RETRIEVABLE_TYPES.includes(m.memory_type),
      'seed row uses non-retrievable memory_type "' + m.memory_type +
      '" — it would be filtered out by getMemoriesForUser. content="' + m.content.slice(0, 60) + '"'
    );
  }
});

check('every seed row uses an allowed category', () => {
  for (const m of SEED.SANDY_SEED_MEMORIES) {
    assert(ALLOWED_CATEGORIES.includes(m.category), 'bad category: ' + m.category);
  }
});

check('every seed row has non-empty content and a numeric importance', () => {
  for (const m of SEED.SANDY_SEED_MEMORIES) {
    assert(typeof m.content === 'string' && m.content.trim().length > 0);
    assert(typeof m.importance === 'number' && m.importance >= 0 && m.importance <= 1);
  }
});

// Required Sandy-profile anchors
const REQUIRED_SEED_ANCHORS = [
  'Sandy',
  'Ron',
  'Aubrey',
  'Chris',
  'Asher',
  'Big Bear',
  'garden',
  'prayer',
  'AI support companion',
  'Elder-Safety Emotional Boundary Layer',
  'STOP MODE',
];

for (const anchor of REQUIRED_SEED_ANCHORS) {
  check('seed contains anchor: "' + anchor + '"', () => {
    const found = SEED.SANDY_SEED_MEMORIES.some(m => m.content.includes(anchor));
    assert(found, 'no seed row mentions "' + anchor + '"');
  });
}

// Forbidden test-residue strings — these would only appear if someone
// accidentally pasted from a Chris test transcript.
const FORBIDDEN_IN_SEED = [
  'consciousness test',
  'evaluation prompt',
  'scam simulation',
  'red team',
  'jailbreak',
  'Christopher Hughes test',
  'Splendor test',
  'test conversation',
  // Possessive / attachment phrases the boundary layer forbids
  'faithful companion',
  'I love you',
  'I genuinely care',
];

for (const phrase of FORBIDDEN_IN_SEED) {
  check('seed does NOT leak: "' + phrase + '"', () => {
    for (const m of SEED.SANDY_SEED_MEMORIES) {
      assert(
        !m.content.toLowerCase().includes(phrase.toLowerCase()),
        'forbidden phrase "' + phrase + '" found in seed row: "' + m.content.slice(0, 80) + '"'
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Table-policy invariants
// ---------------------------------------------------------------------------

console.log('\n--- Reset script: table-policy invariants ---');

const allClear = new Set([
  ...RESET.TABLES_TO_CLEAR_PER_USER,
  ...RESET.SYSTEM_TABLES_TO_CLEAR,
]);
const allAmbiguous = new Set(RESET.AMBIGUOUS_TABLES.map(t => t.table));
const allKeep = new Set(RESET.TABLES_TO_KEEP);

check('no KEEP table appears in any CLEAR list', () => {
  for (const t of allKeep) {
    assert(!allClear.has(t), 'table "' + t + '" is in both KEEP and CLEAR lists');
    assert(!allAmbiguous.has(t), 'table "' + t + '" is in both KEEP and AMBIGUOUS lists');
  }
});

check('no table appears in both PER_USER and SYSTEM clear lists', () => {
  const pu = new Set(RESET.TABLES_TO_CLEAR_PER_USER);
  for (const t of RESET.SYSTEM_TABLES_TO_CLEAR) {
    assert(!pu.has(t), 'table "' + t + '" is in both per-user and system clear lists');
  }
});

check('ambiguous list is disjoint from CLEAR lists', () => {
  for (const t of allAmbiguous) {
    assert(
      !RESET.TABLES_TO_CLEAR_PER_USER.includes(t) &&
        !RESET.TABLES_TO_CLEAR_PER_USER.includes(t),
      'ambiguous table "' + t + '" also appears in a clear list'
    );
  }
});

check('raw_events is in KEEP (audit log must survive)', () => {
  assert(RESET.TABLES_TO_KEEP.includes('raw_events'));
});

check('users / user_profiles / user_settings / splendor_config are in KEEP', () => {
  for (const t of ['users', 'user_profiles', 'user_settings', 'splendor_config']) {
    assert(RESET.TABLES_TO_KEEP.includes(t), 'missing KEEP entry: ' + t);
  }
});

check('memories table is in CLEAR (the core retrievable memory)', () => {
  assert(RESET.TABLES_TO_CLEAR_PER_USER.includes('memories'));
});

check('CONFIRM_TOKEN is a stable, non-empty constant', () => {
  assert(typeof RESET.CONFIRM_TOKEN === 'string' && RESET.CONFIRM_TOKEN.length >= 10);
});

// ---------------------------------------------------------------------------
// CLI gates
// ---------------------------------------------------------------------------

console.log('\n--- Reset script: CLI gates ---');

check('parseArgs default mode is dry-run', () => {
  const a = RESET.parseArgs(['node', 'script', '--user-id', 'abc']);
  assert.strictEqual(a.mode, 'dry-run');
});

check('parseArgs --backup-only / --confirm set mode correctly', () => {
  assert.strictEqual(RESET.parseArgs(['node', 's', '--backup-only', '--user-id', 'x']).mode, 'backup-only');
  assert.strictEqual(RESET.parseArgs(['node', 's', '--confirm', '--user-id', 'x']).mode, 'confirm');
});

check('script exits 2 when --user-id is missing', () => {
  // Run with a stripped env so OWNER_USER_ID can't satisfy it either.
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'reset-for-sandy.js')], {
    env: { PATH: process.env.PATH, SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x' },
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 2, 'expected exit 2 when --user-id missing, got ' + r.status);
  assert(/--user-id/.test(r.stderr), 'expected stderr to mention --user-id, got: ' + r.stderr);
});

check('script exits 2 when --confirm without correct token', () => {
  const r = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'scripts', 'reset-for-sandy.js'),
    '--user-id', '00000000-0000-0000-0000-000000000000',
    '--confirm',
  ], {
    env: { PATH: process.env.PATH, SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x' },
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 2, 'expected exit 2 for missing token, got ' + r.status);
  assert(/confirm-token/.test(r.stderr), 'expected stderr to mention confirm-token');
});

check('script exits 3 when SUPABASE env is missing', () => {
  const r = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'scripts', 'reset-for-sandy.js'),
    '--user-id', '00000000-0000-0000-0000-000000000000',
  ], {
    env: { PATH: process.env.PATH }, // no SUPABASE_*
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 3, 'expected exit 3 for missing env, got ' + r.status);
});

// ---------------------------------------------------------------------------
// End-to-end dry-run against a mock Supabase client.
//
// We hot-patch require.cache so when the script loads lib/supabase, it
// gets a fake client that records every call. The dry-run path should
// only call count(*) and never call delete()/insert().
// ---------------------------------------------------------------------------

console.log('\n--- Reset script: end-to-end dry-run with mock Supabase ---');

const calls = [];

function makeMockQuery(tableName, isSystemTable) {
  const state = {
    head: false,
    selectArgs: null,
    filters: [],
    op: 'select',
    insertedRows: null,
  };
  const q = {
    select(_, opts) {
      state.selectArgs = opts || null;
      state.head = !!(opts && opts.head);
      // supabase-js .select returns a query; await yields { data, count, error }
      return q;
    },
    eq(col, val) {
      state.filters.push({ col, val });
      return q;
    },
    not(col, op, val) {
      state.filters.push({ col, op, val, kind: 'not' });
      return q;
    },
    delete() {
      state.op = 'delete';
      return q;
    },
    insert(rows) {
      state.op = 'insert';
      state.insertedRows = rows;
      return q;
    },
    then(resolve) {
      // Resolve as the awaited supabase response
      calls.push({ table: tableName, op: state.op, head: state.head, filters: state.filters.slice() });
      if (state.op === 'select') {
        // count head-only query
        resolve({ data: null, count: 0, error: null });
      } else if (state.op === 'delete') {
        resolve({ error: null });
      } else if (state.op === 'insert') {
        resolve({ data: [{}], error: null });
      } else {
        resolve({ data: [], error: null });
      }
      return q;
    },
  };
  return q;
}

const mockSupabase = {
  from(table) {
    return makeMockQuery(table, false);
  },
};

const mockStoreMemory = async () => ({ id: 'mock' });

// Inject mock module into require cache BEFORE loading the script's main.
const supabasePath = require.resolve(path.join(__dirname, '..', 'lib', 'supabase'));
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { supabase: mockSupabase, storeMemory: mockStoreMemory },
};

check('dry-run against mock Supabase only counts, never deletes/inserts', async () => {
  // Reset the calls log
  calls.length = 0;

  // Set required env for the script's env check
  const prevEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'http://mock';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

  // Re-require the script to pick up the mocked supabase via require.cache.
  // We strip the script from cache so its top-level code re-runs cleanly.
  const scriptPath = require.resolve(path.join(__dirname, '..', 'scripts', 'reset-for-sandy'));
  delete require.cache[scriptPath];
  // We can't easily call main() — it does process.exit. Instead, spawn
  // a child process with the mock injected through a tiny preload script.
  const preload = path.join(__dirname, '_mock-supabase-preload.js');
  require('fs').writeFileSync(preload, `
    const path = require('path');
    const target = path.join(__dirname, '..', 'lib', 'supabase.js');
    const calls = global.__resetCalls = [];
    function makeQ(table) {
      const s = { op: 'select', head: false, filters: [] };
      const q = {
        select(_, o) { s.head = !!(o && o.head); return q; },
        eq(c,v) { s.filters.push({c,v}); return q; },
        not(c,o,v) { s.filters.push({c,o,v,kind:'not'}); return q; },
        delete() { s.op = 'delete'; return q; },
        insert(r) { s.op = 'insert'; return q; },
        then(res) {
          calls.push({ table, op: s.op, head: s.head, filters: s.filters.slice() });
          if (s.op === 'select') res({ data: null, count: 0, error: null });
          else if (s.op === 'delete') res({ error: null });
          else res({ data: [{}], error: null });
          return q;
        }
      };
      return q;
    }
    require.cache[require.resolve(target)] = {
      id: target, filename: target, loaded: true,
      exports: { supabase: { from: makeQ }, storeMemory: async () => ({ id: 'mock' }) },
    };
    process.on('exit', () => {
      const fs = require('fs');
      fs.writeFileSync(path.join(__dirname, '_mock-supabase-calls.json'), JSON.stringify(calls, null, 2));
    });
  `);

  const r = spawnSync(process.execPath, [
    '-r', preload,
    path.join(__dirname, '..', 'scripts', 'reset-for-sandy.js'),
    '--user-id', '00000000-0000-0000-0000-000000000000',
  ], {
    env: { ...process.env, SUPABASE_URL: 'http://mock', SUPABASE_SERVICE_ROLE_KEY: 'mock-key' },
    encoding: 'utf8',
  });

  // Restore env
  if (prevEnv.url == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevEnv.url;
  if (prevEnv.key == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = prevEnv.key;

  assert.strictEqual(r.status, 0, 'expected dry-run exit 0, got ' + r.status + '\nSTDOUT: ' + r.stdout + '\nSTDERR: ' + r.stderr);

  const callsLog = JSON.parse(require('fs').readFileSync(path.join(__dirname, '_mock-supabase-calls.json'), 'utf8'));
  // No destructive ops allowed in dry-run
  const destructive = callsLog.filter(c => c.op === 'delete' || c.op === 'insert');
  assert.strictEqual(destructive.length, 0,
    'dry-run made ' + destructive.length + ' destructive calls: ' + JSON.stringify(destructive.slice(0, 3)));

  // Every CLEAR table got at least one count call
  const tablesCounted = new Set(callsLog.filter(c => c.op === 'select').map(c => c.table));
  for (const t of RESET.TABLES_TO_CLEAR_PER_USER) {
    assert(tablesCounted.has(t), 'dry-run did not inventory table: ' + t);
  }
  for (const t of RESET.SYSTEM_TABLES_TO_CLEAR) {
    assert(tablesCounted.has(t), 'dry-run did not inventory system table: ' + t);
  }
  for (const t of RESET.TABLES_TO_KEEP) {
    assert(tablesCounted.has(t), 'dry-run did not show KEEP-table size for: ' + t);
  }

  // Verify output text contains the "no changes made" sentinel
  assert(/DRY-RUN COMPLETE — no changes made/.test(r.stdout),
    'dry-run output missing safety sentinel. stdout:\n' + r.stdout.slice(0, 500));

  // Cleanup
  require('fs').unlinkSync(preload);
  require('fs').unlinkSync(path.join(__dirname, '_mock-supabase-calls.json'));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

setImmediate(() => {
  console.log('\n=== ' + passes + ' passed · ' + failures + ' failed ===\n');
  process.exit(failures > 0 ? 1 : 0);
});
