# Skills

`core/SkillRegistry.js` + `core/SkillExecutor.js` are a minimal pattern for
giving an agent a callable, validated, timeout-bound capability — replacing
the old inert Hermes `skills/` folder (removed earlier) with something the
code actually invokes.

## Status: proof-of-concept

This ships with exactly 3 example skills (`core/skills/exampleSkills.js`),
all deliberately safe and non-destructive:

- `summarize_text` — self-contained placeholder structure, no model call
- `format_currency` — deterministic utility, no I/O
- `lookup_department` — reads the existing org chart, read-only

None of these write to the filesystem, make network calls, or execute
arbitrary code.

## Security boundary — read before adding a new skill

Any skill that would:
- Execute external scripts or shell commands
- Make network calls to endpoints not already reviewed elsewhere in this
  codebase
- Access the filesystem beyond what's already read-only elsewhere

...requires explicit security review before being added. This pattern is
intentionally narrow. It is not a general script-execution engine.

## Skills must honor their abort signal

`SkillExecutor` passes an `AbortSignal` as the second argument to every
handler. A skill that ignores it cannot be interrupted — the executor will
wait for it to finish regardless of the configured timeout.

This is deliberate. The executor does not force-reject and report a timeout
while leaving a handler running in the background, because that would report
a stopped operation that is in fact still executing. If you write a skill
that can run long, honor the signal:

```js
handler: (input, { signal }) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => resolve(doWork(input)), 200);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    const err = new Error('Aborted');
    err.name = 'AbortError';
    reject(err);
  });
})
```

## Usage

```js
const { SkillRegistry } = require('../core/SkillRegistry');
const { SkillExecutor } = require('../core/SkillExecutor');
const { registerExampleSkills } = require('../core/skills/exampleSkills');

const registry = new SkillRegistry();
registerExampleSkills(registry);
const executor = new SkillExecutor(registry);

const result = await executor.run('format_currency', { amount: 42.5 });
// { status: 'ok', output: { formatted: '$42.50', amount: 42.5, currency: 'USD' } }
```
