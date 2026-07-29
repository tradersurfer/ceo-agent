# Skills

`core/SkillRegistry.js` + `core/SkillExecutor.js` are a minimal pattern for
giving an agent a callable, validated, timeout-bound capability — replacing
the old inert Hermes `skills/` folder (removed earlier) with something the
code actually invokes.

## Status: dispatched from real chat turns (CLI + web)

Registered skills are now invoked from a live chat turn, not just from unit
tests. Both chat surfaces recognize the same explicit syntax, via the shared
parser in `core/skillDispatch.js`:

- `/skill_name {"field": "value"}` — slash-command form
- `@skill_name {"field": "value"}` — @ addressing, alongside `@department`
- `/skills` (CLI only today) lists every registered skill, its description,
  and its input fields

Arguments are a JSON object matching the skill's `inputSchema`; omit them
entirely for a skill that takes none. Dispatch runs under `ceo_agent`'s
context — the same default an unaddressed chat message already uses — so a
skill gated to a specific department head (e.g. `scope_creep_detection` ->
`cto_agent` only) correctly fails with `reason: 'permission_denied'` when
invoked this way, exactly as `SkillExecutor.run()` already enforced before
any chat wiring existed.

**What's still not real:** every skill also carries a `description` and a
`disableModelInvocation` flag (see `core/SkillRegistry.js#register`), but
nothing in this codebase yet lets a model decide, on its own, to call a
skill mid-conversation — both fields are metadata for a future
model-invocation pass, not consumed by any matching logic today. The only
way to run a skill is the explicit `/name` or `@name` syntax above, typed by
a person.

The 3 example skills (`core/skills/exampleSkills.js`) remain the safest
reference implementations:

- `summarize_text` — self-contained placeholder structure, no model call
- `format_currency` — deterministic utility, no I/O
- `lookup_department` — reads the existing org chart, read-only

None of these write to the filesystem, make network calls, or execute
arbitrary code. Several other registered skills do write generated files
(via `lib/uploadStore.js`) or read an uploaded file — see each skill's own
module comment for its actual I/O boundary.

`web_search` (`core/skills/webSearchSkill.js`) is the first skill that makes
a real outbound network call — see the next section.

## Security boundary — read before adding a new skill

Any skill that would:
- Execute external scripts or shell commands
- Make network calls to endpoints not already reviewed elsewhere in this
  codebase
- Access the filesystem beyond what's already read-only elsewhere

...requires explicit security review before being added. This pattern is
intentionally narrow. It is not a general script-execution engine.

**`web_search` passed this review** (Batch 4, backed by Perplexity's Search
API via `sdk/PerplexityClient.js`): outbound HTTPS only to Perplexity's
single documented API host, no arbitrary caller-supplied URL, no filesystem
or shell access, bounded/typed input (`query` string, `maxResults` number),
requires `PERPLEXITY_API_KEY` (never logged or echoed back). It's marked
`"risk": "review_required"` in `registry/skill-registry.json` (rather than
`"safe"` like the filesystem/CPU-only skills around it) to keep that
distinction visible in the catalog itself, not just in prose here. See
`core/skills/webSearchSkill.js`'s own header comment for the full review
notes. A future skill making a *different* kind of network call (a new
host, a different provider) still needs its own review — this entry
doesn't blanket-approve network calls in general, only this one.

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

## From a chat turn

Both `bin/chat.js` (CLI) and `app/api/chat/route.ts` (web) call the same
`dispatchSkillMessage()` helper in `core/skillDispatch.js` before falling
through to normal `@department`/model-call handling:

```js
const { dispatchSkillMessage } = require('../core/skillDispatch');

const dispatch = await dispatchSkillMessage('/format_currency {"amount": 42.5}', {
  skillRegistry: runtime.skillRegistry,
  skillExecutor: runtime.skillExecutor,
  agentId: 'ceo_agent',
});
// dispatch === null if the input doesn't address a registered skill by name
// (the caller should fall through to its existing routing in that case);
// otherwise { skillName, result } with the same result shape as
// executor.run() above.
```
