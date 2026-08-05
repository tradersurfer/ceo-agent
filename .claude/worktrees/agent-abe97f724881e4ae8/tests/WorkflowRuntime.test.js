const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowRuntime } = require('../core/WorkflowRuntime');

function makeRuntime(clockValues) {
  let i = 0;
  const clock = clockValues ? () => clockValues[Math.min(i++, clockValues.length - 1)] : () => new Date();
  return new WorkflowRuntime({ clock });
}

test('executes a simple single-step workflow to completion', async () => {
  const runtime = makeRuntime();
  runtime.registerExecutor('noop', async () => ({ status: 'ok', value: 42 }));
  const workflow = { id: 'wf-simple', steps: [{ id: 'step1', type: 'noop' }] };
  const run = await runtime.execute({ workflow });
  assert.equal(run.status, 'completed');
  assert.equal(run.steps[0].status, 'completed');
  assert.equal(run.outputs.step1.value, 42);
});

test('runs a second step only after its dependency completes', async () => {
  const runtime = makeRuntime();
  const order = [];
  runtime.registerExecutor('a', async () => { order.push('a'); return { status: 'ok' }; });
  runtime.registerExecutor('b', async () => { order.push('b'); return { status: 'ok' }; });
  const workflow = {
    id: 'wf-deps',
    steps: [
      { id: 'step1', type: 'a' },
      { id: 'step2', type: 'b', depends_on: 'step1' },
    ],
  };
  const run = await runtime.execute({ workflow });
  assert.equal(run.status, 'completed');
  assert.deepEqual(order, ['a', 'b']);
});

test('marks a step failed when its dependency fails', async () => {
  const runtime = makeRuntime();
  runtime.registerExecutor('fails', async () => ({ status: 'failed', error: 'boom' }));
  runtime.registerExecutor('never', async () => ({ status: 'ok' }));
  const workflow = {
    id: 'wf-dep-fail',
    steps: [
      { id: 'step1', type: 'fails' },
      { id: 'step2', type: 'never', depends_on: 'step1' },
    ],
  };
  const run = await runtime.execute({ workflow });
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].status, 'failed');
  assert.equal(run.steps[1].status, 'failed');
  assert.match(run.steps[1].error, /Dependency failed/);
});

test('skips a step whose condition does not pass', async () => {
  const runtime = makeRuntime();
  let ran = false;
  runtime.registerExecutor('conditional', async () => { ran = true; return { status: 'ok' }; });
  const workflow = {
    id: 'wf-condition',
    steps: [{ id: 'step1', type: 'conditional', condition: { field: 'flag', operator: 'eq', value: true } }],
  };
  const run = await runtime.execute({ workflow, input: { flag: false } });
  assert.equal(run.status, 'completed');
  assert.equal(run.steps[0].status, 'skipped');
  assert.equal(ran, false);
});

test('runs a step whose condition passes', async () => {
  const runtime = makeRuntime();
  runtime.registerExecutor('conditional', async () => ({ status: 'ok' }));
  const workflow = {
    id: 'wf-condition-pass',
    steps: [{ id: 'step1', type: 'conditional', condition: { field: 'flag', operator: 'eq', value: true } }],
  };
  const run = await runtime.execute({ workflow, input: { flag: true } });
  assert.equal(run.steps[0].status, 'completed');
});

test('holds a delayed step in waiting status until its scheduled time', async () => {
  const runtime = makeRuntime();
  runtime.registerExecutor('delayed', async () => ({ status: 'ok' }));
  const workflow = { id: 'wf-delay', steps: [{ id: 'step1', type: 'delayed', delay_days: 2 }] };
  const run = await runtime.execute({ workflow });
  assert.equal(run.status, 'waiting');
  assert.equal(run.steps[0].status, 'waiting');
  assert.ok(run.steps[0].scheduledFor);
});

test('resume() completes a delayed step once its scheduled time has passed', async () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const later = new Date('2026-01-03T00:01:00Z'); // 2 days + 1 minute later
  const runtime = makeRuntime([start, start, later, later]);
  runtime.registerExecutor('delayed', async () => ({ status: 'ok' }));
  const workflow = { id: 'wf-resume', steps: [{ id: 'step1', type: 'delayed', delay_days: 2 }] };

  const firstRun = await runtime.execute({ workflow });
  assert.equal(firstRun.status, 'waiting');

  const resumed = await runtime.resume(firstRun.id, workflow);
  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.steps[0].status, 'completed');
});

test('retries a failing step up to max_attempts before marking it failed', async () => {
  const runtime = makeRuntime();
  let calls = 0;
  runtime.registerExecutor('flaky', async () => {
    calls += 1;
    throw new Error('temporary failure');
  });
  const workflow = { id: 'wf-retry', steps: [{ id: 'step1', type: 'flaky', max_attempts: 3 }] };

  let run = await runtime.execute({ workflow });
  assert.equal(run.steps[0].status, 'pending');
  run = await runtime.resume(run.id, workflow);
  assert.equal(run.steps[0].status, 'pending');
  run = await runtime.resume(run.id, workflow);
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].status, 'failed');
  assert.equal(calls, 3);
});

test('succeeds on a later attempt within max_attempts', async () => {
  const runtime = makeRuntime();
  let calls = 0;
  runtime.registerExecutor('flaky-then-ok', async () => {
    calls += 1;
    if (calls < 2) throw new Error('first attempt fails');
    return { status: 'ok' };
  });
  const workflow = { id: 'wf-retry-success', steps: [{ id: 'step1', type: 'flaky-then-ok', max_attempts: 3 }] };

  let run = await runtime.execute({ workflow });
  assert.equal(run.steps[0].status, 'pending');
  run = await runtime.resume(run.id, workflow);
  assert.equal(run.status, 'completed');
  assert.equal(run.steps[0].status, 'completed');
});

test('fails a step with no registered executor for its type', async () => {
  const runtime = makeRuntime();
  const workflow = { id: 'wf-missing-executor', steps: [{ id: 'step1', type: 'unregistered_type' }] };
  const run = await runtime.execute({ workflow });
  assert.equal(run.status, 'failed');
  assert.match(run.steps[0].error, /No executor registered/);
});

test('records audit entries for step lifecycle events', async () => {
  const runtime = makeRuntime();
  runtime.registerExecutor('noop', async () => ({ status: 'ok' }));
  const workflow = { id: 'wf-audit', steps: [{ id: 'step1', type: 'noop' }] };
  await runtime.execute({ workflow });
  const events = runtime.audit.list().map(entry => entry.event);
  assert.ok(events.includes('workflow.step.completed'));
  assert.ok(events.includes('workflow.completed'));
});

test('a repeated execute() with the same id returns the existing run instead of double-running', async () => {
  const runtime = makeRuntime();
  let executionCount = 0;
  runtime.registerExecutor('noop', async () => { executionCount += 1; return { status: 'ok', value: executionCount }; });
  const workflow = { id: 'wf-idempotent', steps: [{ id: 'step1', type: 'noop' }] };

  const first = await runtime.execute({ workflow, id: 'shared-key' });
  const second = await runtime.execute({ workflow, id: 'shared-key' });

  assert.equal(executionCount, 1);
  assert.equal(first.id, 'shared-key');
  assert.equal(second.id, 'shared-key');
  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'completed');
  assert.equal(second.outputs.step1.value, 1);
});

test('execute() calls with different ids each run independently', async () => {
  const runtime = makeRuntime();
  let executionCount = 0;
  runtime.registerExecutor('noop', async () => { executionCount += 1; return { status: 'ok' }; });
  const workflow = { id: 'wf-distinct', steps: [{ id: 'step1', type: 'noop' }] };

  const first = await runtime.execute({ workflow, id: 'key-a' });
  const second = await runtime.execute({ workflow, id: 'key-b' });

  assert.equal(executionCount, 2);
  assert.notEqual(first.id, second.id);
  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'completed');
});

test('concurrent execute() calls with the same id produce exactly one winner', async () => {
  const runtime = makeRuntime();
  let executionCount = 0;
  runtime.registerExecutor('noop', async () => { executionCount += 1; return { status: 'ok' }; });
  const workflow = { id: 'wf-concurrent', steps: [{ id: 'step1', type: 'noop' }] };

  const [first, second] = await Promise.all([
    runtime.execute({ workflow, id: 'race-key' }),
    runtime.execute({ workflow, id: 'race-key' }),
  ]);

  // Exactly one of the two calls actually ran the workflow: the loser's
  // synchronous createIfAbsent() check loses the race before the winner's
  // _run() has necessarily finished, so the loser may legitimately observe
  // the winner's in-flight 'running' snapshot rather than its eventual
  // 'completed' state — the same behavior a real idempotency-key system
  // (e.g. "request already in progress") would give a concurrent duplicate.
  // What must always hold is: exactly one execution, and both calls resolve
  // to the same run id.
  assert.equal(executionCount, 1);
  assert.equal(first.id, 'race-key');
  assert.equal(second.id, 'race-key');
  assert.ok(['running', 'completed'].includes(first.status));
  assert.ok(['running', 'completed'].includes(second.status));

  const finalRecord = await runtime.store.get('race-key');
  assert.equal(finalRecord.status, 'completed');
});
