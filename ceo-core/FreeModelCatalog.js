/**
 * Free-model catalog (zero-cost tier) — resolves the LIVE free roster from
 * two independent sources and exposes it as a provider-agnostic pool.
 *
 * WHY THIS EXISTS SEPARATELY FROM ModelResolver's PER-ROLE TIERS
 * ---------------------------------------------------------------
 * core/ModelResolver.js resolves role -> {flagship, efficient, cheapest} by
 * matching a per-role provider prefix ("anthropic/", "openai/", ...). A free
 * tier was added there too (pickFree), but it resolves to null for every
 * role, and that is the correct result rather than a gap: the free models
 * OpenRouter actually publishes sit under entirely different vendor prefixes
 * — nvidia/, poolside/, thinkingmachines/, qwen/, liquid/, inclusionai/,
 * cohere/, dots-studio/ — none of which back the claude/gpt/codex/gemini/
 * grok roles. Verified against OpenRouter's live catalog: zero of its 16
 * free models match any role prefix, while four of them (nvidia/nemotron-*,
 * poolside/laguna-*, google/gemma-*) have real, capable, large-context
 * bodies worth using.
 *
 * So free models are NOT "a cheaper claude" and are deliberately not modeled
 * as one. They are their own catalog: a flat, browsable pool of zero-cost
 * chat models, qualified by ROLE only at dispatch time (a free model can
 * serve any of the roles), never at catalog-build time.
 *
 * TWO SOURCES, DIFFERENT METADATA QUALITY — treated differently on purpose
 * ------------------------------------------------------------------------
 * 1. OpenRouter free variants: ids ending ":free". These carry full catalog
 *    records — real `pricing` (0/0), real `context_length`, and an
 *    `architecture.output_modalities` block — so they can be ranked by an
 *    objective capability signal (context window).
 * 2. OpenCode Zen free models: bare ids ending "-free" (space-bunny-free,
 *    nemotron-3-ultra-free, deepseek-v4-flash-free, ...). Zen's /v1/models
 *    returns ONLY {id, object, created, owned_by} — no context length, no
 *    pricing, no modality block. There is therefore NO honest way to rank
 *    these against each other from real data, and this module does not
 *    pretend otherwise: see pickBestFree()'s docstring for exactly how the
 *    zero-metadata case is handled rather than guessed at.
 *
 * NAMESPACING
 * -----------
 * Zen model ids are bare ("space-bunny-free"), colliding in shape with no
 * other provider's ids and carrying no vendor prefix. They are exposed here
 * as "opencode/<zen-id>" so resolveClientForModel()'s existing prefix-keyed
 * dispatch seam remains the single place that decides which client places a
 * call. OpenRouter free ids are already fully qualified and pass through
 * unchanged.
 */

const {
  isTextCapable,
  isFreeVariant,
  isBatchVariant,
  tokenizeModelId,
  NON_CHAT_FREE_PATTERN,
} = require('./ModelResolver');

/**
 * Suffix identifying a zero-cost model on OpenCode Zen. Checked as a
 * trailing suffix, matching how ':free' is checked on OpenRouter — a
 * substring search would also match a hypothetical "free-tier-preview" id.
 */
const ZEN_FREE_SUFFIX = '-free';

/**
 * Model-id prefix that routes a model to the OpenCode Zen client. Matches
 * ceo-core/resolveClientForModel.js's MODEL_PREFIX_TO_PROVIDER_ID key and
 * lib/providers.js's provider id.
 */
const OPENCODE_NAMESPACE = 'opencode/';

/**
 * Normalizes a Zen bare id into the namespaced form this codebase dispatches
 * on, leaving already-namespaced ids alone.
 * @param {string} zenId Bare Zen model id, e.g. "space-bunny-free".
 * @returns {string} e.g. "opencode/space-bunny-free".
 */
function toZenModelId(zenId) {
  if (typeof zenId !== 'string') return zenId;
  return zenId.startsWith(OPENCODE_NAMESPACE) ? zenId : `${OPENCODE_NAMESPACE}${zenId}`;
}

/**
 * Whether a Zen model id is a free-tier model.
 * @param {string} id Bare Zen model id.
 * @returns {boolean}
 */
function isZenFree(id) {
  return typeof id === 'string' && id.endsWith(ZEN_FREE_SUFFIX);
}

/**
 * Shared disqualification filter for a free chat candidate, whatever the
 * source. Every rule here has bitten in practice or is structurally required:
 *   - must actually be a free variant of its provider
 *   - must be a text-only model (rejects image/audio-output entries)
 *   - must not be a Batch-API variant (async, never returns inline)
 *   - must not be a safety/moderation/embedding model (returns a classifier
 *     verdict, not an assistant reply)
 *   - must not be an unstable -preview/-beta/-experimental model (can be
 *     withdrawn without notice)
 * @param {string} id Fully-qualified model id.
 * @param {object} model Raw catalog record.
 * @returns {boolean}
 */
function isUsableFreeChatModel(id, model) {
  if (typeof id !== 'string' || !id) return false;
  if (!isFreeVariant(id) && !isZenFree(stripNamespace(id))) return false;
  if (isBatchVariant(id)) return false;
  if (NON_CHAT_FREE_PATTERN.test(id)) return false;
  const lower = id.toLowerCase();
  if (['preview', 'experimental', 'beta'].some(keyword => lower.includes(keyword))) return false;
  return isTextCapable(model);
}

/**
 * Removes the OpenCode namespace prefix, if present.
 * @param {string} id Fully-qualified model id.
 * @returns {string}
 */
function stripNamespace(id) {
  return typeof id === 'string' && id.startsWith(OPENCODE_NAMESPACE)
    ? id.slice(OPENCODE_NAMESPACE.length)
    : id;
}

/**
 * Builds one normalized catalog entry from a raw record.
 * @param {string} apiModelId Fully-qualified id this codebase dispatches on.
 * @param {object} model Raw catalog record.
 * @param {'openrouter'|'opencode'} source Which catalog it came from.
 * @returns {object} Normalized free-model entry.
 */
function toFreeEntry(apiModelId, model, source) {
  return {
    apiModelId,
    name: model?.name || stripNamespace(apiModelId),
    contextLength: model?.context_length || null,
    created: model?.created || null,
    source,
    // Zero by definition on both providers, but recorded explicitly rather
    // than left undefined so cost displays never render as "unknown" for a
    // model that genuinely costs nothing.
    pricing: { prompt: 0, completion: 0 },
  };
}

/**
 * Resolves the full live free roster from both sources.
 *
 * Tolerant of either source failing: a caller with no OpenRouter key, or an
 * unreachable Zen, still gets whatever the other source resolved. Returns
 * {models, errors} so a caller can surface a partial failure instead of
 * silently rendering an incomplete free list as if it were complete.
 *
 * @param {object} sources
 * @param {object[]} [sources.openRouterModels] Live OpenRouter catalog records.
 * @param {object[]} [sources.zenModels] Live Zen model records.
 * @returns {{models: object[], errors: string[]}}
 */
function resolveFreeModels({ openRouterModels = [], zenModels = [] } = {}) {
  const errors = [];
  const models = [];

  for (const model of openRouterModels) {
    if (!model || typeof model.id !== 'string' || !isFreeVariant(model.id)) continue;
    if (!isUsableFreeChatModel(model.id, model)) continue;
    models.push(toFreeEntry(model.id, model, 'openrouter'));
  }

  for (const model of zenModels) {
    if (!model || typeof model.id !== 'string' || !isZenFree(model.id)) continue;
    const qualified = toZenModelId(model.id);
    if (!isUsableFreeChatModel(qualified, model)) continue;
    models.push(toFreeEntry(qualified, model, 'opencode'));
  }

  // Stable ordering: OpenRouter entries first (they carry real context
  // metadata and are the only ones that can be ranked on evidence), then
  // Zen entries in the provider's own listing order. Within a source,
  // largest context first, newest breaking ties.
  const rank = entry => (entry.contextLength || 0) * 1e9 + (entry.created || 0);
  models.sort((a, b) => {
    const sourceDelta = (a.source === 'openrouter' ? 0 : 1) - (b.source === 'openrouter' ? 0 : 1);
    if (sourceDelta !== 0) return sourceDelta;
    return rank(b) - rank(a);
  });

  return { models, errors };
}

/**
 * Picks the default free model — the one a 'free' tier resolves to.
 *
 * Preference order, and the reasoning behind each step:
 *  1. Prefer an OpenRouter free model with a KNOWN context window. This is
 *     the only ranking decision made from real capability data.
 *  2. Prefer a large one (>= 100k tokens) — a 65k-context model cannot hold
 *     a real department's working context, so a small one is a worse
 *     default even though it is still free.
 *  3. Among those, prefer the NEWEST model. Without this step the pick
 *     degenerates to whatever the provider happened to list first among
 *     equal-context candidates — verified live: thinkingmachines/inkling-
 *     small:free and thinkingmachines/inkling:free both carry a 1,048,576
 *     context, and the -small variant is ~3.5 months older, so it must not
 *     win on a tie.
 *  4. Only if NO OpenRouter free model qualifies, fall back to the first
 *     Zen free model in Zen's own listing order.
 *
 * Step 4 is deliberately a listing-order fallback and NOT a capability
 * ranking. Zen's /v1/models carries no context length, pricing, or modality
 * data (verified live), so there is no evidence on which to prefer one Zen
 * model over another. Picking the first listed is a defensible default
 * (Zen controls its own ordering) and is documented here rather than
 * dressed up as a quality judgment the data does not support.
 *
 * @param {object[]} models Normalized free entries from resolveFreeModels().
 * @returns {object|null} Best free entry, or null when there are none.
 */
function pickBestFree(models) {
  if (!Array.isArray(models) || models.length === 0) return null;

  const largeContext = models.filter(
    m => m.source === 'openrouter' && (m.contextLength || 0) >= 100000
  );
  if (largeContext.length > 0) {
    return largeContext.reduce((best, current) => (
      (current.created || 0) > (best.created || 0) ? current : best
    ), largeContext[0]);
  }

  const anyOpenRouter = models.filter(m => m.source === 'openrouter');
  if (anyOpenRouter.length > 0) return anyOpenRouter[0];

  return models.find(m => m.source === 'opencode') || null;
}

module.exports = {
  resolveFreeModels,
  pickBestFree,
  toZenModelId,
  stripNamespace,
  isZenFree,
  isUsableFreeChatModel,
  toFreeEntry,
  OPENCODE_NAMESPACE,
  ZEN_FREE_SUFFIX,
  tokenizeModelId,
};
