# BYNGE — Connection Model Scoping

- **Status:** Scoping pass (design only — no implementation, no branch cut from this doc)
- **Date:** 2026-07-27
- **Builds on:** [`ADR-006`](../adr/ADR-006-multi-provider-strategy.md) (multi-provider strategy, adapter pattern), [`ADR-001a`](../adr/ADR-001a-hermes-gateway-client-model.md) (Hermes bridge pattern — confirmed still out of scope below)
- **Related:** `bin/setup.js`, `app/api/config/route.ts`, `lib/ceoAgentServer.js`, `app/components/{Sidebar,SettingsView,ChatView}.tsx`, `core/ModelBroker.js`, `core/ModelResolver.js`, `core/UsageTracker.js` (#51)

BYNGE is a big feature. This is the scoping pass ADR-006 called for before
any code — same discipline as ADR-001/ADR-001a/ADR-002. Nothing here is
implemented. A follow-up implementation PR (or PRs, per the phase boundary
below) comes after this is reviewed.

---

## 1. Connection model — scope confirmed

Per ADR-006: **API-key connections only.** Anthropic, OpenAI, Google AI
Studio, and xAI console/developer keys — the same shape as how
`OPENROUTER_API_KEY` already works today, just per-provider instead of
once. **Not** OAuth, **not** consumer subscription entitlements
(Claude.ai Pro/Max, ChatGPT Plus, Gemini Advanced, X Premium+) — ADR-006
flagged those as a partner-dependency question outside this project's
control, and nothing in this scoping pass changes that. If a future
provider integration makes (B)-style consumer-entitlement connections
real, that's a distinct future decision with its own scoping pass, not
an extension of what's described here.

## 2. Storage — extending the existing pattern, not inventing one

**Read the real current implementation first, as asked.** Today's
`OPENROUTER_API_KEY` handling is:

- **`bin/setup.js`** (step 5 of 5): asks for the key, then has its own
  inline `.env` read/regex-replace/append block that writes
  `OPENROUTER_API_KEY=...`.
- **`lib/ceoAgentServer.js#setOpenRouterKey(newKey)`**: a *second*,
  near-identical inline `.env` read/regex-replace/append block, called
  from `app/api/config/route.ts`'s `POST` handler when the web
  Settings form submits a new key. Also sets
  `process.env.OPENROUTER_API_KEY` directly so the running process picks
  it up without a restart.
- **`maskKey(key)`** (`lib/ceoAgentServer.js`): already provider-agnostic
  — masks any string, not OpenRouter-specific. `GET /api/config` returns
  `hasApiKey`/`apiKeyMasked`; the real key never round-trips to the
  browser.
- **`loadEnv()`** (duplicated identically in `bin/chat.js` and
  `lib/ceoAgentServer.js`): parses *any* `KEY=value` line in `.env` into
  `process.env` — it is not hardcoded to `OPENROUTER_API_KEY` at all.
  **This means `loadEnv()` needs zero changes to support new provider key
  names** — `ANTHROPIC_API_KEY=...` in `.env` already loads correctly
  today, this minute, with no code change.
- No encryption, no separate secrets store — plaintext `.env`, gitignored,
  matching `SECURITY.md`'s stated model for the one key that exists today.

**A pre-existing wrinkle worth fixing while touching this code:** the
write logic is already duplicated between `bin/setup.js` and
`lib/ceoAgentServer.js#setOpenRouterKey` rather than shared. Extending to
N providers without addressing that means duplicating the duplication.
Recommend centralizing into one `setProviderKey(provider, key)` function
in `lib/ceoAgentServer.js` that both the CLI and web call — this is
Phase 1 work (below), not a new decision.

**Storage extension, concretely:** one `.env` line per connected
provider — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_AI_STUDIO_API_KEY`, `XAI_API_KEY` — alongside the existing
`OPENROUTER_API_KEY`, using the exact same read/write/mask mechanics,
generalized to take a provider id instead of being OpenRouter-specific.
Naming note: needs a single canonical env-var-name table (provider id →
env var name) shared between the write path and `loadEnv()`'s consumers,
not five copy-pasted literals.

**"Per-user" — flagging a scope mismatch before it becomes a silent
assumption.** This codebase has **no multi-user or authentication system
at all** — confirmed by grep: no login, no session/identity concept
beyond a hardcoded `'web-session'` project label in `routeTask()` calls,
and `/api/dispatch`'s "Unauthorized" is a single shared
`DISPATCH_SECRET`, not per-user auth. The scaffold's entire model is
per-*install* (one `.env`, one `ceo-agent.config.json`, one operator).
"Per-user, per-provider API keys" as phrased implies a multi-user
identity system that doesn't exist and isn't being proposed here. This
scoping pass covers **per-install, per-provider** storage — the same
scope the existing `OPENROUTER_API_KEY` already has. Multi-user key
storage is a materially bigger feature (needs actual user accounts
first) and is out of scope for BYNGE's connection layer unless/until
this project builds real multi-user auth, which nothing here proposes.

## 3. UI surface — component boundary, not implementation

**Sidebar entry point:** `app/components/Sidebar.tsx`'s `TABS` array is
a flat list (`chat`/`org`/`status`/`add`/`settings`). Simplest, lowest-
risk option: a `connections` tab alongside `settings` (not nested inside
it), since connection management is its own recurring task, not a
one-time setup field the way agent name/business context are. A new
`ConnectionsView` component (sibling to `SettingsView`), listing each
provider (OpenRouter already-existing, plus Anthropic/OpenAI/Google/xAI)
with the same masked-key-display + key-entry-field pattern
`SettingsView` already has for OpenRouter — repeated per provider, not
redesigned.

**Provider → model cascade:** click a provider, see that provider's
model list. Two real data sources exist for this, and they are **not**
the same maturity:
- OpenRouter's list is real today — `ModelBroker.listModels()` /
  `runtime.registryCatalog` already carry resolved role→model data.
- A *direct* provider's own model list requires that provider's
  `ProviderClient.listModels()` to exist — which ADR-006 explicitly did
  not build. Until it does, a provider tile with no implemented client
  yet should render as **connected (key stored) but not yet active**,
  not silently show OpenRouter's list under a different provider's
  label. This is exactly where the phase boundary in §6 bites.

**Surfacing in the chat terminal, not just Settings/Connections:**
`ChatView.tsx`'s `.chat-input-row` already holds three elements (attach
button, text input, send button) — the natural fourth slot for a model
selector is a small control in that same row (or immediately above it),
not a separate view the user has to leave chat to reach. Sketch, not
implementation: a `<ModelSelector>` component taking the currently
resolved `{provider, role, tier}` and an `onChange` callback, rendered in
both `ChatView.tsx` (compact, inline) and `ConnectionsView.tsx`
(expanded, per-provider detail) — one component, two call sites, so the
selection logic isn't duplicated the way the `.env` write logic
currently is. Where the *selected* model/tier gets persisted (per-session
state? written back to `ceo-agent.config.json`? per-department override?)
is an open question this scoping pass doesn't resolve — flagging it
rather than picking one, since it interacts with §4 below.

## 4. Per-head default models — what "live from the catalog" actually means today

**Confirmed from source, and this is a real finding, not an assumption:**
today, only **two** of the five roles `ModelResolver` resolves
(`claude`, `codex`) are ever actually selected for a department head's
response. Both `bin/chat.js:301` and `app/api/chat/route.ts:83` contain
the identical hardcoded line:

```js
const roleForAgent = (agent.department === 'technology' || agent.lane === 'technology') ? 'codex' : 'claude';
```

Every non-technology department head — CEO, CFO, CMO, CHRO, CLO — always
resolves to `claude`. `gpt`, `gemini`, and `grok` are fully resolved into
`ModelBroker` (flagship + efficient tiers, live pricing) but **nothing in
the actual call path ever selects them.** This matters directly for
BYNGE: "per-head default model, live from the catalog" isn't extending a
rich existing per-head selection mechanism — it's building the first one
that goes beyond a two-way `if`.

**Refresh mechanism today:** `ModelBroker.refreshFromOpenRouter(openRouterClient)`
is the *only* refresh path, called once per server process (via
`ensureModelsResolved()` in both `bin/chat.js` and
`lib/ceoAgentServer.js`), always against OpenRouter's catalog only.

**The multi-provider extension, once `ProviderClient` implementations
exist (ADR-006, not built yet):** yes — `ModelBroker`'s refresh would
generalize from `refreshFromOpenRouter()` to something like
`refresh(clients)`, calling `listModels()` on OpenRouter *and* every
connected direct `ProviderClient`, merging results before resolution.
This is **not** a trivial extension: a direct provider's own
`listModels()` returns *native* ids (e.g. Anthropic's own catalog would
return something like `claude-opus-5-20260115`, no `anthropic/` prefix),
while OpenRouter's catalog uses prefixed ids (`anthropic/claude-opus-5`).
Merging them without producing duplicate or incompatible entries for the
same underlying model needs the *same* provider-prefix mapping table
ADR-006 already sketched for `resolveClientForModel()` on the dispatch
side — reused here for the resolution side. This is real, non-trivial
work that depends on `ProviderClient` implementations existing first; it
is explicitly **Phase 2** (§6), not something this scoping pass builds.

**What department-head default selection should become**, independent of
how many providers are connected: replace the hardcoded two-way `if`
with a real per-department default (configurable, defaulting to today's
`claude`/`codex` split so behavior doesn't regress on day one), stored
alongside `ceo-agent.config.json`'s existing per-install settings. This
part is buildable in Phase 1 — it only requires making today's *already-
resolved* five OpenRouter roles selectable per department, not waiting
on direct-provider connections at all.

## 5. Toggle dimensions — confirming what's real and what's a category error

Flagship/efficient/affordable/dev-work were given as one list of toggle
dimensions. **They are not actually one dimension** — this is worth
stating plainly rather than building a UI that quietly conflates two
different axes:

| Toggle | What it actually is | Real signal it maps to |
|---|---|---|
| **Flagship** | A *tier*, within a resolved role | `ModelResolver#pickFlagship` — already real, already live |
| **Efficient** | A *tier*, within a resolved role | `ModelResolver#pickEfficient` — already real, already live |
| **Dev-work** | A **role selector**, not a tier | The existing `codex` role + `ModelBroker.CAPABILITY_RECOMMENDATIONS['software_development'] = 'codex'` mapping — already real, already live |
| **Affordable** | Ambiguous — needs a decision, not an assumption | See below |

**Dev-work is not a fourth tier alongside the other three** — it's
selecting the `codex` role instead of `claude`/`gpt`/`gemini`/`grok`.
Putting it in the same toggle-chip group as flagship/efficient/affordable
implies it composes with them (e.g. "flagship + dev-work"), which it
actually does — `codex` already resolves its own flagship/efficient
tiers — but the UI needs two independent axes (role × tier), not one flat
list of four equal options, or the selector will misrepresent what's
actually configurable.

**Affordable is not yet a defined signal — flagging, not assuming.**
`pickEfficient()`'s actual logic prefers models matching
`SMALL_TIER_KEYWORDS` (`mini`/`nano`/`haiku`/`flash`/`lite`/`instant`/
`small`) and only falls back to lowest-price when no keyword match
exists — it is a *size* heuristic that usually, not always, correlates
with lower cost. "Affordable" as a distinct toggle needs one of two real
decisions, not a guess:
- **(a)** it's a UI rename of the existing `efficient` tier (zero new
  resolver logic), or
- **(b)** it's a genuinely new `pickCheapest()` resolver function that
  sorts strictly by `extractPricing().prompt` (#51's cost data) across
  *all* connected providers/models for a role, independent of the
  size-keyword heuristic.

(b) is more honest to the word "affordable" but has a real gap once
direct-provider connections exist: OpenRouter's `/models` response
includes live pricing; a direct provider's own model-list endpoint
generally does not (pricing is typically published on a static pricing
page, not a queryable API field). Cross-provider "affordable" comparison
for directly-connected providers would need a maintained static pricing
table CEO Agent owns — a real, non-trivial addition, not something
`ProviderClient.listModels()` hands over for free the way OpenRouter's
catalog does. Flagging this now so it isn't discovered mid-implementation.

## 6. Explicit phase boundary

**Phase 1 — buildable now, no `ProviderClient` implementation required:**
- Per-provider key storage: extend `.env` pattern (§2), centralize the
  currently-duplicated write logic.
- `GET`/`POST /api/config` extended from one flat `hasApiKey`/
  `apiKeyMasked` pair to a `connections` map keyed by provider.
- `ConnectionsView` UI (§3): provider list, masked-key display, key entry
  — for providers with no `ProviderClient` yet, rendered as *connected,
  not yet active*, not silently pointed at OpenRouter's data.
- `<ModelSelector>` component boundary (§3), wired to what's real today:
  OpenRouter's already-resolved catalog, plus the flagship/efficient
  tiers and the `codex` dev-work role — all real, all live, zero new
  backend work.
- Per-department default-model configuration (§4) replacing the
  hardcoded two-way `if`, still scoped to OpenRouter's five existing
  roles — real value shipped without waiting on direct connections at
  all.
- The "affordable" decision (§5) — (a) vs (b) — should be made in this
  phase, before the selector UI ships, since it changes what the toggle
  actually does.

**Phase 2 — depends on `ProviderClient` implementations existing (ADR-006's own listed future work, not built by ADR-006 and not built here):**
- Real `sdk/AnthropicClient.js` / `sdk/OpenAIClient.js` / etc.
  (ADR-006's non-goal — still someone else's PR, still security-reviewed
  separately).
- `ModelBroker`/`ModelResolver` catalog-merge across providers (§4),
  including the id-normalization work.
- `ConnectionsView`'s per-provider "not yet active" tiles become real
  model lists.
- `resolveClientForModel()` (ADR-006) actually implemented, so a chat
  call can route through a direct connection instead of always
  OpenRouter.
- "Affordable" (if decision (b) was made) extended to genuine
  cross-provider comparison, gated on solving the static-pricing-table
  gap noted in §5.

This boundary is deliberately drawn so **Phase 1 ships real, usable value
— connection storage, a working selector against OpenRouter's existing
catalog, real per-department defaults — without being blocked on Phase
2's provider-client work**, which is a separate, larger, security-
reviewed effort per ADR-006.

## 7. Hermes / agentic runtimes — confirmed out of scope

Same as ADR-006: Hermes is a bridge-pattern integration (ADR-001a), not a
model-resolution role. Nothing in this connection model touches
`BridgeExecutors.js`, `HermesBridge.js`, or how Hermes gets invoked once
#36/#56 land. BYNGE's connection layer governs chat-completion model
calls only.

## Non-goals (unchanged from ADR-006, restated for this scoping pass)

- No OAuth, no consumer-entitlement connections (§1).
- No new credential storage schema — `.env`, extended, not replaced (§2).
- No multi-user identity system (§2).
- No actual `ProviderClient` implementations (§6, Phase 2).
- No final answer on "affordable" — a decision to make in Phase 1, not
  made here (§5).
- No decision on where selected-model state persists (§3) — flagged, not
  resolved.
