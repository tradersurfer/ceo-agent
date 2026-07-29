const PERPLEXITY_BASE = 'https://api.perplexity.ai';

/**
 * Hand-rolled fetch()-based client for Perplexity's Search API — same
 * shape and no-new-dependency approach as sdk/AnthropicClient.js,
 * sdk/OpenAIClient.js, sdk/GoogleClient.js, and sdk/XaiClient.js, but for a
 * genuinely different concern: this is not an ADR-006 chat-completion
 * ProviderClient (no `listModels()`/`chatCompletion()`, not wired into
 * lib/providers.js or core/resolveClientForModel.js). It backs the
 * `web_search` skill (core/skills/webSearchSkill.js) instead — a direct
 * query -> ranked-results lookup, not a chat turn.
 *
 * Verified against Perplexity's live API docs (docs.perplexity.ai), not
 * assumed, on 2026-07-28:
 *  - Endpoint: `POST /search` (NOT `/chat/completions`, which is Perplexity's
 *    separate Sonar chat-completions-with-citations API — a prose answer
 *    with inline citations, a different shape entirely). `/search` returns
 *    a direct ranked-results array with no LLM step, which is why it was
 *    chosen for this skill: it's a real, dedicated search endpoint rather
 *    than a chat completion wrapped around a hidden search tool call (the
 *    only kind of "search" OpenAI's Responses API or Google's Gemini
 *    grounding-with-Google-Search tool expose today).
 *  - Auth: `Authorization: Bearer <key>` — same header shape as
 *    OpenRouterClient/OpenAIClient/XaiClient.
 *  - Request body: `query` (string, required) plus optional filters
 *    (`max_results`, `country`, `search_domain_filter`,
 *    `search_recency_filter`, etc.) — this client exposes the subset the
 *    skill's inputSchema declares, not the full filter surface, since
 *    nothing in this codebase needs the rest yet.
 *  - Response body: `{ results: [{title, url, snippet, date,
 *    last_updated}], id, server_time }` — no citations/prose to parse.
 */
class PerplexityClient {
  /**
   * Creates a thin Perplexity Search API client.
   * @param {object} options Client options.
   * @param {string|null} options.apiKey Perplexity API key.
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.PERPLEXITY_API_KEY || null;
  }

  /**
   * Runs a web search via Perplexity's Search API.
   * @param {object} options Search options.
   * @param {string} options.query Search query text.
   * @param {number} [options.maxResults] 1-20, defaults to Perplexity's own default (10).
   * @param {AbortSignal} [options.signal] Passed straight through to `fetch` — lets a caller
   *   (e.g. SkillExecutor's timeout) actually abort the in-flight request, not just stop waiting on it.
   * @returns {Promise<{results: Array<{title: string, url: string, snippet: string, date: string|null, lastUpdated: string|null}>, id: string}>}
   */
  async search({ query, maxResults, signal }) {
    if (!this.apiKey) {
      throw new Error('PERPLEXITY_API_KEY is not set. Add it to .env to enable web search.');
    }

    const requestBody = { query };
    if (maxResults != null) requestBody.max_results = maxResults;

    const response = await fetch(`${PERPLEXITY_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Perplexity search failed: ${response.status} ${errorBody}`);
    }
    const body = await response.json();
    const results = Array.isArray(body.results) ? body.results.map(result => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      date: result.date ?? null,
      lastUpdated: result.last_updated ?? null,
    })) : [];

    return { results, id: body.id };
  }
}

module.exports = PerplexityClient;
