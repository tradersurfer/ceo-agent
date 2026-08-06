const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

// BEHAVIOR.md is never loaded into a live system prompt (sdk/PromptLoader.js
// reads only PROMPT.md, per its PROMPT_PATHS map) -- so this file has no
// bearing on issue #86(a)'s actual leakage, which was already the correct
// fix for PROMPT.md in PR #90. But every BEHAVIOR.md independently teaches
// the same Type 1/Type 2 framework, and a future reader of BEHAVIOR.md
// shouldn't get a different, less-honest impression of the doctrine than
// PROMPT.md gives. This test locks in that consistency, not live model
// behavior.
const ROOT = path.resolve(__dirname, '..');
const BEHAVIOR_PATHS = [
  ['executive', 'ceo-agent'],
  ['finance', 'cfo-agent'],
  ['operations', 'hermes'],
  ['technology', 'cto-agent'],
  ['marketing', 'cmo-agent'],
  ['people', 'chro-agent'],
  ['legal', 'clo-agent'],
];

for (const [department, agentDir] of BEHAVIOR_PATHS) {
  test(`${agentDir}/BEHAVIOR.md carries the same anti-narration instruction as PROMPT.md`, () => {
    const behaviorPath = path.join(ROOT, 'departments', department, agentDir, 'BEHAVIOR.md');
    const behavior = fs.readFileSync(behaviorPath, 'utf8');
    assert.match(
      behavior,
      /Apply this classification internally to decide how to act; state the resulting decision, action, or escalation directly rather than narrating the classification process to the user\./,
      `${agentDir}/BEHAVIOR.md should not teach Type 1/Type 2 without the same anti-narration caveat PROMPT.md carries`,
    );
  });
}
