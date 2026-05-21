# src/setup

Domain: first-run onboarding flow. Setup wizard state machine,
validation, idempotency, profile locking.

## What lives here (target state)

- `state-machine.{js,ts}` - step ordering, validation, transitions.
- `prompts.{js,ts}` - the onboarding questions, *as data* (not as
  prompt strings). Reviewable without touching companion behavior.
- `lock.{js,ts}` - sets `companion_profiles.locked_at` and
  `user_profiles.locked_at` on completion. Verifies that re-open
  attempts go through an authenticated owner endpoint.
- `validators.{js,ts}` - input validation for each step (companion
  name characters, family-contact relationships, vault-PIN
  strength, etc.).

## What does NOT live here

- The HTTP route handlers - those live in `routes/setup.js` (or
  a future `src/api/setup.js`).
- The setup wizard HTML/UI - that lives in `admin/setup-wizard.html`
  (operator-facing) and will eventually have a user-facing
  counterpart.

## Lands in

PR B (execution plan §9). Behind a feature flag
`SETUP_MODE_ENABLED`, default off. No code is added to this
directory by PR A.
