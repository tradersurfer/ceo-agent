const OPENCODE_BASE = 'https://opencode.ai/zen/v1';

/**
 * Hand-rolled fetch()-based client for OpenCode Zen (sdk/OpenCodeZenClient.js).
 * Matches sdk/OpenRouterClient.js's shape and hand-rolled-fetch approach — no
 * vendor SDK dependency, so no new license-check surface. Implements the same
 * ProviderClient interface the ADR-006 adapter pattern defines:
 * `listModels()` and `chatCompletion({model, messages, maxTokens}) -> {text, usage}`.
 *
 * Verified against Zen's live API on 2026-09-29, not assumed:
 *  - `GET /v1/models` is key-free and returns `{object: "list", data: [...]}`
 *    with bare `{id, object, created, owned_by}` records — no pricing, no
 *    context_length, no architecture block (unlike OpenRouter's records).
 *  - `POST /v1/chat/completions` succeeds with NO Authorization header at all
 *    for the free models (verified: a real 200 with usage + cost for
 *    `space-bunny-free`). A key is only needed to raise free-tier rate limits
 *    or reach paid Zen models.
 *  - The response carries a top-level `cost` field (a decimal string, "0" for
 *    free models) in ADDITION to the OpenAI-shaped `usage` object.
 *  - Some Zen models return `reasoning_content` alongside `content`, and
 *    `content` can come back EMPTY while all the output sits in
 *    `reasoning_content` — observed on a real `space-bunny-free` response
 *    truncated at max_tokens=10. chatCompletion() falls back to
 *    `reasoning_content` so a reasoning model that ran out of token budget
 *    mid-thought returns that text instead of an empty string.
 *
 * Model ids: Zen ids are BARE ("space-bunny-free", "nemotron-3-ultra-free")
 * with no vendor prefix, unlike every other provider this codebase dispatches
 * to. They are namespaced as `opencode/<zen-id>` at the catalog layer (see
 * ceo-core/FreeModelCatalog.js) so resolveClientForModel()'s existing
 * prefix-keyed dispatch seam stays the single decision point.
 */
class OpenCodeZenClient {
  /**
   * Creates a thin OpenCode Zen API client.
   * @param {object} options Client options.
   * @param {string|null} options.apiKey Optional Zen API key. Optional —
   *   free models work without one.
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENCODE_ZEN_API_KEY || null;
  }

  /**
   * Fetches the live model list from Zen. Key-free by design (verified), so
   * this works before any credential is configured — same property
   * OpenRouterClient#listModels() relies on.
   * @returns {Promise<object[]>} Raw model records.
   */
  async listModels() {
    const response = await fetch(`${OPENCODE_BASE}/models`);
    if (!response.ok) {
      throw new Error(`OpenCode Zen /models request failed: ${response.status}`);
    }
    const body = await response.json();
    return Array.isArray(body.data) ? body.data : [];
  }

  /**
   * Runs a chat completion against a specific Zen model.
   *
   * Accepts the same OpenAI-style `messages` shape every other client in this
   * codebase accepts (including a leading `{role: 'system'}` entry) so the
   * dispatch seam can hand it the identical array the other providers get.
   *
   * @param {object} options Completion options.
   * @param {string} options.model Bare Zen model id (e.g. "space-bunny-free") — already stripped of the "opencode/" namespace by resolveClientForModel().
   * @param {Array<{role: string, content: string}>} options.messages Chat messages.
   * @param {number} [options.maxTokens] Optional max output tokens.
   * @returns {Promise<{text: string, usage: object}>} Response text and mapped usage.
   */
  async chatCompletion({ model, messages, maxTokens = 1024 }) {
    const requestBody = { model, messages, max_tokens: maxTokens };
    const headers = { 'Content-Type': 'application/json' };
    // Only sent when configured: a keyless request is valid for free models
    // (verified live), and sending an empty "Bearer " header would be worse
    // than sending none.
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const response = await fetch(`${OPENCODE_BASE}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenCode Zen completion failed: ${response.status} ${errorBody}`);
    }
    const body = await response.json();
    const message = body?.choices?.[0]?.message || {};
    // Fall back to reasoning_content: Zen routes reasoning models' output
    // there, and `content` is genuinely empty when the model spends its whole
    // budget thinking. Returning '' there would look like a silent failure.
    const text = message.content || message.reasoning_content || '';
    const rawUsage = body?.usage || {};
    const cacheDetails = rawUsage?.prompt_tokens_details || {};

    // `cost` is a Zen-specific top-level field that OpenRouter does not send.
    // Parsed defensively: it may be absent, null, or a decimal string.
    const cost = parseFloat(body?.cost);
    return {
      text,
      usage: {
        promptTokens: rawUsage.prompt_tokens ?? null,
        completionTokens: rawUsage.completion_tokens ?? null,
        totalTokens: rawUsage.total_tokens ?? null,
        cachedTokens: cacheDetails.cached_tokens ?? null,
        cacheCreationTokens: null,
        cacheReadTokens: null,
      },
      costUsd: Number.isFinite(cost) ? cost : null,
    };
  }
}

module.exports = OpenCodeZenClient;
