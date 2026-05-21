# Lylo — Credential / PII Triage Report

**Status:** Investigation only. **No credentials have been rotated, no files
deleted, no history rewritten by this commit.** This report surfaces what was
found and proposes triage actions for explicit owner approval.

**Scope:** `fatguylilcoat98/mattie-the-protective-ai` at HEAD of `master`
(`c7737a3787f9a0c98662c15a78a35cacb7ece1d9`) and the branched audit work.

---

## 1. Headline finding

**No live API keys or live passwords appear to be committed to the repo.**
The two suspicious `.env`-style files committed (`.env.consciousness` and
`.env.example`) contain placeholder values (`your-anthropic-key`,
`your-app-password`, etc.), not real secrets.

**The PII that *is* exposed:**

- The email address `splendor.ai.2026@gmail.com` appears three times inside
  `.env.consciousness` (in `GMAIL_USER`, `SPLENDOR_EMAIL_FROM`, `USER_EMAIL`).
  This looks like a real mailbox identifier, not a placeholder. **Severity:
  medium** — the address being public enables targeted phishing against that
  mailbox, and since the same env file shows it is configured for
  app-password Gmail SMTP, anyone seeing the file knows which inbox to attack.
  No password value is in the file.
- Personal identifiers `chris_hughes` (as a hard-coded `user_id`) and
  references to Sandy / Aubrey / Chris / Asher appear in the seed scripts and
  the README. **Severity: low** (this is product context, not credential
  material), but for a multi-pilot product it should not live in source.

---

## 2. File-by-file findings

### 2.1 `.env.consciousness` (committed)

Real content found (from the file I read directly):

```
GMAIL_USER=splendor.ai.2026@gmail.com         ← likely real address
GMAIL_APP_PASSWORD=your-app-password           ← placeholder, OK
SPLENDOR_EMAIL_FROM=splendor.ai.2026@gmail.com ← likely real address
USER_EMAIL=splendor.ai.2026@gmail.com          ← likely real address
ANTHROPIC_API_KEY=your-anthropic-key           ← placeholder, OK
SUPABASE_URL=your-supabase-url                 ← placeholder, OK
SUPABASE_ANON_KEY=your-supabase-key            ← placeholder, OK
TAVILY_API_KEY=your-tavily-key-for-web-search  ← placeholder, OK
PINECONE_API_KEY=your-pinecone-key...          ← placeholder, OK
CONSCIOUSNESS_EMERGENCY_DISABLE=false          ← flag, OK
```

Classification: this is *effectively* a `.env.example` with a misleading
filename. The Gmail address is the only piece of real data.

### 2.2 `.env.example` (committed)

All values are placeholders. **No findings.** This file is appropriate to keep
tracked.

### 2.3 `.gitignore`

Relevant lines:

```
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
```

**Gap:** `.gitignore` rules match `.env` exactly and `.env.<known-suffixes>`
for a small allowlist. They do **not** match `.env.consciousness`,
`.env.brain`, `.env.staging`, or any other ad-hoc `.env.*` variant. Anyone
who creates a new `.env.<word>` to hold real credentials and forgets to add
it to `.gitignore` will commit it.

### 2.4 Seed data and SQL files

- `chris_hughes` appears as a hard-coded `user_id` in
  `database/continuous-consciousness-schema.sql` seed inserts.
- `database/complete-fresh-deploy.sql` seeds `memory_categories` rows keyed
  on `chris.personal`, `chris.preferences`, etc.
- The README and seed scripts contain Sandy / Aubrey / Chris / Asher and
  Sandy's faith + routines.

These are not credentials. They are tenant-specific data that should not be
hard-coded once the platform is multi-pilot.

### 2.5 Lib / route source code

From the files I read in the audit (`server.js`, `routes/auth.js`,
`routes/companion.js`, `lib/identity.js`, `lib/supabase.js` references, the
worker entrypoints):

- All API keys are read from `process.env.*` at runtime. No hard-coded
  keys, tokens, or service-role secrets found in the files I inspected.
- `routes/auth.js` correctly creates the Supabase client with
  `process.env.SUPABASE_SERVICE_KEY`. No leaks.
- `server.js` trims whitespace from env-var values defensively at boot.
- Render env-var configuration in `render.yaml` correctly uses `sync: false`
  (Render will not export those to clients).

**No credential leaks identified in source code.**

### 2.6 Backup files committed

- `server.js.backup`
- `package.json.backup`
- `routes/chat.js.backup`, `routes/chat.js.backup-before-streaming`
- `routes/master-continuity.js.backup`
- `lib/anthropic.js.backup`

I did not exhaustively diff these, but a generic risk is that an older
backup committed earlier may contain hard-coded keys that the current file
no longer has. Recommend a one-time scan as part of triage (see §3).

### 2.7 Git history

Not scanned in this audit. **Recommend running GitHub's repository-level
secret scanning** (`Settings → Code security and analysis → Secret scanning`)
if it's not already enabled. If it surfaces hits in history, treat each as
its own incident.

---

## 3. Recommended triage actions (require owner approval before execution)

**None of the following is being executed by this PR.** Each is a proposal.

### 3.1 Immediate (low-risk, recommended next)

- **Confirm whether `splendor.ai.2026@gmail.com` is a live, owned mailbox.**
  - If yes: rotate the Gmail app password (regardless of whether one was
    ever real — belt-and-braces). The committed file does not contain a
    password, but the address is public, so the inbox should expect spam
    and phishing.
  - If yes and the mailbox is reachable: enable 2FA, verify recovery email
    isn't compromised, and review recent sign-in history.
  - If no (was always placeholder): no action needed.
- **Audit the live Render environment for any secret values that came from
  the committed file.** If anyone copy-pasted from `.env.consciousness`
  thinking it was an example, the placeholder strings may now be in
  production. Quick check: are any of `your-anthropic-key`,
  `your-supabase-url`, `your-pinecone-key-for-semantic-memory` present in
  Render's env panel?
- **Tighten `.gitignore`:**
  ```
  # Replace the current `.env` block with:
  .env*
  !.env.example
  ```
  This makes the default *deny* all `.env.*` files and explicitly allows
  only `.env.example`. Safer pattern going forward.
- **Enable repo-level secret scanning** in GitHub settings (no code change).

### 3.2 Cleanup (medium-risk, recommended after the immediate steps)

- **Move `.env.consciousness`'s real content into `.env.example`** with all
  values as placeholders and the Gmail address replaced with
  `your-companion-email@example.com`. Then delete `.env.consciousness`.
  - This is a forward-only file change; the address is still in git history.
  - **Owner gate required.** This involves deleting a tracked file and that
    is on the do-not-touch list for Phase 1.
- **Scan the `.backup` files** for hard-coded secrets:
  ```
  rg -n -e 'sk-[A-Za-z0-9]{20,}' -e 'AIza[0-9A-Za-z\-_]{35}' \
         -e 'pcsk_[A-Za-z0-9_]{20,}' -e 'eyJ[A-Za-z0-9_-]{20,}\.' \
         -- '**/*.backup'
  ```
  Then either delete the `.backup` files (preferred) or scrub the secrets.
  **Owner gate required** — these files are flagged as do-not-touch in the
  Phase 1 audit until owner confirms they are not needed.

### 3.3 History rewrite (high-risk, opt-in only)

- If the email address (or any later finding) is judged sensitive enough to
  scrub from git history:
  - This requires `git filter-repo` (or BFG) and a force-push to `master`.
  - It will invalidate every existing clone and PR (including PR #12 and
    PR #13).
  - It is **destructive to history** and must not be done without explicit
    owner sign-off.
  - Recommended only if the address turns out to be linked to a real Gmail
    account that has been targeted.

### 3.4 Multi-pilot hygiene (long-running, tracked under main refactor)

- The hard-coded `chris_hughes` / Sandy / Aubrey identifiers are addressed
  by the main audit's Step 5 (introduce `pilot_instances`, `user_profiles`,
  `companion_profiles`). They are *not* credentials, just per-tenant
  hardcoding, and they belong with the schema refactor, not credential
  triage.

---

## 4. Owner decisions requested

Before any of the above is executed:

1. Is `splendor.ai.2026@gmail.com` a real mailbox you own? Has its app
   password ever been used in production?
2. Are the `.backup` files (`server.js.backup`, `routes/chat.js.backup`, etc.)
   safe to scan and then delete?
3. Do you want me to open a small dedicated PR for the **`.gitignore`
   tightening only** — the lowest-risk change here — separately from the
   broader log-text replacement work?
4. Do you want history scrubbed if the Gmail address is real?

The rest of the triage waits on these answers. No file content is changed by
this PR.

— End of credential / PII triage.
