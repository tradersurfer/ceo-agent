const test = require('node:test');
const assert = require('node:assert/strict');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const { registerScopeCreepSkill } = require('../ceo-core/skills/scopeCreepSkill');

function build() {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerScopeCreepSkill(registry);
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  return { organization, registry, executor };
}

const asCto = { agentId: 'cto_agent' };

const IN_SCOPE_AND_NEW_DEP_DIFF = [
  'diff --git a/core/parser.js b/core/parser.js',
  'index 1111111..2222222 100644',
  '--- a/core/parser.js',
  '+++ b/core/parser.js',
  '@@ -10,3 +10,3 @@ function parseToken(token) {',
  ' function parseToken(token) {',
  '-  return token.trim();',
  '+  return token ? token.trim() : null;',
  ' }',
  'diff --git a/package.json b/package.json',
  'index 3333333..4444444 100644',
  '--- a/package.json',
  '+++ b/package.json',
  '@@ -4,6 +4,7 @@',
  '   "dependencies": {',
  '     "@supabase/supabase-js": "^2.45.0",',
  '     "next": "^15.0.0",',
  '+    "left-pad": "^1.3.0",',
  '     "react": "^18.3.0",',
  '     "react-dom": "^18.3.0"',
  '   },',
].join('\n');

const OVERSIZED_HUNK_DIFF = [
  'diff --git a/core/big.js b/core/big.js',
  'index 1111111..2222222 100644',
  '--- a/core/big.js',
  '+++ b/core/big.js',
  '@@ -1,2 +1,4 @@',
  '-old line 1',
  '-old line 2',
  '+new line 1',
  '+new line 2',
  '+new line 3',
  '+new line 4',
].join('\n');

const FORMATTING_ONLY_DIFF = [
  'diff --git a/core/format.js b/core/format.js',
  'index 1111111..2222222 100644',
  '--- a/core/format.js',
  '+++ b/core/format.js',
  '@@ -1,2 +1,2 @@',
  '-function foo(){return 1;}',
  '-function bar(){return 2;}',
  '+function foo() { return 1; }',
  '+function bar() { return 2; }',
].join('\n');

const API_RENAME_DIFF = [
  'diff --git a/core/utils.js b/core/utils.js',
  'index 1111111..2222222 100644',
  '--- a/core/utils.js',
  '+++ b/core/utils.js',
  '@@ -1,3 +1,3 @@',
  ' const x = 1;',
  '-function computeTotal(items) {',
  '+function calculateTotal(items) {',
  '   return items.length;',
  ' }',
].join('\n');

test('scope_creep_detection registers through SkillRegistry with schemas and permission metadata', () => {
  const { registry } = build();
  const skill = registry.get('scope_creep_detection');
  assert.ok(skill);
  assert.equal(skill.capability, 'code_review_scope_analysis');
  assert.ok(Object.keys(skill.inputSchema).length > 0);
  assert.ok(Object.keys(skill.outputSchema).length > 0);
  assert.equal(skill.permissions.requiresAgentAssignment, true);
});

test('CTO Agent is assigned scope_creep_detection; other department heads are not', () => {
  const { organization } = build();
  assert.equal(organization.findAgent('cto_agent').skills.includes('scope_creep_detection'), true);
  assert.equal(organization.findAgent('cfo_agent').skills.includes('scope_creep_detection'), false);
  assert.equal(organization.findAgent('clo_agent').skills.includes('scope_creep_detection'), false);
});

test('classifies an unrelated dependency bump as likely creep and a related fix as in scope', async () => {
  const { executor } = build();
  const result = await executor.run('scope_creep_detection', {
    diffText: IN_SCOPE_AND_NEW_DEP_DIFF,
    intent: 'fix null dereference in parser',
  }, 5000, asCto);

  assert.equal(result.status, 'ok');
  assert.equal(result.output.inScope.length, 1);
  assert.equal(result.output.inScope[0].path, 'core/parser.js');

  assert.equal(result.output.likelyCreep.length, 1);
  const creep = result.output.likelyCreep[0];
  assert.equal(creep.path, 'package.json');
  assert.ok(creep.signals.includes('new_dependency'));

  assert.equal(result.output.newDependencies.length, 1);
  assert.equal(result.output.newDependencies[0].name, 'left-pad');
  assert.equal(result.output.newDependencies[0].path, 'package.json');

  assert.equal(result.output.stats.filesTouched, 2);
});

test('flags a hunk whose churn exceeds the configured threshold', async () => {
  const { executor } = build();
  const result = await executor.run('scope_creep_detection', {
    diffText: OVERSIZED_HUNK_DIFF,
    intent: 'unrelated cleanup',
    hunkThreshold: 5,
  }, 5000, asCto);

  assert.equal(result.status, 'ok');
  assert.equal(result.output.stats.oversizedHunks.length, 1);
  assert.equal(result.output.stats.oversizedHunks[0].path, 'core/big.js');
  assert.equal(result.output.stats.oversizedHunks[0].churn, 6);
});

test('detects a formatting-only file where added and removed lines are whitespace-equivalent', async () => {
  const { executor } = build();
  const result = await executor.run('scope_creep_detection', {
    diffText: FORMATTING_ONLY_DIFF,
    intent: 'unrelated cleanup',
  }, 5000, asCto);

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.output.stats.formattingOnlyFiles, ['core/format.js']);
});

test('pairs a removed and added declaration in the same hunk as a public API rename', async () => {
  const { executor } = build();
  const result = await executor.run('scope_creep_detection', {
    diffText: API_RENAME_DIFF,
    intent: 'unrelated cleanup',
  }, 5000, asCto);

  assert.equal(result.status, 'ok');
  assert.equal(result.output.apiRenames.length, 1);
  assert.equal(result.output.apiRenames[0].from, 'computeTotal');
  assert.equal(result.output.apiRenames[0].to, 'calculateTotal');
  assert.equal(result.output.apiRenames[0].kind, 'function');
});

test('input validation failure returns failed without running the handler, and is audited', async () => {
  const { executor } = build();
  const result = await executor.run('scope_creep_detection', { diffText: IN_SCOPE_AND_NEW_DEP_DIFF }, 5000, asCto);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /intent is required/);
  assert.equal(executor.audit.list().at(-1).reason, 'input_validation');
});

test('an invalid hunkThreshold is rejected by the handler', async () => {
  const { executor } = build();
  const result = await executor.run('scope_creep_detection', {
    diffText: IN_SCOPE_AND_NEW_DEP_DIFF,
    intent: 'fix null dereference in parser',
    hunkThreshold: 0,
  }, 5000, asCto);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /hunkThreshold must be/);
});

test('an agent without the assigned skill is blocked by Permissions and audited', async () => {
  const { executor } = build();
  const result = await executor.run('scope_creep_detection', {
    diffText: IN_SCOPE_AND_NEW_DEP_DIFF,
    intent: 'fix null dereference in parser',
  }, 5000, { agentId: 'cfo_agent' });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /not authorized/);
  assert.equal(executor.audit.list().at(-1).reason, 'permission_denied');
});

test('unregistered skill name returns failed and is audited', async () => {
  const { executor } = build();
  const result = await executor.run('does_not_exist', {}, 5000, asCto);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /No skill registered/);
  assert.equal(executor.audit.list().at(-1).skillName, 'does_not_exist');
});

test('successful execution writes an audit record', async () => {
  const { executor } = build();
  const result = await executor.run('scope_creep_detection', {
    diffText: IN_SCOPE_AND_NEW_DEP_DIFF,
    intent: 'fix null dereference in parser',
  }, 5000, asCto);
  assert.equal(result.status, 'ok');
  assert.deepEqual(executor.audit.list().at(-1), {
    event: 'skill.execution.succeeded',
    skillName: 'scope_creep_detection',
    agentId: 'cto_agent',
    status: 'ok',
    reason: null,
    timestamp: executor.audit.list().at(-1).timestamp,
  });
});

test('timeout handling is normalized and audited for a slow handler that honors its signal', async () => {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registry.register('slow_scope_creep_skill', {
    capability: 'test',
    inputSchema: {},
    outputSchema: {},
    handler: (input, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  const result = await executor.run('slow_scope_creep_skill', {}, 20, asCto);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /timed out/);
  assert.equal(executor.audit.list().at(-1).reason, 'timeout');
});
