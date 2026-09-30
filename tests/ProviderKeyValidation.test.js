const test = require('node:test');
const assert = require('node:assert/strict');
const {
  KEY_PREFIXES,
  VERIFIERS,
  validateKeyShape,
  verifyProviderKey,
} = require('../lib/providerKeyValidation');
const { PROVIDER_IDS } = require('../lib/providers');

// Shape-valid fixtures: real prefix + enough trailing characters to clear
// MIN_KEY_LENGTH. These are deliberately NOT real keys — the live check is
// exercised separately with an injected fetch.
const SHAPE_VALID = {
  openrouter: 'sk-or-v1-' + 'a'.repeat(64) + '-' + 'b'.repeat(64),
  anthropic: 'sk-ant-api03-' + 'c'.repeat(95),
  openai: 'sk-proj-' + 'd'.repeat(48),
  google: 'AIza' + 'e'.repeat(35),
  xai: 'xai-' + 'f'.repeat(48),
};

test('every provider id in lib/providers.js has both a prefix list and a live verifier', () => {
  // The Connections tab renders a card per PROVIDERS entry. A provider with
  // no verifier would silently accept any text again — the exact bug this
  // module exists to fix — so this is the guard that keeps the two tables
  // from drifting apart.
  for (const id of PROVIDER_IDS) {
    assert.ok(Array.isArray(KEY_PREFIXES[id]) && KEY_PREFIXES[id].length > 0, `${id} needs a key-prefix list`);
    assert.ok(VERIFIERS[id], `${id} needs a live verifier`);
    assert.ok(VERIFIERS[id].url.startsWith('https://'), `${id} verifier must use https`);
    assert.ok(typeof VERIFIERS[id].buildHeaders === 'function', `${id} verifier needs header builder`);
    assert.ok(VERIFIERS[id].invalidStatuses.length > 0, `${id} verifier needs an invalid-status set`);
  }
});

test('validateKeyShape accepts a correctly-prefixed key for every provider', () => {
  for (const id of PROVIDER_IDS) {
    const result = validateKeyShape(id, SHAPE_VALID[id]);
    assert.equal(result.ok, true, `${id} should accept its own key shape (got: ${result.error})`);
  }
});

test('validateKeyShape rejects arbitrary text — the reported bug', () => {
  for (const id of PROVIDER_IDS) {
    for (const garbage of ['hello', '12345', 'not a key', 'hunter2', 'test', 'aaaa']) {
      const result = validateKeyShape(id, garbage);
      assert.equal(result.ok, false, `${id} must reject ${JSON.stringify(garbage)}`);
      assert.ok(result.error, 'a rejection must carry a user-facing reason');
    }
  }
});

test('validateKeyShape rejects a bare prefix with nothing behind it', () => {
  // "sk-or-v1-" is 9 chars and passes the prefix test on its own; the
  // length floor is what catches it.
  const result = validateKeyShape('openrouter', 'sk-or-v1-');
  assert.equal(result.ok, false);
  assert.match(result.error, /too short/i);
});

test('validateKeyShape rejects INTERIOR whitespace but tolerates surrounding whitespace', () => {
  // Trailing newline / surrounding spaces are normal paste artifacts and
  // must be accepted — the Connections tab receives whatever a paste
  // handler hands it, including a trailing "\n".
  for (const [id, key] of Object.entries(SHAPE_VALID)) {
    assert.equal(validateKeyShape(id, `${key}\n`).ok, true, `${id} should tolerate a trailing newline`);
    assert.equal(validateKeyShape(id, `  ${key}  `).ok, true, `${id} should tolerate surrounding spaces`);
  }

  // Whitespace in the middle is always a mistake — no real key from any of
  // these providers is a broken-up token.
  const interior = [
    ['openrouter', `sk-or-v1-${'a'.repeat(60)} -${'b'.repeat(60)}`],
    ['anthropic', `sk-ant-api03-${'c'.repeat(50)} ${'c'.repeat(50)}`],
    ['google', `AIza${'e'.repeat(30)}\n${'e'.repeat(30)}`],
  ];
  for (const [id, bad] of interior) {
    const result = validateKeyShape(id, bad);
    assert.equal(result.ok, false, `must reject interior whitespace for ${id}`);
    assert.match(result.error, /spaces|line breaks/i);
  }
});

test('validateKeyShape rejects an unknown provider id', () => {
  const result = validateKeyShape('not_a_provider', 'sk-or-v1-' + 'a'.repeat(60));
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown provider/i);
});

test('validateKeyShape rejects a key pasted into the wrong provider card', () => {
  // OpenRouter key in Anthropic's field.
  let result = validateKeyShape('anthropic', SHAPE_VALID.openrouter);
  assert.equal(result.ok, false);
  assert.match(result.error, /OpenRouter key, not a Anthropic key/i);
  assert.match(result.error, /OpenRouter field/i, 'the message should say where to put it');

  // Anthropic key in xAI's field.
  result = validateKeyShape('xai', SHAPE_VALID.anthropic);
  assert.equal(result.ok, false);
  assert.match(result.error, /Anthropic key/);

  // Google key in the xAI field.
  result = validateKeyShape('xai', SHAPE_VALID.google);
  assert.equal(result.ok, false);
  assert.match(result.error, /Google AI Studio key/);
});

test('longest-match-wins: an OpenRouter key in the OpenAI card is caught, not accepted via the broad "sk-" prefix', () => {
  // This is the exact real-world case found in this repo's .env: an
  // sk-or-v1- value stored under OPENAI_API_KEY. OpenAI's accepted prefix
  // 'sk-' also matches, so an implementation that checked "does this match
  // MY prefix" first would wrongly accept it. Specificity must decide.
  const result = validateKeyShape('openai', SHAPE_VALID.openrouter);
  assert.equal(result.ok, false, 'an OpenRouter key must not be accepted as an OpenAI key');
  assert.match(result.error, /OpenRouter key, not a OpenAI key/i);
});

test('a genuine OpenAI key is still accepted — the wrong-card check must not over-reject', () => {
  // The counterweight to the test above: 'sk-proj-…' matches only the broad
  // 'sk-', so OpenRouter's 'sk-or-' prefix must not claim it.
  const result = validateKeyShape('openai', SHAPE_VALID.openai);
  assert.equal(result.ok, true, `a real OpenAI key must be accepted (got: ${result.error})`);

  // Legacy bare 'sk-…' OpenAI keys too.
  assert.equal(validateKeyShape('openai', 'sk-' + 'g'.repeat(40)).ok, true);
});

test('verifyProviderKey does not touch the network when the shape check already fails', async () => {
  let called = false;
  const result = await verifyProviderKey('openrouter', 'hello world', {
    fetchImpl: async () => { called = true; throw new Error('should not be called'); },
  });
  assert.equal(called, false, 'an obviously-bad key must be rejected without a network round-trip');
  assert.equal(result.valid, false);
  assert.equal(result.errorCode, 'invalid');
});

test('verifyProviderKey reports valid on a 200 from the provider', async () => {
  for (const id of PROVIDER_IDS) {
    const result = await verifyProviderKey(id, SHAPE_VALID[id], {
      fetchImpl: async () => ({ ok: true, status: 200 }),
    });
    assert.equal(result.valid, true, `${id} should verify as valid`);
    assert.equal(result.errorCode, null);
    assert.equal(result.error, null);
  }
});

test('verifyProviderKey sends each provider its own documented auth headers and endpoint', async () => {
  // Header/endpoint shapes must match what each sdk/*Client.js actually
  // calls, or a valid key would be rejected for a header the provider
  // never sees.
  const cases = {
    openrouter: { url: 'https://openrouter.ai/api/v1/key', header: 'Authorization', prefix: 'Bearer ' },
    anthropic: { url: 'https://api.anthropic.com/v1/models', header: 'x-api-key', prefix: '' },
    openai: { url: 'https://api.openai.com/v1/models', header: 'Authorization', prefix: 'Bearer ' },
    google: { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', header: 'x-goog-api-key', prefix: '' },
    xai: { url: 'https://api.x.ai/v1/models', header: 'Authorization', prefix: 'Bearer ' },
  };

  for (const [id, expected] of Object.entries(cases)) {
    let captured = null;
    await verifyProviderKey(id, SHAPE_VALID[id], {
      fetchImpl: async (url, init) => { captured = { url: String(url), init }; return { ok: true, status: 200 }; },
    });
    assert.equal(captured.url, expected.url, `${id} should hit its documented endpoint`);
    assert.equal(captured.init.method, 'GET', `${id} verification must be a side-effect-free GET`);
    assert.equal(captured.init.headers[expected.header], expected.prefix + SHAPE_VALID[id], `${id} auth header shape`);
  }

  // Anthropic is the one provider requiring a second header.
  let captured = null;
  await verifyProviderKey('anthropic', SHAPE_VALID.anthropic, {
    fetchImpl: async (url, init) => { captured = init; return { ok: true, status: 200 }; },
  });
  assert.equal(captured.headers['anthropic-version'], '2023-06-01', 'Anthropic requires anthropic-version');
});

test('verifyProviderKey reports a well-formed FAKE key as invalid — the whole point of the live check', async () => {
  // These pass the shape check perfectly (real prefix, real length) and are
  // still not real keys. Only the live call catches them.
  for (const id of PROVIDER_IDS) {
    const result = await verifyProviderKey(id, SHAPE_VALID[id], {
      fetchImpl: async () => ({ ok: false, status: VERIFIERS[id].invalidStatuses[0] }),
    });
    assert.equal(result.valid, false, `${id} must reject a well-formed fake`);
    assert.equal(result.errorCode, 'invalid', `${id} auth failure must be errorCode 'invalid'`);
  }
});

test('verifyProviderKey treats provider-reported 400s as invalid only for the providers that use them', async () => {
  // Google and xAI answer a bad key with 400, not 401 — confirmed live.
  // Treating 400 as invalid everywhere would be wrong; treating it as
  // valid-in-the-other-direction (accepting) would defeat the check.
  for (const id of ['google', 'xai']) {
    const result = await verifyProviderKey(id, SHAPE_VALID[id], {
      fetchImpl: async () => ({ ok: false, status: 400 }),
    });
    assert.equal(result.errorCode, 'invalid', `${id} reports bad keys as 400`);
  }

  // A 400 is a generic client error for the providers that use 401 — it
  // must not be silently read as "invalid key" for them, since their 400
  // would be a malformed request rather than an auth verdict.
  for (const id of ['openrouter', 'anthropic', 'openai']) {
    const result = await verifyProviderKey(id, SHAPE_VALID[id], {
      fetchImpl: async () => ({ ok: false, status: 400 }),
    });
    assert.equal(result.errorCode, 'server', `${id} should not treat a 400 as an auth verdict`);
  }
});

test('a network failure is NOT reported as an invalid key', async () => {
  // The critical safety property: a flaky network must never be able to
  // destroy a working key already in .env. A caller that sees a non-
  // 'invalid' errorCode must refuse the save without deleting anything.
  for (const id of PROVIDER_IDS) {
    const result = await verifyProviderKey(id, SHAPE_VALID[id], {
      fetchImpl: async () => { throw new Error('ECONNRESET / offline / DNS failure'); },
    });
    assert.equal(result.valid, false, `${id} could not be confirmed`);
    assert.equal(result.errorCode, 'network', `${id} network failure must not be 'invalid'`);
    assert.match(result.error, /not changed/i, 'the message must reassure that the stored key survived');
  }
});

test('a 429 is reported as rate_limited, not as an invalid key', async () => {
  for (const id of PROVIDER_IDS) {
    const result = await verifyProviderKey(id, SHAPE_VALID[id], {
      fetchImpl: async () => ({ ok: false, status: 429 }),
    });
    assert.equal(result.errorCode, 'rate_limited', `${id} 429 must not be an auth verdict`);
    assert.match(result.error, /not changed/i);
  }
});

test('a provider 5xx is reported as a server error, not as an invalid key', async () => {
  for (const status of [500, 502, 503]) {
    const result = await verifyProviderKey('anthropic', SHAPE_VALID.anthropic, {
      fetchImpl: async () => ({ ok: false, status }),
    });
    assert.equal(result.errorCode, 'server', `HTTP ${status} must not be an auth verdict`);
    assert.match(result.error, /not changed/i);
  }
});

test('verifyProviderKey never returns provider error text that could echo the submitted key', async () => {
  // OpenAI and xAI echo a masked form of the submitted key back in their
  // error bodies. Passing that through to the browser would leak key
  // material into the UI and logs.
  const leakyBody = 'Incorrect API key provided: sk-proj-****************************abcd. Find yours at https://platform.openai.com/account/api-keys.';
  for (const id of PROVIDER_IDS) {
    const result = await verifyProviderKey(id, SHAPE_VALID[id], {
      fetchImpl: async () => ({
        ok: false,
        status: VERIFIERS[id].invalidStatuses[0],
        json: async () => ({ error: { message: leakyBody } }),
        text: async () => leakyBody,
      }),
    });
    assert.equal(result.valid, false);
    assert.ok(!result.error.includes('sk-proj-'), `${id} must not echo provider text containing key material`);
    assert.ok(!result.error.includes('****'), `${id} must not echo the masked key`);
  }
});

test('verifyProviderKey trims surrounding whitespace before verifying', async () => {
  let sent = null;
  const result = await verifyProviderKey('openrouter', `  ${SHAPE_VALID.openrouter}\n`, {
    fetchImpl: async (url, init) => { sent = init.headers.Authorization; return { ok: true, status: 200 }; },
  });
  assert.equal(result.valid, true);
  assert.equal(sent, `Bearer ${SHAPE_VALID.openrouter}`, 'the key must be sent trimmed');
});

test('verifyProviderKey passes a timeout signal so a hung socket cannot hang the request', async () => {
  let captured = null;
  await verifyProviderKey('xai', SHAPE_VALID.xai, {
    fetchImpl: async (url, init) => { captured = init; return { ok: true, status: 200 }; },
  });
  assert.ok(captured.signal, 'an AbortSignal must be passed to fetch');
});
