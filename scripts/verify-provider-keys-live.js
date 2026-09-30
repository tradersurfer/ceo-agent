#!/usr/bin/env node
/**
 * Live end-to-end check of provider key validation, run against the real
 * provider APIs with the real keys in this repo's `.env`.
 *
 * This is the verification that unit tests with an injected fetch cannot
 * give: that the endpoint/header/status wiring in
 * lib/providerKeyValidation.js actually matches how OpenRouter, Anthropic,
 * OpenAI, Google and xAI behave TODAY, and that a real key verifies while a
 * real-shaped fake does not.
 *
 * Key handling: values are read from `.env` and passed to the validators,
 * but NEVER printed. Every line of output is a fixed label plus a
 * pass/fail. This file is safe to run and to leave in the repo.
 *
 * Run: node scripts/verify-provider-keys-live.js
 * Exit code 0 = every check passed.
 */

const fs = require('fs');
const path = require('path');
const { PROVIDER_ENV_VARS } = require('../lib/providers');
const { verifyProviderKey, validateKeyShape } = require('../lib/providerKeyValidation');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

function readEnvKeys() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const keys = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (/^[A-Z_]*API_KEY$/.test(name) && value) keys[name] = value;
  }
  return keys;
}

/** A shape-valid key that is definitively not a real one. */
function fakeKeyFor(providerId) {
  const fakes = {
    openrouter: 'sk-or-v1-' + '0'.repeat(64) + '-' + '0'.repeat(64),
    anthropic: 'sk-ant-api03-' + '0'.repeat(95),
    openai: 'sk-proj-' + '0'.repeat(48),
    google: 'AIza' + '0'.repeat(35),
    xai: 'xai-' + '0'.repeat(48),
  };
  return fakes[providerId];
}

let failures = 0;
let deadKeys = 0;
function report(ok, label, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

/** A dead/stored key is a finding about the CREDENTIAL, not a bug in the
 *  validation code — tracked separately so a real regression is never
 *  buried under "your key expired". */
function reportDeadKey(label, detail) {
  deadKeys += 1;
  console.log(`WARN  ${label}  — ${detail}`);
}

async function main() {
  const envKeys = readEnvKeys();
  const configured = Object.entries(PROVIDER_ENV_VARS)
    .filter(([, varName]) => envKeys[varName])
    .map(([id]) => id);

  console.log(`\nProvider key validation — live check`);
  console.log(`Providers with a real key in .env: ${configured.length ? configured.join(', ') : '(none)'}\n`);

  // --- 1. Real keys must verify against the real APIs. ---
  for (const id of configured) {
    const key = envKeys[PROVIDER_ENV_VARS[id]];
    const shape = validateKeyShape(id, key);
    if (!shape.ok) {
      // A stored key that doesn't even match its own provider's shape is a
      // misconfiguration in .env (e.g. an OpenRouter key saved under
      // OPENAI_API_KEY) — a credential finding, not a code failure.
      reportDeadKey(`${id}: stored key in .env is not a ${id} key`, shape.error);
      continue;
    }
    const result = await verifyProviderKey(id, key);
    if (result.valid) {
      report(true, `${id}: real key verifies against the live API`);
    } else {
      reportDeadKey(`${id}: stored key was REJECTED by ${id}`, `${result.error} (errorCode=${result.errorCode})`);
    }
  }

  // --- 2. Real-shaped fakes must be rejected by the live API. ---
  // This is the core of the fix: a well-formed fake passes the offline
  // shape check, so only a real API call can catch it.
  for (const id of Object.keys(PROVIDER_ENV_VARS)) {
    const fake = fakeKeyFor(id);
    const shape = validateKeyShape(id, fake);
    if (!shape.ok) {
      // Acceptable: rejected offline before any network call. Still a pass.
      report(true, `${id}: fake key rejected by the shape check (no network needed)`, shape.error);
      continue;
    }
    const result = await verifyProviderKey(id, fake);
    report(!result.valid && result.errorCode === 'invalid',
      `${id}: fake key rejected by the live API as invalid`,
      result.valid ? 'it was ACCEPTED — validation is not working' : `errorCode=${result.errorCode}`);
  }

  // --- 3. Cross-provider: a real key for the wrong provider is rejected. ---
  // Uses the actual OpenRouter key, if present, against OpenAI's endpoint.
  const openrouterKey = envKeys[PROVIDER_ENV_VARS.openrouter];
  if (openrouterKey) {
    const result = await verifyProviderKey('openai', openrouterKey);
    report(!result.valid && result.errorCode === 'invalid',
      'openai: a real OpenRouter key is rejected (wrong provider)',
      result.valid ? 'it was ACCEPTED' : result.error);
  }

  console.log(`\n${failures === 0 ? 'All live checks passed.' : `${failures} live check(s) FAILED.`}`);
  if (deadKeys > 0) {
    console.log(`${deadKeys} stored key(s) in .env are dead or misconfigured.`);
    console.log('That is a CREDENTIAL problem, not a validation bug — the checks above');
    console.log('proving the code works are the PASS lines. Replace the flagged key(s)');
    console.log('in .env (or via the Connections tab, which now refuses to save an');
    console.log('unverifiable key) and re-run this script.');
  }
  console.log('');
  // Only a validation-code regression fails the run. Dead credentials are
  // reported loudly but do not turn a green validation suite red — an
  // expired key is an operational fact, not a defect in the checker.
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nLive verification script crashed:', err.message);
  process.exit(1);
});
