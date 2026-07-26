const test = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseWorkflowStore } = require('../core/persistence/SupabaseWorkflowStore');
const { InMemoryWorkflowStore } = require('../core/WorkflowRuntime');
const { makeFakeSupabase } = require('./helpers/fakeSupabase');

function sampleRecord(overrides = {}) {
  return {
    id: 'wf:1',
    workflowId: 'wf',
    status: 'running',
    input: { a: 1 },
    context: { tenantId: 'tenant-a' },
    steps: [{ id: 's1', status: 'pending', attempts: 0 }],
    outputs: {},
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
    ...overrides,
  };
}

test('save upserts a run and returns the stored record', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  const record = sampleRecord();

  const saved = await store.save(record);
  assert.deepEqual(saved, record);

  // Persisted row carries the indexable columns plus the full record.
  const rows = supabase._rows('workflow_runs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'wf:1');
  assert.equal(rows[0].workflow_id, 'wf');
  assert.equal(rows[0].status, 'running');
  assert.equal(rows[0].tenant_id, 'tenant-a');
  assert.deepEqual(rows[0].record, record);
});

test('save on the same id updates rather than duplicating', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  await store.save(sampleRecord());
  await store.save(sampleRecord({ status: 'completed' }));

  const rows = supabase._rows('workflow_runs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'completed');
});

test('get returns the stored record, or null when absent', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  await store.save(sampleRecord());

  const fetched = await store.get('wf:1');
  assert.deepEqual(fetched, sampleRecord());
  assert.equal(await store.get('missing'), null);
});

test('returned records are deep copies, not shared references', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  const record = sampleRecord();
  await store.save(record);

  const fetched = await store.get('wf:1');
  fetched.status = 'mutated';
  const refetched = await store.get('wf:1');
  assert.equal(refetched.status, 'running');
});

test('matches the InMemoryWorkflowStore save/get contract', async () => {
  const supabase = makeFakeSupabase();
  const supa = new SupabaseWorkflowStore({ supabase });
  const mem = new InMemoryWorkflowStore();
  const record = sampleRecord();

  assert.deepEqual(await supa.save(record), await mem.save(record));
  assert.deepEqual(await supa.get('wf:1'), await mem.get('wf:1'));
  assert.equal(await supa.get('nope'), await mem.get('nope'));
});

test('listWaiting returns only waiting runs, filtered server-side by status', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  await store.save(sampleRecord({ id: 'wf:1', status: 'waiting' }));
  await store.save(sampleRecord({ id: 'wf:2', status: 'completed' }));
  await store.save(sampleRecord({ id: 'wf:3', status: 'waiting' }));

  const waiting = await store.listWaiting();
  assert.deepEqual(waiting.map(record => record.id).sort(), ['wf:1', 'wf:3']);
  assert.ok(waiting.every(record => record.status === 'waiting'));
});

test('listWaiting matches the InMemoryWorkflowStore contract', async () => {
  const supabase = makeFakeSupabase();
  const supa = new SupabaseWorkflowStore({ supabase });
  const mem = new InMemoryWorkflowStore();
  await supa.save(sampleRecord({ id: 'wf:1', status: 'waiting' }));
  await mem.save(sampleRecord({ id: 'wf:1', status: 'waiting' }));
  await supa.save(sampleRecord({ id: 'wf:2', status: 'running' }));
  await mem.save(sampleRecord({ id: 'wf:2', status: 'running' }));

  const supaWaiting = (await supa.listWaiting()).map(record => record.id).sort();
  const memWaiting = (await mem.listWaiting()).map(record => record.id).sort();
  assert.deepEqual(supaWaiting, memWaiting);
});

test('createIfAbsent creates a run once and reports created: true', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  const record = sampleRecord();

  const result = await store.createIfAbsent(record);
  assert.equal(result.created, true);
  assert.deepEqual(result.record, record);

  const rows = supabase._rows('workflow_runs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'wf:1');
});

test('createIfAbsent on an existing id returns the stored record with created: false, unmodified', async () => {
  const supabase = makeFakeSupabase();
  const store = new SupabaseWorkflowStore({ supabase });
  await store.createIfAbsent(sampleRecord({ status: 'running' }));

  const result = await store.createIfAbsent(sampleRecord({ status: 'completed' }));
  assert.equal(result.created, false);
  assert.equal(result.record.status, 'running');

  const rows = supabase._rows('workflow_runs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'running');
});

test('createIfAbsent matches the InMemoryWorkflowStore contract for both the winner and the loser', async () => {
  const supabase = makeFakeSupabase();
  const supa = new SupabaseWorkflowStore({ supabase });
  const mem = new InMemoryWorkflowStore();
  const record = sampleRecord();

  const supaFirst = await supa.createIfAbsent(record);
  const memFirst = await mem.createIfAbsent(record);
  assert.deepEqual(supaFirst, memFirst);

  const supaSecond = await supa.createIfAbsent(sampleRecord({ status: 'completed' }));
  const memSecond = await mem.createIfAbsent(sampleRecord({ status: 'completed' }));
  assert.deepEqual(supaSecond, memSecond);
});

test('requires credentials when no client is injected', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => new SupabaseWorkflowStore(), /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    if (saved.url) process.env.SUPABASE_URL = saved.url;
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});
