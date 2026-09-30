#!/usr/bin/env node
/**
 * Positive-path proof for the Connections-tab validation: stand up a local
 * stub that behaves like a provider accepting one specific key, point the
 * validator at it, and confirm a valid key is accepted end to end.
 *
 * This exists because every REAL key in this repo's `.env` is dead (see
 * scripts/verify-provider-keys-live.js), so the "valid key gets saved"
 * branch cannot otherwise be exercised here without a real credential.
 * The stub is bound to 127.0.0.1 and is test-only; it is never used by
 * app code.
 *
 * Run: node scripts/verify-valid-key-saves.js
 */

const http = require('http');
const { verifyProviderKey } = require('../lib/providerKeyValidation');

const GOOD_KEY = 'sk-or-v1-' + 'a'.repeat(64) + '-' + 'b'.repeat(64);
const BAD_KEY = 'sk-or-v1-' + 'c'.repeat(64) + '-' + 'd'.repeat(64);

let failures = 0;
function report(ok, label, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  // Stand in for a provider: 200 for the good key, 401 for anything else —
  // exactly OpenRouter's real contract, confirmed live.
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    if (auth === `Bearer ${GOOD_KEY}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { label: 'test key' } }));
      return;
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'No cookie auth credentials found', code: 401 } }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  // Drive the real validator, overriding only the transport so it talks to
  // the stub. validateKeyShape/response handling are the production code.
  const { VERIFIERS } = require('../lib/providerKeyValidation');
  const original = VERIFIERS.openrouter;
  VERIFIERS.openrouter = {
    url: `http://127.0.0.1:${port}/api/v1/key`,
    buildHeaders: original.buildHeaders,
    invalidStatuses: original.invalidStatuses,
  };

  try {
    const good = await verifyProviderKey('openrouter', GOOD_KEY);
    report(good.valid === true, 'a valid key is ACCEPTED and would be saved',
      good.valid ? '' : `errorCode=${good.errorCode}`);

    const bad = await verifyProviderKey('openrouter', BAD_KEY);
    report(bad.valid === false && bad.errorCode === 'invalid',
      'an invalid key is REFUSED and would not be saved',
      bad.valid ? 'it was ACCEPTED' : `errorCode=${bad.errorCode}`);
  } finally {
    VERIFIERS.openrouter = original;
    server.close();
  }

  console.log(`\n${failures === 0 ? 'Valid-key save path verified.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Verification script crashed:', err.message);
  process.exit(1);
});
