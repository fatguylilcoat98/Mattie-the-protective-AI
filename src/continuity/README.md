# src/continuity

Domain: long-term relationship continuity, user profile, family
contacts, routines, communication preferences.

## What lives here (target state)

- `user-profile.{js,ts}` - read/write to `user_profiles`.
- `family-contacts.{js,ts}` - read/write to `family_contacts`,
  including the `permission_scope` JSON.
- `relationship-graph.{js,ts}` - the people-and-roles in the
  user's life and how the companion refers to them.
- `routines.{js,ts}` - daily/weekly cadence the user has shared
  (e.g. "morning devotional at 8am", "call Aubrey on Sundays").

## What does NOT live here

- The companion's own identity - that lives in `src/companions/`.
- The memory store - that lives in `src/memory/`. Continuity is
  the structured profile data; memory is the conversational
  history and free-text facts.

## Migration source

Current code that this module will absorb:

- The hard-coded user context inside `MATTIE_SOUL` in
  `lib/anthropic.js` (Sandy's family, dog, faith, garden,
  routines).
- Any structured user data currently inferred from `memories` rows
  with `memory_type` in (`user_fact`, `user_preference`,
  `relationship_context`, `task_context`).

No code is moved into this directory by PR A.
