// Real runtime enforcement of ADR-010's off_limits mechanism at both named
// chokepoints: SkillExecutor.run() and BaseBridge.validatePermissions().
// Proves a genuinely off-limits action is actually blocked, not merely
// declared in registry data -- and that a non-enforceable entry (Bucket A
// relational constraints, Bucket B category-only entries whose real
// violation depends on an unverifiable qualifier) does not falsely block
// otherwise-legitimate work.

process.env.CEO_AGENT_PROJECTS = 'test-project';
process.env.CEO_AGENT_APPROVERS = 'ceo_agent';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const BaseBridge = require('../sdk/BaseBridge');
const OnboardingCommsBridge = require('../departments-subagents/marketing/onboarding-comms/src/OnboardingCommsBridge');
const SalesIntakeBridge = require('../departments-subagents/marketing/sales-intake/src/SalesIntakeBridge');
const HermesBridge = require('../departments-subagents/operations/hermes/src/HermesBridge');

// -- SkillExecutor.run() -----------------------------------------------

function buildExecutorWithAgent(offLimits) {
  const registry = new SkillRegistry();
  registry.register('dangerous_skill', {
    capability: 'test',
    inputSchema: {},
    permissions: { requiresAgentAssignment: true },
    handler: async () => ({}),
  });
  const agent = { id: 'fixture_agent', skills: ['dangerous_skill'], offLimits };
  const executor = new SkillExecutor(registry, { agentResolver: id => (id === agent.id ? agent : null) });
  return { executor, agent };
}

test('SkillExecutor.run() hard-blocks a skill an enforceable off_limits entry restricts', async () => {
  const { executor, agent } = buildExecutorWithAgent([
    { id: 'move_money', label: 'Moving money', restricts: ['dangerous_skill'] },
  ]);
  const result = await executor.run('dangerous_skill', {}, 5000, { agentId: agent.id });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'off_limits_violation');
  assert.match(result.error, /Moving money/);
});

test('SkillExecutor.run() allows the same skill when no off_limits entry restricts it', async () => {
  const { executor, agent } = buildExecutorWithAgent([
    { id: 'move_money', label: 'Moving money', restricts: [] },
  ]);
  const result = await executor.run('dangerous_skill', {}, 5000, { agentId: agent.id });
  assert.equal(result.status, 'ok');
});

test('SkillExecutor.run() does not block on a matching but enforceable: false entry (Bucket A/B)', async () => {
  const { executor, agent } = buildExecutorWithAgent([
    { id: 'unsolicited_email', label: 'Sending unsolicited emails', restricts: ['dangerous_skill'], enforceable: false },
  ]);
  const result = await executor.run('dangerous_skill', {}, 5000, { agentId: agent.id });
  assert.equal(result.status, 'ok');
});

test('SkillExecutor.run() still checks permission_denied before off_limits', async () => {
  const registry = new SkillRegistry();
  registry.register('dangerous_skill', {
    capability: 'test',
    inputSchema: {},
    permissions: { requiresAgentAssignment: true },
    handler: async () => ({}),
  });
  const executor = new SkillExecutor(registry, { agentResolver: () => null });
  const result = await executor.run('dangerous_skill', {}, 5000, { agentId: 'unknown_agent' });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'permission_denied');
});

// -- BaseBridge.validatePermissions() ------------------------------------

function baseTask(overrides = {}) {
  return {
    agent: 'fixture_bridge',
    project: 'test-project',
    goal: 'do the thing',
    task: 'do the thing',
    approved_by: 'ceo_agent',
    type: 'restricted_type',
    ...overrides,
  };
}

test('BaseBridge.validateTask() hard-blocks a task type an enforceable off_limits entry restricts', () => {
  const bridge = new BaseBridge({
    id: 'fixture_bridge',
    allowedApprovers: ['ceo_agent'],
    allowedProjects: ['test-project'],
    allowedTaskTypes: ['restricted_type'],
    offLimits: [{ id: 'delete_source_files', label: 'Deleting source files', restricts: ['restricted_type'] }],
  });
  const result = bridge.validateTask(baseTask());
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => /off-limits/.test(error) && /Deleting source files/.test(error)));
});

test('BaseBridge.execute() returns BLOCKED for an off-limits task type, distinct from a plain permission failure', async () => {
  const bridge = new BaseBridge({
    id: 'fixture_bridge',
    allowedApprovers: ['ceo_agent'],
    allowedProjects: ['test-project'],
    allowedTaskTypes: ['restricted_type'],
    offLimits: [{ id: 'move_money', label: 'Moving money', restricts: ['restricted_type'] }],
  });
  const result = await bridge.execute(baseTask());
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.some(error => /Moving money/.test(error)));
});

test('BaseBridge.validateTask() allows the task type when off_limits does not restrict it', () => {
  const bridge = new BaseBridge({
    id: 'fixture_bridge',
    allowedApprovers: ['ceo_agent'],
    allowedProjects: ['test-project'],
    allowedTaskTypes: ['restricted_type'],
    offLimits: [{ id: 'move_money', label: 'Moving money', restricts: ['some_other_type'] }],
  });
  const result = bridge.validateTask(baseTask());
  assert.equal(result.valid, true);
});

// -- Real production bridges: off_limits data actually wired in ----------

test('OnboardingCommsBridge carries its registered off_limits, but does not block its own real email task types (Bucket B unenforced)', () => {
  const bridge = new OnboardingCommsBridge();
  const unsolicited = bridge.offLimits.find(entry => entry.id === 'unsolicited_email');
  assert.ok(unsolicited, 'expected unsolicited_email entry to be wired onto OnboardingCommsBridge');
  assert.equal(unsolicited.enforceable, false, 'must stay non-enforceable, or every real send would hard-block');
  const result = bridge.validateTask({
    agent: 'onboarding_comms_agent',
    project: 'test-project',
    goal: 'send welcome email',
    task: 'send welcome email',
    approved_by: 'ceo_agent',
    type: 'email_welcome',
  });
  assert.equal(result.valid, true);
});

test('SalesIntakeBridge and HermesBridge carry their registered off_limits ids matching registry/agent-registry.json', () => {
  const sales = new SalesIntakeBridge();
  assert.deepEqual(sales.offLimits.map(entry => entry.id).sort(), [
    'modify_client_records_outside_scope',
    'override_ceo_agent_routing',
    'unauthorized_email',
  ]);

  const hermes = new HermesBridge();
  assert.deepEqual(hermes.offLimits.map(entry => entry.id).sort(), [
    'approve_production_deployments',
    'change_credentials',
    'change_pricing',
    'delete_source_files',
    'legal_claims',
    'move_money',
    'override_ceo_agent',
  ]);
});
