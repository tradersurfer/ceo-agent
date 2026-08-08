/**
 * Web search skill, backed by Perplexity's Search API
 * (sdk/PerplexityClient.js). Real, callable, permission-gated per this
 * project's existing SkillRegistry/SkillExecutor pattern (Stream B1, #77) —
 * no second registry, no config-driven loader, registered the same way
 * every other skill in core/skills/ is.
 *
 * This is the first skill in this codebase to make a real outbound network
 * call, which docs/SKILLS.md's security boundary flags as requiring
 * explicit review before being added. That review, done for this PR:
 *  - Outbound HTTPS only, to Perplexity's single documented API host
 *    (https://api.perplexity.ai) — no arbitrary URL fetching, no
 *    caller-supplied endpoint.
 *  - No filesystem or shell access anywhere in this file.
 *  - Requires PERPLEXITY_API_KEY; the key is read from process.env only
 *    (never logged, never echoed back in the skill's output).
 *  - Bounded, typed input (`query` string, `maxResults` number) — no
 *    free-form code or command construction.
 *  - Every execution (success, validation failure, permission denial,
 *    handler error, timeout) is captured by SkillExecutor's existing audit
 *    log with no new code path, same as every other skill.
 * Marked `"risk": "review_required"` in registry/skill-registry.json to
 * record that this category of skill (real network I/O) needed and got
 * that review, rather than "safe" like the filesystem/CPU-only skills
 * around it.
 *
 * Permission-gated to ceo_agent and cmo_agent: ceo_agent for general
 * executive research, cmo_agent because real-time competitor/market/trend
 * research is a genuine, already-documented part of its mandate
 * ("marketing_strategy" capability — registry/agent-registry.json). No
 * other department head was given this skill; expanding to a specific
 * department head later should be justified the same way, not granted by
 * default because search is generically useful (the same discipline
 * CURATION_RATIONALE.md applied to scope_creep_detection's cto_agent-only
 * scoping).
 */

const PerplexityClient = require('../../sdk/PerplexityClient');

const WEB_SEARCH_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

/**
 * Registers the web_search skill onto a SkillRegistry.
 * @param {import('../SkillRegistry').SkillRegistry} registry
 * @param {object} [options]
 * @param {PerplexityClient} [options.client] Injectable client, for tests. Defaults to a real PerplexityClient reading PERPLEXITY_API_KEY from process.env.
 */
function registerWebSearchSkill(registry, options = {}) {
  const client = options.client || new PerplexityClient();

  registry.register('web_search', {
    capability: 'web_search',
    description: 'Searches the web via Perplexity\'s Search API and returns ranked results (title, url, snippet).',
    inputSchema: {
      query: { type: 'string', required: true },
      maxResults: { type: 'number', required: false },
    },
    outputSchema: {
      results: { type: 'array', required: true },
      id: { type: 'string', required: false },
    },
    permissions: WEB_SEARCH_PERMISSION,
    // Passes SkillExecutor's AbortSignal straight through to the client so a
    // timeout actually cancels the in-flight HTTP request (see
    // docs/SKILLS.md's "Skills must honor their abort signal" section) —
    // this skill's real network call is exactly the case that matters for.
    handler: async ({ query, maxResults }, { signal } = {}) => client.search({ query, maxResults, signal }),
  });

  return registry;
}

module.exports = { registerWebSearchSkill, WEB_SEARCH_PERMISSION };
