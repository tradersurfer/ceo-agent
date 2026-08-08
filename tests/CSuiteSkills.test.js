const test = require('node:test');
const assert = require('node:assert/strict');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { registerCeoSkills } = require('../ceo-core/skills/ceoSkills');
const { registerCfoSkills } = require('../ceo-core/skills/cfoSkills');
const { registerCooSkills } = require('../ceo-core/skills/cooSkills');
const { registerCtoSkills } = require('../ceo-core/skills/ctoSkills');
const { registerCmoSkills } = require('../ceo-core/skills/cmoSkills');
const { registerChroSkills } = require('../ceo-core/skills/chroSkills');
const { registerCloSkills } = require('../ceo-core/skills/cloSkills');

const registrars = [
  { name: 'ceoSkills', fn: registerCeoSkills, count: 5 },
  { name: 'cfoSkills', fn: registerCfoSkills, count: 8 },
  { name: 'cooSkills', fn: registerCooSkills, count: 2 },
  { name: 'ctoSkills', fn: registerCtoSkills, count: 5 },
  { name: 'cmoSkills', fn: registerCmoSkills, count: 6 },
  { name: 'chroSkills', fn: registerChroSkills, count: 7 },
  { name: 'cloSkills', fn: registerCloSkills, count: 7 },
];

const ALL_NEW_SKILLS = registrars.flatMap(({ fn }) => {
  const reg = new SkillRegistry();
  fn(reg);
  return reg.list();
});

// Promoted from scaffold stub to real pure-computation implementations
const PROMOTED_TO_REAL_CFO = new Set(['cash_conversion_cycle_calc', 'dupont_performance_diagnosis', 'dcf_valuation']);
const SCAFFOLD_SKILLS = ALL_NEW_SKILLS.filter(skill => !PROMOTED_TO_REAL_CFO.has(skill.name));

// Promoted from scaffold stub to real deterministic handlers (payment webhook rename + reconciliation batch).
const PROMOTED_TO_REAL_BATCH = new Set([
  'subsidiary_health_check', 'partnership_transition_planning', 'multi_agent_consensus_evaluation',
  'resource_reallocation_directive', 'launch_roadmap_orchestration',
  'payment_webhook_event_classify', 'webhook_payload_parsing',
  'react_tailwind_ui_generation', 'node_flask_backend_integration', 'firebase_vercel_deployment_config',
  'docker_environment_blueprinting', 'open_source_dependency_audit',
  'social_post_architect_prompting', 'local_keyword_campaign_builder', 'brand_guideline_generation',
  'ai_brand_training_manual_creation', 'visual_layout_review', 'public_vs_internal_copy_separation',
]);

const NON_SCAFFOLD_HANDLERS = new Set([...PROMOTED_TO_REAL_CFO, ...PROMOTED_TO_REAL_BATCH]);
const STILL_SCAFFOLD_SKILLS = ALL_NEW_SKILLS.filter(skill => !NON_SCAFFOLD_HANDLERS.has(skill.name));

const BATCH_SAMPLE_INPUT = {
  subsidiaryIds: ['s1'], metrics: [], partnerName: 'Acme', transitionType: 'acquisition',
  frameworkId: 'fw1', consensusLogic: { minAgents: 2, agreementThreshold: 0.7, humanVeto: true, killSwitch: true, maxPositionPct: 10 },
  fromSector: 'A', toSector: 'B', rationale: 'test', projectName: 'Launch',
  webhookEvent: { type: 'payment_intent.succeeded', data: { object: { status: 'succeeded' } } },
  payload: { type: 'lead.created' }, componentType: 'card', stack: 'node', endpoints: ['GET /health'],
  projectRoot: '.', frameworkName: 'agent-fw', dependencies: ['lodash@4.0.0'], platform: 'x',
  businessType: 'bakery', location: 'Austin', brandName: 'Brand', brandProfile: { name: 'Brand' },
  content: 'Hello', layoutSpec: { texts: [], buttons: [], logo: { x: 0, y: 0 } },
};

test('each C-suite skill registrar registers the expected number of skills', () => {
  for (const { name, fn, count } of registrars) {
    const reg = new SkillRegistry();
    fn(reg);
    assert.equal(reg.list().length, count, `${name} registered ${count} skills`);
  }
});

test('all still-scaffold C-suite skills have disableModelInvocation=true', () => {
  for (const skill of SCAFFOLD_SKILLS) {
    assert.equal(skill.disableModelInvocation, true, `${skill.name} must have disableModelInvocation=true`);
  }
});

test('the 3 promoted CFO skills are real: disableModelInvocation=false', () => {
  const promoted = ALL_NEW_SKILLS.filter(skill => PROMOTED_TO_REAL_CFO.has(skill.name));
  assert.equal(promoted.length, 3);
  for (const skill of promoted) {
    assert.equal(skill.disableModelInvocation, false, `${skill.name} is real — must not be disableModelInvocation=true`);
  }
});

test('the 18 payment/reconciliation-batch skills are real but remain disableModelInvocation=true', () => {
  const promoted = ALL_NEW_SKILLS.filter(skill => PROMOTED_TO_REAL_BATCH.has(skill.name));
  assert.equal(promoted.length, 18);
  for (const skill of promoted) {
    assert.equal(skill.disableModelInvocation, true, `${skill.name} should still require explicit command dispatch`);
  }
});

test('all C-suite scaffold skills require agent assignment', () => {
  for (const skill of ALL_NEW_SKILLS) {
    assert.equal(skill.permissions.requiresAgentAssignment, true, `${skill.name} must require agent assignment`);
  }
});

test('all C-suite scaffold skills have non-empty input and output schemas', () => {
  for (const skill of ALL_NEW_SKILLS) {
    assert.ok(Object.keys(skill.inputSchema).length > 0, `${skill.name} must have input schema`);
    assert.ok(Object.keys(skill.outputSchema).length > 0, `${skill.name} must have output schema`);
  }
});

test('all genuinely-still-scaffold C-suite handlers return scaffolded:true', async () => {
  for (const skill of STILL_SCAFFOLD_SKILLS) {
    const reg = new SkillRegistry();
    for (const { fn } of registrars) fn(reg);
    const full = reg.get(skill.name);
    const result = await full.handler({ test: 'input' });
    assert.equal(result.scaffolded, true, `${skill.name} handler must return scaffolded:true`);
    assert.equal(result.skill, skill.name, `${skill.name} handler must return skill name`);
  }
});

test('the 18 payment/reconciliation-batch handlers no longer return scaffolded:true', async () => {
  for (const name of PROMOTED_TO_REAL_BATCH) {
    const reg = new SkillRegistry();
    for (const { fn } of registrars) fn(reg);
    const full = reg.get(name);
    assert.ok(full, `${name} must still be registered`);
    const result = await full.handler(BATCH_SAMPLE_INPUT);
    assert.notEqual(result.scaffolded, true, `${name} should no longer be a scaffold stub`);
  }
});

test('C-suite skills cover all new capabilities in CapabilityResolver', () => {
  const CapabilityResolver = require('../sdk/CapabilityResolver');
  const skillCapabilities = new Set(ALL_NEW_SKILLS.map(s => s.capability));
  const resolverCapabilities = CapabilityResolver.RECOGNIZED_CAPABILITIES;

  for (const cap of skillCapabilities) {
    assert.ok(
      resolverCapabilities.includes(cap),
      `Capability "${cap}" used by a skill must be in RECOGNIZED_CAPABILITIES`,
    );
  }
});

test('C-suite skill IDs are unique across all registrars', () => {
  const ids = ALL_NEW_SKILLS.map(s => s.name);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size, 'All skill IDs must be unique');
});

test('C-suite skills do not include ADR-001a-conflicting Hermes skills', () => {
  const forbidden = ['docker_sandbox_management', 'database_script_execution', 'shell_script_automation'];
  const registered = ALL_NEW_SKILLS.map(s => s.name);
  for (const name of forbidden) {
    assert.equal(registered.includes(name), false, `${name} must not be registered as a CEO-Agent-side skill (ADR-001a)`);
  }
});

test('payment_gateway_sync (the old id) is no longer registered anywhere', () => {
  const ids = ALL_NEW_SKILLS.map(s => s.name);
  assert.equal(ids.includes('payment_gateway_sync'), false, 'old payment_gateway_sync id must not remain registered');
  assert.ok(ids.includes('payment_webhook_event_classify'), 'renamed payment_webhook_event_classify must be registered');
});