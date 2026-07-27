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

test('without Supabase configured, workflow and skill audit stay independent in-memory logs (unchanged default)', () => {
  const runtime = createRuntime(MINIMAL_CONFIG);
  assert.ok(runtime.workflowRuntime.audit instanceof InMemoryAuditLog);
  assert.ok(runtime.skillExecutor.audit instanceof InMemoryAuditLog);
  assert.notEqual(runtime.workflowRuntime.audit, runtime.skillExecutor.audit);
});

test('with Supabase configured, workflow and skill audit are separate SupabaseAuditLog tables sharing one client', () => {
  withEnv({ SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key' }, () => {
    const runtime = createRuntime(MINIMAL_CONFIG);

    assert.ok(runtime.workflowRuntime.audit instanceof SupabaseAuditLog);
    assert.ok(runtime.skillExecutor.audit instanceof SupabaseAuditLog);
    assert.equal(runtime.workflowRuntime.audit.table, 'workflow_audit');
    assert.equal(runtime.skillExecutor.audit.table, 'skill_audit');

    // Same backend/connection, not the same log — issue #52's "no
    // correlation to preserve" reasoning, fixed to actually reach Supabase.
    assert.equal(runtime.workflowRuntime.audit.supabase, runtime.skillExecutor.audit.supabase);
    assert.notEqual(runtime.workflowRuntime.audit, runtime.skillExecutor.audit);
  });
});

test('an explicitly injected workflowRuntimeOptions is honored as-is, and skillAudit must be passed alongside it explicitly', () => {
  const audit = new InMemoryAuditLog();
  const store = { save: async () => {}, get: async () => null };
  const skillAudit = new InMemoryAuditLog();

  const runtime = createRuntime(MINIMAL_CONFIG, {
    workflowRuntimeOptions: { store, audit },
    skillAudit,
  });

  assert.equal(runtime.workflowRuntime.audit, audit);
  assert.equal(runtime.skillExecutor.audit, skillAudit);
});

test('an explicitly injected workflowRuntimeOptions without an explicit skillAudit falls back to a fresh in-memory log, not a silently derived Supabase one', () => {
  withEnv({ SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key' }, () => {
    const audit = new InMemoryAuditLog();
    const store = { save: async () => {}, get: async () => null };

    const runtime = createRuntime(MINIMAL_CONFIG, { workflowRuntimeOptions: { store, audit } });

    assert.equal(runtime.workflowRuntime.audit, audit);
    assert.ok(runtime.skillExecutor.audit instanceof InMemoryAuditLog);
    assert.notEqual(runtime.skillExecutor.audit, audit);
  });
});
