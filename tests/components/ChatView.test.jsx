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

// Issue #88: token usage metadata was reported as reading like it was
// concatenated into the message body. Prior investigation (and this test)
// confirm the API response and the render tree never actually concatenate
// it -- .chat-usage is a real DOM-separate sibling of .chat-text, not a
// child of it and not part of the message string. This is the first test
// to actually exercise that render path: every prior test in this file
// passes usage: {} (no promptTokens), which never satisfies the render
// guard, so .chat-usage never previously rendered in any test.
test('token usage metadata renders as a sibling DOM node of .chat-text, never nested inside the message body', async () => {
  await withFetch(
    async () => ({
      json: async () => ({
        status: 'ok',
        agentName: 'CEO Agent',
        usage: { promptTokens: 2791, completionTokens: 1024 },
        text: 'Here is the analysis you asked for.',
      }),
    }),
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      await sendMessage('give me the analysis');

      await waitFor(() => assert.ok(screen.getByText('2791 prompt · 1024 completion')));
      const usageEl = screen.getByText('2791 prompt · 1024 completion');
      assert.equal(usageEl.className, 'chat-usage');

      const bubble = usageEl.closest('.chat-bubble');
      assert.ok(bubble, 'usage metadata must live inside the same message bubble as the text it describes');
      const textEl = bubble.querySelector('.chat-text');
      assert.ok(textEl, 'the bubble must still have a real .chat-text node');

      // The real assertion: usage is a sibling of .chat-text, not a
      // descendant of it -- and the message text itself never contains the
      // token-count string.
      assert.equal(textEl.contains(usageEl), false, '.chat-usage must not be nested inside .chat-text');
      assert.equal(usageEl.contains(textEl), false, '.chat-text must not be nested inside .chat-usage');
      assert.doesNotMatch(textEl.textContent, /2791 prompt/, 'the message text itself must never contain the usage string');
    },
  );
});

// Citation rendering: a model may emit <cite> tags unprompted (no doctrine
// instructs this format). ChatView uses react-markdown with no rehype-raw,
// so an unhandled <cite> tag would render as literal, visible tag syntax.
// lib/citations.js's sanitizeCitations() is applied before ReactMarkdown
// sees the text -- this confirms it's actually wired in, not just unit-
// tested in isolation.
test('a <cite> tag in agent text renders as clean styled text, not raw tag syntax', async () => {
  await withFetch(
    async () => ({
      json: async () => ({
        status: 'ok',
        agentName: 'CEO Agent',
        usage: {},
        text: 'The Act applies here <cite index="1">EU AI Act Article 6</cite> and elsewhere.',
      }),
    }),
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      await sendMessage('what does the act say');

      await waitFor(() => assert.ok(screen.getByText(/EU AI Act Article 6/)));
      const textEl = document.querySelector('.chat-agent .chat-text');
      assert.ok(textEl, 'agent message must render');
      assert.doesNotMatch(textEl.innerHTML, /<cite\b/i, 'raw <cite tag markup must never reach the DOM as visible text');
      assert.doesNotMatch(textEl.textContent, /<cite|<\/cite>/, 'no literal cite tag characters should be visible to the user');
      // Converted to markdown emphasis -> a real <em> element, not plain text.
      const emphasized = textEl.querySelector('em');
      assert.ok(emphasized, 'the citation content should render as a real emphasized element');
      assert.match(emphasized.textContent, /EU AI Act Article 6/);
    },
  );
});

// Hover actions: copy/edit/regenerate. jsdom does support navigator.clipboard
// once stubbed (it has no real implementation), so copy is testable here;
// the actual hover-triggered visibility (CSS :hover) is a real-browser
// concern verified separately, not something jsdom's non-rendering layout
// engine can assert -- these tests exercise the click handlers directly.
test('Copy on an agent message writes its text to the clipboard', async () => {
  const originalClipboard = global.navigator.clipboard;
  let written = null;
  global.navigator.clipboard = { writeText: async (text) => { written = text; } };
  try {
    await withFetch(
      async () => ({ json: async () => ({ status: 'ok', agentName: 'CEO Agent', usage: {}, text: 'Here is the answer.' }) }),
      async () => {
        render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
        await sendMessage('question');
        await waitFor(() => assert.ok(screen.getByText('Here is the answer.')));

        const bubble = screen.getByText('Here is the answer.').closest('.chat-bubble');
        const copyButton = Array.from(bubble.querySelectorAll('.chat-action-button')).find(b => b.textContent === 'Copy');
        assert.ok(copyButton, 'agent message must have a Copy action');
        fireEvent.click(copyButton);

        await waitFor(() => assert.equal(written, 'Here is the answer.'));
      },
    );
  } finally {
    global.navigator.clipboard = originalClipboard;
  }
});

test('Edit on a user message populates the input with that message text', async () => {
  await withFetch(
    async () => ({ json: async () => ({ status: 'ok', agentName: 'CEO Agent', usage: {}, text: 'ok' }) }),
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      await sendMessage('the original message');
      await waitFor(() => assert.ok(screen.getByText('the original message')));

      const bubble = screen.getByText('the original message').closest('.chat-bubble');
      const editButton = Array.from(bubble.querySelectorAll('.chat-action-button')).find(b => b.textContent === 'Edit');
      assert.ok(editButton, 'user message must have an Edit action');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Message your CEO Agent...');
      assert.equal(textarea.value, 'the original message');
    },
  );
});

test('Regenerate on an agent message replays the exact original request and replaces that message in place', async () => {
  let callCount = 0;
  const bodies = [];
  await withFetch(
    async (url, options) => {
      callCount += 1;
      bodies.push(JSON.parse(options.body));
      const text = callCount === 1 ? 'first answer' : 'second, regenerated answer';
      return { json: async () => ({ status: 'ok', agentName: 'CEO Agent', usage: {}, text }) };
    },
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      await sendMessage('the question');
      await waitFor(() => assert.ok(screen.getByText('first answer')));

      const bubble = screen.getByText('first answer').closest('.chat-bubble');
      const regenButton = Array.from(bubble.querySelectorAll('.chat-action-button')).find(b => b.textContent === 'Regenerate');
      assert.ok(regenButton, 'agent message must have a Regenerate action');
      fireEvent.click(regenButton);

      await waitFor(() => assert.ok(screen.getByText('second, regenerated answer')));
      // Same message replaced in place, not appended -- only one agent bubble.
      assert.equal(document.querySelectorAll('.chat-agent').length, 1);
      assert.throws(() => screen.getByText('first answer'));
      assert.equal(callCount, 2);
      assert.deepEqual(bodies[0], bodies[1], 'regenerate must replay the exact same request body as the original send');
    },
  );
});

// Auto-resize textarea: the compose input is now a real <textarea>, not a
// single-line <input>. jsdom's layout engine always reports scrollHeight
// as 0 (a well-known jsdom limitation -- see the markdown-table test above
// for the same caveat applied to CSS), so the actual pixel-growth behavior
// cannot be meaningfully asserted here and was verified in a real browser
// (PR description, not this file). What IS real and testable in jsdom:
// this is a genuine multi-line-capable <textarea>, and Shift+Enter inserts
// a newline instead of sending (a plain Enter still sends, unchanged from
// the existing IME-guard tests above).
test('the chat input is a real textarea, and Shift+Enter does not send', async () => {
  let fetchCalled = false;
  await withFetch(
    async () => { fetchCalled = true; return { json: async () => ({ status: 'ok', text: 'unexpected', agentName: 'CEO Agent', usage: {} }) }; },
    async () => {
      render(React.createElement(ChatView, { config: MINIMAL_CONFIG }));
      const textarea = screen.getByPlaceholderText('Message your CEO Agent...');
      assert.equal(textarea.tagName, 'TEXTAREA', 'chat input must be a real textarea, not a single-line input');

      fireEvent.change(textarea, { target: { value: 'line one' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(fetchCalled, false, 'Shift+Enter must not trigger send()');
    },
  );
});
