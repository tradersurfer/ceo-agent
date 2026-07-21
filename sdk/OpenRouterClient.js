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
   * server-side to text-output models only via the output_modalities
   * query parameter. This is the authoritative filter — OpenRouter applies
   * it before returning results, so it doesn't depend on guessing the
   * shape of per-model metadata client-side.
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
   * @param {object} options Completion options.
   * @param {string} options.model OpenRouter model id (e.g. "anthropic/claude-sonnet-4.5").
   * @param {Array<{role: string, content: string}>} options.messages Chat messages.
   * @param {number} [options.maxTokens] Optional max output tokens.
   * @returns {Promise<string>} The model's text response.
   */
  async chatCompletion({ model, messages, maxTokens = 1024 }) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set. Run setup or add it to .env.');
    }
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenRouter completion failed: ${response.status} ${errorBody}`);
    }
    const body = await response.json();
    return body?.choices?.[0]?.message?.content || '';
  }
}

module.exports = OpenRouterClient;
