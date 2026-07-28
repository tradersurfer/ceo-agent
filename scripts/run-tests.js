#!/usr/bin/env node
/**
 * `npm test` orchestrator. Runs the existing plain node:test suite
 * (tests/*.test.js) and the new component-test suite
 * (tests/components/*.test.jsx, added for BYNGE Phase 1's ModelSelector
 * coverage — see docs/design/BYNGE-connection-scoping.md) as two separate
 * `node --test` processes, since they need different require hooks
 * (jsdom + esbuild JSX transform only for the component suite).
 *
 * Deliberately NOT a `&&`-chained package.json script: on both cmd.exe and
 * POSIX shells, `a && b` skips `b` entirely if `a` exits non-zero, so a
 * single failing test in one suite would silently hide whether the other
 * suite passes at all. This runs both unconditionally and exits non-zero
 * if either failed, cross-platform (spawnSync, no shell-specific syntax).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(label, args) {
  console.log(`\n> node ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT });
  const ok = result.status === 0;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${label}`);
  return ok;
}

// Resolved here via fs.readdirSync rather than handed to `--test` as a
// shell-glob-style string: spawnSync has no shell involved (see module
// comment), so a literal "tests/*.test.js" argument depends entirely on
// Node's own CLI glob support for test-file arguments — present in the
// Node version this was developed against, but not in Node 20 (confirmed
// on CI: "Could not find '.../tests/*.test.js'", taken as a literal
// filename). Enumerating files ourselves works identically on every
// Node version >=18, matching package.json's stated engines range.
function testFiles(dir, extension) {
  return fs.readdirSync(dir)
    .filter(name => name.endsWith(extension))
    .map(name => path.join(dir, name));
}

const coreOk = run('core suite (tests/*.test.js)', ['--test', ...testFiles(path.join(ROOT, 'tests'), '.test.js')]);

// Absolute paths for --require: a bare relative path here (e.g.
// "tests/components/registerTsx.js" with no "./" prefix) is resolved by
// Node as a package specifier via node_modules, not as a file relative to
// cwd, and fails with MODULE_NOT_FOUND.
const componentsOk = run('component suite (tests/components/*.test.jsx)', [
  '--require', path.join(ROOT, 'tests', 'components', 'registerTsx.js'),
  '--require', path.join(ROOT, 'tests', 'components', 'setupJsdom.js'),
  '--test', ...testFiles(path.join(ROOT, 'tests', 'components'), '.test.jsx'),
]);

if (!coreOk || !componentsOk) {
  console.error('\nOne or more test suites failed.');
  process.exit(1);
}

console.log('\nAll test suites passed.');
