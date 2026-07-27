# ADR-007: Pluggable agent harness — a documented question, not a decision

- **Status:** Open question (design note only — no implementation, no interface built)
- **Date:** 2026-07-27
- **Distinct from:** [`ADR-001a`](./ADR-001a-hermes-gateway-client-model.md) (Hermes specifically — the gateway-client execution model), [`ADR-006`](./ADR-006-multi-provider-strategy.md) (chat-completion model providers — BYNGE)
- **Related:** `sdk/BaseBridge.js`, `core/BridgeExecutors.js`, `core/RuntimeConfig.js`, issue #56 (Hermes gateway API surface investigation), issue #36 (real Hermes execution)

---

## Context

CEO Agent currently has two established patterns for "talk to something
that isn't a chat-completion model":

1. **Chat-completion model providers** — resolves an internal role
   (`claude`, `gpt`, `gemini`, `grok`, `codex`) to a specific model and
   calls it for a single request/response. ADR-006 (BYNGE) governs this
   category and its extension to direct provider connections.
2. **The single-bridge-per-install pattern** — `SalesIntakeBridge`,
   `OnboardingCommsBridge`, `DisputeAgentBridge`, `HermesBridge`, each a
   `BaseBridge` subclass with a fixed identity/permissions/allowed-task-
   types set at construction, registered once at process start in
   `core/BridgeExecutors.js`. Fixed by the operator's code/deployment —
   not something an end user connects or disconnects at runtime.

The question this ADR records, without answering: **should there be a
third category — a pluggable interface for "any external agent harness a
user wants to connect," Hermes being the first real example, with
OpenClaw and others potentially following — distinct from both of the
above?** This is a documented question for future reference, not a
decision to build against.

## What actually varies between harnesses today — grounded in what exists, not guessed

**Hermes is the only real example, and even it isn't fully specified
yet.** ADR-001a settled that CEO Agent talks to Hermes as an HTTP client
of its gateway task-submission API, with a scoped credential — but issue
#56 (the gateway's actual `HERMES_HOME`/config layout and API surface)
is still open, and issue #36 (real execution) hasn't landed. So even
Hermes's own gateway/API shape, auth model, and task-submission contract
aren't fully known yet — they're a design (ADR-001a) awaiting the
investigation that confirms it in detail.

**OpenClaw and T3Agent are placeholders, not implementations.**
Confirmed by grep across the whole codebase: `OpenClaw` exists only as a
`role: 'runtime_connectors'` entry in `core/RuntimeConfig.js`'s default
model list (non-API, `apiModelId: null`, same shape as Hermes's own
placeholder entry before any bridge existed) and a single capability-
recommendation mapping in `core/ModelBroker.js`
(`runtime_connectors: 'openclaw'`). No bridge, no client, no gateway
integration, nothing else — zero real implementation. `T3Agent` doesn't
appear in any code at all; it exists only in `README.md`'s "Swarm
Agents — Coming soon" table.

**So the honest answer to "what varies between harnesses" is: unknown,**
because there is exactly one real example, and that example's own
concrete shape (gateway API, auth, task-submission contract) is *itself*
still being confirmed through #56/#36. Abstracting a common interface
from one incompletely-specified example and zero other implementations
would mean designing the "common" parts by guessing what a hypothetical
second harness might need — precisely the premature-abstraction pattern
this project has explicitly avoided elsewhere (PR #42's rejected second
skill-registry/provider-resolution path; ADR-006 declining to guess at
OAuth/consumer-entitlement scope before a provider confirms it offers
one).

## Confirming this is a third category, not a restatement of the other two

Worth stating explicitly, since the boundary matters for anyone reading
this later and wondering whether it overlaps with ADR-006 or the
existing bridge pattern:

- **Not BYNGE's scope (ADR-006).** BYNGE governs chat-completion
  providers: resolve a role to a model, send messages, get text back —
  stateless, single request/response, no task queue, no execution loop.
  An agent harness like Hermes is the opposite shape: it accepts a task,
  runs its own multi-step execution loop (with its own sandboxing, its
  own tool use, its own scheduling — see ADR-001a's findings on Hermes's
  actual architecture), and reports status/results back, potentially
  asynchronously. These are not the same kind of "connection," and
  BYNGE's adapter pattern (`ProviderClient.chatCompletion()`) is not the
  right shape for it.
- **Not a restatement of the current bridge pattern.** The existing
  `BaseBridge`/`core/BridgeExecutors.js` pattern is fixed at the
  operator's install/deployment level — which bridges exist is a code-
  level decision (`registerBridgeExecutors()`'s hardcoded object), not
  something an end user toggles through a UI at runtime. The question
  this ADR raises is specifically about **end-user-connectable,
  potentially-plural, potentially-runtime-changeable** harness
  connections — a materially different lifecycle than "the operator
  wrote a bridge class and shipped it."

## Non-goal for now

**No implementation. No generalized `HarnessRegistry` (or similarly-named
interface) gets built from this ADR.** There is exactly one real harness
to design against (Hermes), and that one isn't fully proven end-to-end
yet. Building a general interface now would mean encoding assumptions
about a second, third, and fourth harness that don't exist — the same
caution this project has applied consistently (ADR-006's adapter pattern
was sketched only after confirming OpenRouter's actual client shape
first; the skill-expansion backlog explicitly defers anything without a
real, buildable signal).

## Recommendation

**Hold this as a documented open question until #56 and #36 ship** — i.e.
until Hermes's gateway API surface is actually confirmed and a real
`HermesGatewayClient` exists and works end-to-end. At that point, this
project will have exactly one proven, concrete example of what "connect
an external agent harness" actually requires in practice: its real auth
model, its real task-submission contract, its real status-reporting
shape — not a design document's best guess at one.

Only once a **second** real harness gets real implementation work
(OpenClaw or otherwise moving past its current placeholder-only state)
does it become possible to ask, with two real data points instead of
one, whether they share enough shape to justify extracting a common
interface — the same "confirm before abstracting" discipline this
project uses everywhere else. Revisit this ADR then; don't resolve it
now.
