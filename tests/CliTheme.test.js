// CEO Agent — CLI theme invariants.
//
// These are behavior contracts for the boot chrome, not snapshots: the strip
// renders whatever the slash registry hands it, and the only thing that must
// hold is that a reader can never see a description cut mid-word.

const test = require('node:test');
const assert = require('node:assert');

const theme = require('../bin/cliTheme.js');

// The strip paints ANSI, so strip escapes before asserting on visible text.
function visible(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}

test('commandStrip never truncates a description mid-word', () => {
  const strip = visible(theme.commandStrip([
    { name: '/models', help: 'Resolved model assignments' },
    { name: '/attach', help: 'Attach a file to the next message' },
  ]));

  // "Show or set c" was the real regression: a bare slice(0, 28) with no word
  // boundary and no marker, so it read as broken rather than terse.
  assert.ok(!/\b(?:set|or|show) [a-z]$/m.test(strip), `mid-word cut in:\n${strip}`);

  // A clipped description must announce itself, so a short help string is
  // distinguishable from a whole one.
  assert.ok(strip.includes('…') || !strip.includes('Attach a file to the next'), strip);
});

test('commandStrip preserves full help text when it fits the budget', () => {
  const strip = visible(theme.commandStrip([
    { name: '/who', help: 'Who reports to whom' },
  ]));
  assert.ok(strip.includes('Who reports to whom'), strip);
});

test('commandStrip accepts a bare string list as well as command objects', () => {
  const strip = visible(theme.commandStrip(['/help', '/exit']));
  assert.ok(strip.includes('/help'), strip);
  assert.ok(strip.includes('/exit'), strip);
});

test('commandStrip falls back to a default roster when given nothing', () => {
  const strip = visible(theme.commandStrip([]));
  assert.ok(strip.includes('/org'), strip);
  assert.ok(strip.includes('/exit'), strip);
});

test('theme exports every renderer chat.js depends on', () => {
  for (const fn of [
    'banner', 'kv', 'statusBlock', 'hintLine', 'commandStrip', 'routedLine',
    'attachLine', 'skillLine', 'usageLine', 'errorLine', 'warnLine', 'okLine',
    'section', 'promptString', 'rule',
  ]) {
    assert.strictEqual(typeof theme[fn], 'function', `missing export: ${fn}`);
  }
});

test('paint is a no-op when color is disabled, so plain terminals stay readable', () => {
  // The module reads process.stdout.isTTY at import; under the test runner that is
  // false, so this asserts the degraded path produces no escape sequences.
  if (!theme.enabled) {
    const line = theme.okLine('ok');
    assert.ok(!line.includes('\x1b'), `color leaked with theme disabled: ${JSON.stringify(line)}`);
    // Indentation is layout, not styling — it must survive the no-color path.
    assert.strictEqual(line, '  ok');
  }
});
