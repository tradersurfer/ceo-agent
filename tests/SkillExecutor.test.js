const { test } = require('node:test');
const assert = require('node:assert');
const { SkillRegistry } = require('../core/SkillRegistry');
const { SkillExecutor } = require('../core/SkillExecutor');
const { registerExampleSkills } = require('../core/skills/exampleSkills');
const { InMemoryAuditLog } = require('../core/WorkflowRuntime');

function buildExecutor() {
  const registry = new SkillRegistry();
  registerExampleSkills(registry);
  return new SkillExecutor(registry);
}

test('successful execution returns ok with output', async () => {
  const executor = buildExecutor();
  const result = await executor.run('format_currency', { amount: 42.5 });
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.output.formatted, '$42.50');
});

test('input validation failure returns failed without running the handler', async () => {
  const executor = buildExecutor();
  const result = await executor.run('summarize_text', {});
  assert.strictEqual(result.status, 'failed');
  assert.match(result.error, /text is required/);
});

test('unregistered skill name returns failed', async () => {
  const executor = buildExecutor();
  const result = await executor.run('does_not_exist', {});
  assert.strictEqual(result.status, 'failed');
  assert.match(result.error, /No skill registered/);
});

test('timeout handling returns failed for a slow handler that honors its signal', async () => {
  const registry = new SkillRegistry();
  registry.register('slow_skill', {
    capability: 'test',
    inputSchema: {},
    handler: (input, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }),
  });
  const executor = new SkillExecutor(registry);
  const result = await executor.run('slow_skill', {}, 20);
  assert.strictEqual(result.status, 'failed');
  assert.match(result.error, /timed out/);
});

test('summarize_text produces a preview and word count', async () => {
  const executor = buildExecutor();
  const result = await executor.run('summarize_text', { text: 'The quick brown fox jumps over the lazy dog.' });
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.output.wordCount, 9);
});

test('lookup_department reads from the real org chart, read-only', async () => {
  const executor = buildExecutor();
  const result = await executor.run('lookup_department', { departmentId: 'legal' });
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.output.found, true);
  assert.strictEqual(result.output.department.id, 'legal');
});

test('audit entries include tenantId when the caller supplies it, and omit it otherwise', async () => {
  const registry = new SkillRegistry();
  registerExampleSkills(registry);
  const audit = new InMemoryAuditLog();
  const executor = new SkillExecutor(registry, { audit });

  await executor.run('format_currency', { amount: 1 }, 5000, { agentId: 'cfo_agent', tenantId: 'tenant-a' });
  await executor.run('format_currency', { amount: 1 }, 5000, { agentId: 'cfo_agent' });

  const [withTenant, withoutTenant] = audit.list();
  assert.strictEqual(withTenant.tenantId, 'tenant-a');
  assert.strictEqual(withTenant.skillName, 'format_currency');
  assert.strictEqual(withTenant.event, 'skill.execution.succeeded');
  assert.strictEqual('tenantId' in withoutTenant, false);
});
