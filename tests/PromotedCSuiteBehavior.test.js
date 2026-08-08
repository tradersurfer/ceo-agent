/**
 * Pairwise behavioral tests for promoted C-suite skills.
 * Asserts meaningfully different output for two structurally different inputs.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

class SkillRegistry {
  constructor() { this.skills = new Map(); }
  register(name, def) { this.skills.set(name, { name, ...def }); }
  get(name) { return this.skills.get(name) || null; }
  list() { return [...this.skills.values()]; }
}

const skillsDir = path.join(__dirname, '..', 'ceo-core', 'skills');
const { registerCeoSkills } = require(path.join(skillsDir, 'ceoSkills.js'));
const { registerCooSkills } = require(path.join(skillsDir, 'cooSkills.js'));
const { registerCtoSkills } = require(path.join(skillsDir, 'ctoSkills.js'));
const { registerCmoSkills } = require(path.join(skillsDir, 'cmoSkills.js'));

function buildRegistry() {
  const reg = new SkillRegistry();
  registerCeoSkills(reg);
  registerCooSkills(reg);
  registerCtoSkills(reg);
  registerCmoSkills(reg);
  return reg;
}

test('payment_webhook_event_classify: success vs failure event shapes differ', async () => {
  const reg = buildRegistry();
  const skill = reg.get('payment_webhook_event_classify');
  assert.ok(skill, 'renamed skill must be registered');
  assert.equal(reg.get('payment_gateway_sync'), null, 'old payment_gateway_sync name must not remain');

  const ok = await skill.handler({
    webhookEvent: { type: 'payment_intent.succeeded', data: { object: { status: 'succeeded', customer: 'cus_1', amount: 5000 } } },
  });
  const fail = await skill.handler({
    webhookEvent: { type: 'payment_intent.payment_failed', data: { object: { status: 'failed' } } },
  });

  assert.equal(ok.transactionStatus, 'succeeded');
  assert.equal(fail.transactionStatus, 'failed');
  assert.ok(ok.actions.some(a => a.type === 'grant_access'));
  assert.ok(fail.actions.some(a => a.type === 'flag_revenue_risk'));
  assert.notDeepEqual(ok.actions.map(a => a.type), fail.actions.map(a => a.type));
});

test('subsidiary_health_check: healthy vs critical metrics produce different scores and flags', async () => {
  const skill = buildRegistry().get('subsidiary_health_check');
  const healthy = await skill.handler({
    subsidiaryIds: ['s1'],
    metrics: [{ subsidiaryId: 's1', revenue: 100, cost: 40, nps: 40, cashRunwayDays: 180 }],
  });
  const critical = await skill.handler({
    subsidiaryIds: ['s1'],
    metrics: [{ subsidiaryId: 's1', revenue: 100, cost: 140, nps: -10, cashRunwayDays: 15 }],
  });
  assert.equal(healthy.healthReport.subsidiaries[0].status, 'healthy');
  assert.equal(critical.healthReport.subsidiaries[0].status, 'critical');
  assert.ok(healthy.healthReport.subsidiaries[0].score > critical.healthReport.subsidiaries[0].score);
  assert.ok(critical.flags.length > healthy.flags.length);
  assert.ok(critical.flags.some(f => f.code === 'negative_margin'));
});

test('multi_agent_consensus_evaluation: strong controls approve; weak controls reject', async () => {
  const skill = buildRegistry().get('multi_agent_consensus_evaluation');
  const strong = await skill.handler({
    frameworkId: 'fw-strong',
    consensusLogic: {
      minAgents: 3, agreementThreshold: 0.8, humanVeto: true, killSwitch: true,
      maxPositionPct: 5, models: ['a', 'b'],
    },
  });
  const weak = await skill.handler({
    frameworkId: 'fw-weak',
    consensusLogic: { minAgents: 1 },
  });
  assert.equal(strong.recommendation, 'approve');
  assert.equal(weak.recommendation, 'reject');
  assert.ok(weak.evaluation.riskScore > strong.evaluation.riskScore);
  assert.ok(weak.evaluation.findings.some(f => f.code === 'weak_quorum'));
});

test('webhook_payload_parsing: payment payload routes to finance; lead payload to marketing', async () => {
  const skill = buildRegistry().get('webhook_payload_parsing');
  const pay = await skill.handler({ payload: { type: 'invoice.paid', amount: 1200 }, source: 'stripe' });
  const lead = await skill.handler({ payload: { type: 'lead.created', email: 'a@b.com' }, source: 'crm' });
  assert.equal(pay.routedTo, 'finance');
  assert.equal(lead.routedTo, 'marketing');
  assert.equal(pay.parsed.eventType, 'invoice.paid');
  assert.equal(lead.parsed.eventType, 'lead.created');
});

test('open_source_dependency_audit: clean dep vs risky/deprecated dep differs in score and findings', async () => {
  const skill = buildRegistry().get('open_source_dependency_audit');
  const clean = await skill.handler({ dependencies: [{ name: 'lodash', version: '4.17.21' }] });
  const risky = await skill.handler({
    dependencies: [{ name: 'event-stream', version: '0.1.0', deprecated: true }],
    packageLockPath: '/tmp/package-lock.json',
  });
  assert.ok(risky.riskScore > clean.riskScore);
  assert.ok(risky.vulnerabilities.some(v => /historically risky/i.test(v.reason)));
  assert.ok(risky.vulnerabilities.some(v => v.package === '(lockfile)'));
  assert.ok(clean.vulnerabilities.every(v => v.package !== 'event-stream'));
});

test('partnership_transition_planning: acquisition vs divestiture workstreams differ', async () => {
  const skill = buildRegistry().get('partnership_transition_planning');
  const acq = await skill.handler({ partnerName: 'Acme', transitionType: 'acquisition', timeline: '90_days' });
  const div = await skill.handler({ partnerName: 'Beta', transitionType: 'divestiture', timeline: '180_days' });
  assert.equal(acq.transitionPlan.transitionType, 'acquisition');
  assert.equal(div.transitionPlan.transitionType, 'divestiture');
  assert.notDeepEqual(
    acq.transitionPlan.workstreams.map(w => w.id),
    div.transitionPlan.workstreams.map(w => w.id),
  );
  assert.ok(acq.milestones.some(m => m.name === 'diligence'));
  assert.ok(div.milestones.some(m => m.name === 'scope_lock'));
  assert.equal(acq.transitionPlan.timelineDays, 90);
  assert.equal(div.transitionPlan.timelineDays, 180);
});

test('docker_environment_blueprinting: strict vs standard changes dockerfile and network', async () => {
  const skill = buildRegistry().get('docker_environment_blueprinting');
  const strict = await skill.handler({ frameworkName: 'levi', isolationLevel: 'strict' });
  const standard = await skill.handler({ frameworkName: 'hermes-runner', isolationLevel: 'standard' });
  assert.equal(strict.blueprint.network, 'none');
  assert.equal(standard.blueprint.network, 'egress-allowlist');
  assert.ok(strict.dockerfile.includes('WORKDIR /app/levi'));
  assert.ok(standard.dockerfile.includes('WORKDIR /app/hermes-runner'));
  assert.ok(strict.dockerfile.includes('USER nobody'));
  assert.ok(standard.dockerfile.includes('USER node'));
  assert.notEqual(strict.dockerfile, standard.dockerfile);
});
