# ADR-006: Multi-provider strategy — direct provider connections alongside OpenRouter

- **Status:** Proposed (design only — no execution/implementation code in this change)
- **Date:** 2026-07-27
- **Related:** Priority 6 (BYNGE's direct-provider-connection extension path); [`ADR-001a`](./ADR-001a-hermes-gateway-client-model.md) and [`ADR-001`](./ADR-001-hermes-sandboxed-execution.md) (establish the "one canonical resolution/execution path" discipline this ADR extends to providers); `core/ModelResolver.js`; `core/ModelBroker.js`; `sdk/OpenRouterClient.js`; `core/UsageTracker.js` (#51)

> Referenced in ADR-001's intro as "the roadmap's later `ADR-006` (multi-provider SDK strategy)," not yet written at that time. This is that document. No implementation issue has been filed yet — per ADR-001's own pattern, that follows once this design is reviewed, not before.

---

## Context

Priority 6 / BYNGE's extension path: let an install's users connect their own
provider accounts (Claude, ChatGPT, Gemini, Grok) directly, not only through
OpenRouter's aggregation. Before designing that, this ADR establishes what
actually exists today (read from source, not assumed) and what "connect
your own X account" concretely requires per provider, since those two
things determine whether this is a small adapter or an open-ended
integration problem.

## Current state (verified from source)

### Resolution: OpenRouter is the only path, in full

- **`core/ModelResolver.js`** — `PROVIDER_PREFIXES` maps five internal
  role labels to OpenRouter provider prefixes: `claude` → `anthropic/`,
  `gpt`/`codex` → `openai/` (OpenRouter has no distinct "Codex" listing),
  `gemini` → `google/`, `grok` → `x-ai/`. `resolveRoleModels(models)`
  takes OpenRouter's live `/models` catalog and resolves a `flagship` and
  `efficient` tier per role, including per-token pricing extracted from
  OpenRouter's own `pricing.prompt`/`pricing.completion` fields (added in
  #51 for cost tracking).
- **`core/ModelBroker.js`** — stores the resolved role→tiers map;
  `getApiModelId(role, tier)` and `getPricing(role, tier)` read from it;
  `refreshFromOpenRouter(openRouterClient)` is the *only* place resolution
  happens, and it always calls `ModelResolver.resolveRoleModels()` against
  `openRouterClient.listModels()` — one catalog, one client.
- **`sdk/OpenRouterClient.js`** — the *only* code path that ever calls a
  live model. `chatCompletion({ model, messages, maxTokens })` POSTs to
  `https://openrouter.ai/api/v1/chat/completions` with a single
  `Authorization: Bearer <this.apiKey>` header, for every role, every
  tier, every department, every call site. `listModels()` GETs `/models`,
  no key required. There is no second client class anywhere in this
  codebase.
- **Call sites** — `bin/chat.js` and `app/api/chat/route.ts` each
  instantiate one `OpenRouterClient` and call `chatCompletion()` directly
  for whatever `apiModelId` `ModelBroker.getApiModelId()` resolved. No
  per-provider branching exists at either call site.

### BYOK/API-key handling today: exactly one key, no per-provider credentials

- **Setup wizard** (`bin/setup.js`, step 5 of 5) — asks once for "an
  OpenRouter API key," writes `OPENROUTER_API_KEY=...` to `.env`. No other
  provider key is ever requested or stored.
- **Web config** (`app/api/config/route.ts` `POST`) — an `openRouterApiKey`
  field routes to `lib/ceoAgentServer.js#setOpenRouterKey()`, which
  writes/replaces the `OPENROUTER_API_KEY=` line in `.env` and sets
  `process.env.OPENROUTER_API_KEY` directly — no encryption, no separate
  secrets store, matching this project's existing `.env`-only credential
  model (`SECURITY.md`).
- **`maskKey()`** masks the key for display (`GET /api/config`) — the real
  value never round-trips to the browser.
- Confirmed via a repo-wide grep: no `OAuth`, no `ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY` / `GOOGLE_API_KEY` / `XAI_API_KEY`, no per-provider
  credential handling exists anywhere in this codebase today. The
  single-key, single-endpoint model is total, not partial — there is
  nothing to extend, only something to add alongside.

## What "connect your own X account" actually requires

This phrase is ambiguous between two materially different things, and the
answer differs by provider. This ADR does not resolve which one BYNGE
means — it flags the distinction because "connect your Claude account"
can't be scoped honestly without it, and assuming one interpretation
risks designing for the wrong problem.

**(A) A provider's own developer/API-console key** — an Anthropic API key
from console.anthropic.com, an OpenAI key from platform.openai.com, a
Google AI Studio key, an xAI API key. Pay-per-token, third-party-app-safe
by design, no OAuth involved. Shape-identical to how
`OPENROUTER_API_KEY` already works: one text field, one `.env` line —
just per-provider instead of once.

**(B) A consumer subscription entitlement** — Claude.ai Pro/Max, ChatGPT
Plus, Gemini Advanced (Google One AI Premium), X Premium+'s Grok access.
These are **not** exposed as third-party-usable API keys by the
providers. A consumer subscription's usage entitlement is tied to that
provider's own first-party client/web surface. Using it from a
third-party app the way "connect your account" implies requires the
provider itself to offer a sanctioned integration surface for that — a
partner/business-development dependency, not an engineering one, and one
this project cannot build its way around if a given provider doesn't
offer it. This environment can't reach the providers' current
partner-integration documentation live to confirm what exists per
provider today, so this ADR flags (B) as needing real product-side
confirmation rather than filling in a guess.

**Recommendation for scoping BYNGE's engineering surface:** design for
interpretation (A) — direct API-key entry, no OAuth — since it's the only
version buildable without an unresolved external dependency.
Interpretation (B), for any given provider, is a distinct future decision
gated on that provider actually offering a usable integration path, not
on this ADR.

## Does OpenRouter already solve this?

Partially — worth being precise, since it changes what's actually novel
work. OpenRouter documents ("Bring Your Own Key," on OpenRouter's own
account dashboard) letting a user link their own provider API key
(interpretation (A)) into their OpenRouter account; OpenRouter then
routes requests through that linked key instead of its pooled credits,
still through OpenRouter's own unified endpoint and request/response
shape, typically at a small fee even in BYOK mode. This project has not
independently verified this against a live OpenRouter response —
openrouter.ai is unreachable from this development environment, the same
limitation #51 already noted for its pricing-contract assumption. Treat
it as documented-but-unconfirmed, same discipline this codebase applies
to any external claim it can't check.

If that's the shape BYNGE means, **CEO Agent needs zero code changes**
for it: the user links their key on OpenRouter's own site, and CEO Agent
keeps sending the exact same request through the exact same
`sdk/OpenRouterClient.js` it already has, with the exact same single
`OPENROUTER_API_KEY`. Nothing here is CEO Agent's problem to build.

The only scenario where CEO-Agent-side direct-provider connections carry
real value is bypassing OpenRouter's endpoint entirely — to avoid its
fee, or to reach an entitlement OpenRouter genuinely cannot proxy
(interpretation (B) consumer subscriptions; OpenRouter is a developer-API
aggregator and has no access to those at all). The adapter pattern below
is designed for that case.

## Adapter pattern — the central design question

**Goal: add direct-provider dispatch without creating a second resolution
path.** `ModelResolver`/`ModelBroker` stay the single source of truth for
"which model id does role X resolve to at tier Y" — role resolution does
not change. What's new is a second, narrow question asked only at the
moment of actually placing a call: *does this install have a direct
connection for this model's provider, or does it go through OpenRouter as
today?*

Sketch only — interface shapes, not implementation:

```
ProviderClient (interface both OpenRouterClient and any new direct
client conform to):
  listModels(): Promise<ModelRecord[]>
  chatCompletion({ model, messages, maxTokens }): Promise<{ text, usage }>
```

- `sdk/OpenRouterClient.js` already conforms to this shape today (verified
  from source) — it does not move or change.
- A hypothetical `sdk/AnthropicClient.js` (interpretation (A), direct API
  key) would implement the same two methods against Anthropic's native
  `/v1/messages` endpoint, translating its response into the same
  `{ text, usage }` shape. Anthropic's own `usage.input_tokens` /
  `output_tokens` / `cache_creation_input_tokens` / `cache_read_input_tokens`
  map directly onto the fields `OpenRouterClient`'s usage object already
  has (`promptTokens` / `completionTokens` / `cacheCreationTokens` /
  `cacheReadTokens`). `core/UsageTracker.js` (#51) needs **no changes** —
  it already takes a generic `usage` shape, agnostic to which client
  produced it.
- One new seam, not a parallel system:

```
resolveClientForModel(apiModelId, connections)
  -> { client: ProviderClient, providerModelId: string }
```

  Given a resolved OpenRouter-style id (e.g. `"anthropic/claude-opus-5"`)
  and a per-install connection registry (which providers, if any, have a
  direct connection configured), this returns which client should
  actually place the call and what model id to send it — the direct
  client with the provider's native id (stripping/mapping the
  `anthropic/` prefix), or `OpenRouterClient` unchanged if no direct
  connection exists for that provider. This is the *only* new decision
  point in the whole call path; `ModelResolver`'s role→model resolution
  and `ModelBroker`'s tier storage are untouched by it.
- **Connection registry** (name only, not designed here): something
  `ModelBroker` or a sibling holds, keyed by provider prefix (`anthropic/`,
  `openai/`, ...) → either absent (OpenRouter, the default) or a
  configured direct client instance. How that registry gets populated
  (env vars? per-tenant config? a UI?) is explicitly out of scope below.

## Non-goals for this ADR

- No OAuth implementation.
- No new credential storage schema — whatever ends up storing
  direct-provider keys is a separate, security-reviewed design; this
  project's existing `.env`-only model may or may not be the right shape
  for N provider keys instead of 1, and this ADR does not answer that.
- No actual provider connection code — no `sdk/AnthropicClient.js`, no
  `sdk/OpenAIClient.js`, etc. get written here. The interface sketch above
  is a shape, not a build.
- No decision on which of interpretation (A)/(B) BYNGE actually needs, per
  provider — flagged above as needing product confirmation, not assumed.
- No decision on the connection registry's storage/config shape.

## Hermes / agentic runtimes: confirmed out of scope, consistent with ADR-001a

Hermes (and any future agentic runtime wired via #36 once #56 resolves
the gateway API surface) is not a model-resolution concern and stays
fully out of this ADR's scope. ADR-001a already settled that CEO Agent
talks to Hermes as an HTTP client of its gateway task-submission API —
bridge pattern, like `SalesIntakeBridge`/`OnboardingCommsBridge`/
`DisputeAgentBridge`, not a role that resolves to a chat-completion model
call the way claude/gpt/gemini/grok do. Nothing in this ADR touches
`BridgeExecutors.js`, `HermesBridge.js`, or the bridge pattern generally;
multi-provider strategy governs `sdk/OpenRouterClient.js`-shaped
chat-completion calls only, and stays that way.

## Consequences

- **No runtime behavior changes from this ADR.** Resolution stays 100%
  OpenRouter-only until a follow-up implementation PR, itself gated on
  resolving the open items above (which BYNGE interpretation per
  provider; connection-registry shape; actual client implementations,
  each needing its own security review per this project's stated
  discipline for anything touching credentials).
- Establishes the one-seam adapter pattern as the accepted design, so a
  future implementation PR has a shape to build against instead of
  inventing one under time pressure.
- Documents plainly that OpenRouter's own BYOK (if that's what "connect
  your own account" turns out to mean) requires zero CEO-Agent code —
  worth stating explicitly so a future implementer doesn't build
  unnecessary machinery for a case OpenRouter may already solve.
