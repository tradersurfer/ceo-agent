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

// OpenRouter model ids carry variant suffixes that select a different
// billing/serving mode on the SAME underlying model. Two matter here:
//
// - ':batch' — the asynchronous Batch API. Cheaper per token (verified live:
//   claude-haiku-4.5 is $0.50/M batched vs $1.00/M for the same model
//   unbatched), which is exactly why it used to WIN pickCheapest by price.
//   But a batch endpoint does not return a chat completion synchronously,
//   so targeting one from an interactive chat call yields a response the
//   caller never receives. Excluded from every tier rather than special-
//   cased in pickCheapest only, because the same argument disqualifies it
//   from pickFlagship/pickEfficient too.
// - ':free' — the free tier. Deliberately NOT excluded here; instead it is
//   excluded from flagship/efficient/cheapest (so those tiers keep returning
//   the best genuinely-paid option for a role) and surfaced on its own via
//   pickFree()/'free' tier below.
//
// Checked as a suffix on the id rather than a substring search anywhere in
// it, since a model id like "vendor/model:free" only means "free" in that
// exact trailing position.
const BATCH_VARIANT_SUFFIX = ':batch';

// Free models that are real text models but are NOT general-purpose chat
// assistants — routing a chat completion to one of these returns a
// classifier verdict instead of an assistant reply. OpenRouter's live
// catalog currently lists nvidia/nemotron-3.5-content-safety:free, which
// passes every other filter (text output modality, no -preview suffix, real
// created timestamp) and would otherwise be a valid pickFree() candidate.
// Pattern-matched rather than listed by exact id so the same guard holds as
// these safety/moderation models get renamed across vendors.
const NON_CHAT_FREE_PATTERN = /content[-_]?safety|moderation|guardrail|classifier|embedding|(^|[-/.])safety([-/.]|$)/i;
const ROLE_FAMILIES = Object.freeze({
  claude: { include: /^anthropic\/claude-/, flagship: /(?:^|[-/])opus(?:[-/]|$)/ },
  gpt: { include: /^openai\/gpt-/, exclude: /codex/, flagship: /(?:^|-)pro(?:-|$)/ },
  codex: { include: /^openai\/.*codex/ },
  gemini: { include: /^google\/gemini-/, flagship: /(?:^|-)pro(?:-|$)/ },
  grok: { include: /^x-ai\/grok-/, exclude: /(?:build|multi-agent)/ },
});

/**
 * Splits a model id into lowercase name tokens on the separators that
 * actually delimit a model name: '/', '-', '.', '_' and ':'. Version
 * numbers deliberately survive as their own tokens ("4.5" -> "4","5") so
 * they can never accidentally spell a keyword.
 * @param {string} id OpenRouter-style model id.
 * @returns {string[]} Lowercased tokens.
 */
function tokenizeModelId(id) {
  return String(id).toLowerCase().split(/[-/._:]+/);
}

/**
 * Whether a model id names a SMALL_TIER_KEYWORDS model.
 *
 * This is a token match, NOT a substring match, and the distinction is a
 * real bug fix rather than a stylistic choice: the previous `id.includes(
 * keyword)` form made every Gemini model count as "mini", because "gemini"
 * contains the substring "mini". Since pickFlagship() uses this to build
 * its non-small pool, every Gemini model landed in the small tier, that
 * pool was empty, and flagship fell through to the newest candidate with
 * no small-tier keyword at all — resolving Gemini flagship to
 * google/gemini-2.5-pro while google/gemini-3.1-pro sat unused, because
 * 3.1 Pro is still published under a -preview suffix.
 *
 * Token matching fixes the whole family of accidental substrings, not just
 * this one: "flash" would similarly match "Flashpoint", "lite" would match
 * "elite"/"satellite", "small" would match "smalltalk", and "nano" would
 * match "nanoseconds" if any vendor ever shipped those names.
 * @param {string} id OpenRouter-style model id.
 * @returns {boolean}
 */
function isSmallTierModel(id) {
  const tokens = new Set(tokenizeModelId(id));
  return SMALL_TIER_KEYWORDS.some(keyword => tokens.has(keyword));
}

/**
 * Whether a model id names a FLAGSHIP_VARIANT_KEYWORDS model.
 * Token-matched for the same reason isSmallTierModel() is — see its
 * docstring; '-fast' as a suffix test would also miss "gpt-6-fast-preview".
 */
function isFlagshipVariantModel(id) {
  const tokens = new Set(tokenizeModelId(id));
  return FLAGSHIP_VARIANT_KEYWORDS.some(keyword => tokens.has(keyword.replace(/^-/, '')));
}

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
 * Whether a model id is a free-tier variant, checked as a trailing suffix.
 * @param {string} id OpenRouter-style model id.
 * @returns {boolean}
 */
function isFreeVariant(id) {
  return typeof id === 'string' && id.endsWith(':free');
}

/**
 * Whether a model id is a Batch-API variant, checked as a trailing suffix.
 * @param {string} id OpenRouter-style model id.
 * @returns {boolean}
 */
function isBatchVariant(id) {
  return typeof id === 'string' && id.endsWith(BATCH_VARIANT_SUFFIX);
}

/**
 * Builds the candidate pool every tier picker draws from.
 *
 * Filters applied here (shared by all tiers) are the ones that disqualify a
 * model from an interactive chat completion at all:
 *   - wrong provider prefix / role family
 *   - Batch-API variants (async, never returns inline)
 *   - non-text-output models
 * Filters that only disqualify a model from SOME tiers (free variants, via
 * `includeFree`) are applied by the caller.
 * @param {object[]} models Full OpenRouter model list.
 * @param {string} prefix Provider id prefix, e.g. "anthropic/".
 * @param {string|null} [role] Role family key, or null for prefix-only matching.
 * @param {object} [options]
 * @param {boolean} [options.includeFree] Keep ':free' variants in the pool.
 * @returns {object[]}
 */
function getCandidates(models, prefix, role = null, options = {}) {
  const includeFree = options.includeFree === true;
  const family = role ? ROLE_FAMILIES[role] : null;
  return models
    .filter(model => typeof model.id === 'string' && model.id.startsWith(prefix))
    .filter(model => !family || family.include.test(model.id))
    .filter(model => !family?.exclude || !family.exclude.test(model.id))
    .filter(model => includeFree || !isFreeVariant(model.id))
    .filter(model => !isBatchVariant(model.id))
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

  const flagshipTier = candidates.filter(model => !isSmallTierModel(model.id));
  let pool = flagshipTier.length > 0 ? flagshipTier : candidates;
  const family = role ? ROLE_FAMILIES[role] : null;
  const preferred = family?.flagship
    ? pool.filter(model => family.flagship.test(model.id))
    : [];
  if (preferred.length > 0) pool = preferred;
  const stable = pool.filter(isStable);
  pool = stable.length > 0 ? stable : pool;
  const canonical = pool.filter(model => !isFlagshipVariantModel(model.id));
  return newest(canonical.length > 0 ? canonical : pool);
}

/**
 * Picks the best AVAILABLE free-tier chat model for a role.
 *
 * Free models are resolved per-role against the live catalog, NOT from a
 * hardcoded slug list — OpenRouter's free roster churns (16 models live at
 * time of writing) and a hardcoded id fails silently the moment one is
 * retired, which is the exact failure mode this module documents for
 * hardcoded slugs everywhere else.
 *
 * "Best" is decided by real capability signals from the catalog record:
 * largest context window wins, newest model breaking ties. Context is the
 * most honest available proxy for "can actually do the job" among free
 * models, whose quality varies enormously.
 *
 * Filters out, on top of the shared getCandidates() disqualifiers:
 *   - NON_CHAT_FREE_PATTERN matches (safety/moderation/embedding models —
 *     real text models that answer as classifiers, not assistants)
 *   - unstable (-preview/-beta/-experimental) free models, by the same
 *     rule every other tier uses: a preview free model can vanish without
 *     notice
 *
 * Returns null when a role has no free option — every major vendor's free
 * tier currently sits outside these five prefixes — which callers must read
 * as "no free tier for this role", not as an error.
 * @param {object[]} models Full OpenRouter model list.
 * @param {string} prefix Provider id prefix, e.g. "anthropic/".
 * @param {string} [role] Role family key.
 * @returns {object|null}
 */
function pickFree(models, prefix, role = null) {
  const candidates = getCandidates(models, prefix, role, { includeFree: true })
    .filter(model => isFreeVariant(model.id))
    .filter(model => !NON_CHAT_FREE_PATTERN.test(model.id))
    .filter(isStable);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    const ctxDelta = (current.context_length || 0) - (best.context_length || 0);
    if (ctxDelta !== 0) return ctxDelta > 0 ? current : best;
    return (current.created || 0) > (best.created || 0) ? current : best;
  }, candidates[0]);
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
  const smallTier = stablePool.filter(model => isSmallTierModel(model.id));
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
 * Shapes a raw catalog record into the resolved-tier entry shape every
 * consumer (ModelBroker, /api/config's catalog, ModelSelector) expects.
 * @param {object|null} model Raw catalog record.
 * @returns {object|null}
 */
function toTierEntry(model) {
  if (!model) return null;
  return {
    apiModelId: model.id,
    contextLength: model.context_length || null,
    name: model.name || model.id,
    pricing: extractPricing(model),
  };
}

/**
 * Resolves all known role labels to live OpenRouter model ids, all four
 * tiers.
 *
 * The fourth tier, `free`, is zero-cost and additive: it never displaces
 * flagship/efficient/cheapest (those still return the best genuinely-paid
 * option for a role), and is null for any role whose provider publishes no
 * free model — see pickFree().
 * @param {object[]} models Full OpenRouter model list.
 * @returns {object} Map of role -> { flagship, efficient, cheapest, free }
 */
function resolveRoleModels(models) {
  const resolved = {};
  for (const [role, prefix] of Object.entries(PROVIDER_PREFIXES)) {
    resolved[role] = {
      flagship: toTierEntry(pickFlagship(models, prefix, role)),
      efficient: toTierEntry(pickEfficient(models, prefix, role)),
      cheapest: toTierEntry(pickCheapest(models, prefix, role)),
      free: toTierEntry(pickFree(models, prefix, role)),
    };
  }
  return resolved;
}

module.exports = {
  resolveRoleModels,
  pickFlagship,
  pickEfficient,
  pickCheapest,
  pickFree,
  isTextCapable,
  extractPricing,
  tokenizeModelId,
  isSmallTierModel,
  isFlagshipVariantModel,
  isFreeVariant,
  isBatchVariant,
  PROVIDER_PREFIXES,
  ROLE_FAMILIES,
  SMALL_TIER_KEYWORDS,
  UNSTABLE_KEYWORDS,
  FLAGSHIP_VARIANT_KEYWORDS,
  BATCH_VARIANT_SUFFIX,
  NON_CHAT_FREE_PATTERN,
};
