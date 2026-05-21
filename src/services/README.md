# src/services

Domain: external-service boundary adapters. One adapter per
external dependency, kept thin.

## What lives here (target state)

- `anthropic.{js,ts}` - Claude API. Wraps `@anthropic-ai/sdk`.
  Does not contain prompts or persona strings; those live in
  `src/companions/` and `src/legacy/`.
- `openai.{js,ts}` - OpenAI (TTS, embeddings, image, multimodal
  fallback).
- `perplexity.{js,ts}` - Perplexity API.
- `groq.{js,ts}` - Groq (response auditor model).
- `supabase.{js,ts}` - the role-scoped Postgres client factory.
  After PR E, this returns a request-scoped client whose role is
  one of `lylo_senior`, `lylo_family`, `lylo_caregiver`,
  `lylo_admin`, `lylo_system`. The legacy service-key path is
  retained for migrations only.
- `pinecone.{js,ts}` - per-user (and after PR G, per-pilot)
  Pinecone namespace access.
- `tavily.{js,ts}` - web search.
- `elevenlabs.{js,ts}` - voice synthesis fallback.
- `email.{js,ts}` - Gmail / SMTP transport. Reads sender address
  and credentials from environment variables only.
- `modelslab.{js,ts}` - video generation.

## What does NOT live here

- Business logic - the adapters are thin. They take typed input,
  return typed output, and convert provider-specific errors to
  internal error types. They do not decide what to remember,
  what to surface, or what to refuse.
- Prompts - those live with the domain that owns the prompt
  (`src/companions/`, `src/legacy/`, `src/setup/`).

## Migration source

Current code that this module will absorb:

- `lib/anthropic.js` (minus the persona string and the
  prompt-assembly logic).
- `lib/supabase.js`
- `lib/pinecone.js`, `lib/pinecone-sync-service.ts`
- `lib/tavily.js`
- `lib/voice.js`
- `lib/multi-ai.js`, `lib/model-router.js` - merge into
  `anthropic.{js,ts}` and `openai.{js,ts}` as appropriate.

No code is moved here by PR A.
