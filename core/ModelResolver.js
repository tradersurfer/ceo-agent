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
const UNSTABLE_KEYWORDS = Object.freeze(['preview', 'experimental', 'beta']);
const FLAGSHIP_VARIANT_KEYWORDS = Object.freeze(['-fast']);
const ROLE_FAMILIES = Object.freeze({
  claude: { include: /^anthropic\/claude-/, flagship: /(?:^|[-/])opus(?:[-/]|$)/ },
  gpt: { include: /^openai\/gpt-/, exclude: /codex/, flagship: /(?:^|-)pro(?:-|$)/ },
  codex: { include: /^openai\/.*codex/ },
  gemini: { include: /^google\/gemini-/, flagship: /(?:^|-)pro(?:-|$)/ },
  grok: { include: /^x-ai\/grok-/, exclude: /(?:build|multi-agent)/ },
});

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
 * Picks the newest stable premium-family candidate for a provider.
 * @param {object[]} models Full OpenRouter model list.
 * @param {string} prefix Provider id prefix, e.g. "anthropic/".
 * @returns {object|null}
 */
function getCandidates(models, prefix, role = null) {
  const family = role ? ROLE_FAMILIES[role] : null;
  return models
    .filter(model => typeof model.id === 'string' && model.id.startsWith(prefix))
    .filter(model => !family || family.include.test(model.id))
    .filter(model => !family?.exclude || !family.exclude.test(model.id))
    .filter(model => !model.id.endsWith(':free'))
    .filter(isTextCapable);
}

function newest(models) {
  return models.reduce((best, current) => {
    const createdDelta = (current.created || 0) - (best.created || 0);
    if (createdDelta !== 0) return createdDelta > 0 ? current : best;
    return (current.context_length || 0) > (best.context_length || 0) ? current : best;
  }, models[0]);
}

function isStable(model) {
  const id = model.id.toLowerCase();
  return !UNSTABLE_KEYWORDS.some(keyword => id.includes(keyword));
}

function pickFlagship(models, prefix, role = null) {
  const candidates = getCandidates(models, prefix, role);
  if (candidates.length === 0) return null;

  const flagshipTier = candidates.filter(
    model => !SMALL_TIER_KEYWORDS.some(keyword => model.id.toLowerCase().includes(keyword))
  );
  let pool = flagshipTier.length > 0 ? flagshipTier : candidates;
  const family = role ? ROLE_FAMILIES[role] : null;
  const preferred = family?.flagship
    ? pool.filter(model => family.flagship.test(model.id))
    : [];
  if (preferred.length > 0) pool = preferred;
  const stable = pool.filter(isStable);
  pool = stable.length > 0 ? stable : pool;
  const canonical = pool.filter(
    model => !FLAGSHIP_VARIANT_KEYWORDS.some(keyword => model.id.toLowerCase().includes(keyword))
  );
  return newest(canonical.length > 0 ? canonical : pool);
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
function pickEfficient(models, prefix, role = null) {
  const candidates = getCandidates(models, prefix, role);
  if (candidates.length === 0) return null;

  const stable = candidates.filter(isStable);
  const stablePool = stable.length > 0 ? stable : candidates;
  const smallTier = stablePool.filter(
    model => SMALL_TIER_KEYWORDS.some(keyword => model.id.toLowerCase().includes(keyword))
  );
  if (smallTier.length > 0) return newest(smallTier);

  return stablePool.reduce((cheapest, current) => {
    const cheapestPrice = parseFloat(cheapest?.pricing?.prompt || '999');
    const currentPrice = parseFloat(current?.pricing?.prompt || '999');
    if (currentPrice !== cheapestPrice) return currentPrice < cheapestPrice ? current : cheapest;
    return (current.created || 0) > (cheapest.created || 0) ? current : cheapest;
  }, stablePool[0]);
}

/**
 * Resolves all known role labels to live OpenRouter model ids, both tiers.
 * @param {object[]} models Full OpenRouter model list.
 * @returns {object} Map of role -> { flagship: {...}|null, efficient: {...}|null }
 */
function resolveRoleModels(models) {
  const resolved = {};
  for (const [role, prefix] of Object.entries(PROVIDER_PREFIXES)) {
    const flagship = pickFlagship(models, prefix, role);
    const efficient = pickEfficient(models, prefix, role);
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

module.exports = {
  resolveRoleModels,
  pickFlagship,
  pickEfficient,
  isTextCapable,
  PROVIDER_PREFIXES,
  ROLE_FAMILIES,
  SMALL_TIER_KEYWORDS,
  UNSTABLE_KEYWORDS,
  FLAGSHIP_VARIANT_KEYWORDS,
};
