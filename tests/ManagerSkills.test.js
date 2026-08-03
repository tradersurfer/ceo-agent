const test = require('node:test');
const assert = require('node:assert/strict');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../core/SkillRegistry');
const { SkillExecutor } = require('../core/SkillExecutor');
const { registerManagerSkills } = require('../core/skills/managerSkills');
const { CEO_MODES } = require('../core/ceoModes');

function build(options = {}) {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerManagerSkills(registry, { organization, ceoMode: options.ceoMode });
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
  // 10 manager skills + web_search (core/skills/webSearchSkill.js).
  assert.equal(organization.findAgent('ceo_agent').skills.length, 11);
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

// CEO Modes (Stream B2, core/ceoModes.js): prove the configured mode
// actually changes escalation_assessment/quality_review's real decision,
// not just that a mode object exists somewhere unused.

test('escalation_assessment: identical input escalates under Conservative but not the Aggressive default', async () => {
  // impact=3, urgency=3, reversible=true, withinAuthority=true -> score 6.
  // Conservative's threshold (5) crosses it; Aggressive's (7) does not.
  const input = { issue: 'Mid-size vendor commitment', impact: 3, urgency: 3, reversible: true, withinAuthority: true };

  const conservative = await build({ ceoMode: CEO_MODES.conservative }).executor.run('escalation_assessment', input, 5000, asCeo);
  assert.equal(conservative.output.assessment.score, 6);
  assert.equal(conservative.output.assessment.threshold, 5);
  assert.equal(conservative.output.assessment.escalate, true);

  const aggressive = await build({ ceoMode: CEO_MODES.aggressive }).executor.run('escalation_assessment', input, 5000, asCeo);
  assert.equal(aggressive.output.assessment.score, 6);
  assert.equal(aggressive.output.assessment.threshold, 7);
  assert.equal(aggressive.output.assessment.escalate, false);
});

test('escalation_assessment: identical input escalates under Aggressive but not Musk Mode', async () => {
  // impact=4, urgency=4, reversible=true, withinAuthority=true -> score 8.
  // Aggressive's threshold (7) crosses it; Musk Mode's (10) does not.
  const input = { issue: 'Larger commitment', impact: 4, urgency: 4, reversible: true, withinAuthority: true };

  const aggressive = await build({ ceoMode: CEO_MODES.aggressive }).executor.run('escalation_assessment', input, 5000, asCeo);
  assert.equal(aggressive.output.assessment.score, 8);
  assert.equal(aggressive.output.assessment.escalate, true);

  const musk = await build({ ceoMode: CEO_MODES.musk_mode }).executor.run('escalation_assessment', input, 5000, asCeo);
  assert.equal(musk.output.assessment.score, 8);
  assert.equal(musk.output.assessment.threshold, 10);
  assert.equal(musk.output.assessment.escalate, false);
});

test('escalation_assessment: an explicit threshold in the call always overrides the configured mode', async () => {
  const { executor } = build({ ceoMode: CEO_MODES.musk_mode });
  const result = await executor.run('escalation_assessment', {
    issue: 'Trivial decision, but caller demands escalation',
    impact: 1, urgency: 1, reversible: true, withinAuthority: true,
    threshold: 1,
  }, 5000, asCeo);
  assert.equal(result.output.assessment.score, 2);
  assert.equal(result.output.assessment.threshold, 1);
  assert.equal(result.output.assessment.escalate, true);
});

test('quality_review: identical criteria pass under Musk Mode but fail under the Aggressive default', async () => {
  // 3 of 4 criteria passed -> score 0.75. Musk Mode's bar (0.6) is cleared;
  // Aggressive's (0.8) and Conservative's (0.9) are not.
  const criteria = [
    { name: 'Tests passed', passed: true },
    { name: 'Docs updated', passed: true },
    { name: 'Security review', passed: true },
    { name: 'Rollback documented', passed: false, note: 'Missing rollback steps.' },
  ];

  const musk = await build({ ceoMode: CEO_MODES.musk_mode }).executor.run('quality_review', { artifact: 'Release plan', criteria }, 5000, asCeo);
  assert.equal(musk.output.review.score, 0.75);
  assert.equal(musk.output.review.passThreshold, 0.6);
  assert.equal(musk.output.review.passed, true);

  const aggressive = await build({ ceoMode: CEO_MODES.aggressive }).executor.run('quality_review', { artifact: 'Release plan', criteria }, 5000, asCeo);
  assert.equal(aggressive.output.review.score, 0.75);
  assert.equal(aggressive.output.review.passThreshold, 0.8);
  assert.equal(aggressive.output.review.passed, false);
});

test('quality_review: identical criteria pass under Aggressive but fail under Conservative', async () => {
  // 4 of 5 criteria passed -> score 0.8. Aggressive's bar (0.8) is cleared;
  // Conservative's (0.9) is not.
  const criteria = [
    { name: 'a', passed: true }, { name: 'b', passed: true }, { name: 'c', passed: true },
    { name: 'd', passed: true }, { name: 'e', passed: false, note: 'Not done.' },
  ];

  const aggressive = await build({ ceoMode: CEO_MODES.aggressive }).executor.run('quality_review', { artifact: 'Report', criteria }, 5000, asCeo);
  assert.equal(aggressive.output.review.score, 0.8);
  assert.equal(aggressive.output.review.passed, true);

  const conservative = await build({ ceoMode: CEO_MODES.conservative }).executor.run('quality_review', { artifact: 'Report', criteria }, 5000, asCeo);
  assert.equal(conservative.output.review.score, 0.8);
  assert.equal(conservative.output.review.passThreshold, 0.9);
  assert.equal(conservative.output.review.passed, false);
});

test('quality_review: an explicit passThreshold in the call always overrides the configured mode', async () => {
  const { executor } = build({ ceoMode: CEO_MODES.conservative });
  const result = await executor.run('quality_review', {
    artifact: 'Draft',
    criteria: [{ name: 'x', passed: true }],
    passThreshold: 0.1,
  }, 5000, asCeo);
  assert.equal(result.output.review.score, 1);
  assert.equal(result.output.review.passThreshold, 0.1);
  assert.equal(result.output.review.passed, true);
});

test('with no ceoMode configured, thresholds match the pre-CEO-modes hardcoded defaults', async () => {
  const { executor } = build();
  const escalation = await executor.run('escalation_assessment', {
    issue: 'Baseline behavior check', impact: 3, urgency: 3, reversible: true, withinAuthority: true,
  }, 5000, asCeo);
  assert.equal(escalation.output.assessment.threshold, 7);

  const review = await executor.run('quality_review', {
    artifact: 'Baseline', criteria: [{ name: 'a', passed: true }, { name: 'b', passed: false }],
  }, 5000, asCeo);
  assert.equal(review.output.review.passThreshold, 0.8);
});
