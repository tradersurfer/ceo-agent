const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, fireEvent, waitFor } = require('@testing-library/react');
const ChatView = require('../../app/components/ChatView').default;

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

const MINIMAL_CONFIG = {
  agentName: 'CEO Agent',
  costMode: 'flagship',
  connections: { openrouter: { hasKey: true, active: true } },
  catalog: null,
};

async function sendMessage(text) {
  const input = screen.getByPlaceholderText('Message your CEO Agent...');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByText('Send'));
}

test('a successful skill-dispatch response renders as a labeled, pretty-printed JSON bubble', async () => {
  await withFetch(
    async () => ({
      json: async () => ({ status: 'ok', kind: 'skill', skillName: 'format_currency', output: { formatted: '$42.50', amount: 42.5, currency: 'USD' } }),
    }),
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      await sendMessage('/format_currency {"amount": 42.5}');

      await waitFor(() => assert.ok(screen.getByText('skill: format_currency')));
      const output = screen.getByText(/"formatted": "\$42\.50"/);
      assert.ok(output);
      assert.equal(output.tagName, 'PRE');
    },
  );
});

test('a failed skill-dispatch response renders as a system message, not a skill bubble', async () => {
  await withFetch(
    async () => ({
      json: async () => ({ status: 'failed', kind: 'skill', skillName: 'format_currency', reason: 'input_validation', userMessage: 'amount is required.' }),
    }),
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      await sendMessage('/format_currency {}');

      await waitFor(() => assert.ok(screen.getByText('amount is required.')));
      assert.throws(() => screen.getByText('skill: format_currency'));
    },
  );
});
