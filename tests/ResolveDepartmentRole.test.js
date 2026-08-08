const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveDepartmentRole,
  resolveRoleForAgent,
  BUILT_IN_DEPARTMENT_ROLES,
  FALLBACK_ROLE,
} = require('../ceo-core/resolveDepartmentRole');

test('day-one non-regression: technology defaults to codex with no override configured', () => {
  assert.equal(resolveDepartmentRole('technology', undefined), 'codex');
  assert.equal(resolveDepartmentRole('technology', {}), 'codex');
});

test('day-one non-regression: every other known department defaults to claude with no override configured', () => {
  for (const department of ['executive', 'finance', 'operations', 'marketing', 'people', 'legal']) {
    assert.equal(resolveDepartmentRole(department, undefined), 'claude', `expected claude for ${department}`);
  }
});

test('day-one non-regression: resolveRoleForAgent matches the exact old hardcoded two-way if, for both department and lane', () => {
  assert.equal(resolveRoleForAgent({ department: 'technology' }, undefined), 'codex');
  assert.equal(resolveRoleForAgent({ lane: 'technology' }, undefined), 'codex');
  assert.equal(resolveRoleForAgent({ department: 'finance' }, undefined), 'claude');
  assert.equal(resolveRoleForAgent({ lane: 'marketing' }, undefined), 'claude');
  assert.equal(resolveRoleForAgent({}, undefined), 'claude');
});

test('a configured departmentModelDefaults override wins over the built-in default', () => {
  assert.equal(resolveDepartmentRole('marketing', { marketing: 'grok' }), 'grok');
  assert.equal(resolveDepartmentRole('technology', { technology: 'gpt' }), 'gpt', 'even technology can be overridden away from codex');
});

test('an override is validated against the live catalog roles — an unresolvable role string falls back to the built-in default', () => {
  assert.equal(resolveDepartmentRole('marketing', { marketing: 'not_a_real_role' }), 'claude');
  assert.equal(resolveDepartmentRole('technology', { technology: 'not_a_real_role' }), 'codex');
});

test('resolves against all 5 live OpenRouter roles, not just claude/codex', () => {
  assert.equal(resolveDepartmentRole('marketing', { marketing: 'gpt' }), 'gpt');
  assert.equal(resolveDepartmentRole('people', { people: 'gemini' }), 'gemini');
  assert.equal(resolveDepartmentRole('legal', { legal: 'grok' }), 'grok');
});

test('an override for an unrelated department does not affect other departments', () => {
  const overrides = { marketing: 'grok' };
  assert.equal(resolveDepartmentRole('finance', overrides), 'claude');
  assert.equal(resolveDepartmentRole('technology', overrides), 'codex');
});

test('exports the exact built-in defaults the old hardcoded line encoded', () => {
  assert.deepEqual(BUILT_IN_DEPARTMENT_ROLES, { technology: 'codex' });
  assert.equal(FALLBACK_ROLE, 'claude');
});
