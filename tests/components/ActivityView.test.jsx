const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, waitFor } = require('@testing-library/react');
const ActivityView = require('../../app/components/ActivityView').default;

afterEach(() => {
  cleanup();
});

function withFetch(impl, fn) {
  const originalFetch = global.fetch;
  global.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.fetch = originalFetch; });
}

const REAL_SHAPED_FEED = {
  configured: true,
  generatedAt: '2026-07-28T12:00:00.000Z',
  skills: {
    source: 'in-memory',
    sampleSize: 2,
    failureCount: 1,
    errorRate: 0.5,
    recent: [
      { event: 'skill.execution.succeeded', skillName: 'format_currency', status: 'ok', agentId: 'cfo_agent', agentName: 'CFO Agent', agentResolved: true, department: 'finance', timestamp: '2026-07-28T11:59:00.000Z' },
      { event: 'skill.execution.failed', skillName: 'summarize_text', status: 'failed', agentId: 'ghost_agent', agentName: 'ghost_agent', agentResolved: false, department: null, timestamp: '2026-07-28T11:58:00.000Z' },
    ],
  },
  workflows: {
    source: 'in-memory',
    sampleSize: 3,
    runTerminalCount: 1,
    failureCount: 0,
    errorRate: 0,
    recent: [
      { event: 'workflow.completed', workflowId: 'wf-a', runId: 'wf-a:1', agentId: 'coo_agent', agentName: 'COO Agent', agentResolved: true, department: 'operations', timestamp: '2026-07-28T11:57:00.000Z' },
    ],
    runs: [
      { runId: 'wf-a:1', workflowId: 'wf-a', status: 'completed', createdAt: '2026-07-28T11:56:00.000Z', updatedAt: '2026-07-28T11:57:00.000Z', durationMs: 60000 },
    ],
  },
  usage: {
    source: 'in-memory',
    sampleSize: 2,
    totalPromptTokens: 1500,
    totalCompletionTokens: 750,
    totalCostUsd: 0.0105,
    costUnknownCalls: 1,
    byAgent: {
      cfo_agent: { agentId: 'cfo_agent', agentName: 'CFO Agent', department: 'finance', agentResolved: true, calls: 1, promptTokens: 1000, completionTokens: 500, costUsd: 0.0105, costUnknownCalls: 0 },
      unknown: { agentId: null, agentName: 'Unknown', department: null, agentResolved: false, calls: 1, promptTokens: 500, completionTokens: 250, costUsd: 0, costUnknownCalls: 1 },
    },
    recent: [],
  },
  byDepartment: {},
  notes: {
    duration: 'Per-skill-execution and per-workflow-step duration are not tracked.',
    errorRate: 'errorRate is computed only from skill_audit and workflow_audit, never model_usage.',
    working: 'byDepartment[].working is a recency proxy.',
  },
};

test('renders real-shaped activity data: skill rows, workflow rows, run duration, and usage-by-agent', async () => {
  await withFetch(
    async () => ({ json: async () => REAL_SHAPED_FEED }),
    async () => {
      render(React.createElement(ActivityView));
      await waitFor(() => assert.ok(screen.getByText('format_currency')));

      // "CFO Agent" legitimately appears twice: once in the skill-execution
      // row, once in the usage-by-agent row -- both real, not a duplicate render.
      assert.ok(screen.getAllByText('CFO Agent').length >= 2);
      assert.ok(screen.getByText('COO Agent'));
      assert.ok(screen.getByText('60.0s')); // run duration formatting
      assert.ok(screen.getByText('50.0%')); // skill error rate
      assert.ok(screen.getByText(/unpriced/));
    },
  );
});

test('does not crash on an unresolvable agentId, and renders it gracefully rather than dropping the row', async () => {
  await withFetch(
    async () => ({ json: async () => REAL_SHAPED_FEED }),
    async () => {
      render(React.createElement(ActivityView));
      await waitFor(() => assert.ok(screen.getByText('summarize_text')));
      assert.ok(screen.getByText(/ghost_agent \(unresolved\)/));
    },
  );
});

test('renders sensibly with empty/no-activity data, no crash', async () => {
  const EMPTY_FEED = {
    configured: true,
    generatedAt: '2026-07-28T12:00:00.000Z',
    skills: { source: 'in-memory', sampleSize: 0, failureCount: 0, errorRate: null, recent: [] },
    workflows: { source: 'in-memory', sampleSize: 0, runTerminalCount: 0, failureCount: 0, errorRate: null, recent: [], runs: [] },
    usage: { source: 'in-memory', sampleSize: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCostUsd: 0, costUnknownCalls: 0, byAgent: {}, recent: [] },
    byDepartment: {},
    notes: {},
  };
  await withFetch(
    async () => ({ json: async () => EMPTY_FEED }),
    async () => {
      render(React.createElement(ActivityView));
      await waitFor(() => assert.ok(screen.getByText('No skill executions recorded yet.')));
      assert.ok(screen.getByText('No workflow activity recorded yet.'));
      assert.ok(screen.getByText('No model usage recorded yet.'));
    },
  );
});

test('renders a setup prompt when not configured', async () => {
  await withFetch(
    async () => ({ json: async () => ({ configured: false }) }),
    async () => {
      render(React.createElement(ActivityView));
      await waitFor(() => assert.ok(screen.getByText('Run setup first.')));
    },
  );
});
