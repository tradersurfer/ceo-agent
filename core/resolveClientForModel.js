/**
 * Dispatch-time provider seam (BYNGE Phase 2, ADR-006's adapter pattern —
 * see docs/adr/ADR-006-multi-provider-strategy.md "Adapter pattern"
 * section). This is the ONE new decision point ADR-006 sketches:
 *
 *   resolveClientForModel(apiModelId, connections)
 *     -> { client: ProviderClient, providerModelId: string }
 *
 * Deliberately narrow. Given an already-resolved OpenRouter-style model id
 * (e.g. "anthropic/claude-opus-5" — the output of
 * ModelBroker#getApiModelId(), itself resolved by core/ModelResolver.js
 * against OpenRouter's live catalog), this picks which ProviderClient
 * should actually place the call: a direct provider client if the install
 * has one connected for that model's provider, or OpenRouterClient
 * unchanged otherwise (the default, and the only path that existed before
 * this PR).
 *
 * This does NOT change role->model resolution. ModelResolver/ModelBroker
 * stay the single source of truth for "which model id does role X resolve
 * to at tier Y" — that OpenRouter-only catalog is untouched. This function
 * only answers "once a model id is already resolved, which client actually
 * calls it" — a dispatch-time decision, not a catalog decision. Building
 * catalog-merging (a direct provider's own models feeding into
 * ModelResolver's tiers) is explicitly the separately-scoped, larger,
 * still-out-of-scope Phase 2 item (see docs/design/BYNGE-connection-
 * scoping.md §6) — getting this distinction backwards was the specific risk
 * flagged when this module was commissioned, so it's called out here
 * plainly rather than left implicit.
 *
 * Connection-registry keying: ADR-006's sketch named the registry as keyed
 * "by provider prefix (anthropic/, openai/, ...)". This implementation
 * keys by provider id instead (e.g. "anthropic", matching
 * lib/providers.js's PROVIDER_IDS / PROVIDER_ENV_VARS) — a deliberate,
 * documented deviation from the sketch, not an oversight. Provider id is
 * the key every other registry in this codebase already uses
 * (buildConnections() in lib/connectionsConfig.js, PROVIDER_ENV_VARS), and
 * "anthropic/" is an awkward literal object key (trailing slash) with no
 * upside over "anthropic" once the prefix-stripping happens inside this
 * function anyway.
 */

// Model-id prefix -> provider id. Phase 2's first PR only wired Anthropic;
// this stays a plain object (not lib/providers.js's PROVIDER_PREFIXES,
// which doesn't exist there — core/ModelResolver.js's PROVIDER_PREFIXES is
// role -> prefix, a different mapping) so each future provider PR
// (OpenAI/Google/xAI) adds one line here without touching resolution logic.
//
// 'openai/' (added in Phase 2's second PR, sdk/OpenAIClient.js) is the
// OpenRouter prefix core/ModelResolver.js's PROVIDER_PREFIXES uses for BOTH
// the 'gpt' and 'codex' roles (OpenRouter has no distinct "Codex" listing —
// see ModelResolver.js's own PROVIDER_PREFIXES comment). This function's
// loop matches on the model-id prefix only, not on which role produced it,
// so an 'openai/'-prefixed id resolved from either role dispatches through
// OpenAIClient identically — no role-awareness needed or added here.
//
// 'google/' (added in Phase 2's third PR, sdk/GoogleClient.js) is the
// OpenRouter prefix core/ModelResolver.js's PROVIDER_PREFIXES uses for the
// 'gemini' role — confirmed from that file rather than assumed; the
// provider id ('google', matching lib/providers.js's PROVIDER_IDS) and the
// OpenRouter prefix ('google/') happen to share a name here the same way
// anthropic/openai's do, which was still worth checking, not inferring.
const MODEL_PREFIX_TO_PROVIDER_ID = Object.freeze({
  'anthropic/': 'anthropic',
  'openai/': 'openai',
  'google/': 'google',
});

/**
 * Resolves which ProviderClient should actually place a call for an
 * already-resolved model id, and the native model id to send it.
 * @param {string} apiModelId OpenRouter-style resolved model id, e.g. "anthropic/claude-opus-5" (from ModelBroker#getApiModelId()).
 * @param {object} connections Registry of already-constructed ProviderClient
 *   instances, keyed by lib/providers.js provider id. `connections.openrouter`
 *   is required — it's the default fallback client used for every
 *   non-direct-connected provider prefix, and for `apiModelId` values this
 *   function doesn't recognize a prefix for. `connections.anthropic`
 *   (or any other future provider id), when present, means "a real direct
 *   connection is configured for this provider" — callers should pass it
 *   as null/undefined/absent when no key is configured, not construct a
 *   client with a null key and pass that in, so this function's presence
 *   check stays a true "is this connected" signal rather than requiring it
 *   to reach into a client's internals to find out.
 * @returns {{client: object, providerModelId: string}} The client to call
 *   and the model id to pass it — the native id (prefix stripped) for a
 *   direct connection, or `apiModelId` unchanged for OpenRouter.
 */
function resolveClientForModel(apiModelId, connections) {
  const openRouterClient = connections && connections.openrouter;

  if (typeof apiModelId === 'string') {
    for (const [prefix, providerId] of Object.entries(MODEL_PREFIX_TO_PROVIDER_ID)) {
      if (!apiModelId.startsWith(prefix)) continue;
      const directClient = connections && connections[providerId];
      if (directClient) {
        return { client: directClient, providerModelId: apiModelId.slice(prefix.length) };
      }
      break; // matched a known prefix but no direct connection — fall through to OpenRouter
    }
  }

  return { client: openRouterClient, providerModelId: apiModelId };
}

module.exports = { resolveClientForModel, MODEL_PREFIX_TO_PROVIDER_ID };
