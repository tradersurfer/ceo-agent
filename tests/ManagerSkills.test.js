const test = require('node:test');
const assert = require('node:assert/strict');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../core/SkillRegistry');
const { SkillExecutor } = require('../core/SkillExecutor');
const { registerManagerSkills } = require('../core/skills/managerSkills');

function build() {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerManagerSkills(registry, { organization });
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  return { organization, registry, executor };
}

const asCeo = { agentId: 'ceo_agent' };

test('manager skills register through SkillRegistry with schemas and permission metadata', () => {
  const { registry } = build();
  const skills = registry.list();
  assert.equal(skills.length, 10);
  for (const skill of skills) {
    assert.ok(Object.keys(skill.inputSchema).length > 0, `${skill.name} input schema`);
    assert.ok(Object.keys(skill.outputSchema).length > 0, `${skill.name} output schema`);
    assert.equal(skill.permissions.requiresAgentAssignment, true, `${skill.name} permissions`);
  }
});

test('C-suite skill assignments are selective and subordinate agents receive none', () => {
  const { organization } = build();
  assert.equal(organization.findAgent('ceo_agent').skills.length, 10);
  assert.equal(organization.findAgent('cfo_agent').skills.includes('budget_token_allocation'), true);
  assert.equal(organization.findAgent('cfo_agent').skills.includes('workload_balancing'), false);
  assert.equal(organization.findAgent('hermes').skills.includes('workload_balancing'), true);
  assert.equal(organization.findAgent('clo_agent').skills.includes('quality_review'), true);
  assert.deepEqual(organization.findAgent('sales_intake_agent').skills, []);
});

test('task_decomposition returns ordered executable tasks', async () => {
  const { executor } = build();
  const result = await executor.run('task_decomposition', {
    objective: 'Launch the release',
    deliverables: ['Verify tests', 'Publish release'],
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.tasks.length, 2);
  assert.deepEqual(result.output.tasks[1].dependsOn, ['task_1']);
});

test('delegation_brief produces a concrete assignment contract', async () => {
  const { executor } = build();
  const result = await executor.run('delegation_brief', {
    task: 'Review launch metrics',
    assignee: 'CMO Agent',
    desiredOutcome: 'A verified launch report',
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.brief.assignee, 'CMO Agent');
  assert.match(result.output.brief.checkIn, /evidence/i);
});

test('priority_scoring ranks high-impact urgent work first', async () => {
  const { executor } = build();
  const result = await executor.run('priority_scoring', {
    items: [
      { id: 'low', impact: 1, urgency: 1, effort: 5 },
      { id: 'high', impact: 5, urgency: 5, effort: 2 },
    ],
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.rankedItems[0].id, 'high');
});

test('decision_memo preserves options, recommendation, rationale, and risks', async () => {
  const { executor } = build();
  const result = await executor.run('decision_memo', {
    decision: 'Select launch window',
    options: ['Monday', 'Friday'],
    recommendation: 'Monday',
    rationale: 'Provides a full support week.',
    risks: ['Final checks may slip.'],
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.memo.recommendation, 'Monday');
  assert.equal(result.output.memo.approvalRequired, true);
});

test('status_synthesis counts states and extracts blockers and actions', async () => {
  const { executor } = build();
  const result = await executor.run('status_synthesis', {
    updates: [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'blocked', blocker: 'Approval needed', nextAction: 'Escalate' },
    ],
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.summary.completed, 1);
  assert.equal(result.output.blockers.length, 1);
  assert.equal(result.output.nextActions.length, 1);
});

test('escalation_assessment identifies high-impact out-of-authority decisions', async () => {
  const { executor } = build();
  const result = await executor.run('escalation_assessment', {
    issue: 'Approve an irreversible external commitment',
    impact: 5,
    urgency: 4,
    reversible: false,
    withinAuthority: false,
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.assessment.escalate, true);
  assert.ok(result.output.assessment.reasons.length >= 3);
});

test('department_capability_lookup searches the live organization model', async () => {
  const { executor } = build();
  const result = await executor.run('department_capability_lookup', {
    query: 'financial',
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.ok(result.output.matches.some(match => match.id === 'cfo_agent'));
});

test('workload_balancing identifies overload and an available owner', async () => {
  const { executor } = build();
  const result = await executor.run('workload_balancing', {
    assignments: [
      { owner: 'Operations', workload: 12, capacity: 10 },
      { owner: 'Finance', workload: 4, capacity: 10 },
    ],
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.recommendations[0].from, 'Operations');
  assert.equal(result.output.recommendations[0].to, 'Finance');
});

test('quality_review returns a measurable score and explicit gaps', async () => {
  const { executor } = build();
  const result = await executor.run('quality_review', {
    artifact: 'Release plan',
    criteria: [
      { name: 'Tests passed', passed: true },
      { name: 'Rollback documented', passed: false, note: 'Missing rollback steps.' },
    ],
    passThreshold: 0.8,
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.review.score, 0.5);
  assert.equal(result.output.review.passed, false);
  assert.equal(result.output.review.gaps.length, 1);
});

test('budget_token_allocation allocates the full budget by priority and complexity', async () => {
  const { executor } = build();
  const result = await executor.run('budget_token_allocation', {
    totalTokens: 1000,
    workItems: [
      { id: 'analysis', priority: 5, complexity: 5, minimumTokens: 100 },
      { id: 'formatting', priority: 1, complexity: 1, minimumTokens: 50 },
    ],
  }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.totalAllocated, 1000);
  assert.equal(result.output.unusedTokens, 0);
  assert.ok(result.output.allocations[0].tokens > result.output.allocations[1].tokens);
});

test('input validation failure is returned and audited', async () => {
  const { executor } = build();
  const result = await executor.run('priority_scoring', {}, 5000, asCeo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /items is required/);
  assert.equal(executor.audit.list().at(-1).reason, 'input_validation');
});

test('an agent without an assigned skill is blocked by Permissions and audited', async () => {
  const { executor } = build();
  const result = await executor.run('workload_balancing', {
    assignments: [],
  }, 5000, { agentId: 'cfo_agent' });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /not authorized/);
  assert.equal(executor.audit.list().at(-1).reason, 'permission_denied');
});

test('successful manager execution writes an audit record', async () => {
  const { executor } = build();
  const result = await executor.run('priority_scoring', { items: [] }, 5000, asCeo);
  assert.equal(result.status, 'ok');
  assert.deepEqual(executor.audit.list().at(-1), {
    event: 'skill.execution.succeeded',
    skillName: 'priority_scoring',
    agentId: 'ceo_agent',
    status: 'ok',
    reason: null,
    timestamp: executor.audit.list().at(-1).timestamp,
  });
});

test('unregistered manager skill attempts fail and are audited', async () => {
  const { executor } = build();
  const result = await executor.run('missing_manager_skill', {}, 5000, asCeo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /No skill registered/);
  assert.equal(executor.audit.list().at(-1).skillName, 'missing_manager_skill');
});

test('timeout handling remains normalized and audited', async () => {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registry.register('slow_manager_skill', {
    capability: 'management_test',
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
  const result = await executor.run('slow_manager_skill', {}, 20, asCeo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /timed out/);
  assert.equal(executor.audit.list().at(-1).reason, 'timeout');
});
