/**
 * Resolves internal role labels (claude, gpt, gemini, grok, codex) to live
 * OpenRouter model ids by fetching the current model catalog. Resolves
 * THREE tiers per role: "flagship" (best available), "efficient" (a
 * small/lightweight model, chosen by name heuristic — see pickEfficient),
 * and "cheapest" (the genuinely lowest-priced model, chosen by real
 * pricing data — see pickCheapest; this is the "Affordable" tier in the
 * UI) — never hardcoded, since exact model slugs change over time and a
 * stale hardcoded slug fails silently.
 *
 * Phase 2 gap (documented, not built here — see docs/design/BYNGE-
 * connection-scoping.md §5's (a)/(b) decision, resolved as (b)):
 * pickCheapest() only works today because OpenRouter's /models response
 * carries live per-token pricing for every listed model. Once direct
 * provider connections exist (ADR-006 Phase 2 — Anthropic/OpenAI/Google/
 * xAI's own ProviderClients), those providers' own listModels() calls will
 * NOT carry the same queryable pricing data — provider pricing pages are
 * typically static HTML, not an API field. Cross-provider "cheapest"
 * comparison for directly-connected providers will need a maintained
 * static pricing table this project does not have yet. Until that's
 * built, "cheapest"/"Affordable" only ever resolves against OpenRouter's
 * catalog, exactly like "flagship" and "efficient" do today.
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
 * Picks the genuinely lowest-priced candidate for a provider, by real
 * per-token pricing (extractPricing().prompt) — NOT the SMALL_TIER_KEYWORDS
 * name heuristic pickEfficient() uses. "Efficient" and "cheapest" often
 * agree (small models tend to be cheap) but aren't guaranteed to: a model
 * with no small-tier keyword in its name can still be the cheapest
 * candidate, and this function is the one that actually checks. This is
 * the resolver behind the "Affordable" tier in the UI (see
 * docs/design/BYNGE-connection-scoping.md §5, decision (b)).
 *
 * Only ranks models with parseable pricing; a candidate with no/unparseable
 * pricing sorts last (never wins over a priced model) rather than being
 * treated as free. Ties (identical prompt price) are broken by original
 * list order — the first candidate at the minimum price wins, deterministic
 * rather than incidental (Array.prototype.sort/reduce iterate in stable,
 * defined order per spec).
 *
 * OpenRouter-only today: this reads model.pricing straight from
 * OpenRouter's /models response. A direct provider's own listModels() (once
 * ADR-006 Phase 2 ships) won't carry the same live pricing field — see the
 * module-level comment above for that gap.
 * @param {object[]} models Full OpenRouter model list.
 * @param {string} prefix Provider id prefix, e.g. "anthropic/".
 * @returns {object|null}
 */
function pickCheapest(models, prefix, role = null) {
  const candidates = getCandidates(models, prefix, role);
  if (candidates.length === 0) return null;

  const stable = candidates.filter(isStable);
  const stablePool = stable.length > 0 ? stable : candidates;

  let cheapest = null;
  let cheapestPrice = Infinity;
  for (const model of stablePool) {
    const pricing = extractPricing(model);
    const price = pricing && pricing.prompt != null ? pricing.prompt : Infinity;
    if (price < cheapestPrice) {
      cheapest = model;
      cheapestPrice = price;
    }
  }
  // Every candidate was unpriced (cheapestPrice stayed Infinity) — fall back
  // to the first stable candidate rather than returning null, matching
  // pickFlagship/pickEfficient's "always return something if candidates
  // exist" contract.
  return cheapest || stablePool[0];
}

/**
 * Extracts per-token USD pricing from an OpenRouter model record, per its
 * documented `pricing.prompt`/`pricing.completion` decimal-string contract
 * (cost per single token, e.g. "0.000003" == $3 / million tokens) — this
 * project could not independently verify a live response against that
 * documented contract (openrouter.ai is unreachable from this environment),
 * so treat downstream cost figures as an estimate against the documented
 * shape, not an independently confirmed one.
 * @param {object} model OpenRouter model record.
 * @returns {{prompt: number|null, completion: number|null}|null}
 */
function extractPricing(model) {
  if (!model?.pricing) return null;
  const prompt = parseFloat(model.pricing.prompt);
  const completion = parseFloat(model.pricing.completion);
  return {
    prompt: Number.isFinite(prompt) ? prompt : null,
    completion: Number.isFinite(completion) ? completion : null,
  };
}

/**
 * Resolves all known role labels to live OpenRouter model ids, all three
 * tiers.
 * @param {object[]} models Full OpenRouter model list.
 * @returns {object} Map of role -> { flagship: {...}|null, efficient: {...}|null, cheapest: {...}|null }
 */
function resolveRoleModels(models) {
  const resolved = {};
  for (const [role, prefix] of Object.entries(PROVIDER_PREFIXES)) {
    const flagship = pickFlagship(models, prefix, role);
    const efficient = pickEfficient(models, prefix, role);
    const cheapest = pickCheapest(models, prefix, role);
    resolved[role] = {
      flagship: flagship
        ? {
          apiModelId: flagship.id,
          contextLength: flagship.context_length || null,
          name: flagship.name || flagship.id,
          pricing: extractPricing(flagship),
        }
        : null,
      efficient: efficient
        ? {
          apiModelId: efficient.id,
          contextLength: efficient.context_length || null,
          name: efficient.name || efficient.id,
          pricing: extractPricing(efficient),
        }
        : null,
      cheapest: cheapest
        ? {
          apiModelId: cheapest.id,
          contextLength: cheapest.context_length || null,
          name: cheapest.name || cheapest.id,
          pricing: extractPricing(cheapest),
        }
        : null,
    };
  }
  return resolved;
}

module.exports = {
  resolveRoleModels,
  pickFlagship,
  pickEfficient,
  pickCheapest,
  isTextCapable,
  extractPricing,
  PROVIDER_PREFIXES,
  ROLE_FAMILIES,
  SMALL_TIER_KEYWORDS,
  UNSTABLE_KEYWORDS,
  FLAGSHIP_VARIANT_KEYWORDS,
};
