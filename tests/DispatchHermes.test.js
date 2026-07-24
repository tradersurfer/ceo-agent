// Bridges read their allowlists from env vars at module-load time, so these
// must be set BEFORE requiring the dispatch handler (which requires HermesBridge).
process.env.CEO_AGENT_PROJECTS = 'test-project';
process.env.CEO_AGENT_APPROVERS = 'ceo_agent';

const test = require('node:test');
const assert = require('node:assert/strict');
const { routeToAgent } = require('../app/api/dispatch/handler');

// Issue #27: the dispatch handler used to special-case Hermes and return a
// hardcoded 'queued' placeholder WITHOUT calling HermesBridge.runTask(). These
// tests prove that short-circuit is gone and the real bridge validation runs.

test('dispatch invokes real HermesBridge.runTask validation — an unauthorized project is blocked', async () => {
  const result = await routeToAgent('hermes', {
    agent: 'hermes',
    type: 'cron_create',
    project: 'unauthorized-project',
    goal: 'schedule a job',
    task: 'create a cron job',
    approved_by: 'ceo_agent',
  });

  // The old hardcoded short-circuit could ONLY ever return 'queued'. A 'blocked'
  // result is only reachable through the real runTask() validation path.
  assert.equal(result.status, 'blocked');
  assert.ok(Array.isArray(result.blockers) && result.blockers.length > 0, 'Expected real validation blockers');
  assert.match(result.blockers.join('; '), /project/i);
});

test('dispatch runs Hermes validation and honestly queues a valid task without claiming runtime execution', async () => {
  const result = await routeToAgent('hermes', {
    agent: 'hermes',
    type: 'cron_create',
    project: 'test-project',
    goal: 'schedule a job',
    task: 'create a cron job',
    approved_by: 'ceo_agent',
  });

  assert.equal(result.status, 'queued');
  // Proof the result came from runTask(): it carries the real validation
  // actions_taken and the runTask summary vocabulary.
  assert.ok(result.actions_taken.includes('Validated authorized task type.'));
  assert.match(result.summary, /not connected yet/i);
  // The old hardcoded placeholder text must be gone.
  assert.doesNotMatch(result.summary, /OpenClaw|HERMES_RUNTIME_PATH/);
});
