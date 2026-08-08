const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowRuntime } = require('../ceo-core/WorkflowRuntime');
const { WorkflowScheduler } = require('../ceo-core/WorkflowScheduler');

function makeClock(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const WORKFLOW = { id: 'wf-delay', steps: [{ id: 'step1', type: 'delayed', delay_days: 2 }] };
const resolveWorkflow = id => (id === WORKFLOW.id ? WORKFLOW : null);

test('constructor requires a WorkflowRuntime instance', () => {
  assert.throws(() => new WorkflowScheduler({ workflowResolver: resolveWorkflow }), /WorkflowRuntime instance/);
});

test('constructor requires a workflowResolver function', () => {
  const runtime = new WorkflowRuntime();
  assert.throws(() => new WorkflowScheduler({ runtime }), /workflowResolver/);
});

test('constructor requires a store that implements listWaiting', () => {
  const bareStore = { save: async record => record, get: async () => null };
  const runtime = new WorkflowRuntime({ store: bareStore });
  assert.throws(() => new WorkflowScheduler({ runtime, workflowResolver: resolveWorkflow }), /listWaiting/);
});

test('tick() leaves a not-yet-due waiting run untouched', async () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const runtime = new WorkflowRuntime({ clock: makeClock([start, start]) });
  runtime.registerExecutor('delayed', async () => ({ status: 'ok' }));
  const run = await runtime.execute({ workflow: WORKFLOW });
  assert.equal(run.status, 'waiting');

  const scheduler = new WorkflowScheduler({ runtime, workflowResolver: resolveWorkflow, clock: () => start });
  const results = await scheduler.tick();

  assert.deepEqual(results, []);
  const stillWaiting = await runtime.store.get(run.id);
  assert.equal(stillWaiting.status, 'waiting');
});

test('tick() resumes a due waiting run and reports its new status', async () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const later = new Date('2026-01-03T00:01:00Z'); // 2 days + 1 minute later
  const runtime = new WorkflowRuntime({ clock: makeClock([start, start, later, later]) });
  runtime.registerExecutor('delayed', async () => ({ status: 'ok' }));
  const run = await runtime.execute({ workflow: WORKFLOW });
  assert.equal(run.status, 'waiting');

  const scheduler = new WorkflowScheduler({ runtime, workflowResolver: resolveWorkflow, clock: () => later });
  const results = await scheduler.tick();

  assert.deepEqual(results, [{ id: run.id, status: 'completed' }]);
  const resolved = await runtime.store.get(run.id);
  assert.equal(resolved.status, 'completed');
  assert.equal(resolved.steps[0].status, 'completed');
});

test('tick() reports a skipped result when the workflow definition cannot be resolved', async () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const later = new Date('2026-01-03T00:01:00Z');
  const runtime = new WorkflowRuntime({ clock: makeClock([start, start]) });
  runtime.registerExecutor('delayed', async () => ({ status: 'ok' }));
  const run = await runtime.execute({ workflow: WORKFLOW });
  assert.equal(run.status, 'waiting');

  const scheduler = new WorkflowScheduler({ runtime, workflowResolver: () => null, clock: () => later });
  const results = await scheduler.tick();

  assert.deepEqual(results, [{ id: run.id, status: 'skipped', reason: 'workflow_not_found' }]);
  const untouched = await runtime.store.get(run.id);
  assert.equal(untouched.status, 'waiting');
});

test('overlapping tick() calls do not resume the same due run twice', async () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const later = new Date('2026-01-03T00:01:00Z');
  const runtime = new WorkflowRuntime({ clock: makeClock([start, start, later, later]) });

  let executionCount = 0;
  let releaseExecutor;
  const gate = new Promise(resolve => { releaseExecutor = resolve; });
  runtime.registerExecutor('delayed', async () => {
    executionCount += 1;
    await gate;
    return { status: 'ok' };
  });

  const run = await runtime.execute({ workflow: WORKFLOW });
  assert.equal(run.status, 'waiting');

  const scheduler = new WorkflowScheduler({ runtime, workflowResolver: resolveWorkflow, clock: () => later });

  const firstTick = scheduler.tick();
  const secondTick = scheduler.tick();
  await new Promise(resolve => setImmediate(resolve));
  releaseExecutor();
  const [firstResults, secondResults] = await Promise.all([firstTick, secondTick]);

  assert.equal(executionCount, 1);
  assert.deepEqual(firstResults, [{ id: run.id, status: 'completed' }]);
  assert.deepEqual(secondResults, []);
});

test('start() polls tick() on an interval and stop() halts it', async () => {
  const runtime = new WorkflowRuntime();
  let tickCount = 0;
  const scheduler = new WorkflowScheduler({ runtime, workflowResolver: resolveWorkflow });
  scheduler.tick = async () => { tickCount += 1; return []; };

  scheduler.start(5);
  await new Promise(resolve => setTimeout(resolve, 25));
  scheduler.stop();
  const countAfterStop = tickCount;
  await new Promise(resolve => setTimeout(resolve, 25));

  assert.ok(countAfterStop >= 2, `expected at least 2 ticks, got ${countAfterStop}`);
  assert.equal(tickCount, countAfterStop);
});

test('start() is a no-op when already started, and requires a positive interval', () => {
  const runtime = new WorkflowRuntime();
  const scheduler = new WorkflowScheduler({ runtime, workflowResolver: resolveWorkflow });
  assert.throws(() => scheduler.start(0), /positive intervalMs/);
  scheduler.start(1000);
  const firstTimer = scheduler._timer;
  scheduler.start(2000);
  assert.equal(scheduler._timer, firstTimer);
  scheduler.stop();
  assert.equal(scheduler._timer, null);
});
