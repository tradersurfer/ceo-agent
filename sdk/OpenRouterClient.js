const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

class OpenRouterClient {
  /**
   * Creates a thin OpenRouter API client. No API key is required to list
   * models; a key is required to run chat completions.
   * @param {object} options Client options.
   * @param {string|null} options.apiKey OpenRouter API key.
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENROUTER_API_KEY || null;
  }

  /**
   * Fetches the live list of models available on OpenRouter, filtered
   * server-side to text-output models only.
   * @returns {Promise<object[]>} Raw model records from OpenRouter.
   */
  async listModels() {
    const response = await fetch(`${OPENROUTER_BASE}/models?output_modalities=text`);
    if (!response.ok) {
      throw new Error(`OpenRouter /models request failed: ${response.status}`);
    }
    const body = await response.json();
    return Array.isArray(body.data) ? body.data : [];
  }

  /**
   * Runs a chat completion against a specific OpenRouter model.
   *
   * For Anthropic models, requests top-level automatic prompt caching
   * (documented OpenRouter behavior: a top-level `cache_control` field,
   * not nested inside a message). NOTE: real-world reports show this can
   * be inconsistent depending on request shape — this method does not
   * assume it worked. It returns whatever cache/usage stats OpenRouter's
   * response actually reports, so the caller can verify real behavior
   * rather than trust an unverified claim.
   *
   * @param {object} options Completion options.
   * @param {string} options.model OpenRouter model id (e.g. "anthropic/claude-sonnet-4.5").
   * @param {Array<{role: string, content: string}>} options.messages Chat messages.
   * @param {number} [options.maxTokens] Optional max output tokens.
   * @returns {Promise<{text: string, usage: object}>} Response text and reported usage.
   */
  async chatCompletion({ model, messages, maxTokens = 1024 }) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set. Run setup or add it to .env.');
    }

    const requestBody = { model, messages, max_tokens: maxTokens };
    if (typeof model === 'string' && model.startsWith('anthropic/')) {
      requestBody.cache_control = { type: 'ephemeral' };
    }

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenRouter completion failed: ${response.status} ${errorBody}`);
    }
    const body = await response.json();
    const text = body?.choices?.[0]?.message?.content || '';
    const rawUsage = body?.usage || {};
    const cacheDetails = rawUsage?.prompt_tokens_details || {};

    return {
      text,
      usage: {
        promptTokens: rawUsage.prompt_tokens ?? null,
        completionTokens: rawUsage.completion_tokens ?? null,
        totalTokens: rawUsage.total_tokens ?? null,
        cachedTokens: cacheDetails.cached_tokens ?? null,
        cacheCreationTokens: rawUsage.cache_creation_input_tokens ?? null,
        cacheReadTokens: rawUsage.cache_read_input_tokens ?? null,
      },
    };
  }
}

module.exports = OpenRouterClient;
