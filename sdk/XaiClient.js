const XAI_BASE = 'https://api.x.ai/v1';

/**
 * Hand-rolled fetch()-based client for xAI's Grok API (BYNGE Phase 2,
 * ADR-006's adapter pattern — fourth and last provider client). Matches
 * sdk/OpenRouterClient.js's, sdk/AnthropicClient.js's, sdk/OpenAIClient.js's,
 * and sdk/GoogleClient.js's shape and hand-rolled-fetch approach — no `xai`/
 * `@xai-org` npm dependency (xAI does not appear to publish one under
 * either name at the time of writing; irrelevant either way since this PR
 * follows the established no-new-dependency precedent), so no new
 * license-check surface. Implements the ProviderClient interface ADR-006
 * sketches: `listModels()` and `chatCompletion({model, messages,
 * maxTokens}) -> {text, usage}`.
 *
 * Verified against xAI's live current API docs (docs.x.ai), not assumed
 * from OpenAI's precedent despite xAI's API surface being widely reported
 * as OpenAI-compatible in public discussion — checked directly, on
 * 2026-07-28:
 *
 *  - Base endpoint: `https://api.x.ai/v1` — confirmed current, not a stale
 *    assumption.
 *  - Endpoint choice: `POST /v1/responses`, NOT `/v1/chat/completions`. Both
 *    are real, currently-documented endpoints — xAI's Chat Completions
 *    endpoint (`POST /v1/chat/completions`) is not deprecated and uses a
 *    genuinely OpenAI-Chat-Completions-compatible shape (`messages` array,
 *    `choices[0].message.content` response). But unlike OpenAI's own
 *    Responses-vs-Chat-Completions guidance (recommended, not mandated),
 *    xAI's docs state this more plainly for their own API: "The Responses
 *    API is the preferred way of interacting with our models via API." This
 *    client targets the endpoint xAI itself states is preferred for new
 *    integrations, same reasoning OpenAIClient already applied for OpenAI,
 *    verified independently for xAI rather than inferred from that
 *    precedent — a real, revisitable tradeoff if xAI's guidance changes.
 *  - Auth: `Authorization: Bearer <key>` — same header shape as
 *    OpenRouterClient/OpenAIClient (unlike AnthropicClient's `x-api-key` +
 *    `anthropic-version`, or GoogleClient's `x-goog-api-key`). Confirmed for
 *    both `/v1/responses` and `/v1/models`.
 *  - Request shape: `input` array of `{role, content}` items, plain string
 *    `content` (matches xAI's own worked examples). A genuine, checked
 *    deviation from OpenAIClient's handling of the Responses API shape:
 *    xAI's own guide demonstrates a LEADING `{role: "system", content: ...}`
 *    item placed directly inside the `input` array
 *    (`input: [{role: "system", ...}, {role: "user", ...}]`) — unlike
 *    OpenAI's Responses API, which has no `"system"` role inside `input` at
 *    all and requires the system/developer prompt to go in a separate
 *    top-level `instructions` string field instead. xAI's API reference also
 *    separately lists a top-level `instructions` parameter as a documented
 *    option, so both shapes are plausible; this client uses the
 *    system-role-in-`input` form because that is the one xAI's own worked
 *    example concretely demonstrates working, rather than the one merely
 *    listed as an available parameter with no worked example. `max_tokens`
 *    is NOT the right field for this endpoint (that's the older Chat
 *    Completions convention) — the Responses API's documented parameter is
 *    `max_output_tokens`, confirmed from xAI's own parameter reference.
 *  - Response shape: like OpenAI's Responses API and unlike xAI's own Chat
 *    Completions endpoint, the raw JSON has no `output_text` convenience
 *    field on the wire. A hand-rolled client must walk the real `output`
 *    array: find the item with `type: "message"` and `role: "assistant"`,
 *    then within its `content` array find the item with
 *    `type: "output_text"` and read `.text` — same walk OpenAIClient already
 *    performs for the structurally-equivalent OpenAI shape, confirmed
 *    independently correct for xAI's own documented response example rather
 *    than assumed identical.
 *  - `usage` field names: `input_tokens`, `input_tokens_details.
 *    cached_tokens`, `output_tokens`, `output_tokens_details.
 *    reasoning_tokens`, `total_tokens` — see the usage-mapping comment in
 *    chatCompletion() below for how these map onto UsageTracker's generic
 *    usage shape, and for what's confirmed vs. still uncertain.
 *  - `GET /v1/models` requires the same `Authorization: Bearer` auth as a
 *    real completion call — NOT key-free like OpenRouter's `/models`. Same
 *    asymmetry Anthropic/OpenAI/GoogleClient already flag, confirmed
 *    independently true for xAI too (not assumed from that precedent).
 *    Response is a flat `{object: "list", data: [...]}` with no pagination
 *    fields documented (no `has_more`/cursor/`nextPageToken` — matches
 *    OpenAIClient's flat shape, unlike Anthropic's `after_id`/`has_more` or
 *    Google's `nextPageToken` paging). See listModels()'s docstring for a
 *    genuine asymmetry worth flagging: unlike the other three providers'
 *    model records (which carry no per-token pricing field), xAI's own
 *    `/v1/models` records DO carry live per-token pricing fields directly
 *    (`prompt_text_token_price`, `cached_prompt_text_token_price`,
 *    `completion_text_token_price`, etc., in USD-cents-per-100M-tokens
 *    units per xAI's docs) — this closes part of the pricing-table gap
 *    core/ModelResolver.js's module comment describes for direct-provider
 *    "cheapest" comparison, but building any cross-provider pickCheapest
 *    extension on top of it is explicitly out of scope for this PR (ADR-006
 *    non-goals) — flagged here for a future reader, not acted on.
 */
class XaiClient {
  /**
   * Creates a thin xAI Responses API client.
   * @param {object} options Client options.
   * @param {string|null} options.apiKey xAI API key.
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.XAI_API_KEY || null;
  }

  /**
   * Fetches the live list of models from xAI's own `/v1/models` endpoint.
   *
   * Requires authentication (confirmed from live docs, not assumed — see
   * class docstring) — there is no unauthenticated variant, so this throws
   * a clear error when no key is configured rather than silently returning
   * an empty list or fabricating a hardcoded model list (same reasoning
   * AnthropicClient#listModels()/OpenAIClient#listModels()/
   * GoogleClient#listModels() already document for the identical asymmetry
   * with OpenRouter).
   *
   * Nothing in this codebase calls listModels() today — ADR-006's non-goals
   * explicitly exclude ModelResolver/ModelBroker catalog-merging for this
   * PR — so this method exists only to satisfy the ProviderClient interface
   * shape for future use, not to feed any live catalog. Records are
   * returned as-is: unlike the other three clients' model records, xAI's DO
   * carry pricing fields natively (see class docstring) — this client does
   * not synthesize, rename, or normalize them into OpenRouter's
   * `pricing.prompt`/`pricing.completion` shape; callers that need
   * OpenRouter-catalog-shaped records must not use this method — none do
   * today.
   * @returns {Promise<object[]>} Raw model records from xAI's `/v1/models`.
   */
  async listModels() {
    if (!this.apiKey) {
      throw new Error(
        "XAI_API_KEY is not set. Unlike OpenRouter's /models, xAI's "
        + '/v1/models requires authentication — configure a key before listing models.'
      );
    }

    const response = await fetch(`${XAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`xAI /v1/models request failed: ${response.status}`);
    }
    const body = await response.json();
    return Array.isArray(body.data) ? body.data : [];
  }

  /**
   * Runs a chat completion against a specific Grok model via xAI's
   * Responses API (`POST /v1/responses` — see class docstring for why this
   * endpoint over Chat Completions).
   *
   * `messages` follows the same OpenAI-Chat-Completions-style shape
   * OpenRouterClient, AnthropicClient, OpenAIClient, and GoogleClient all
   * accept (including an optional leading `{role: 'system', ...}` entry).
   * Unlike AnthropicClient/OpenAIClient/GoogleClient — which each translate
   * a leading system message into a separate top-level field
   * (`system`/`instructions`/`systemInstruction`) — this client passes a
   * system-role message straight through as a leading item in xAI's `input`
   * array, unchanged, because that is the shape xAI's own worked example
   * documents (see class docstring for the specific deviation and why).
   *
   * @param {object} options Completion options.
   * @param {string} options.model xAI native model id (e.g. "grok-4.5") — already stripped of the "x-ai/" prefix by resolveClientForModel().
   * @param {Array<{role: string, content: string}>} options.messages Chat messages, OpenAI-style (system/user/assistant roles).
   * @param {number} [options.maxTokens] Optional max output tokens.
   * @returns {Promise<{text: string, usage: object}>} Response text and mapped usage.
   */
  async chatCompletion({ model, messages, maxTokens = 1024 }) {
    if (!this.apiKey) {
      throw new Error('XAI_API_KEY is not set. Run setup or add it to .env.');
    }

    const input = (messages || [])
      .filter(msg => msg && msg.role && msg.content != null)
      .map(msg => ({ role: msg.role, content: msg.content }));

    const requestBody = { model, input, max_output_tokens: maxTokens };

    const response = await fetch(`${XAI_BASE}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`xAI completion failed: ${response.status} ${errorBody}`);
    }
    const body = await response.json();

    // No `output_text` convenience field exists on the raw response (same
    // gap OpenAIClient already documents for OpenAI's structurally
    // equivalent Responses API shape) — walk the real `output` array: find
    // the assistant message item, then its output_text content part.
    const outputItems = Array.isArray(body.output) ? body.output : [];
    const messageItem = outputItems.find(item => item && item.type === 'message' && item.role === 'assistant');
    const textPart = messageItem && Array.isArray(messageItem.content)
      ? messageItem.content.find(part => part && part.type === 'output_text')
      : null;
    const text = textPart ? textPart.text : '';
    const rawUsage = body.usage || {};
    const inputDetails = rawUsage.input_tokens_details || {};
    const outputDetails = rawUsage.output_tokens_details || {};

    // Usage mapping — deliberate, not a guess (verified field names against
    // live xAI API reference and prompt-caching docs on 2026-07-28; see the
    // class docstring):
    //
    // - promptTokens <- usage.input_tokens directly. xAI's own prompt-
    //   caching documentation states total/long-context prompt-token
    //   accounting is computed "including cached tokens" and describes
    //   input_tokens as covering both cache-miss and cache-hit tokens —
    //   consistent across multiple independent doc pages checked, though
    //   this project could not find one single verbatim "input_tokens
    //   includes cached_tokens" sentence the way OpenAIClient's equivalent
    //   claim was pinned to one exact quote. Treated as reasonably confirmed
    //   (same direction as OpenAI's shape), not a default assumption from
    //   that precedent — flagged here at the same honesty level as
    //   GoogleClient's own least-certain mapping, one notch more confident
    //   than Google's because two independent doc pages agreed rather than
    //   zero.
    // - completionTokens <- usage.output_tokens directly.
    // - totalTokens <- usage.total_tokens directly — present on this
    //   response shape, no derivation needed (unlike Anthropic's usage
    //   object, which has none).
    // - cachedTokens / cacheReadTokens <- usage.input_tokens_details.
    //   cached_tokens: tokens actually SERVED FROM the cache this request.
    //   Reused for both fields, same considered-equivalence reasoning
    //   Anthropic/OpenAI/GoogleClient already apply for their own
    //   single-cache-read-figure shapes.
    // - cacheCreationTokens <- always null. xAI's caching is fully
    //   automatic (server-side, keyed by matching a prior request's
    //   starting messages) with no separate cache-write/cache-creation API
    //   call and no documented token-count field for "tokens written to
    //   cache" anywhere in xAI's usage object or prompt-caching guide —
    //   unlike OpenAI's cache_write_tokens (confirmed to exist on some
    //   models, uncertain on others) or Anthropic's
    //   cache_creation_input_tokens (a real, always-present field). Null is
    //   the honest answer here — there is no field to defensively read, not
    //   a placeholder for one this project couldn't find.
    const promptTokens = rawUsage.input_tokens ?? null;
    const completionTokens = rawUsage.output_tokens ?? null;
    const totalTokens = rawUsage.total_tokens ?? null;
    const cachedTokens = inputDetails.cached_tokens ?? null;
    // outputDetails.reasoning_tokens exists on this shape too (reasoning
    // models) but UsageTracker's generic usage shape has no reasoning-token
    // field to map it onto — same "not every provider field has a home"
    // situation AnthropicClient/OpenAIClient note for their own unused
    // granular fields. Left unread here deliberately, not an oversight.
    void outputDetails;

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cachedTokens,
        cacheCreationTokens: null,
        cacheReadTokens: cachedTokens,
      },
    };
  }
}

module.exports = XaiClient;
