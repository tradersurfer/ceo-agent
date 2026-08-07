const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('../core/runtimeFactory');
const { InMemoryAuditLog } = require('../core/WorkflowRuntime');
const { SupabaseAuditLog } = require('../core/persistence/SupabaseAuditLog');

const MINIMAL_CONFIG = { activeDepartments: ['executive'] };

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('without Supabase configured, workflow, skill, and usage audit stay independent in-memory logs (unchanged default)', () => {
  const runtime = createRuntime(MINIMAL_CONFIG);
  assert.ok(runtime.workflowRuntime.audit instanceof InMemoryAuditLog);
  assert.ok(runtime.skillExecutor.audit instanceof InMemoryAuditLog);
  assert.ok(runtime.usageAudit instanceof InMemoryAuditLog);
  assert.notEqual(runtime.workflowRuntime.audit, runtime.skillExecutor.audit);
  assert.notEqual(runtime.workflowRuntime.audit, runtime.usageAudit);
  assert.notEqual(runtime.skillExecutor.audit, runtime.usageAudit);
});

test('with Supabase configured, workflow/skill/usage audit are three separate SupabaseAuditLog tables sharing one client', () => {
  withEnv({ SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key' }, () => {
    const runtime = createRuntime(MINIMAL_CONFIG);

    assert.ok(runtime.workflowRuntime.audit instanceof SupabaseAuditLog);
    assert.ok(runtime.skillExecutor.audit instanceof SupabaseAuditLog);
    assert.ok(runtime.usageAudit instanceof SupabaseAuditLog);
    assert.equal(runtime.workflowRuntime.audit.table, 'workflow_audit');
    assert.equal(runtime.skillExecutor.audit.table, 'skill_audit');
    assert.equal(runtime.usageAudit.table, 'model_usage');

    // Same backend/connection, not the same log — issue #52's "no
    // correlation to preserve" reasoning, fixed to actually reach Supabase.
    assert.equal(runtime.workflowRuntime.audit.supabase, runtime.skillExecutor.audit.supabase);
    assert.equal(runtime.workflowRuntime.audit.supabase, runtime.usageAudit.supabase);
    assert.notEqual(runtime.skillExecutor.audit, runtime.usageAudit);
  });
});

test('an explicitly injected workflowRuntimeOptions is honored as-is, and skillAudit/usageAudit must be passed alongside it explicitly', () => {
  const audit = new InMemoryAuditLog();
  const store = { save: async () => {}, get: async () => null };
  const skillAudit = new InMemoryAuditLog();
  const usageAudit = new InMemoryAuditLog();

  const runtime = createRuntime(MINIMAL_CONFIG, {
    workflowRuntimeOptions: { store, audit },
    skillAudit,
    usageAudit,
  });

  assert.equal(runtime.workflowRuntime.audit, audit);
  assert.equal(runtime.skillExecutor.audit, skillAudit);
  assert.equal(runtime.usageAudit, usageAudit);
});

test('an explicitly injected workflowRuntimeOptions without explicit skillAudit/usageAudit falls back to fresh in-memory logs, not silently derived Supabase ones', () => {
  withEnv({ SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key' }, () => {
    const audit = new InMemoryAuditLog();
    const store = { save: async () => {}, get: async () => null };

    const runtime = createRuntime(MINIMAL_CONFIG, { workflowRuntimeOptions: { store, audit } });

    assert.equal(runtime.workflowRuntime.audit, audit);
    assert.ok(runtime.skillExecutor.audit instanceof InMemoryAuditLog);
    assert.ok(runtime.usageAudit instanceof InMemoryAuditLog);
    assert.notEqual(runtime.skillExecutor.audit, audit);
    assert.notEqual(runtime.usageAudit, audit);
  });
});
