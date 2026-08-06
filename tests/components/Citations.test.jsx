const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeCitations } = require('../../app/lib/citations');

test('converts a well-formed <cite> tag into markdown emphasis', () => {
  const input = 'The Act applies here <cite index="1">EU AI Act Article 6</cite>.';
  assert.equal(sanitizeCitations(input), 'The Act applies here *EU AI Act Article 6*.');
});

test('handles multiple citations in one message', () => {
  const input = 'See <cite>Source A</cite> and also <cite>Source B</cite>.';
  assert.equal(sanitizeCitations(input), 'See *Source A* and also *Source B*.');
});

test('collapses internal whitespace/newlines inside a citation', () => {
  const input = 'Ref <cite>\n  Multi\n  Line   Source \n</cite> here.';
  assert.equal(sanitizeCitations(input), 'Ref *Multi Line Source* here.');
});

test('removes an empty <cite></cite> entirely, including its own text run', () => {
  const input = 'Before<cite></cite>After';
  assert.equal(sanitizeCitations(input), 'BeforeAfter');
});

test('strips a self-closing or unclosed <cite/> fragment with no inner text', () => {
  assert.equal(sanitizeCitations('Note <cite/> continues.'), 'Note  continues.');
  assert.equal(sanitizeCitations('Note <cite index="2"> continues.'), 'Note  continues.');
});

test('is a no-op on text with no citation tags at all', () => {
  const input = 'Plain text with no tags, just normal *markdown* and `code`.';
  assert.equal(sanitizeCitations(input), input);
});

test('does not touch unrelated angle-bracket content (generics, comparisons, code)', () => {
  const input = 'Use `Array<T>` and check `if (x < y)` in the diff.';
  assert.equal(sanitizeCitations(input), input);
});

test('handles non-string input defensively without throwing', () => {
  assert.equal(sanitizeCitations(null), null);
  assert.equal(sanitizeCitations(undefined), undefined);
  assert.equal(sanitizeCitations(''), '');
});
