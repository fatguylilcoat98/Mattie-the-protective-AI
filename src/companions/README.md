# src/companions

Domain: companion identity, persona templates, name locking,
operator-configured persona state.

## What lives here (target state)

- `companion-profile.{js,ts}` - read/write to `companion_profiles`.
- `persona-builder.{js,ts}` - `buildCompanionPrompt(
    companionProfile, userProfile, safetyPolicies)`.
  Replaces the hard-coded `MATTIE_SOUL` constant in
  `lib/anthropic.js`. Lands behind a feature flag
  (`USE_PROFILE_DRIVEN_PROMPT=false` by default; see execution
  plan PR Step 7).
- `persona-templates.{js,ts}` - reads `companion_persona_templates`
  and renders a template for a new pilot.
- `lock.{js,ts}` - sets/checks `companion_profiles.locked_at`,
  enforces that a locked profile can only be re-opened by an
  authenticated owner.

## What does NOT live here

- The user's continuity / relationship data - that lives in
  `src/continuity/`. The companion's identity ("Grace, gentle
  tone, prefers prayer language") is here; the user's facts
  ("Sandy has a Shih Tzu named Asher") is there.
- The safety rules the companion enforces - those live in
  `src/governance/`.

## Migration source

Current code that this module will absorb:

- `lib/identity.js` - companion personality evolution, `identity_states` reads/writes.
- The persona string `MATTIE_SOUL` in `lib/anthropic.js`.
- The lock-state checks scattered through `routes/auth.js` and `routes/setup.js` (after PR B lands).

No code is moved into this directory by PR A. The module exists
as a target for future PRs.
