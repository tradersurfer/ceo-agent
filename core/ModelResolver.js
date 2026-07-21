/**
 * Resolves internal role labels (claude, gpt, gemini, grok, codex) to live
 * OpenRouter model ids by fetching the current model catalog. Resolves TWO
 * tiers per role: "flagship" (best available) and "efficient" (cheaper/
 * smaller, for cost-conscious installs) — never hardcoded, since exact
 * model slugs change over time and a stale hardcoded slug fails silently.
 */

const PROVIDER_PREFIXES = Object.freeze({
  claude: 'anthropic/',
  gpt: 'openai/',
  codex: 'openai/', // OpenRouter has no distinct "Codex" listing; falls back to best OpenAI model.
  gemini: 'google/',
  grok: 'x-ai/',
});

const SMALL_TIER_KEYWORDS = Object.freeze(['mini', 'nano', 'haiku', 'flash', 'lite', 'instant', 'small']);

/**
 * Checks whether a model is a pure text-chat model (excludes multimodal
 * output like Lyria's text+audio). See git history for why this check
 * requires an EXACT single-element ["text"] array, not "includes text".
 * @param {object} model OpenRouter model record.
 * @returns {boolean}
 */
function isTextCapable(model) {
  const outputModalities = model?.architecture?.output_modalities;
  if (!Array.isArray(outputModalities)) return true;
  return outputModalities.length === 1 && outputModalities[0] === 'text';
}

/**
 * Picks the best (highest context, non-small-tier) candidate for a provider.
 * @param {object[]} models Full OpenRouter model list.
 * @param {string} prefix Provider id prefix, e.g. "anthropic/".
 * @returns {object|null}
 */
function pickFlagship(models, prefix) {
  const candidates = models
    .filter(model => typeof model.id === 'string' && model.id.startsWith(prefix))
    .filter(isTextCapable);
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
 * Picks the cheapest reasonable small-tier candidate for a provider, for
 * cost-conscious installs. Prefers models matching SMALL_TIER_KEYWORDS;
 * falls back to the lowest-context (typically cheapest) candidate if no
 * small-tier match exists for that provider.
 * @param {object[]} models Full OpenRouter model list.
 * @param {string} prefix Provider id prefix, e.g. "anthropic/".
 * @returns {object|null}
 */
function pickEfficient(models, prefix) {
  const candidates = models
    .filter(model => typeof model.id === 'string' && model.id.startsWith(prefix))
    .filter(isTextCapable);
  if (candidates.length === 0) return null;

  const smallTier = candidates.filter(
    model => SMALL_TIER_KEYWORDS.some(keyword => model.id.toLowerCase().includes(keyword))
  );
  const pool = smallTier.length > 0 ? smallTier : candidates;

  return pool.reduce((cheapest, current) => {
    const cheapestPrice = parseFloat(cheapest?.pricing?.prompt || '999');
    const currentPrice = parseFloat(current?.pricing?.prompt || '999');
    return currentPrice < cheapestPrice ? current : cheapest;
  }, pool[0]);
}

/**
 * Resolves all known role labels to live OpenRouter model ids, both tiers.
 * @param {object[]} models Full OpenRouter model list.
 * @returns {object} Map of role -> { flagship: {...}|null, efficient: {...}|null }
 */
function resolveRoleModels(models) {
  const resolved = {};
  for (const [role, prefix] of Object.entries(PROVIDER_PREFIXES)) {
    const flagship = pickFlagship(models, prefix);
    const efficient = pickEfficient(models, prefix);
    resolved[role] = {
      flagship: flagship
        ? { apiModelId: flagship.id, contextLength: flagship.context_length || null, name: flagship.name || flagship.id }
        : null,
      efficient: efficient
        ? { apiModelId: efficient.id, contextLength: efficient.context_length || null, name: efficient.name || efficient.id }
        : null,
    };
  }
  return resolved;
}

module.exports = { resolveRoleModels, pickFlagship, pickEfficient, isTextCapable, PROVIDER_PREFIXES, SMALL_TIER_KEYWORDS };
