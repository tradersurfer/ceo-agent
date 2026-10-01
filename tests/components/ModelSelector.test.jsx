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
    cheapest: { apiModelId: 'anthropic/claude-value-tier', name: 'Claude Value Tier', pricing: { prompt: 0.0000003, completion: 0.0000015 } },
  },
  codex: {
    flagship: { apiModelId: 'openai/gpt-5.3-codex', name: 'Codex 5.3', pricing: null },
    efficient: null,
    cheapest: null,
  },
  gpt: { flagship: null, efficient: null, cheapest: null },
  gemini: { flagship: null, efficient: null, cheapest: null },
  grok: { flagship: null, efficient: null, cheapest: null },
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
  assert.ok(screen.getByText('Affordable'));
  // Resolved-model detail for the current selection (role=claude, tier=flagship) is shown.
  assert.ok(screen.getByText('Claude Opus 5'));
  assert.ok(screen.getByText('anthropic/claude-opus-5'));
});

test('the "Affordable" chip is selectable and switches the resolved detail to the pickCheapest()-resolved model (BYNGE §5 decision (b))', () => {
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

  const affordableChip = screen.getByText('Affordable');
  assert.equal(affordableChip.disabled, false, 'claude has a resolved cheapest entry, so Affordable must be selectable');
  fireEvent.click(affordableChip);
  assert.deepEqual(received, { role: 'claude', tier: 'cheapest' }, 'selecting Affordable must resolve to the "cheapest" tier key, not silently fall through to efficient');
});

test('selecting the "cheapest" tier shows the actual pickCheapest()-resolved model, distinct from the efficient pick', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: true,
      connected: true,
      catalog: SAMPLE_CATALOG,
      value: { role: 'claude', tier: 'cheapest' },
      onChange: () => {},
    })
  );

  assert.ok(screen.getByText('Claude Value Tier'));
  assert.ok(screen.getByText('anthropic/claude-value-tier'));
  assert.throws(() => screen.getByText('Claude Haiku 4.5'), 'the cheapest-tier detail must show the cheapest pick, not the efficient one');
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

// --- BYNGE Phase 2: active-but-no-catalog state (e.g. Anthropic direct
// dispatch) — must be distinct from both the full grid and the inactive
// state, and must never render OpenRouter's catalog data. ---------------

test('an active provider with no catalog (e.g. direct Anthropic dispatch) renders "direct calls enabled", never the role/tier grid', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: true,
      connected: true,
      catalog: null,
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  assert.ok(screen.getByTestId('model-selector-direct'));
  assert.ok(screen.getByText('Connected — direct calls enabled'));
  assert.throws(() => screen.getByTestId('model-selector-active'));
  assert.throws(() => screen.getByTestId('model-selector-inactive'));
  // No role/tier chips — there's nothing catalog-backed to pick for this provider yet.
  assert.throws(() => screen.getByText('Flagship'));
  assert.throws(() => screen.getByText('Claude'));
});

test('compact mode\'s "direct calls enabled" state has no expanded hint paragraph', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'compact',
      active: true,
      connected: true,
      catalog: null,
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  assert.ok(screen.getByTestId('model-selector-direct'));
  assert.throws(() => screen.getByText(/There's no separate model catalog/));
});

// --- Real bug found via actual mobile screenshots: Anthropic/OpenAI cards
// showed "Not connected" in ConnectionsView's header badge (gated on
// `connected`/hasKey) while this component's OWN status text, one line
// below, claimed "Connected — direct calls enabled" for the same card
// (gated on `active` alone, true for these providers regardless of
// whether a key was ever saved). `active: true, connected: false` was
// never covered by any prior test -- exactly the gap that let it ship. ---

test('BUG: an active provider with NO key stored must say "Not connected", never "direct calls enabled"', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: true,
      connected: false,
      catalog: null,
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  assert.ok(screen.getByText('Not connected'), 'must say the same "Not connected" ConnectionsView\'s header badge says for hasKey=false');
  assert.throws(
    () => screen.getByText('Connected — direct calls enabled'),
    'must never claim calls are enabled when no key is stored -- there is nothing to call with',
  );
  assert.throws(() => screen.getByTestId('model-selector-direct'));
  assert.equal(screen.getByTestId('model-selector-inactive').getAttribute('data-testid'), 'model-selector-inactive');
});

test('an active provider with no key stored still gets a distinct expanded hint from a fully inactive provider', () => {
  render(
    React.createElement(ModelSelector, {
      mode: 'expanded',
      active: true,
      connected: false,
      catalog: null,
      value: { role: 'claude', tier: 'flagship' },
      onChange: () => {},
    })
  );

  // Distinct copy from the plain "!active" hint below -- a real
  // ProviderClient already exists for this provider, so the promise is
  // stronger ("will work as soon as you add a key") than the generic
  // "stores a connection" hint an unbuilt provider gets.
  assert.ok(screen.getByText('Add an API key above to enable direct calls through this provider.'));
});

test('an inactive, unconnected provider keeps its original, more generic hint', () => {
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

  assert.ok(screen.getByText('Add an API key above to store a connection for this provider.'));
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

  // --- Compact resolution strip (added Sep 30, 2026) ----------------------
  // Compact mode showed WHICH role and WHICH tier but never WHICH model, which
  // is the thing a user actually picks on. The strip renders it inline, without
  // widening compact mode's "no detail panel" contract into a panel.

  test('compact mode shows which model the current role and tier actually resolved to', () => {
    const { container } = render(
      React.createElement(ModelSelector, {
        mode: 'compact',
        active: true,
        connected: true,
        catalog: SAMPLE_CATALOG,
        value: { role: 'claude', tier: 'flagship' },
        onChange: () => {},
      })
    );

    const strip = container.querySelector('.model-selector-resolved');
    assert.ok(strip, 'compact mode must name the resolved model, not just the role/tier');
    assert.ok(strip.textContent.includes('anthropic/claude-opus-5'));
  });

  test('the compact resolution strip scales per-token catalog pricing to a per-million figure', () => {
    // SAMPLE_CATALOG prices flagship at 0.000015 PER TOKEN. Rendered raw that is
    // "$0.00/M in" -- a number that looks like a real price and is silently wrong,
    // which is worse than showing no price at all. This is the regression guard.
    const { container } = render(
      React.createElement(ModelSelector, {
        mode: 'compact',
        active: true,
        connected: true,
        catalog: SAMPLE_CATALOG,
        value: { role: 'claude', tier: 'flagship' },
        onChange: () => {},
      })
    );

    const text = container.querySelector('.model-selector-resolved').textContent;
    assert.ok(text.includes('$15.00/M in'), 'expected 0.000015/token scaled to $15.00/M, got: ' + text);
    assert.ok(!text.includes('$0.00'), 'a zero price must never be rendered as a real number');
  });

  test('a cheap-enough tier that would round to $0.00 shows its real magnitude instead', () => {
    const cheap = {
      claude: { flagship: { apiModelId: 'anthropic/claude-lite', pricing: { prompt: 0.0000003 } } },
    };
    const { container } = render(
      React.createElement(ModelSelector, {
        mode: 'compact',
        active: true,
        connected: true,
        catalog: cheap,
        value: { role: 'claude', tier: 'flagship' },
        onChange: () => {},
      })
    );

    const text = container.querySelector('.model-selector-resolved').textContent;
    assert.ok(text.includes('$0.30/M in'), 'expected 0.0000003/token as $0.30/M, got: ' + text);
  });

  test('an explicitly-null prompt price renders as free, not as a missing value', () => {
    // The free roster is the real case: pricing.prompt is null because there IS
    // no price. Silently dropping the fact would read as "unknown", which for a
    // free model is the wrong answer to the question the user is asking.
    const freeCatalog = {
      free: { flagship: { apiModelId: 'inclusionai/ling-3.0-flash-sante:free', pricing: null } },
    };
    const { container } = render(
      React.createElement(ModelSelector, {
        mode: 'compact',
        active: true,
        connected: true,
        catalog: freeCatalog,
        value: { role: 'free', tier: 'flagship' },
        onChange: () => {},
      })
    );

    const text = container.querySelector('.model-selector-resolved').textContent;
    assert.ok(text.includes('inclusionai/ling-3.0-flash-sante:free'), text);
    assert.ok(text.includes('free'), 'a null price means free, not unknown: ' + text);
  });

  test('context length renders compactly when the resolver supplies it', () => {
    const withContext = {
      claude: { flagship: { apiModelId: 'anthropic/claude-opus-5', contextLength: 200000 } },
    };
    const { container } = render(
      React.createElement(ModelSelector, {
        mode: 'compact',
        active: true,
        connected: true,
        catalog: withContext,
        value: { role: 'claude', tier: 'flagship' },
        onChange: () => {},
      })
    );

    assert.ok(container.querySelector('.model-selector-resolved').textContent.includes('200k'));
  });

  test('expanded mode keeps its detail panel and does not also render the compact strip', () => {
    const { container } = render(
      React.createElement(ModelSelector, {
        mode: 'expanded',
        active: true,
        connected: true,
        catalog: SAMPLE_CATALOG,
        value: { role: 'claude', tier: 'flagship' },
        onChange: () => {},
      })
    );

    assert.ok(container.querySelector('.model-selector-detail'), 'expanded keeps its panel');
    assert.equal(container.querySelector('.model-selector-resolved'), null, 'expanded must not double-render the strip');
  });

  test('an unresolved role renders no strip rather than a placeholder', () => {
    const { container } = render(
      React.createElement(ModelSelector, {
        mode: 'compact',
        active: true,
        connected: true,
        catalog: SAMPLE_CATALOG,
        value: { role: 'gpt', tier: 'flagship' },  // gpt is all-null in the sample
        onChange: () => {},
      })
    );

    assert.equal(container.querySelector('.model-selector-resolved'), null);
  });