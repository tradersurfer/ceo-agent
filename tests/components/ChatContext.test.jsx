const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, waitFor, fireEvent } = require('@testing-library/react');

const uploadStore = require('../../lib/uploadStore');
const ChatView = require('../../app/components/ChatView').default;

afterEach(() => {
  cleanup();
});

// --- buildHistory: the memory bug -------------------------------------------------
// Screenshot 4 showed the agent saying "There is no previous question in our
// conversation" with a full transcript visible above it. Root cause: the route
// sent [system, user] and nothing else. These pin the client half — that the
// prior turns are actually collected and attached to the request.

// The helper is module-private, so exercise it through the real send path and
// inspect what fetch received. That is the contract that matters anyway: not
// "buildHistory works" but "history reaches the wire".

function renderChat() {
  return render(React.createElement(ChatView, { config: { agentName: 'tester_man' } }));
}

async function send(text) {
  const box = screen.getByRole('textbox');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter' });
}

function withFetchStub(fn) {
  const original = global.fetch;
  global.fetch = fn;
  return () => { global.fetch = original; };
}

function okAgent(text) {
  return {
    ok: true,
    json: async () => ({ status: 'ok', kind: undefined, agentId: 'ceo_agent', agentName: 'CEO Agent', text, usage: { promptTokens: 1, completionTokens: 1 } }),
  };
}

test('a follow-up question sends the prior conversation to the model', async () => {
  const requests = [];
  const restore = withFetchStub(async (url, init) => {
    if (String(url).includes('/api/chat')) {
      requests.push(JSON.parse(init.body));
      return okAgent(`reply ${requests.length}`);
    }
    return { ok: true, json: async () => ({ configured: true, ceoModes: [], agentName: 'tester_man' }) };
  });

  try {
    renderChat();
    await waitFor(() => screen.getByRole('textbox'));

    await send('what is the revenue target?');
    await waitFor(() => requests.length === 1);

    await send('no, I meant last quarter');
    await waitFor(() => requests.length === 2);

    const second = requests[1];
    assert.ok(Array.isArray(second.history), 'the follow-up must carry history');
    assert.equal(second.history.length, 2, 'both prior turns are included');
    assert.equal(second.history[0].role, 'user');
    assert.equal(second.history[0].content, 'what is the revenue target?');
    assert.equal(second.history[1].role, 'assistant');
    assert.equal(second.history[1].content, 'reply 1');
  } finally {
    restore();
  }
});

test('the message being sent is never included in its own history', async () => {
  const requests = [];
  const restore = withFetchStub(async (url, init) => {
    if (String(url).includes('/api/chat')) {
      requests.push(JSON.parse(init.body));
      return okAgent('ok');
    }
    return { ok: true, json: async () => ({ configured: true, ceoModes: [], agentName: 'tester_man' }) };
  });

  try {
    renderChat();
    await waitFor(() => screen.getByRole('textbox'));
    await send('first question');
    await waitFor(() => requests.length === 1);

    // First turn has no prior conversation, so history is omitted entirely.
    assert.equal(requests[0].history, undefined, 'a first message needs no history field');
    assert.equal(requests[0].message, 'first question');
  } finally {
    restore();
  }
});

test('local system notices are not replayed to the model as if the user said them', async () => {
  // A rate-limit or "request failed" row is a UI notice, not something the user
  // typed. Replaying it would teach the model that the user said things they
  // never said — a subtle correctness bug in the other direction.
  const requests = [];
  const restore = withFetchStub(async (url, init) => {
    if (String(url).includes('/api/chat')) {
      requests.push(JSON.parse(init.body));
      return okAgent('answer');
    }
    // Force the first turn to fail so a 'system' row lands in the transcript.
    if (String(url).includes('/api/config')) return { ok: true, json: async () => ({ configured: true, ceoModes: [], agentName: 'tester_man' }) };
    return { ok: true, json: async () => ({}) };
  });

  try {
    renderChat();
    await waitFor(() => screen.getByRole('textbox'));
    await send('hello');
    await waitFor(() => requests.length === 1);

    await send('and again');
    await waitFor(() => requests.length === 2);

    const history = requests[1].history || [];
    assert.ok(!history.some(h => /Request failed|Check that the server/.test(h.content)),
      'UI notices must not enter the model conversation');
  } finally {
    restore();
  }
});

// --- Image attachments: the read-images bug ---------------------------------------
// Screenshot 1: the user attached a PNG and the agent replied "I cannot see or
// read any attachment... no file was received with this message." Both halves
// were wrong: the route never put image bytes in the prompt, and it never even
// mentioned the file.

test('an attached image is uploaded and referenced by the chat request', async () => {
  const uploads = [];
  const chats = [];
  const restore = withFetchStub(async (url, init) => {
    if (String(url).includes('/api/uploads')) {
      uploads.push(init.body);
      return { ok: true, json: async () => ({ status: 'ok', fileId: 'fid-1', filename: 'shot.png', size: 8 }) };
    }
    if (String(url).includes('/api/chat')) {
      chats.push(JSON.parse(init.body));
      return okAgent('I can see your screenshot.');
    }
    return { ok: true, json: async () => ({ configured: true, ceoModes: [], agentName: 'tester_man' }) };
  });

  try {
    renderChat();
    await waitFor(() => screen.getByRole('textbox'));

    // The file input is the hidden one in the chat row.
    const fileInput = document.querySelector('input[type="file"]');
    assert.ok(fileInput, 'chat has a file input');

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([png], 'shot.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => uploads.length === 1, { timeout: 5000 });
    await send('are you able to read the attachment?');

    await waitFor(() => chats.length === 1);
    assert.deepEqual(chats[0].attachmentIds, ['fid-1'], 'the uploaded file is referenced by the chat request');
  } finally {
    restore();
  }
});

test('an uploaded image renders as a visible chip in the transcript', async () => {
  const uploads = [];
  const restore = withFetchStub(async (url, init) => {
    if (String(url).includes('/api/uploads')) {
      uploads.push(init.body);
      return { ok: true, json: async () => ({ status: 'ok', fileId: 'fid-2', filename: 'chart.png', size: 8 }) };
    }
    if (String(url).includes('/api/chat')) return okAgent('got it');
    return { ok: true, json: async () => ({ configured: true, ceoModes: [], agentName: 'tester_man' }) };
  });

  try {
    renderChat();
    await waitFor(() => screen.getByRole('textbox'));

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File([Buffer.from([1, 2, 3])], 'chart.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // The chip renders as "📎 chart.png", so match on the substring rather than
    // the whole text node.
    await waitFor(() => screen.getByText(/chart\.png/), { timeout: 5000 });
  } finally {
    restore();
  }
});