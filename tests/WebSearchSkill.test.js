const test = require('node:test');
const assert = require('node:assert/strict');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const { registerWebSearchSkill } = require('../ceo-core/skills/webSearchSkill');
const { InMemoryAuditLog } = require('../ceo-core/WorkflowRuntime');
const { createRuntime } = require('../ceo-core/runtimeFactory');
const { dispatchSkillMessage } = require('../ceo-core/skillDispatch');

function fakeClient(searchImpl) {
  return { search: searchImpl };
}

// web_search requires agent assignment (permissions.requiresAgentAssignment),
// same as every other non-example skill — an executor with no agentResolver
// denies every call regardless of context.agentId (see SkillExecutor.js), so
// tests that aren't specifically about permission gating still need a real
// Organization + agentResolver + a valid agentId, same as
// tests/ScopeCreepSkill.test.js's build()/asCto pattern.
function build(searchImpl, options = {}) {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerWebSearchSkill(registry, { client: fakeClient(searchImpl), ...options });
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
    audit: options.audit,
  });
  return { organization, registry, executor };
}

const asCeo = { agentId: 'ceo_agent' };

test('web_search registers with schema and permission metadata matching the established pattern', () => {
  const { registry } = build(async () => ({ results: [], id: 'x' }));
  const skill = registry.get('web_search');
  assert.ok(skill);
  assert.equal(skill.capability, 'web_search');
  assert.match(skill.description, /Perplexity/);
  assert.equal(skill.disableModelInvocation, false);
  assert.equal(skill.permissions.requiresAgentAssignment, true);
  assert.deepEqual(Object.keys(skill.inputSchema), ['query', 'maxResults']);
  assert.deepEqual(Object.keys(skill.outputSchema), ['results', 'id']);
});

test('web_search runs a query through the injected client and returns its results', async () => {
  let capturedArgs = null;
  const { executor } = build(async args => {
    capturedArgs = args;
    return { results: [{ title: 'A', url: 'https://example.com', snippet: 'hi', date: null, lastUpdated: null }], id: 'req_1' };
  });

  const result = await executor.run('web_search', { query: 'ceo agent', maxResults: 5 }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.id, 'req_1');
  assert.equal(result.output.results.length, 1);
  assert.equal(capturedArgs.query, 'ceo agent');
  assert.equal(capturedArgs.maxResults, 5);
  // SkillExecutor's AbortSignal is forwarded through (see PerplexityClient's signal passthrough test for the full contract).
  assert.ok(capturedArgs.signal instanceof AbortSignal);
});

test('web_search input validation rejects a missing query without invoking the client', async () => {
  let called = false;
  const { executor } = build(async () => { called = true; return { results: [], id: 'x' }; });

  const result = await executor.run('web_search', {}, 5000, asCeo);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'input_validation');
  assert.equal(called, false);
});

test('web_search surfaces a client error (e.g. missing/invalid API key) as a handler_error, not a crash', async () => {
  const { executor } = build(async () => {
    throw new Error('PERPLEXITY_API_KEY is not set. Add it to .env to enable web search.');
  });

  const result = await executor.run('web_search', { query: 'ceo agent' }, 5000, asCeo);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'handler_error');
  assert.match(result.error, /PERPLEXITY_API_KEY is not set/);
});

// --- Abort-signal handling: same pattern as
// tests/SkillExecutor.test.js's "timeout handling returns failed for a slow
// handler that honors its signal" test — proves the skill's handler actually
// forwards SkillExecutor's AbortSignal into the client (see
// sdk/PerplexityClient.js#search's signal passthrough and
// docs/SKILLS.md's "Skills must honor their abort signal"), not just that a
// timeout eventually fires. ---------------------------------------------

test('web_search honors SkillExecutor\'s abort signal on a slow client call', async () => {
  // client.search() takes one options object (see sdk/PerplexityClient.js) —
  // {query, maxResults, signal} — not a separate (input, {signal}) pair.
  const { executor } = build(({ signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ results: [], id: 'too-slow' }), 200);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    });
  }));

  const result = await executor.run('web_search', { query: 'ceo agent' }, 20, asCeo);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'timeout');
});

// --- Permission gating, via a full runtime (same pattern as
// tests/SkillDispatch.test.js's "enforces real permission gating" test) ---

test('web_search is authorized for ceo_agent and cmo_agent, and denied for an agent without it', async () => {
  const runtime = createRuntime({ activeDepartments: ['executive', 'marketing', 'legal'] });
  // Swap in a fake client so this test makes no real network call, same as
  // every other test in this file — permission gating happens in
  // SkillExecutor before the handler ever runs, so this proves denial never
  // reaches the client at all.
  runtime.skillRegistry.register('web_search', {
    capability: 'web_search',
    description: 'test double',
    inputSchema: { query: { type: 'string', required: true }, maxResults: { type: 'number', required: false } },
    outputSchema: { results: { type: 'array', required: true }, id: { type: 'string', required: false } },
    permissions: { requiresAgentAssignment: true },
    handler: async () => ({ results: [], id: 'fake' }),
  });

  const ceo = await runtime.skillExecutor.run('web_search', { query: 'ceo agent' }, 5000, { agentId: 'ceo_agent' });
  assert.equal(ceo.status, 'ok');

  const cmo = await runtime.skillExecutor.run('web_search', { query: 'ceo agent' }, 5000, { agentId: 'cmo_agent' });
  assert.equal(cmo.status, 'ok');

  const clo = await runtime.skillExecutor.run('web_search', { query: 'ceo agent' }, 5000, { agentId: 'clo_agent' });
  assert.equal(clo.status, 'failed');
  assert.equal(clo.reason, 'permission_denied');
});

// --- End-to-end: the REAL webSearchSkill (as RegistryLoader.js registers
// it, PerplexityClient and all — not a fake registration override), reached
// through the same /name or @name chat-dispatch syntax bin/chat.js and
// app/api/chat/route.ts already use (Stream B1, #77). This PR touches no
// app/ or lib/ file and adds no new dependency, so CONTRIBUTING.md's
// browser boot-check trigger doesn't apply — this is the closest equivalent
// real check available: the full path from chat text to a real HTTP call,
// with only the network layer (global.fetch) stubbed. -----------------------

test('web_search is reachable via /name chat-dispatch syntax against a real runtime, with a real PerplexityClient', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.perplexity.ai/search');
    assert.equal(init.headers.Authorization, 'Bearer test-e2e-key');
    return { ok: true, json: async () => ({ results: [{ title: 'A', url: 'https://example.com', snippet: 'hi' }], id: 'req_e2e' }) };
  };
  const originalKey = process.env.PERPLEXITY_API_KEY;
  process.env.PERPLEXITY_API_KEY = 'test-e2e-key';

  try {
    const runtime = createRuntime({ activeDepartments: ['executive'] });
    const dispatch = await dispatchSkillMessage('/web_search {"query": "ceo agent"}', {
      skillRegistry: runtime.skillRegistry,
      skillExecutor: runtime.skillExecutor,
      agentId: 'ceo_agent',
    });
    assert.equal(dispatch.result.status, 'ok');
    assert.equal(dispatch.result.output.id, 'req_e2e');
    assert.equal(dispatch.result.output.results.length, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PERPLEXITY_API_KEY;
    else process.env.PERPLEXITY_API_KEY = originalKey;
  }
});

// --- Audit logging: same pattern as tests/SkillExecutor.test.js's
// "audit entries include tenantId..." test. ---------------------------------

test('web_search executions are captured in the audit log, success and failure alike', async () => {
  const audit = new InMemoryAuditLog();
  const { executor } = build(async ({ query }) => {
    if (query === 'trigger error') throw new Error('Perplexity search failed: 500 upstream error');
    return { results: [{ title: 'A', url: 'https://example.com', snippet: 'hi' }], id: 'req_audit' };
  }, { audit });

  await executor.run('web_search', { query: 'ceo agent' }, 5000, asCeo);
  await executor.run('web_search', { query: 'trigger error' }, 5000, asCeo);

  const [succeeded, failed] = audit.list();
  assert.equal(succeeded.event, 'skill.execution.succeeded');
  assert.equal(succeeded.skillName, 'web_search');
  assert.equal(succeeded.agentId, 'ceo_agent');
  assert.equal(succeeded.status, 'ok');

  assert.equal(failed.event, 'skill.execution.failed');
  assert.equal(failed.skillName, 'web_search');
  assert.equal(failed.reason, 'handler_error');
});
