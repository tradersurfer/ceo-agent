const test = require('node:test');
const assert = require('node:assert/strict');
const { SkillRegistry } = require('../core/SkillRegistry');
const { registerCeoSkills } = require('../core/skills/ceoSkills');
const { registerCfoSkills } = require('../core/skills/cfoSkills');
const { registerCooSkills } = require('../core/skills/cooSkills');
const { registerCtoSkills } = require('../core/skills/ctoSkills');
const { registerCmoSkills } = require('../core/skills/cmoSkills');
const { registerChroSkills } = require('../core/skills/chroSkills');
const { registerCloSkills } = require('../core/skills/cloSkills');

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

test('each C-suite skill registrar registers the expected number of skills', () => {
  for (const { name, fn, count } of registrars) {
    const reg = new SkillRegistry();
    fn(reg);
    assert.equal(reg.list().length, count, `${name} registered ${count} skills`);
  }
});

test('all C-suite scaffold skills have disableModelInvocation=true', () => {
  for (const skill of ALL_NEW_SKILLS) {
    assert.equal(skill.disableModelInvocation, true, `${skill.name} must have disableModelInvocation=true`);
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

test('all C-suite scaffold handlers return scaffolded:true', async () => {
  for (const skill of ALL_NEW_SKILLS) {
    const reg = new SkillRegistry();
    // Re-register to get the full skill object including handler
    for (const { fn } of registrars) fn(reg);
    const full = reg.get(skill.name);
    const result = await full.handler({ test: 'input' });
    assert.equal(result.scaffolded, true, `${skill.name} handler must return scaffolded:true`);
    assert.equal(result.skill, skill.name, `${skill.name} handler must return skill name`);
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
