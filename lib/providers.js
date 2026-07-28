/**
 * Canonical provider metadata for BYNGE Phase 1 (see docs/adr/ADR-006 and
 * docs/design/BYNGE-connection-scoping.md). One table, shared by:
 *  - the .env write path (lib/ceoAgentServer.js#setProviderKey, bin/setup.js)
 *  - the web config API (app/api/config/route.ts)
 *  - the UI (ConnectionsView.tsx, ModelSelector.tsx) — indirectly, via
 *    app/api/config/route.ts's response, NOT by importing this file
 *    directly. See the correction below.
 *
 * Deliberately dependency-free (no `fs`, no Node builtins) so it can be
 * required from server code (CommonJS — bin/chat.js, lib/ceoAgentServer.js,
 * any app/api/*\/route.ts handler) without pulling server-only code into
 * anything else.
 *
 * CORRECTION (found investigating a production dev-server bundle break):
 * this file must NOT be import()'d or require()'d directly from a 'use
 * client' component, despite what an earlier version of this comment
 * claimed ("...and 'use client' components (bundled)"). This file has zero
 * ES import/export syntax of its own (pure `module.exports`), so webpack
 * parses it as Script grammar, not Module grammar. Next dev's Fast-Refresh
 * instrumentation injects `import.meta.webpackHot.accept()` into every
 * module reachable from a 'use client' boundary regardless of how it's
 * required — that injection is only valid syntax under Module grammar, so
 * pulling this file into any client bundle breaks `next dev` with a parse
 * error (`next build`'s production bundle never injects Fast-Refresh code,
 * so this was invisible to every build/test/API-curl boot-check that ran
 * before this was caught). If a client component needs data from this file,
 * relay it through a server route's response (see app/api/config/route.ts's
 * `providers` field) — never import this module into client code directly.
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
// pattern) wired into the dispatch path today via
// core/resolveClientForModel.js. 'anthropic' joined in BYNGE Phase 2's first
// PR (sdk/AnthropicClient.js); 'openai' joined in Phase 2's second PR
// (sdk/OpenAIClient.js) — everything else is still "connected, not yet
// active" once a key is stored, pending their own ProviderClient PRs.
//
// Important: "active" here means DISPATCH-active only — a real client
// exists and chat calls for that provider's models can actually go out
// through it. It does NOT mean the provider has its own resolved model
// catalog the way OpenRouter does (ModelBroker/ModelResolver stay
// OpenRouter-only; catalog-merging is the separately-scoped, larger,
// still-out-of-scope §6 item). ConnectionsView/ModelSelector read this list
// to decide whether to render the role/tier picker at all — see
// ModelSelector.tsx's active-vs-catalog handling for how it avoids
// conflating "dispatch works" with "there's a catalog to show under this
// provider's label".
const ACTIVE_PROVIDER_IDS = Object.freeze(['openrouter', 'anthropic', 'openai']);

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
