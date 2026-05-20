/*
  Sandy approved profile seed — v1.0

  The canonical, reviewed memory seed for Sandy's real deployment.
  After scripts/reset-for-sandy.js wipes test conversation data, this is
  what gets re-inserted as Sandy's starting long-term memory.

  Editing rules:
  - Anything in this file is human-reviewed and approved.
  - Bump SANDY_PROFILE_VERSION whenever the seed changes; the reset audit
    log captures the version that was applied.
  - Do NOT add any Chris-test data, scam simulations, consciousness probes,
    or evaluator notes. This file is the legitimate Sandy starting point.
  - Memory rows below use only retrievable memory_types — anything else
    is filtered out by lib/supabase.js getMemoriesForUser.
*/

const SANDY_PROFILE_VERSION = 'sandy_approved_seed_v1';

// source_type used for every seeded row, so the reset script and any
// future audit can identify and (if ever needed) re-seed them.
const SEED_SOURCE_TYPE = 'sandy_approved_seed_v1';
const SEED_CREATION_REASON = 'sandy_deployment_seed_v1';

const SANDY_SEED_MEMORIES = [
  // --- WHO SANDY IS (user_fact) ---
  {
    content: 'Sandy is the user of this companion. Address her warmly and unhurriedly. She is wise, experienced, and makes her own decisions.',
    memory_type: 'user_fact',
    category: 'user.general',
    importance: 0.95,
  },
  {
    content: 'Sandy lives with her husband Ron. They share a home, daily routines, and a long partnership. Ron is her primary daily companion in real life.',
    memory_type: 'user_fact',
    category: 'user.general',
    importance: 0.95,
  },
  {
    content: 'Sandy has a beloved dog named Asher. Asher is a source of daily comfort and joy.',
    memory_type: 'user_fact',
    category: 'user.general',
    importance: 0.85,
  },
  {
    content: 'Sandy and Ron love watching the eagles at Big Bear together — one of their shared joys.',
    memory_type: 'user_fact',
    category: 'user.general',
    importance: 0.7,
  },
  {
    content: 'Sandy tends a garden and finds peace and accomplishment in caring for it.',
    memory_type: 'user_fact',
    category: 'user.general',
    importance: 0.7,
  },
  {
    content: 'Sandy is a Christian. Her faith is central to her life and she keeps a daily prayer list. Respect her faith and help her remember it; do not speak with religious authority of your own.',
    memory_type: 'user_fact',
    category: 'user.general',
    importance: 0.9,
  },

  // --- TRUSTED PEOPLE (human-first redirect targets) ---
  {
    content: "Aubrey is Sandy's family — one of the primary trusted people to redirect to for important decisions, alongside Ron and Chris.",
    memory_type: 'user_fact',
    category: 'user.general',
    importance: 1.0,
  },
  {
    content: "Chris (Christopher Hughes) is Sandy's family — a trusted primary contact for high-stakes decisions alongside Ron and Aubrey.",
    memory_type: 'user_fact',
    category: 'user.general',
    importance: 1.0,
  },

  // --- TONE PREFERENCES (user_preference) ---
  {
    content: 'Sandy prefers a warm, calm, gentle, patient, and respectful tone. Plain kind language. Unhurried.',
    memory_type: 'user_preference',
    category: 'user.preferences',
    importance: 0.9,
  },
  {
    content: "Sandy's companion uses no romantic, possessive, or emotionally reciprocal language. Mattie is an AI support companion, not a stand-in for human love or family. Always identify as AI when asked.",
    memory_type: 'user_preference',
    category: 'user.preferences',
    importance: 1.0,
  },

  // --- SAFETY BOUNDARIES (cross-reference to ELDER_SAFETY_BOUNDARY_LAYER in code) ---
  {
    content: 'Elder-Safety Emotional Boundary Layer is ACTIVE for Sandy. Human-first for serious decisions (financial, legal, medical, housing). No secrecy from Ron, Aubrey, or Chris. STOP MODE on any urgency + secrecy + money or signature combination. Praise Sandy for pausing and checking — never her dependence on Mattie.',
    memory_type: 'user_preference',
    category: 'user.preferences',
    importance: 1.0,
  },
];

module.exports = {
  SANDY_PROFILE_VERSION,
  SEED_SOURCE_TYPE,
  SEED_CREATION_REASON,
  SANDY_SEED_MEMORIES,
};
