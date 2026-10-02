const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, waitFor } = require('@testing-library/react');
const RightSidebar = require('../../app/components/RightSidebar').default;

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

const ok = body => ({ ok: true, json: async () => body });

const REAL_SHAPED_STATUS = {
  configured: true,
  costMode: 'flagship',
  status: { agentCount: 3, agents: ['ceo_agent', 'cfo_agent', 'clo_agent'], health: 'healthy' },
};

const REAL_SHAPED_FEED = {
  configured: true,
  generatedAt: '2026-10-01T20:00:00.000Z',
  skills: {
    sampleSize: 2,
    failureCount: 1,
    errorRate: 0.5,
    recent: [
      { skillName: 'format_currency', status: 'ok' },
      { skillName: 'summarize_text', status: 'failed' },
    ],
  },
  workflows: { failureCount: 2, recent: [{ workflowId: 'wf-a', status: 'completed' }] },
  usage: { totalCostUsd: 0, costUnknownCalls: 3, byAgent: {} },
  notes: { duration: 'Per-step duration is not tracked today.' },
};

function renderWith(statusBody, feedBody, { statusOk = true, feedOk = true } = {}) {
  return withFetch(async (url) => {
    if (String(url).includes('/api/activity')) {
      return feedOk ? ok(feedBody) : { ok: false, json: async () => ({}) };
    }
    return statusOk ? ok(statusBody) : { ok: false, json: async () => ({}) };
  }, async () => {
    render(React.createElement(RightSidebar));
    // The <aside> exists on first render, BEFORE the fetches resolve — waiting
    // on it alone returns immediately and every value is still its "—"
    // placeholder. Wait on a value that can only come from a resolved fetch.
    // node:test has no `expect`; throwing inside waitFor is how it retries.
    await waitFor(() => {
      const active = screen.getByText('Active').parentElement;
      if (active.textContent === 'Active—') throw new Error('status fetch not resolved yet');
    });
  });
}

test('renders live agent status from the real /api/status shape', async () => {
  await renderWith(REAL_SHAPED_STATUS, REAL_SHAPED_FEED);

  // getByText matches whole text nodes, so a bare '3' is ambiguous next to
  // other numbers; assert the labelled cell instead.
  const activeCell = screen.getByText('Active').parentElement;
  assert.equal(activeCell.textContent, 'Active3', 'active agent count');
  assert.ok(screen.getByText('flagship'), 'cost mode');
  assert.ok(screen.getByText('ceo_agent'), 'agent id is listed');
  assert.ok(screen.getByText('clo_agent'), 'every reported agent is listed');
});

test('names the health state in text, so colour is never the only signal', async () => {
  await renderWith(REAL_SHAPED_STATUS, REAL_SHAPED_FEED);
  // The word must be readable, not just carried by the badge colour.
  assert.ok(screen.getByText('healthy'));
});

test('a degraded health state is rendered as its own word, not as healthy', async () => {
  const degraded = { ...REAL_SHAPED_STATUS, status: { ...REAL_SHAPED_STATUS.status, health: 'degraded' } };
  await renderWith(degraded, REAL_SHAPED_FEED);
  assert.ok(screen.getByText('degraded'));
});

test('renders an error rate as a percentage when the feed supplies samples', async () => {
  await renderWith(REAL_SHAPED_STATUS, REAL_SHAPED_FEED);
  assert.ok(screen.getByText('50%'));
});

test('an unknown error rate renders as unknown, never as 0%', async () => {
  // buildActivityFeed returns null errorRate when it has no samples. Rendering
  // that as "0%" would claim a clean record where none was measured.
  const noSamples = {
    ...REAL_SHAPED_FEED,
    skills: { sampleSize: 0, failureCount: 0, errorRate: null, recent: [] },
  };
  await renderWith(REAL_SHAPED_STATUS, noSamples);
  assert.ok(screen.getByText('—'), 'unknown must render as an em dash');
  // queryBy* returns null when absent; getByText throws, which would fail the
  // test rather than assert absence.
  assert.equal(screen.queryByText('0%'), null, 'must never render an unknown rate as 0%');
});

test('a zero spend with unpriced calls is not reported as a plain $0', async () => {
  // $0 can mean "free" or "nothing was priced". costUnknownCalls distinguishes
  // them and the UI must not collapse the two.
  await renderWith(REAL_SHAPED_STATUS, REAL_SHAPED_FEED);
  assert.ok(screen.getByText('0 (3 unpriced)'));
});

test('a genuinely free run reports a plain $0, with no unpriced caveat', async () => {
  const free = { ...REAL_SHAPED_FEED, usage: { totalCostUsd: 0, costUnknownCalls: 0, byAgent: {} } };
  await renderWith(REAL_SHAPED_STATUS, free);
  assert.ok(screen.getByText('$0.0000'));
  assert.equal(screen.queryByText(/unpriced/), null, 'a truly free run must not claim unpriced calls');
});

test('empty activity renders an explicit message, not a blank panel', async () => {
  const empty = {
    ...REAL_SHAPED_FEED,
    skills: { sampleSize: 0, failureCount: 0, errorRate: null, recent: [] },
    workflows: { failureCount: 0, recent: [] },
  };
  await renderWith(REAL_SHAPED_STATUS, empty);
  assert.ok(screen.getByText('No skill activity recorded yet.'));
  assert.ok(screen.getByText('No workflow runs recorded yet.'));
});

test('a failed fetch is visibly distinct from an empty feed', async () => {
  // The critical distinction: "cannot reach the runtime" and "nothing has
  // happened yet" are different facts and must not look alike.
  await renderWith(REAL_SHAPED_STATUS, REAL_SHAPED_FEED, { feedOk: false });
  await waitFor(() => screen.getByRole('status'));
  assert.ok(screen.getByText(/Can't reach the runtime/));
});

test('surfaces the feed own documented measurement gaps rather than hiding them', async () => {
  await renderWith(REAL_SHAPED_STATUS, REAL_SHAPED_FEED);
  assert.ok(screen.getByText('What this feed does not track'));
  assert.ok(screen.getByText(/not tracked today/));
});

test('renders an agent list with no samples without inventing rows', async () => {
  const noAgents = { ...REAL_SHAPED_STATUS, status: { agentCount: 0, agents: [], health: 'healthy' } };
  await renderWith(noAgents, REAL_SHAPED_FEED);
  assert.ok(screen.getByText('No agents reported yet.'));
});