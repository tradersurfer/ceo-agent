const test = require('node:test');
const assert = require('node:assert/strict');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const { registerExampleSkills } = require('../ceo-core/skills/exampleSkills');
const { createRuntime } = require('../ceo-core/runtimeFactory');
const { parseSkillInvocation, parseSkillArgs, dispatchSkillMessage } = require('../ceo-core/skillDispatch');

function buildRegistryAndExecutor() {
  const registry = new SkillRegistry();
  registerExampleSkills(registry);
  return { registry, executor: new SkillExecutor(registry) };
}

test('parseSkillInvocation recognizes /name syntax against a registered skill', () => {
  const { registry } = buildRegistryAndExecutor();
  const invocation = parseSkillInvocation('/format_currency {"amount": 42.5}', registry);
  assert.deepEqual(invocation, { skillName: 'format_currency', argsText: '{"amount": 42.5}' });
});

test('parseSkillInvocation recognizes @name syntax against a registered skill', () => {
  const { registry } = buildRegistryAndExecutor();
  const invocation = parseSkillInvocation('@format_currency {"amount": 42.5}', registry);
  assert.deepEqual(invocation, { skillName: 'format_currency', argsText: '{"amount": 42.5}' });
});

test('parseSkillInvocation returns null for a name that is not a registered skill (falls through)', () => {
  const { registry } = buildRegistryAndExecutor();
  assert.equal(parseSkillInvocation('@legal draft an NDA clause', registry), null);
  assert.equal(parseSkillInvocation('/does_not_exist {}', registry), null);
});

test('parseSkillInvocation returns null for plain chat text with no leading /or@', () => {
  const { registry } = buildRegistryAndExecutor();
  assert.equal(parseSkillInvocation('what is our runway', registry), null);
});

test('parseSkillInvocation is case-insensitive on the skill name and allows no argument text', () => {
  const { registry } = buildRegistryAndExecutor();
  assert.deepEqual(parseSkillInvocation('/FORMAT_CURRENCY', registry), { skillName: 'format_currency', argsText: '' });
});

test('parseSkillArgs returns {} for empty argument text', () => {
  const { registry } = buildRegistryAndExecutor();
  const skill = registry.get('format_currency');
  assert.deepEqual(parseSkillArgs('', skill), {});
});

test('parseSkillArgs throws a descriptive error for invalid JSON', () => {
  const { registry } = buildRegistryAndExecutor();
  const skill = registry.get('format_currency');
  assert.throws(() => parseSkillArgs('{not json', skill), /Could not parse arguments as JSON.*amount/);
});

test('parseSkillArgs throws for valid JSON that is not an object', () => {
  const { registry } = buildRegistryAndExecutor();
  const skill = registry.get('format_currency');
  assert.throws(() => parseSkillArgs('[1,2,3]', skill), /Could not parse arguments as JSON/);
  assert.throws(() => parseSkillArgs('"just a string"', skill), /Could not parse arguments as JSON/);
});

test('dispatchSkillMessage runs a matched skill end to end via /name', async () => {
  const { registry, executor } = buildRegistryAndExecutor();
  const dispatch = await dispatchSkillMessage('/format_currency {"amount": 42.5}', {
    skillRegistry: registry,
    skillExecutor: executor,
    agentId: 'ceo_agent',
  });
  assert.equal(dispatch.skillName, 'format_currency');
  assert.equal(dispatch.result.status, 'ok');
  assert.equal(dispatch.result.output.formatted, '$42.50');
});

test('dispatchSkillMessage runs a matched skill end to end via @name', async () => {
  const { registry, executor } = buildRegistryAndExecutor();
  const dispatch = await dispatchSkillMessage('@lookup_department {"departmentId": "legal"}', {
    skillRegistry: registry,
    skillExecutor: executor,
    agentId: 'ceo_agent',
  });
  assert.equal(dispatch.result.status, 'ok');
  assert.equal(dispatch.result.output.found, true);
});

test('dispatchSkillMessage returns null (falls through) for @department addressing that is not a skill', async () => {
  const { registry, executor } = buildRegistryAndExecutor();
  const dispatch = await dispatchSkillMessage('@legal draft an NDA clause', {
    skillRegistry: registry,
    skillExecutor: executor,
    agentId: 'ceo_agent',
  });
  assert.equal(dispatch, null);
});

test('dispatchSkillMessage returns null for a plain unaddressed chat message', async () => {
  const { registry, executor } = buildRegistryAndExecutor();
  const dispatch = await dispatchSkillMessage('what is our runway', {
    skillRegistry: registry,
    skillExecutor: executor,
    agentId: 'ceo_agent',
  });
  assert.equal(dispatch, null);
});

test('dispatchSkillMessage reports an args_parse_error without invoking the handler', async () => {
  const { registry, executor } = buildRegistryAndExecutor();
  const dispatch = await dispatchSkillMessage('/format_currency not-json', {
    skillRegistry: registry,
    skillExecutor: executor,
    agentId: 'ceo_agent',
  });
  assert.equal(dispatch.result.status, 'failed');
  assert.equal(dispatch.result.reason, 'args_parse_error');
  assert.match(dispatch.result.error, /amount/);
});

test('dispatchSkillMessage passes through SkillExecutor input-validation failures', async () => {
  const { registry, executor } = buildRegistryAndExecutor();
  const dispatch = await dispatchSkillMessage('/format_currency {}', {
    skillRegistry: registry,
    skillExecutor: executor,
    agentId: 'ceo_agent',
  });
  assert.equal(dispatch.result.status, 'failed');
  assert.equal(dispatch.result.reason, 'input_validation');
});

test('dispatchSkillMessage enforces real permission gating via a full runtime (cto_agent authorized, ceo_agent not)', async () => {
  const runtime = createRuntime({ activeDepartments: ['executive', 'technology'] });
  const diffText = 'diff --git a/foo.js b/foo.js\n--- a/foo.js\n+++ b/foo.js\n@@ -1,1 +1,1 @@\n-old\n+new\n';
  const argsText = JSON.stringify({ diffText, intent: 'test' });

  const authorized = await dispatchSkillMessage(`/scope_creep_detection ${argsText}`, {
    skillRegistry: runtime.skillRegistry,
    skillExecutor: runtime.skillExecutor,
    agentId: 'cto_agent',
  });
  assert.equal(authorized.result.status, 'ok');

  const denied = await dispatchSkillMessage(`/scope_creep_detection ${argsText}`, {
    skillRegistry: runtime.skillRegistry,
    skillExecutor: runtime.skillExecutor,
    agentId: 'ceo_agent',
  });
  assert.equal(denied.result.status, 'failed');
  assert.equal(denied.result.reason, 'permission_denied');
});
