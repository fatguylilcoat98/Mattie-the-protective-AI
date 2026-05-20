#!/usr/bin/env node
/*
  reset-for-sandy.js — Phase 1 of Sandy deployment.

  Wipe Mattie's test conversation/memory data and re-seed Sandy's approved
  starting profile from seeds/sandy-approved-profile.js. The persona,
  safety layer, and persona/safety rules in lib/anthropic.js are
  CODE-DEFINED and never touched by this script.

  USAGE
    # Default: dry-run. Inventories every table, prints what WOULD happen.
    node scripts/reset-for-sandy.js --user-id <uuid>

    # Backup only — writes a timestamped JSON dump under ./backups/ and
    # makes NO destructive change.
    node scripts/reset-for-sandy.js --user-id <uuid> --backup-only

    # Real reset — requires the exact confirmation token. Always takes
    # a backup first.
    node scripts/reset-for-sandy.js --user-id <uuid> --confirm \
        --confirm-token "I-HAVE-REVIEWED-THE-DRY-RUN"

  AMBIGUOUS-TABLE FLAGS (defaults documented in code)
    --keep-cognitive   keep cognitive_profiles / cognitive_evolution rows
    --keep-identity    keep identity_states / splendor_decisions rows
    --keep-pinecone    do not clear the user's Pinecone semantic namespace

  ENVIRONMENT
    SUPABASE_URL                  required
    SUPABASE_SERVICE_ROLE_KEY     required (anon key cannot delete)
    OWNER_USER_ID                 optional convenience; --user-id wins

  EXIT CODES
    0  success / dry-run finished
    2  bad CLI args
    3  missing supabase env
    4  reset proceeded but one or more table operations errored
*/

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Table policy — keep these lists hand-maintained. Sourced from the
// schema audit in tests/sandy-deployment-reset.test.js commentary and the
// inventory in docs/sandy-deployment-runbook.md.
// ---------------------------------------------------------------------------

// Per-user tables: DELETE WHERE user_id = <sandy>
const TABLES_TO_CLEAR_PER_USER = [
  'memories',
  'conversations',
  'episodes',
  'memory_summaries',
  'reflections',
  'open_threads',
  'splendor_journal',
  'splendor_memories',
  'interpretations',
  'emotional_patterns',
  'internal_thoughts',
  'recent_internal_thoughts',
  'ambient_insights',
  'micro_reflections',
  'premise_checks',
];

// System-wide tables: DELETE *. These accumulate test residue during
// Chris's testing and should not carry forward to Sandy.
const SYSTEM_TABLES_TO_CLEAR = [
  'autonomous_thoughts',
  'reflection_cycles',
  'pending_communications',
  'inquiry_threads',
  'consciousness_state',
  'proactive_conversations',
  'thought_connections',
];

// Never touched. Auth, user profile, and audit log live here.
const TABLES_TO_KEEP = [
  'users',
  'user_profiles',
  'user_settings',
  'splendor_config',
  'raw_events',
];

// Ambiguous: defaults below, override with flags. These describe per-user
// behavior tracking that should reset for a clean Sandy start, but the
// operator may have reason to keep one or both.
const AMBIGUOUS_TABLES = [
  { table: 'identity_states',     group: 'identity',  default: 'clear' },
  { table: 'splendor_decisions',  group: 'identity',  default: 'clear' },
  { table: 'cognitive_profiles',  group: 'cognitive', default: 'clear' },
  { table: 'cognitive_evolution', group: 'cognitive', default: 'clear' },
];

const CONFIRM_TOKEN = 'I-HAVE-REVIEWED-THE-DRY-RUN';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    mode: 'dry-run',
    userId: process.env.OWNER_USER_ID || null,
    confirmToken: null,
    keepCognitive: false,
    keepIdentity: false,
    keepPinecone: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dry-run':       args.mode = 'dry-run'; break;
      case '--backup-only':   args.mode = 'backup-only'; break;
      case '--confirm':       args.mode = 'confirm'; break;
      case '--user-id':       args.userId = argv[++i]; break;
      case '--confirm-token': args.confirmToken = argv[++i]; break;
      case '--keep-cognitive': args.keepCognitive = true; break;
      case '--keep-identity':  args.keepIdentity = true; break;
      case '--keep-pinecone':  args.keepPinecone = true; break;
      case '--help':
      case '-h':              args.mode = 'help'; break;
      default:
        console.error(`Unknown argument: ${a}`);
        args.mode = 'help';
    }
  }
  return args;
}

function ambiguousPolicy(args) {
  return AMBIGUOUS_TABLES.map(t => {
    if (t.group === 'cognitive' && args.keepCognitive) return { ...t, applied: 'keep' };
    if (t.group === 'identity'  && args.keepIdentity)  return { ...t, applied: 'keep' };
    return { ...t, applied: t.default };
  });
}

// ---------------------------------------------------------------------------
// Operations against Supabase. Each is a thin wrapper so the script can be
// reasoned about table by table.
// ---------------------------------------------------------------------------

async function countRows(supabase, table, userId = null) {
  const query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (userId) query.eq('user_id', userId);
  const { count, error } = await query;
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: count || 0 };
}

async function dumpRows(supabase, table, userId = null) {
  const query = supabase.from(table).select('*');
  if (userId) query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) return { ok: false, rows: [], error: error.message };
  return { ok: true, rows: data || [] };
}

async function deleteRows(supabase, table, userId = null) {
  const query = supabase.from(table).delete();
  if (userId) query.eq('user_id', userId);
  // System-wide deletes need a non-null filter or supabase-js refuses.
  else query.not('id', 'is', null);
  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function seedSandy(supabase, userId, storeMemory, seedRows, sourceType, creationReason) {
  const results = [];
  for (const row of seedRows) {
    try {
      const out = await storeMemory(userId, row.content, row.memory_type, row.category, {
        source_type: sourceType,
        creation_reason: creationReason,
        importance: row.importance,
        confidence: 1.0,
      });
      results.push({ ok: !!out, content: row.content.slice(0, 80) });
    } catch (e) {
      results.push({ ok: false, content: row.content.slice(0, 80), error: e.message });
    }
  }
  return results;
}

async function writeAuditLog(supabase, payload) {
  try {
    const { error } = await supabase.from('raw_events').insert({
      event_type: 'sandy_deployment_reset',
      payload,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtTable(rows) {
  if (rows.length === 0) return '  (none)';
  const widths = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i] || '').length)));
  return rows.map(r => '  ' + r.map((c, i) => String(c || '').padEnd(widths[i] + 2)).join('')).join('\n');
}

function help() {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 45).map(l => l.replace(/^\/\*?\s?/, '').replace(/\*\/$/, '')).join('\n'));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  if (args.mode === 'help') {
    help();
    process.exit(0);
  }

  if (!args.userId) {
    console.error('ERROR: --user-id <uuid> is required (or set OWNER_USER_ID env var)');
    process.exit(2);
  }

  if (args.mode === 'confirm' && args.confirmToken !== CONFIRM_TOKEN) {
    console.error('ERROR: --confirm requires --confirm-token "' + CONFIRM_TOKEN + '"');
    console.error('       (Run --dry-run first, review the output, THEN pass the token.)');
    process.exit(2);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    console.error('       The service-role key is required — the anon key cannot delete rows.');
    process.exit(3);
  }

  const { supabase, storeMemory } = require('../lib/supabase');
  const {
    SANDY_PROFILE_VERSION,
    SEED_SOURCE_TYPE,
    SEED_CREATION_REASON,
    SANDY_SEED_MEMORIES,
  } = require('../seeds/sandy-approved-profile');

  const startedAt = new Date().toISOString();
  console.log('=== RESET FOR SANDY ===');
  console.log('Mode:        ' + args.mode);
  console.log('User ID:     ' + args.userId);
  console.log('Started:     ' + startedAt);
  console.log('Seed:        ' + SANDY_PROFILE_VERSION);
  console.log('');

  const policy = ambiguousPolicy(args);

  // ---- INVENTORY ----
  console.log('--- INVENTORY: tables that WOULD be cleared ---');
  const inventoryRows = [['table', 'rows', 'scope']];
  let totalToDelete = 0;
  let inventoryErrors = 0;

  for (const t of TABLES_TO_CLEAR_PER_USER) {
    const r = await countRows(supabase, t, args.userId);
    if (!r.ok) inventoryErrors++;
    inventoryRows.push([t, r.ok ? r.count : 'ERR:' + r.error, 'per-user']);
    if (r.ok) totalToDelete += r.count;
  }
  for (const t of SYSTEM_TABLES_TO_CLEAR) {
    const r = await countRows(supabase, t);
    if (!r.ok) inventoryErrors++;
    inventoryRows.push([t, r.ok ? r.count : 'ERR:' + r.error, 'system-wide']);
    if (r.ok) totalToDelete += r.count;
  }
  for (const p of policy) {
    if (p.applied === 'keep') {
      inventoryRows.push([p.table, '0', 'KEPT by flag (' + p.group + ')']);
    } else {
      const r = await countRows(supabase, p.table, args.userId);
      if (!r.ok) inventoryErrors++;
      inventoryRows.push([p.table, r.ok ? r.count : 'ERR:' + r.error, 'per-user (ambiguous → clear)']);
      if (r.ok) totalToDelete += r.count;
    }
  }
  console.log(fmtTable(inventoryRows));
  console.log('');
  console.log('TOTAL rows to delete: ' + totalToDelete);
  console.log('Inventory errors:    ' + inventoryErrors);
  console.log('');

  console.log('--- INVENTORY: tables that WILL be kept untouched ---');
  const keepRows = [['table', 'rows', 'reason']];
  for (const t of TABLES_TO_KEEP) {
    const r = await countRows(supabase, t);
    keepRows.push([t, r.ok ? r.count : 'ERR:' + r.error, 'auth / config / audit']);
  }
  console.log(fmtTable(keepRows));
  console.log('');

  console.log('--- SEED: what WILL be re-inserted ---');
  console.log('  Profile version: ' + SANDY_PROFILE_VERSION + '  (' + SANDY_SEED_MEMORIES.length + ' memory rows)');
  for (const m of SANDY_SEED_MEMORIES) {
    const head = '  [' + m.memory_type.padEnd(15) + '] ';
    const max = 100;
    console.log(head + (m.content.length > max ? m.content.slice(0, max) + '…' : m.content));
  }
  console.log('');

  // ---- DRY-RUN STOPS HERE ----
  if (args.mode === 'dry-run') {
    console.log('=== DRY-RUN COMPLETE — no changes made ===');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Read the inventory above. Confirm the per-user counts look right.');
    console.log('  2. Take a standalone backup (no destructive action):');
    console.log('       node scripts/reset-for-sandy.js --user-id ' + args.userId + ' --backup-only');
    console.log('  3. When you are ready to actually reset:');
    console.log('       node scripts/reset-for-sandy.js --user-id ' + args.userId + ' \\');
    console.log('         --confirm --confirm-token "' + CONFIRM_TOKEN + '"');
    process.exit(inventoryErrors > 0 ? 4 : 0);
  }

  // ---- BACKUP ----
  const tsForDir = startedAt.replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups', 'sandy-reset-' + tsForDir);
  fs.mkdirSync(backupDir, { recursive: true });
  console.log('--- BACKUP ---');
  console.log('Backup dir: ' + backupDir);

  let backupErrors = 0;
  for (const t of TABLES_TO_CLEAR_PER_USER) {
    const r = await dumpRows(supabase, t, args.userId);
    if (!r.ok) {
      backupErrors++;
      console.log('  ' + t.padEnd(28) + 'ERR ' + r.error);
      continue;
    }
    fs.writeFileSync(path.join(backupDir, t + '.json'), JSON.stringify(r.rows, null, 2));
    console.log('  ' + t.padEnd(28) + r.rows.length + ' rows');
  }
  for (const p of policy) {
    if (p.applied === 'keep') continue;
    const r = await dumpRows(supabase, p.table, args.userId);
    if (!r.ok) {
      backupErrors++;
      console.log('  ' + p.table.padEnd(28) + 'ERR ' + r.error);
      continue;
    }
    fs.writeFileSync(path.join(backupDir, p.table + '.json'), JSON.stringify(r.rows, null, 2));
    console.log('  ' + p.table.padEnd(28) + r.rows.length + ' rows (ambiguous)');
  }
  for (const t of SYSTEM_TABLES_TO_CLEAR) {
    const r = await dumpRows(supabase, t);
    if (!r.ok) {
      backupErrors++;
      console.log('  ' + t.padEnd(28) + 'ERR ' + r.error);
      continue;
    }
    fs.writeFileSync(path.join(backupDir, t + '.json'), JSON.stringify(r.rows, null, 2));
    console.log('  ' + t.padEnd(28) + r.rows.length + ' rows (system)');
  }
  console.log('');

  if (args.mode === 'backup-only') {
    console.log('=== BACKUP-ONLY COMPLETE — no destructive action taken ===');
    process.exit(backupErrors > 0 ? 4 : 0);
  }

  if (backupErrors > 0) {
    console.error('ERROR: backup had ' + backupErrors + ' table errors. Refusing to proceed with deletion.');
    process.exit(4);
  }

  // ---- DELETE ----
  console.log('--- DELETING ---');
  let deleteErrors = 0;
  for (const t of TABLES_TO_CLEAR_PER_USER) {
    const r = await deleteRows(supabase, t, args.userId);
    if (!r.ok) { deleteErrors++; console.log('  ' + t.padEnd(28) + 'ERR ' + r.error); }
    else console.log('  ' + t.padEnd(28) + 'cleared (per-user)');
  }
  for (const p of policy) {
    if (p.applied === 'keep') continue;
    const r = await deleteRows(supabase, p.table, args.userId);
    if (!r.ok) { deleteErrors++; console.log('  ' + p.table.padEnd(28) + 'ERR ' + r.error); }
    else console.log('  ' + p.table.padEnd(28) + 'cleared (ambiguous)');
  }
  for (const t of SYSTEM_TABLES_TO_CLEAR) {
    const r = await deleteRows(supabase, t);
    if (!r.ok) { deleteErrors++; console.log('  ' + t.padEnd(28) + 'ERR ' + r.error); }
    else console.log('  ' + t.padEnd(28) + 'cleared (system)');
  }
  console.log('');

  // ---- PINECONE ----
  console.log('--- PINECONE ---');
  let pineconeStatus = 'skipped';
  if (args.keepPinecone) {
    console.log('  --keep-pinecone set: namespace untouched');
    pineconeStatus = 'kept';
  } else {
    try {
      const pinecone = require('../lib/pinecone');
      if (pinecone && typeof pinecone.deleteUserNamespace === 'function') {
        await pinecone.deleteUserNamespace(args.userId);
        console.log('  Cleared user namespace for ' + args.userId);
        pineconeStatus = 'cleared';
      } else {
        console.log('  pinecone.deleteUserNamespace not available — skipping');
        pineconeStatus = 'unavailable';
      }
    } catch (e) {
      console.log('  Pinecone clear failed: ' + e.message);
      pineconeStatus = 'failed:' + e.message;
    }
  }
  console.log('');

  // ---- SEED ----
  console.log('--- SEEDING ---');
  const seedResults = await seedSandy(
    supabase,
    args.userId,
    storeMemory,
    SANDY_SEED_MEMORIES,
    SEED_SOURCE_TYPE,
    SEED_CREATION_REASON,
  );
  let seedFailures = 0;
  for (const r of seedResults) {
    if (!r.ok) seedFailures++;
    console.log('  ' + (r.ok ? 'OK  ' : 'FAIL') + ' ' + r.content + (r.error ? ' [' + r.error + ']' : ''));
  }
  console.log('');

  // ---- AUDIT ----
  console.log('--- AUDIT LOG ---');
  const auditResult = await writeAuditLog(supabase, {
    user_id: args.userId,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    backup_dir: backupDir,
    seed_version: SANDY_PROFILE_VERSION,
    tables_cleared_per_user: TABLES_TO_CLEAR_PER_USER,
    tables_cleared_system: SYSTEM_TABLES_TO_CLEAR,
    ambiguous_policy: policy,
    pinecone_status: pineconeStatus,
    seeded_memory_count: SANDY_SEED_MEMORIES.length,
    seed_failures: seedFailures,
    delete_errors: deleteErrors,
    operator: process.env.USER || process.env.LOGNAME || 'unknown',
  });
  console.log('  raw_events: ' + (auditResult.ok ? 'written' : 'FAIL ' + auditResult.error));
  console.log('');

  const total = deleteErrors + seedFailures + (auditResult.ok ? 0 : 1);
  console.log('=== RESET COMPLETE ===');
  console.log('Backup:        ' + backupDir);
  console.log('Delete errors: ' + deleteErrors);
  console.log('Seed failures: ' + seedFailures);
  console.log('Audit:         ' + (auditResult.ok ? 'ok' : 'FAIL'));
  process.exit(total > 0 ? 4 : 0);
}

// Export pure pieces for tests; only run main() when invoked directly.
module.exports = {
  TABLES_TO_CLEAR_PER_USER,
  SYSTEM_TABLES_TO_CLEAR,
  TABLES_TO_KEEP,
  AMBIGUOUS_TABLES,
  CONFIRM_TOKEN,
  parseArgs,
  ambiguousPolicy,
};

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
