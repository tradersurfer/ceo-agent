const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Hand-rolled fetch()-based client for Anthropic's native Messages API
 * (BYNGE Phase 2, ADR-006's adapter pattern). Matches sdk/OpenRouterClient.js's
 * shape and hand-rolled-fetch approach — no @anthropic-ai/sdk dependency, so
 * no new license-check surface. Implements the ProviderClient interface
 * ADR-006 sketches: `listModels()` and `chatCompletion({model, messages,
 * maxTokens}) -> {text, usage}`.
 *
 * Verified against Anthropic's live API docs (platform.claude.com), not
 * assumed, on 2026-07-27:
 *  - Auth headers are `x-api-key: <key>` + `anthropic-version: 2023-06-01`
 *    — NOT `Authorization: Bearer <key>` (that header shape is reserved for
 *    OAuth tokens, e.g. from `ant auth print-credentials`, and additionally
 *    requires an `anthropic-beta: oauth-2025-04-20` header — irrelevant
 *    here since this client only ever uses a plain API key).
 *  - `usage` field names on a Messages API response: `input_tokens`,
 *    `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
 *    (plus a more granular `cache_creation.{ephemeral_5m_input_tokens,
 *    ephemeral_1h_input_tokens}` breakdown this client does not need).
 *    See the usage-mapping comment in chatCompletion() below for how these
 *    map onto UsageTracker's generic usage shape.
 *  - `GET /v1/models` is a real, current endpoint (unlike an assumed
 *    symmetry with OpenRouter) — but see listModels()'s docstring for the
 *    asymmetry that matters: unlike OpenRouter's key-free `/models`,
 *    Anthropic's endpoint requires the same `x-api-key` auth as a real
 *    completion call.
 */
class AnthropicClient {
  /**
   * Creates a thin Anthropic Messages API client.
   * @param {object} options Client options.
   * @param {string|null} options.apiKey Anthropic API key.
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || null;
  }

  /**
   * Fetches the live list of models from Anthropic's own `/v1/models`
   * endpoint.
   *
   * Asymmetry with OpenRouterClient#listModels() worth flagging plainly
   * (this was a real gap hit while building this, not silently resolved):
   * OpenRouter's `/models` needs no key at all — `resolveRoleModels()` can
   * run before any credential exists. Anthropic's `/v1/models` genuinely
   * requires the same `x-api-key` authentication as a real completion call
   * (confirmed from Anthropic's live docs, not assumed) — there is no
   * unauthenticated or cheaper variant. So this method throws a clear error
   * when no key is configured, rather than either (a) silently returning an
   * empty list, which would look like "Anthropic has no models" instead of
   * "no key configured", or (b) fabricating a hardcoded static model list
   * to paper over the asymmetry, which risks silently going stale (exactly
   * the failure mode the resolver docs elsewhere warn against for hardcoded
   * model slugs). Nothing in this codebase calls listModels() today —
   * ADR-006's non-goals explicitly exclude ModelResolver/ModelBroker
   * catalog-merging for this PR — so this method exists only to satisfy the
   * ProviderClient interface shape for future use, not to feed any live
   * catalog.
   *
   * Note also: Anthropic's model records carry no per-token pricing field
   * (unlike OpenRouter's `pricing.prompt`/`pricing.completion`), so the
   * returned records are NOT shaped like OpenRouter's — no `pricing`,
   * `context_length`, or `architecture` fields are synthesized. Callers
   * that need OpenRouter-catalog-shaped records must not use this method;
   * none do today.
   * @returns {Promise<object[]>} Raw ModelInfo records from Anthropic's `/v1/models`.
   */
  async listModels() {
    if (!this.apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Unlike OpenRouter's /models, Anthropic's "
        + '/v1/models requires authentication — configure a key before listing models.'
      );
    }

    const models = [];
    let afterId = null;
    do {
      const url = new URL(`${ANTHROPIC_BASE}/models`);
      url.searchParams.set('limit', '1000');
      if (afterId) url.searchParams.set('after_id', afterId);

      // eslint-disable-next-line no-await-in-loop -- pagination is inherently sequential
      const response = await fetch(url, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
      });
      if (!response.ok) {
        throw new Error(`Anthropic /v1/models request failed: ${response.status}`);
      }
      // eslint-disable-next-line no-await-in-loop
      const body = await response.json();
      if (Array.isArray(body.data)) models.push(...body.data);
      afterId = body.has_more ? body.last_id : null;
    } while (afterId);

    return models;
  }

  /**
   * Runs a chat completion against a specific Anthropic model via the
   * native Messages API (`POST /v1/messages`).
   *
   * `messages` follows the same OpenAI-style shape OpenRouterClient accepts
   * (including an optional leading `{role: 'system', ...}` entry) — both
   * real call sites (bin/chat.js, app/api/chat/route.ts) build one identical
   * messages array and hand it to whichever client resolveClientForModel()
   * picked, so this client must accept the same input shape even though
   * Anthropic's native API takes the system prompt as a separate top-level
   * `system` field, not a message with role "system". This method does that
   * translation; `messages` sent to Anthropic itself is left with only
   * `user`/`assistant` turns, matching Anthropic's alternating-role
   * contract.
   *
   * @param {object} options Completion options.
   * @param {string} options.model Anthropic native model id (e.g. "claude-opus-5") — already stripped of the "anthropic/" prefix by resolveClientForModel().
   * @param {Array<{role: string, content: string}>} options.messages Chat messages, OpenAI-style (system/user/assistant roles).
   * @param {number} [options.maxTokens] Optional max output tokens.
   * @returns {Promise<{text: string, usage: object}>} Response text and mapped usage.
   */
  async chatCompletion({ model, messages, maxTokens = 1024 }) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set. Run setup or add it to .env.');
    }

    const systemParts = [];
    const conversation = [];
    for (const msg of messages || []) {
      if (msg && msg.role === 'system') {
        if (msg.content) systemParts.push(msg.content);
      } else if (msg) {
        conversation.push({ role: msg.role, content: msg.content });
      }
    }

    const requestBody = { model, max_tokens: maxTokens, messages: conversation };
    if (systemParts.length > 0) {
      requestBody.system = systemParts.join('\n\n');
    }

    const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Anthropic completion failed: ${response.status} ${errorBody}`);
    }
    const body = await response.json();
    const textBlock = Array.isArray(body.content) ? body.content.find(block => block && block.type === 'text') : null;
    const text = textBlock ? textBlock.text : '';
    const rawUsage = body.usage || {};

    // Usage mapping — deliberate, not a guess (verified field names against
    // live Messages API docs on 2026-07-27; see the class docstring). This
    // is the same honest-about-uncertainty treatment
    // OpenRouterClient#chatCompletion's docstring already gives its own
    // cache-behavior claim, applied to a genuinely different API shape:
    //
    // - cacheCreationTokens <- usage.cache_creation_input_tokens: tokens
    //   WRITTEN to the cache this request (billed at the cache-write
    //   premium).
    // - cacheReadTokens <- usage.cache_read_input_tokens: tokens actually
    //   SERVED FROM the cache this request (billed at the cheap read rate).
    // - cachedTokens <- reuses cache_read_input_tokens. Anthropic's usage
    //   object has no field distinct from cache_read_input_tokens meaning
    //   "cached tokens actually used" — unlike OpenAI/OpenRouter's
    //   `prompt_tokens_details.cached_tokens`, which is what
    //   OpenRouterClient's own `cachedTokens` maps from. Read tokens ARE
    //   "tokens actually served from cache", the same concept
    //   cached_tokens names on the OpenAI shape, so reusing
    //   cache_read_input_tokens here is a considered equivalence, not an
    //   arbitrary duplicate field.
    // - promptTokens <- input_tokens + cache_creation_input_tokens +
    //   cache_read_input_tokens. Anthropic documents `input_tokens` as the
    //   UNCACHED remainder only ("Total prompt size = input_tokens +
    //   cache_creation_input_tokens + cache_read_input_tokens" — Anthropic's
    //   own prompt-caching docs) — unlike OpenAI/OpenRouter's
    //   `prompt_tokens`, which already includes any cached tokens. Reading
    //   bare input_tokens here would under-report prompt size relative to
    //   OpenRouterClient's promptTokens for an equivalent cached request,
    //   which would silently skew UsageTracker's per-token cost estimates
    //   and audit totals depending on which client happened to place a
    //   given call.
    // - totalTokens <- promptTokens + completionTokens. Anthropic's usage
    //   object has no total_tokens field to read directly (unlike OpenAI's).
    const cacheCreationTokens = rawUsage.cache_creation_input_tokens ?? null;
    const cacheReadTokens = rawUsage.cache_read_input_tokens ?? null;
    const inputTokens = rawUsage.input_tokens ?? null;
    const completionTokens = rawUsage.output_tokens ?? null;
    const promptTokens = inputTokens != null
      ? inputTokens + (cacheCreationTokens || 0) + (cacheReadTokens || 0)
      : null;
    const totalTokens = promptTokens != null && completionTokens != null
      ? promptTokens + completionTokens
      : null;

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cachedTokens: cacheReadTokens,
        cacheCreationTokens,
        cacheReadTokens,
      },
    };
  }
}

module.exports = AnthropicClient;
