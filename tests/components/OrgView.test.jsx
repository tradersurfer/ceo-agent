const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, waitFor } = require('@testing-library/react');
const OrgView = require('../../app/components/OrgView').default;

afterEach(() => {
  cleanup();
});

// OrgView fetches /api/org (department structure) and /api/activity (live
// working overlay) independently -- branch the fetch mock on the URL, same
// approach ChatView.test.jsx uses for a single endpoint.
function withRoutedFetch(routes, fn) {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const route = Object.keys(routes).find(key => String(url).includes(key));
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return { json: async () => routes[route] };
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.fetch = originalFetch; });
}

const ORG_DATA = {
  configured: true,
  activeDepartments: ['finance', 'operations'],
  departments: [
    {
      department: 'finance',
      agents: [{ id: 'cfo_agent', name: 'CFO Agent', title: 'Chief Financial Officer' }],
    },
    {
      department: 'operations',
      agents: [{ id: 'coo_agent', name: 'COO Agent', title: 'Chief Operating Officer' }],
    },
  ],
};

test('renders departments and agents from /api/org, data-driven not hardcoded', async () => {
  await withRoutedFetch(
    {
      '/api/org': ORG_DATA,
      '/api/activity': { configured: true, byDepartment: {} },
    },
    async () => {
      render(React.createElement(OrgView));
      await waitFor(() => assert.ok(screen.getByText('CFO Agent')));
      assert.ok(screen.getByText('COO Agent'));
      assert.ok(screen.getByText('finance'));
      assert.ok(screen.getByText('operations'));
    },
  );
});

test('shows a live working indicator and highlight when the activity overlay reports recent activity', async () => {
  await withRoutedFetch(
    {
      '/api/org': ORG_DATA,
      '/api/activity': {
        configured: true,
        byDepartment: {
          finance: { department: 'finance', working: true, highlight: 'CFO Agent ran format_currency', lastActivity: new Date().toISOString() },
          operations: { department: 'operations', working: false, highlight: null, lastActivity: null },
        },
      },
    },
    async () => {
      render(React.createElement(OrgView));
      await waitFor(() => assert.ok(screen.getByText('active')));
      assert.ok(screen.getByText(/CFO Agent ran format_currency/));
    },
  );
});

test('renders sensibly with no activity data available yet (activity fetch not configured), no crash', async () => {
  await withRoutedFetch(
    {
      '/api/org': ORG_DATA,
      '/api/activity': { configured: false },
    },
    async () => {
      render(React.createElement(OrgView));
      await waitFor(() => assert.ok(screen.getByText('CFO Agent')));
      // No "active" badge and no highlight when the activity overlay isn't configured.
      assert.throws(() => screen.getByText('active'));
    },
  );
});

test('renders the empty-state prompt when org itself is not configured', async () => {
  await withRoutedFetch(
    {
      '/api/org': { configured: false },
      '/api/activity': { configured: false },
    },
    async () => {
      render(React.createElement(OrgView));
      await waitFor(() => assert.ok(screen.getByText('Run setup first.')));
    },
  );
});
