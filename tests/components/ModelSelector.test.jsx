const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, cleanup, fireEvent } = require('@testing-library/react');
const ModelSelector = require('../../app/components/ModelSelector').default;

afterEach(() => {
  cleanup();
});

const SAMPLE_CATALOG = {
  claude: {
    flagship: { apiModelId: 'anthropic/claude-opus-5', name: 'Claude Opus 5', pricing: { prompt: 0.000015, completion: 0.000075 } },
    efficient: { apiModelId: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', pricing: { prompt: 0.000001, completion: 0.000005 } },
  },
  codex: {
    flagship: { apiModelId: 'openai/gpt-5.3-codex', name: 'Codex 5.3', pricing: null },
    efficient: null,
  },
  gpt: { flagship: null, efficient: null },
  gemini: { flagship: null, efficient: null },
  grok: { flagship: null, efficient: null },
};

test('an active, connected provider (OpenRouter) renders the role x tier selector grid', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: true,
      connected: true,
      catalog: SAMPLE_CATALOG,
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  assert.ok(screen.getByTestId('model-selector-active'));
  assert.ok(screen.getByText('Claude'));
  assert.ok(screen.getByText('Codex'));
  assert.ok(screen.getByText('Flagship'));
  assert.ok(screen.getByText('Efficient'));
  // Resolved-model detail for the current selection (role=claude, tier=flagship) is shown.
  assert.ok(screen.getByText('Claude Opus 5'));
  assert.ok(screen.getByText('anthropic/claude-opus-5'));
});

test('a provider with no ProviderClient yet (connected, key stored) renders "connected, not active" — never the role/tier grid', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: false,
      connected: true,
      catalog: null,
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  assert.ok(screen.getByTestId('model-selector-inactive'));
  assert.ok(screen.getByText('Connected — not yet active'));
  assert.throws(() => screen.getByTestId('model-selector-active'));
  // The role/tier chips must not render at all for an inactive provider.
  assert.throws(() => screen.getByText('Flagship'));
});

test('a provider with no key stored renders "Not connected", distinct from "connected, not active"', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: false,
      connected: false,
      catalog: null,
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  assert.ok(screen.getByText('Not connected'));
  assert.throws(() => screen.getByText('Connected — not yet active'));
});

test('hard requirement: an inactive provider never renders another provider\'s catalog data under its own label, even if a catalog is (incorrectly) passed in', () => {
  // Simulates the exact bug the scoping doc calls out: caller accidentally
  // hands an inactive (non-OpenRouter) provider tile OpenRouter's resolved
  // catalog. The component must refuse to render it regardless.
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: false,
      connected: true,
      catalog: SAMPLE_CATALOG, // should be structurally ignored because active=false
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  assert.throws(() => screen.getByText('Claude Opus 5'), 'must never leak OpenRouter model data onto an inactive provider tile');
  assert.throws(() => screen.getByText('anthropic/claude-opus-5'));
  assert.ok(screen.getByText('Connected — not yet active'));
});

test('clicking a resolved role chip calls onChange with that role and the current tier', () => {
  let received = null;
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: true,
      connected: true,
      catalog: SAMPLE_CATALOG,
      value: { role: 'claude', tier: 'flagship' },
      onChange: next => { received = next; },
    })
  );

  fireEvent.click(screen.getByText('Codex'));
  assert.deepEqual(received, { role: 'codex', tier: 'flagship' });
});

test('an unresolved role (no flagship or efficient entry in the catalog) renders disabled and cannot be selected', () => {
  let called = false;
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: true,
      connected: true,
      catalog: SAMPLE_CATALOG, // gpt/gemini/grok are unresolved in SAMPLE_CATALOG
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => { called = true; },
    })
  );

  const gptChip = screen.getByText('GPT');
  assert.equal(gptChip.disabled, true);
  fireEvent.click(gptChip);
  assert.equal(called, false, 'clicking a disabled chip must not fire onChange');
});

test('clicking a tier chip calls onChange with the current role and the new tier', () => {
  let received = null;
  render(
    React.createElement(ModelSelector, {
      mode: 'compact',
      active: true,
      connected: true,
      catalog: SAMPLE_CATALOG,
      value: { role: 'claude', tier: 'flagship' },
      onChange: next => { received = next; },
    })
  );

  fireEvent.click(screen.getByText('Efficient'));
  assert.deepEqual(received, { role: 'claude', tier: 'efficient' });
});

test('compact mode does not render the expanded per-role resolved-model detail panel', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'compact',
      active: true,
      connected: true,
      catalog: SAMPLE_CATALOG,
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  assert.throws(() => screen.getByText('anthropic/claude-opus-5'), 'compact mode is for the chat input row — no detail panel');
});
