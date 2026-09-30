const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, fireEvent, waitFor, act } = require('@testing-library/react');
const ConnectionsView = require('../../app/components/ConnectionsView').default;

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

const CONFIG = {
  costMode: 'flagship',
  providers: [
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'google', label: 'Google AI Studio' },
    { id: 'xai', label: 'xAI' },
  ],
  connections: {
    openrouter: { hasKey: true, keyMasked: 'sk-or-v••••••••-1234', active: true },
    anthropic: { hasKey: false, keyMasked: null, active: true },
    openai: { hasKey: false, keyMasked: null, active: true },
    google: { hasKey: false, keyMasked: null, active: true },
    xai: { hasKey: false, keyMasked: null, active: true },
  },
  catalog: null,
};

/** The password input for a given provider card, in render order. */
function keyInputFor(label) {
  const card = screen.getByText(label).closest('.connection-card');
  return card.querySelector('input[type="password"]');
}

function saveButtonFor(label) {
  const card = screen.getByText(label).closest('.connection-card');
  return Array.from(card.querySelectorAll('button')).find(b => /save key/i.test(b.textContent));
}

// The click's `act` wrapper matters: saveKey() awaits a fetch and then calls
// several setState functions. Without act(), those async updates land outside
// React's batching window and React logs "an update was not wrapped in
// act(...)" — a warning this suite has zero tolerance for, since it hides
// real update bugs. act() both silences it and correctly flushes the updates
// before the assertions below run.
async function submitKey(label, value) {
  const input = keyInputFor(label);
  const button = saveButtonFor(label);
  fireEvent.change(input, { target: { value } });
  await act(async () => {
    fireEvent.click(button);
  });
}

test('a rejected key shows the server\'s specific reason, not a generic "Save failed."', async () => {
  await withFetch(
    async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'That openrouter API key was rejected by openrouter. Check that you pasted the full key from the provider\'s dashboard.',
        errorCode: 'invalid',
        provider: 'openrouter',
        saved: false,
      }),
    }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
      await submitKey('Anthropic', 'sk-ant-api03-not-a-real-key');
      await waitFor(() => assert.ok(screen.getByTestId('connection-error-anthropic')));
      assert.match(screen.getByTestId('connection-error-anthropic').textContent, /rejected by openrouter/);
    }
  );
});

test('a wrong-provider key shows the "paste it in the X field instead" guidance', async () => {
  await withFetch(
    async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'That looks like a OpenRouter key, not a OpenAI key. Paste it in the OpenRouter field instead.',
        errorCode: 'invalid',
        saved: false,
      }),
    }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
      await submitKey('OpenAI', 'sk-or-v1-abc');
      await waitFor(() => assert.ok(screen.getByTestId('connection-error-openai')));
      assert.match(screen.getByTestId('connection-error-openai').textContent, /Paste it in the OpenRouter field instead/);
    }
  );
});

test('a rejected key is NOT cleared from the field, so the user can correct it', async () => {
  await withFetch(
    async () => ({ ok: false, status: 400, json: async () => ({ error: 'rejected', errorCode: 'invalid' }) }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
      await submitKey('xAI', 'xai-not-valid');
      await waitFor(() => assert.ok(screen.getByTestId('connection-error-xai')));
      assert.equal(keyInputFor('xAI').value, 'xai-not-valid', 'a rejected key must stay in the box to be fixed');
    }
  );
});

test('a successful save clears the field, shows "Saved.", and calls onSaved', async () => {
  let saved = 0;
  await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ configured: true }) }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => { saved += 1; } }));
      await submitKey('xAI', 'xai-'.padEnd(30, 'a'));
      await waitFor(() => assert.ok(screen.getByText('Saved.')));
      assert.equal(keyInputFor('xAI').value, '', 'a verified key must be cleared from the field');
      assert.equal(saved, 1, 'onSaved must fire so the page refreshes connection state');
    }
  );
});

test('the error is cleared when the user starts retyping', async () => {
  await withFetch(
    async () => ({ ok: false, status: 400, json: async () => ({ error: 'rejected by provider', errorCode: 'invalid' }) }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
      await submitKey('Google AI Studio', 'AIzaBogus');
      await waitFor(() => assert.ok(screen.getByTestId('connection-error-google')));
      fireEvent.change(keyInputFor('Google AI Studio'), { target: { value: 'AIzaSomethingElse' } });
      assert.equal(screen.queryByTestId('connection-error-google'), null, 'stale error must not linger while retyping');
    }
  );
});

test('a 502 "could not confirm" response reassures that the stored key was not changed', async () => {
  await withFetch(
    async () => ({
      ok: false,
      status: 502,
      json: async () => ({
        error: 'Could not reach the provider to verify this key. Check your connection and try again — your existing key was not changed.',
        errorCode: 'network',
        saved: false,
      }),
    }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
      await submitKey('OpenRouter', 'sk-or-v1-'.padEnd(40, 'b'));
      await waitFor(() => assert.ok(screen.getByTestId('connection-error-openrouter')));
      assert.match(screen.getByTestId('connection-error-openrouter').textContent, /not changed/i);
    }
  );
});

test('a network failure reaching our own server shows a message instead of a bare "Save failed."', async () => {
  await withFetch(
    async () => { throw new TypeError('Failed to fetch'); },
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
      await submitKey('Anthropic', 'sk-ant-api03-abc');
      await waitFor(() => assert.ok(screen.getByTestId('connection-error-anthropic')));
      assert.match(screen.getByTestId('connection-error-anthropic').textContent, /Could not reach the server/i);
    }
  );
});

test('a non-JSON error body falls back to a generic message rather than crashing', async () => {
  await withFetch(
    async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
      await submitKey('xAI', 'xai-abc');
      await waitFor(() => assert.ok(screen.getByTestId('connection-error-xai')));
      assert.match(screen.getByTestId('connection-error-xai').textContent, /Save failed/i);
    }
  );
});

test('the error is rendered with role="alert" so a screen reader announces it', async () => {
  await withFetch(
    async () => ({ ok: false, status: 400, json: async () => ({ error: 'rejected by provider', errorCode: 'invalid' }) }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
      await submitKey('Anthropic', 'sk-ant-api03-abc');
      await waitFor(() => assert.ok(screen.getByTestId('connection-error-anthropic')));
      assert.equal(screen.getByTestId('connection-error-anthropic').getAttribute('role'), 'alert');
    }
  );
});

test('the Save button shows it is checking, not blindly saving', async () => {
  // This test deliberately leaves the fetch PENDING to observe the
  // in-flight label, so it cannot use submitKey()'s awaiting act() — that
  // would wait forever on a promise that only resolves later in the test.
  // It clicks bare and then resolves the deferred by hand.
  let resolveFetch;
  await withFetch(
    () => new Promise(resolve => { resolveFetch = resolve; }),
    async () => {
      render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));

      const input = keyInputFor('OpenRouter');
      const button = saveButtonFor('OpenRouter');
      fireEvent.change(input, { target: { value: 'sk-or-v1-abc' } });
      fireEvent.click(button);

      // The label flips synchronously on click, before the fetch resolves.
      assert.ok(screen.getByText('Checking…'), 'the button must say it is checking, not just "Saving…"');

      await act(async () => {
        resolveFetch({ ok: true, status: 200, json: async () => ({}) });
      });
      await waitFor(() => assert.equal(screen.queryByText('Checking…'), null));
      assert.ok(screen.getByText('Saved.'), 'the pending save must complete normally once resolved');
    }
  );
});

test('an empty field keeps the Save button disabled', async () => {
  await withFetch(async () => ({ ok: true, json: async () => ({}) }), async () => {
    render(React.createElement(ConnectionsView, { config: CONFIG, onSaved: () => {} }));
    assert.equal(saveButtonFor('Anthropic').disabled, true);
    fireEvent.change(keyInputFor('Anthropic'), { target: { value: '   ' } });
    assert.equal(saveButtonFor('Anthropic').disabled, true, 'whitespace alone must not enable saving');
  });
});
