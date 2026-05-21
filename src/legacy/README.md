# src/legacy

Domain: Legacy Project mode. Guided storytelling, family archives,
legacy-export pipeline.

## What lives here (target state)

- `storytelling-engine.{js,ts}` - the guided-prompt state machine
  that walks a user through preserving a story.
- `prompts.{js,ts}` - thoughtful prompts ("Tell me about the day
  you met Ron"), reviewed *as data*.
- `no-fabrication-guard.{js,ts}` - pre-response check specific to
  Legacy mode: refuses to assert any detail not in the project's
  preserved store. Stricter than the general `src/governance/`
  no-fabrication guard.
- `archive.{js,ts}` - read/write to `legacy_projects`,
  `legacy_stories`, `legacy_voice_recordings`.
- `export.{js,ts}` - the per-project export pipeline. Produces a
  family archive in a user-portable format.

## Non-negotiable rules

- The companion in Legacy mode must not simulate deceased people.
- The companion in Legacy mode must not invent emotional memories.
- The companion in Legacy mode must not use afterlife /
  resurrection framing.
- Preserved-story rows must have `provenance = 'USER_STATED'` or
  `'ADMIN_APPROVED'`. They cannot be `'GENERATED'` or `'INFERRED'`.

These rules are enforced by `no-fabrication-guard.{js,ts}`, the
`memory_store` CHECK constraint, the safety policies, and the
adversarial test suite (`tests/lylo/legacy-no-fabrication.test.js`).

## Lands in

PR F (execution plan §10). Behind a feature flag
`LEGACY_MODE_ENABLED`, default off. No code is added to this
directory by PR A.
