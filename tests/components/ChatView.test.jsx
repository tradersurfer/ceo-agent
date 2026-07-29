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

// Issue #87: an Enter keystroke that confirms an IME composition also fires
// a native/synthetic 'Enter' keydown. Treating that as a send trigger races
// the composition-confirming update against the controlled input's value,
// which can send a garbled/partial value instead of the finished text (the
// real-world symptom: a corrupted "drafdra"-style bubble). These tests
// confirm the fix: Enter during an active composition must not send.
test('Enter during an active IME composition (isComposing: true) does not send', async () => {
  let fetchCalled = false;
  await withFetch(
    async () => { fetchCalled = true; return { json: async () => ({ status: 'ok', text: 'unexpected', agentName: 'CEO Agent', usage: {} }) }; },
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      const input = screen.getByPlaceholderText('Message your CEO Agent...');

      // Simulate a real composition sequence: compositionstart -> the input
      // changes mid-composition (the browser's in-progress candidate text,
      // not the user's finished intent) -> Enter fires WHILE still
      // composing (isComposing: true) to confirm the candidate, not to send.
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'draf' } });
      fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });

      // Give any (incorrect) async send a tick to fire, then assert it didn't.
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(fetchCalled, false, 'Enter during active composition must not trigger send()');
      assert.equal(input.value, 'draf', 'input value must be unchanged by the composition-confirming Enter');
    },
  );
});

test('after composition ends, Enter sends the real finished value, not the mid-composition draft', async () => {
  let sentBody = null;
  await withFetch(
    async (url, options) => {
      sentBody = JSON.parse(options.body);
      return { json: async () => ({ status: 'ok', text: 'ok', agentName: 'CEO Agent', usage: {} }) };
    },
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      const input = screen.getByPlaceholderText('Message your CEO Agent...');

      // Full sequence: compositionstart -> in-progress candidate text ->
      // Enter confirms the composition (isComposing still true at this
      // point per the spec) -> compositionend -> the input settles to its
      // real final value -> a genuine, non-composing Enter actually sends.
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'draf' } });
      fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
      fireEvent.compositionEnd(input);
      fireEvent.change(input, { target: { value: 'draft complete' } });
      fireEvent.keyDown(input, { key: 'Enter', isComposing: false });

      await waitFor(() => assert.ok(sentBody));
      assert.equal(sentBody.message, 'draft complete', 'the send must use the real finished value, not the mid-composition draft');
    },
  );
});

test('a plain Enter with no composition in play still sends normally (no regression)', async () => {
  let sentBody = null;
  await withFetch(
    async (url, options) => {
      sentBody = JSON.parse(options.body);
      return { json: async () => ({ status: 'ok', text: 'ok', agentName: 'CEO Agent', usage: {} }) };
    },
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      const input = screen.getByPlaceholderText('Message your CEO Agent...');
      fireEvent.change(input, { target: { value: 'hello' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => assert.ok(sentBody));
      assert.equal(sentBody.message, 'hello');
    },
  );
});

test('Enter with only the keyCode-229 signal (isComposing unset/unreliable) is still treated as composition and does not send', async () => {
  // Some browsers/IMEs don't set isComposing reliably on the keydown event —
  // keyCode 229 is the long-standing fallback signal. This test isolates
  // that path specifically (isComposing NOT set), proving the fallback
  // alone is sufficient to suppress the send, not just isComposing.
  let fetchCalled = false;
  await withFetch(
    async () => { fetchCalled = true; return { json: async () => ({ status: 'ok', text: 'unexpected', agentName: 'CEO Agent', usage: {} }) }; },
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      const input = screen.getByPlaceholderText('Message your CEO Agent...');
      fireEvent.change(input, { target: { value: 'draf' } });
      fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });

      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(fetchCalled, false, 'Enter with keyCode 229 must not trigger send(), even without isComposing set');
    },
  );
});

// Issue #85: table CSS previously had only border-collapse + cell borders —
// no header distinction, no zebra striping, and a wide table would clip
// inside the fixed-width chat bubble instead of scrolling. This structural
// check confirms remark-gfm's real output (<thead>/<th>, <tbody>/<tr>) is
// what actually renders, so the CSS selectors (.chat-agent .chat-text th,
// tbody tr:nth-child(even) td) have real elements to target. jsdom doesn't
// paint CSS, so the actual visual result (header background/weight, zebra
// tint, horizontal scroll on a wide table) was verified manually in a real
// browser — see the PR description, not this test file, for that evidence.
test('an agent message with a markdown table renders real thead/th and tbody/tr elements for the header/zebra-stripe CSS to target', async () => {
  await withFetch(
    async () => ({
      json: async () => ({
        status: 'ok',
        agentName: 'CEO Agent',
        usage: {},
        text: '| Metric | Q1 | Q2 |\n|---|---|---|\n| Revenue | 100 | 120 |\n| Cost | 40 | 45 |\n',
      }),
    }),
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      await sendMessage('show the quarterly table');

      await waitFor(() => assert.ok(screen.getByText('Revenue')));
      const table = document.querySelector('.chat-agent .chat-text table');
      assert.ok(table, 'a real <table> must render inside the agent message bubble');
      assert.ok(table.querySelector('thead th'), 'header cells must be real <th> elements inside <thead>, for the header CSS rule to target');
      const bodyRows = table.querySelectorAll('tbody tr');
      assert.equal(bodyRows.length, 2, 'both data rows must render inside <tbody>, for the :nth-child zebra-stripe CSS rule to target');
    },
  );
});
