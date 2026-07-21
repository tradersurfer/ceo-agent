/**
 * Resolves internal role labels (claude, gpt, gemini, grok, codex) to live
 * OpenRouter model ids by fetching the current model catalog and picking
 * the flagship candidate for each provider — never hardcoded, since exact
 * model slugs change over time and a stale hardcoded slug fails silently.
 */

const PROVIDER_PREFIXES = Object.freeze({
  claude: 'anthropic/',
  gpt: 'openai/',
  codex: 'openai/', // OpenRouter has no distinct "Codex" listing; falls back to best OpenAI model.
  gemini: 'google/',
  grok: 'x-ai/',
});

// Keywords that mark a smaller/cheaper tier — excluded from flagship selection
// unless a provider has no larger-tier candidate available.
const SMALL_TIER_KEYWORDS = Object.freeze(['mini', 'nano', 'haiku', 'flash', 'lite', 'instant', 'small']);

/**
 * Checks whether a model is a pure text-chat model. output_modalities lives
 * at model.architecture.output_modalities per OpenRouter's actual API
 * response shape (confirmed against a live record). Requiring the array to
 * contain ONLY "text" (not "text" among others) is deliberate: some models
 * — e.g. Google's Lyria music-generation line — list output_modalities as
 * ["text", "audio"], which makes them pass a loose "includes text" check
 * despite not being chat models. A CEO Agent conversational role needs a
 * model whose primary and sole output is text.
 * @param {object} model OpenRouter model record.
 * @returns {boolean} Whether this model is text-only output.
 */
function isTextCapable(model) {
  const outputModalities = model?.architecture?.output_modalities;
  if (!Array.isArray(outputModalities)) return true; // unknown shape — don't exclude
  return outputModalities.length === 1 && outputModalities[0] === 'text';
}

/**
 * Picks the best candidate for one provider prefix from the live model list.
 * @param {object[]} models Full OpenRouter model list.
 * @param {string} prefix Provider id prefix, e.g. "anthropic/".
 * @returns {object|null} Selected model record or null if none found.
 */
function pickFlagship(models, prefix) {
  const providerCandidates = models.filter(
    model => typeof model.id === 'string' && model.id.startsWith(prefix)
  );
  const candidates = providerCandidates.filter(isTextCapable);
  if (candidates.length === 0) return null;

  const flagshipTier = candidates.filter(
    model => !SMALL_TIER_KEYWORDS.some(keyword => model.id.toLowerCase().includes(keyword))
  );
  const pool = flagshipTier.length > 0 ? flagshipTier : candidates;

  return pool.reduce((best, current) => {
    const bestContext = best?.context_length || 0;
    const currentContext = current?.context_length || 0;
    return currentContext > bestContext ? current : best;
  }, pool[0]);
}

/**
 * Resolves all known role labels to live OpenRouter model ids.
 * @param {object[]} models Full OpenRouter model list (from OpenRouterClient.listModels()).
 * @returns {object} Map of role -> { apiModelId, contextLength } or null if unresolved.
 */
function resolveRoleModels(models) {
  const resolved = {};
  for (const [role, prefix] of Object.entries(PROVIDER_PREFIXES)) {
    const match = pickFlagship(models, prefix);
    resolved[role] = match
      ? { apiModelId: match.id, contextLength: match.context_length || null, name: match.name || match.id }
      : null;
  }
  return resolved;
}

module.exports = { resolveRoleModels, pickFlagship, isTextCapable, PROVIDER_PREFIXES, SMALL_TIER_KEYWORDS };
