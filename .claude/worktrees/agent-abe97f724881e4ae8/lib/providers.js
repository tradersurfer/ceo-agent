/**
 * Canonical provider metadata for BYNGE Phase 1 (see docs/adr/ADR-006 and
 * docs/design/BYNGE-connection-scoping.md). One table, shared by:
 *  - the .env write path (lib/ceoAgentServer.js#setProviderKey, bin/setup.js)
 *  - the web config API (app/api/config/route.ts)
 *  - the UI (ConnectionsView.tsx, ModelSelector.tsx)
 *
 * Deliberately dependency-free (no `fs`, no Node builtins) so it can be
 * required from both server code (CommonJS) and 'use client' components
 * (bundled) without pulling server-only code into the browser bundle.
 *
 * Provider ids here are connection/credential ids (openrouter, anthropic,
 * openai, google, xai) — a superset of and distinct from ModelResolver's
 * chat "role" ids (claude, codex, gpt, gemini, grok). `openrouter` is the
 * aggregator, not a role; the other four ids happen to line up 1:1 with a
 * role today, but the two concepts stay separate on purpose (ADR-006 non-
 * goals: no catalog merging, no resolveClientForModel in this phase).
 */

const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', envVar: 'OPENROUTER_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { id: 'google', label: 'Google AI Studio', envVar: 'GOOGLE_AI_STUDIO_API_KEY' },
  { id: 'xai', label: 'xAI', envVar: 'XAI_API_KEY' },
];

const PROVIDER_ENV_VARS = Object.freeze(
  Object.fromEntries(PROVIDERS.map(p => [p.id, p.envVar]))
);

const PROVIDER_IDS = Object.freeze(PROVIDERS.map(p => p.id));

// Providers with a real ProviderClient implementation (ADR-006's adapter
// pattern) wired into the dispatch path today. Everything else is
// "connected, not yet active" once a key is stored — Phase 2 work per the
// scoping doc's §6 phase boundary, not built here.
const ACTIVE_PROVIDER_IDS = Object.freeze(['openrouter']);

// Internal role labels ModelResolver/ModelBroker resolve and that a chat
// completion can actually be dispatched against today. Kept here (rather
// than only in core/ModelResolver.js) so client components can validate/
// render role ids without requiring server-only Node code.
const CHAT_ROLES = Object.freeze(['claude', 'codex', 'gpt', 'gemini', 'grok']);
// 'cheapest' is the resolver/broker tier key (matches ModelResolver's
// pickCheapest, same naming pattern as pickFlagship -> 'flagship' and
// pickEfficient -> 'efficient'); the UI labels it "Affordable" (see
// ModelSelector.tsx). Resolved only from OpenRouter's live pricing today —
// see core/ModelResolver.js's module comment for the Phase-2 gap once
// direct provider connections exist.
const COST_TIERS = Object.freeze(['flagship', 'efficient', 'cheapest']);

function isActiveProvider(providerId) {
  return ACTIVE_PROVIDER_IDS.includes(providerId);
}

module.exports = {
  PROVIDERS,
  PROVIDER_ENV_VARS,
  PROVIDER_IDS,
  ACTIVE_PROVIDER_IDS,
  CHAT_ROLES,
  COST_TIERS,
  isActiveProvider,
};
