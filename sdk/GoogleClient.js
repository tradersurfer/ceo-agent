const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Hand-rolled fetch()-based client for Google's Gemini API (BYNGE Phase 2,
 * ADR-006's adapter pattern — third provider client). Matches
 * sdk/OpenRouterClient.js's, sdk/AnthropicClient.js's, and
 * sdk/OpenAIClient.js's shape and hand-rolled-fetch approach — no
 * `@google/generative-ai` npm dependency, so no new license-check surface.
 * Implements the ProviderClient interface ADR-006 sketches: `listModels()`
 * and `chatCompletion({model, messages, maxTokens}) -> {text, usage}`.
 *
 * Verified against Google's live current Gemini API docs (ai.google.dev),
 * not assumed, on 2026-07-27. Gemini's actual shape does NOT slot cleanly
 * into either Anthropic's or OpenAI's precedent — it disagrees with both on
 * different axes, checked rather than guessed:
 *
 *  - Endpoint choice, and the one genuinely hard call this client makes:
 *    Google's current docs push a NEW "Interactions API"
 *    (`POST /v1beta/interactions`) as "the simplest and best way to build
 *    with Gemini models," explicitly recommended over the older
 *    `models.generateContent` endpoint for all new development — the same
 *    shape of "not deprecated, but no longer the recommended default"
 *    situation OpenAIClient hit with Chat Completions vs. Responses. Unlike
 *    that case, though, this client deliberately does NOT follow the newer
 *    recommendation, for a reason that was checked, not assumed: the
 *    Interactions API's central feature is server-side conversation state
 *    (`previous_interaction_id`, a `store` flag controlling persistence) —
 *    its docs describe stateless operation as merely "also" possible, not
 *    the primary design center, and even in stateless-leaning fetches this
 *    project could not pin down a firm request/response contract for it: no
 *    confirmed usage/token-accounting field names beyond one inconsistent
 *    example (`usage.total_tokens`/`total_input_tokens`/`total_output_tokens`
 *    — a flatter shape with no visible cache-token breakdown, seen in only
 *    one of several fetches), and no confirmed multi-turn `contents`-array
 *    equivalent the way `generateContent`'s request shape is fully and
 *    consistently documented. ADR-006's ProviderClient interface is
 *    explicitly stateless — every call site (bin/chat.js, app/api/chat/
 *    route.ts) builds one full messages array per call and expects
 *    `{text, usage}` back; nothing in this codebase stores a conversation/
 *    interaction id anywhere. Building that storage as a side effect of
 *    this adapter PR would be a real, separately-scoped feature, not a
 *    one-line client swap — the same "don't build a second system to avoid
 *    a documented gap" discipline ADR-001a/ADR-006 already apply elsewhere.
 *    So this client targets `models.generateContent`
 *    (`POST /v1beta/models/{model}:generateContent`) instead: fully and
 *    consistently documented, not deprecated, and its `contents` array
 *    already IS "send full history every call" — a structural match to the
 *    stateless `messages` contract this client must implement, no adapter
 *    trickery required. This is a real, revisitable tradeoff if Google's
 *    Interactions API's contract becomes fully confirmable and this
 *    project's call sites grow session state to use it — flagged here so a
 *    future reader doesn't mistake this for an oversight, mirroring
 *    OpenAIClient's own "revisitable if guidance changes" note for the
 *    opposite call.
 *  - Auth: `x-goog-api-key: <key>` header — every current-docs example
 *    fetched (Interactions quickstart, generateContent's own REST example)
 *    uses this header consistently, not `Authorization: Bearer` (OpenAI/
 *    OpenRouter's shape) and not `x-api-key` + a version header (Anthropic's
 *    shape). One older-looking fetch (the `/v1beta/models` listing page)
 *    showed a `?key=$GEMINI_API_KEY` query-param example instead; both
 *    appear to be genuinely supported, but the header is what current
 *    examples consistently lead with, so that's what this client sends.
 *    Also confirmed: Google is mid-migration away from "Standard" API keys
 *    to service-account-bound "auth" keys, with Standard keys rejected
 *    starting September 2026 — a real, checkable near-term risk for
 *    whatever key an install stores under GOOGLE_AI_STUDIO_API_KEY, but
 *    orthogonal to this client's request shape (both key types are bearer
 *    strings sent the same way) and out of scope to design around here.
 *  - Request shape: `contents` array of `{role, parts: [{text}]}` — Gemini
 *    uses `"model"` as the assistant role name in `contents`, NOT
 *    `"assistant"` (OpenAI/Anthropic/OpenRouter's shape), and has no
 *    `"system"` role in `contents` at all. System instructions go in a
 *    separate top-level `systemInstruction: {parts: [{text}]}` field —
 *    same spirit as Anthropic's `system` string / OpenAI's `instructions`
 *    string, confirmed current field name and shape (an object wrapping a
 *    `parts` array, not a bare string) from Google's own request-body
 *    reference, not assumed to match either prior client's flatter shape.
 *    `maxOutputTokens` lives nested inside a `generationConfig` object
 *    (unlike Anthropic's/OpenAI's/OpenRouter's top-level `max_tokens`/
 *    `max_output_tokens`).
 *  - Response shape: `candidates[0].content.parts[].text` — an array of
 *    candidates (Gemini supports multiple completions per call; this client
 *    only ever requests/reads the first), each with a `content.role` of
 *    `"model"` and a `parts` array whose first text part holds the answer.
 *  - `usage` field names: `usageMetadata` (not `usage`), with
 *    `promptTokenCount`/`candidatesTokenCount`/`totalTokenCount`/
 *    `cachedContentTokenCount` — a wholly different naming convention from
 *    both Anthropic's `_tokens`-suffixed snake_case and OpenAI's
 *    `input_tokens`/`output_tokens` — confirmed field names from Google's
 *    live GenerateContentResponse reference. See the usage-mapping comment
 *    in chatCompletion() below for what's confirmed vs. genuinely uncertain
 *    (the promptTokenCount-vs-cached-tokens relationship, specifically,
 *    could NOT be pinned down from reachable docs — flagged there, not
 *    guessed).
 *  - `GET /v1beta/models` requires the same key-based auth as a real
 *    completion call — NOT key-free like OpenRouter's `/models` — same
 *    asymmetry AnthropicClient/OpenAIClient already flag, confirmed
 *    independently true for Google too. Response paginates via a
 *    `nextPageToken` string (a different pagination idiom from Anthropic's
 *    `after_id`/`has_more`, though the same general shape: page until no
 *    more pages). Each record: `{name, baseModelId, version, displayName,
 *    description, inputTokenLimit, outputTokenLimit,
 *    supportedGenerationMethods, ...}` — no per-token pricing field, same
 *    gap AnthropicClient/OpenAIClient already document for their own model
 *    records. `name` is Google's full resource name (e.g.
 *    `"models/gemini-3-pro"`), NOT a bare id — left as-is, unmodified, same
 *    "no synthesized fields" treatment the other two clients apply.
 */
class GoogleClient {
  /**
   * Creates a thin Gemini API client.
   * @param {object} options Client options.
   * @param {string|null} options.apiKey Google AI Studio API key.
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_AI_STUDIO_API_KEY || null;
  }

  /**
   * Fetches the live list of models from Google's own `/v1beta/models`
   * endpoint.
   *
   * Requires authentication (confirmed from live docs, not assumed — see
   * class docstring) — there is no unauthenticated variant, so this throws
   * a clear error when no key is configured rather than silently returning
   * an empty list or fabricating a hardcoded model list (same reasoning
   * AnthropicClient#listModels()/OpenAIClient#listModels() already document
   * for the identical asymmetry with OpenRouter).
   *
   * Nothing in this codebase calls listModels() today — ADR-006's non-goals
   * explicitly exclude ModelResolver/ModelBroker catalog-merging for this
   * PR — so this method exists only to satisfy the ProviderClient interface
   * shape for future use, not to feed any live catalog. No `pricing`,
   * `context_length`, or `architecture` fields are synthesized; callers
   * that need OpenRouter-catalog-shaped records must not use this method —
   * none do today.
   * @returns {Promise<object[]>} Raw model records from Google's `/v1beta/models`.
   */
  async listModels() {
    if (!this.apiKey) {
      throw new Error(
        "GOOGLE_AI_STUDIO_API_KEY is not set. Unlike OpenRouter's /models, Google's "
        + '/v1beta/models requires authentication — configure a key before listing models.'
      );
    }

    const models = [];
    let pageToken = null;
    do {
      const url = new URL(`${GOOGLE_BASE}/models`);
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      // eslint-disable-next-line no-await-in-loop -- pagination is inherently sequential
      const response = await fetch(url, {
        headers: { 'x-goog-api-key': this.apiKey },
      });
      if (!response.ok) {
        throw new Error(`Google /v1beta/models request failed: ${response.status}`);
      }
      // eslint-disable-next-line no-await-in-loop
      const body = await response.json();
      if (Array.isArray(body.models)) models.push(...body.models);
      pageToken = body.nextPageToken || null;
    } while (pageToken);

    return models;
  }

  /**
   * Runs a chat completion against a specific Gemini model via the
   * `generateContent` endpoint (`POST /v1beta/models/{model}:generateContent`
   * — see class docstring for why this endpoint over the newer Interactions
   * API).
   *
   * `messages` follows the same OpenAI-style shape OpenRouterClient,
   * AnthropicClient, and OpenAIClient all accept (including an optional
   * leading `{role: 'system', ...}` entry) — both real call sites
   * (bin/chat.js, app/api/chat/route.ts) build one identical messages array
   * and hand it to whichever client resolveClientForModel() picked, so this
   * client must accept the same input shape even though Gemini's native API
   * takes the system prompt as a separate top-level `systemInstruction`
   * field (an object wrapping a `parts` array, not a bare string — see
   * class docstring) and has no `"system"` role inside `contents` at all.
   * `contents` sent to Gemini is left with only real turns, each mapped to
   * Gemini's role vocabulary: `"user"` passes through unchanged, but
   * `"assistant"` is translated to `"model"` — Gemini's own role name for
   * model turns, NOT `"assistant"` (no call site in this codebase sends
   * assistant-role history today, but this mapping is correct regardless,
   * matching the honesty bar of translating the full contract rather than
   * only the paths currently exercised).
   *
   * @param {object} options Completion options.
   * @param {string} options.model Gemini native model id (e.g. "gemini-3-pro") — already stripped of the "google/" prefix by resolveClientForModel().
   * @param {Array<{role: string, content: string}>} options.messages Chat messages, OpenAI-style (system/user/assistant roles).
   * @param {number} [options.maxTokens] Optional max output tokens.
   * @returns {Promise<{text: string, usage: object}>} Response text and mapped usage.
   */
  async chatCompletion({ model, messages, maxTokens = 1024 }) {
    if (!this.apiKey) {
      throw new Error('GOOGLE_AI_STUDIO_API_KEY is not set. Run setup or add it to .env.');
    }

    const systemParts = [];
    const contents = [];
    for (const msg of messages || []) {
      if (!msg) continue;
      if (msg.role === 'system') {
        if (msg.content) systemParts.push(msg.content);
        continue;
      }
      const role = msg.role === 'assistant' ? 'model' : msg.role;
      contents.push({ role, parts: [{ text: msg.content }] });
    }

    const requestBody = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (systemParts.length > 0) {
      requestBody.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
    }

    const response = await fetch(`${GOOGLE_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Google completion failed: ${response.status} ${errorBody}`);
    }
    const body = await response.json();
    const firstCandidate = Array.isArray(body.candidates) ? body.candidates[0] : null;
    const textPart = firstCandidate?.content?.parts?.find(part => part && typeof part.text === 'string');
    const text = textPart ? textPart.text : '';
    const rawUsage = body.usageMetadata || {};

    // Usage mapping — deliberate, not a guess (verified field names against
    // live GenerateContentResponse reference docs on 2026-07-27; see the
    // class docstring). This mapping has a genuine, flagged gap neither
    // AnthropicClient's nor OpenAIClient's usage comment had to carry:
    //
    // - completionTokens <- usageMetadata.candidatesTokenCount.
    // - totalTokens <- usageMetadata.totalTokenCount — present directly on
    //   this response shape, same as OpenAI's total_tokens, no derivation
    //   needed (unlike Anthropic's usage object, which has none).
    // - cachedTokens / cacheReadTokens <- usageMetadata.cachedContentTokenCount:
    //   tokens served from cache this request. Reused for both fields, same
    //   considered-equivalence reasoning AnthropicClient/OpenAIClient both
    //   already apply for their own single-cache-read-figure shapes.
    // - cacheCreationTokens <- always null. Gemini's cache-WRITE cost is not
    //   part of a generateContent call's usage at all — explicit context
    //   caching bills the cache-creation cost at CachedContent-resource
    //   creation time (a separate API this client does not call), and
    //   Gemini's *implicit* caching (enabled by default for 2.5+ models,
    //   confirmed from live docs) has no documented "tokens written to
    //   cache" figure exposed on this response shape at all. Unlike OpenAI's
    //   cache_write_tokens (confirmed to exist, just uncertain which models
    //   carry it), there is no field here to defensively read — null is the
    //   honest answer, not a placeholder for one this project couldn't find.
    // - promptTokens <- usageMetadata.promptTokenCount, read directly.
    //   FLAGGED AS THE LEAST CERTAIN MAPPING IN THIS FILE: whether
    //   promptTokenCount already INCLUDES cachedContentTokenCount (OpenAI's
    //   shape) or reports only the uncached remainder, requiring the
    //   Anthropic-style addition, could NOT be confirmed from reachable
    //   Google docs in this environment — the caching guide states only
    //   that cache hits are visible in the response, not the arithmetic
    //   relationship between the two fields. Reading promptTokenCount
    //   directly (treating it as the total) is this client's best-available
    //   judgment call given the balance of evidence, NOT a confirmed fact
    //   the way AnthropicClient's addition or OpenAIClient's direct read
    //   both are — re-verify against a live response before trusting
    //   promptTokens for cost-tracking accuracy on any call that actually
    //   hits cached content.
    const completionTokens = rawUsage.candidatesTokenCount ?? null;
    const totalTokens = rawUsage.totalTokenCount ?? null;
    const cachedContentTokenCount = rawUsage.cachedContentTokenCount ?? null;
    const promptTokens = rawUsage.promptTokenCount ?? null;

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cachedTokens: cachedContentTokenCount,
        cacheCreationTokens: null,
        cacheReadTokens: cachedContentTokenCount,
      },
    };
  }
}

module.exports = GoogleClient;
