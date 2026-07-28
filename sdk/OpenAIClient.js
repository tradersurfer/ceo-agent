const OPENAI_BASE = 'https://api.openai.com/v1';

/**
 * Hand-rolled fetch()-based client for OpenAI's native API (BYNGE Phase 2,
 * ADR-006's adapter pattern). Matches sdk/OpenRouterClient.js's and
 * sdk/AnthropicClient.js's shape and hand-rolled-fetch approach — no
 * `openai` npm dependency, so no new license-check surface. Implements the
 * ProviderClient interface ADR-006 sketches: `listModels()` and
 * `chatCompletion({model, messages, maxTokens}) -> {text, usage}`.
 *
 * Verified against OpenAI's live current API docs (developers.openai.com),
 * not assumed, on 2026-07-27:
 *
 *  - Endpoint choice: `POST /v1/responses`, NOT `/v1/chat/completions`.
 *    This is a real, deliberate decision, not a default/naive pick — OpenAI's
 *    own "Migrate to the Responses API" guide states explicitly: "While Chat
 *    Completions remains supported, Responses is recommended for all new
 *    projects" (not deprecated, but no longer the recommended default even
 *    for simple text-in/text-out use — the guide's own comparison table
 *    doesn't carve out an exception for simple/non-agentic use). Since this
 *    client is new code being written today, it targets the endpoint OpenAI
 *    currently recommends rather than the one that happens to look most like
 *    OpenRouterClient's shape. Chat Completions is not deprecated and this
 *    is a real, revisitable tradeoff if OpenAI's guidance changes — noted
 *    here so a future reader doesn't mistake this for an oversight.
 *  - Auth: `Authorization: Bearer <key>` — same header shape as
 *    OpenRouterClient (unlike AnthropicClient's `x-api-key` +
 *    `anthropic-version`). Confirmed for both `/v1/responses` and
 *    `/v1/models` — OpenAI uses one uniform auth scheme across its whole API
 *    surface, no per-endpoint variation the way Anthropic's OAuth-vs-API-key
 *    split has.
 *  - Request shape: `instructions` (top-level string) for the system/
 *    developer prompt — analogous to Anthropic's top-level `system` field,
 *    structurally different from Chat Completions' `{role: "system", ...}`
 *    message. `input` takes an array of `{role, content}` items (plain
 *    string `content` is valid per OpenAI's own multi-turn examples — the
 *    more verbose `{type: "input_text", text: ...}` content-part form is for
 *    richer/multimodal input this client doesn't need). `max_output_tokens`
 *    replaces Chat Completions' `max_tokens`.
 *  - Response shape: the raw JSON response has NO `output_text` field —
 *    that's a client-SDK-only convenience (`response.output_text` in
 *    OpenAI's official Python/Node SDKs) that does not exist on the wire.
 *    A hand-rolled client must walk the real `output` array: find the item
 *    with `type: "message"` and `role: "assistant"`, then within its
 *    `content` array find the item with `type: "output_text"` and read
 *    `.text`. Confirmed this the hard way (not guessed) since assuming an
 *    `output_text` field on the raw body would have silently produced
 *    `undefined` for every response.
 *  - `usage` field names: `input_tokens`, `input_tokens_details.
 *    cached_tokens`, `output_tokens`, `output_tokens_details.
 *    reasoning_tokens`, `total_tokens` — see the usage-mapping comment in
 *    chatCompletion() below for how these map onto UsageTracker's generic
 *    usage shape, and for what's confirmed vs. still uncertain.
 *  - `GET /v1/models` requires the same `Authorization: Bearer` auth as a
 *    real completion call — NOT key-free like OpenRouter's `/models`. Same
 *    asymmetry AnthropicClient already flagged for Anthropic, confirmed
 *    independently true for OpenAI too (not assumed from that precedent).
 *    Response is a flat `{object: "list", data: [...]}` with no pagination
 *    fields (`has_more`/cursor) — unlike Anthropic's `/v1/models`, which
 *    does paginate. Each record: `{id, object: "model", created, owned_by}`
 *    — no per-token pricing field, same gap AnthropicClient's listModels()
 *    already documents for Anthropic's own model records.
 */
class OpenAIClient {
  /**
   * Creates a thin OpenAI Responses API client.
   * @param {object} options Client options.
   * @param {string|null} options.apiKey OpenAI API key.
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || null;
  }

  /**
   * Fetches the live list of models from OpenAI's own `/v1/models` endpoint.
   *
   * Requires authentication (confirmed from live docs, not assumed —
   * see class docstring) — there is no unauthenticated variant, so this
   * throws a clear error when no key is configured rather than silently
   * returning an empty list or fabricating a hardcoded model list (same
   * reasoning AnthropicClient#listModels() already documents for the
   * identical asymmetry with OpenRouter).
   *
   * Nothing in this codebase calls listModels() today — ADR-006's non-goals
   * explicitly exclude ModelResolver/ModelBroker catalog-merging for this
   * PR — so this method exists only to satisfy the ProviderClient interface
   * shape for future use, not to feed any live catalog. No `pricing`,
   * `context_length`, or `architecture` fields are synthesized; callers that
   * need OpenRouter-catalog-shaped records must not use this method — none
   * do today.
   * @returns {Promise<object[]>} Raw model records from OpenAI's `/v1/models`.
   */
  async listModels() {
    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Unlike OpenRouter's /models, OpenAI's "
        + '/v1/models requires authentication — configure a key before listing models.'
      );
    }

    const response = await fetch(`${OPENAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`OpenAI /v1/models request failed: ${response.status}`);
    }
    const body = await response.json();
    return Array.isArray(body.data) ? body.data : [];
  }

  /**
   * Runs a chat completion against a specific OpenAI model via the
   * Responses API (`POST /v1/responses` — see class docstring for why this
   * endpoint over Chat Completions).
   *
   * `messages` follows the same OpenAI-Chat-Completions-style shape
   * OpenRouterClient and AnthropicClient both accept (including an optional
   * leading `{role: 'system', ...}` entry) — both real call sites
   * (bin/chat.js, app/api/chat/route.ts) build one identical messages array
   * and hand it to whichever client resolveClientForModel() picked, so this
   * client must accept the same input shape even though the Responses API's
   * own native shape takes the system/developer prompt as a separate
   * top-level `instructions` field, not a message with role "system". This
   * method does that translation, the same way AnthropicClient translates
   * into Anthropic's top-level `system` field; `input` sent to OpenAI is
   * left with only `user`/`assistant` turns.
   *
   * @param {object} options Completion options.
   * @param {string} options.model OpenAI native model id (e.g. "gpt-6") — already stripped of the "openai/" prefix by resolveClientForModel().
   * @param {Array<{role: string, content: string}>} options.messages Chat messages, OpenAI-style (system/user/assistant roles).
   * @param {number} [options.maxTokens] Optional max output tokens.
   * @returns {Promise<{text: string, usage: object}>} Response text and mapped usage.
   */
  async chatCompletion({ model, messages, maxTokens = 1024 }) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Run setup or add it to .env.');
    }

    const instructionsParts = [];
    const input = [];
    for (const msg of messages || []) {
      if (msg && msg.role === 'system') {
        if (msg.content) instructionsParts.push(msg.content);
      } else if (msg) {
        input.push({ role: msg.role, content: msg.content });
      }
    }

    const requestBody = { model, input, max_output_tokens: maxTokens };
    if (instructionsParts.length > 0) {
      requestBody.instructions = instructionsParts.join('\n\n');
    }

    const response = await fetch(`${OPENAI_BASE}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenAI completion failed: ${response.status} ${errorBody}`);
    }
    const body = await response.json();

    // No `output_text` field exists on the raw response (that's an
    // SDK-only convenience — see class docstring) — walk the real `output`
    // array: find the assistant message item, then its output_text content
    // part.
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
    // live Responses API docs/guides on 2026-07-27; see the class
    // docstring). Unlike AnthropicClient's mapping, this one did NOT need
    // the same non-trivial reconstruction — confirmed explicitly rather
    // than assumed, since ADR-006's own sketch warned not to assume either
    // provider's shape without checking:
    //
    // - promptTokens <- usage.input_tokens directly. OpenAI's own docs are
    //   explicit that this figure ALREADY INCLUDES cached tokens ("the
    //   prompt_tokens field includes cached tokens in its total" — true for
    //   the Chat Completions usage shape this project confirmed, and the
    //   Responses API's input_tokens is the same total-input concept under
    //   a renamed field). This is the OPPOSITE of Anthropic's
    //   `input_tokens`, which explicitly EXCLUDES cached tokens and requires
    //   summing three fields — so no addition is needed here, but the
    //   reason it isn't needed was checked, not assumed by default.
    // - completionTokens <- usage.output_tokens directly.
    // - totalTokens <- usage.total_tokens directly — present on this
    //   response shape (unlike Anthropic's usage object, which has no
    //   total_tokens field and requires deriving it).
    // - cachedTokens <- usage.input_tokens_details.cached_tokens: tokens
    //   actually SERVED FROM the cache this request (billed at the cheap
    //   read rate) — confirmed field location and meaning from OpenAI's
    //   prompt-caching guide and API reference.
    // - cacheReadTokens <- reuses cachedTokens. OpenAI's usage object has
    //   one field for "tokens read from cache," not two distinct concepts
    //   the way Anthropic's cache_read_input_tokens/cachedTokens split
    //   isn't actually a split at all for Anthropic either (see
    //   AnthropicClient's own comment) — here both UsageTracker fields
    //   genuinely mean the same underlying number, so reusing is a
    //   considered equivalence, not an arbitrary duplicate.
    // - cacheCreationTokens <- usage.input_tokens_details.cache_write_tokens,
    //   when present. FLAGGED AS LESS CERTAIN than the fields above: OpenAI's
    //   formal API reference schema for input_tokens_details (as fetched)
    //   lists only `cached_tokens` (plus `audio_tokens` on the
    //   Chat-Completions-shaped variant); a separate narrative prompt-caching
    //   guide states OpenAI reports cache writes via `cache_write_tokens`
    //   "on GPT-5.6+ models" specifically. Whether that field is present for
    //   every model this client might be pointed at, or only newer ones,
    //   was NOT independently confirmed against a live response in this
    //   environment (no live OpenAI key available here — see repo-level
    //   testing notes). Reading it defensively (?? null) means older models
    //   or models where the field is absent simply report
    //   cacheCreationTokens: null rather than throwing or silently
    //   miscounting.
    const promptTokens = rawUsage.input_tokens ?? null;
    const completionTokens = rawUsage.output_tokens ?? null;
    const totalTokens = rawUsage.total_tokens ?? null;
    const cachedTokens = inputDetails.cached_tokens ?? null;
    const cacheCreationTokens = inputDetails.cache_write_tokens ?? null;
    // outputDetails.reasoning_tokens exists on this shape too (reasoning
    // models) but UsageTracker's generic usage shape has no reasoning-token
    // field to map it onto — same "not every provider field has a home"
    // situation AnthropicClient notes for cache_creation's more granular
    // ephemeral_5m/1h breakdown it also doesn't need. Left unread here
    // deliberately, not an oversight.
    void outputDetails;

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cachedTokens,
        cacheCreationTokens,
        cacheReadTokens: cachedTokens,
      },
    };
  }
}

module.exports = OpenAIClient;
