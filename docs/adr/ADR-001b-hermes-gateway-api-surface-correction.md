# ADR-001b: Correction — the gateway's task-submission API is a separate, opt-in adapter

- **Status:** Documented correction (docs only — no execution/adapter code in this change)
- **Date:** 2026-07-27
- **Tracking issue:** [#56](https://github.com/tradersurfer/ceo-agent/issues/56) (the investigation this ADR reports), [#36](https://github.com/tradersurfer/ceo-agent/issues/36) (implementation tracker — still gated, unaffected by this correction beyond the API surface it will target)
- **Amends:** [`ADR-001a`](./ADR-001a-hermes-gateway-client-model.md) — corrects its description of "the gateway's task-submission API," resolving one of ADR-001a's two listed *Open items*. Does **not** change ADR-001a's *Decision*: "HTTP client of a gateway API, not subprocess supervisor" was and remains correct. Only the description of what that API concretely is was wrong, and is corrected here.
- **Related:** `docs/adr/ADR-001-hermes-sandboxed-execution.md`
- **Bundled with this document:** a submodule pin bump (`departments/operations/hermes/hermes-agent`, `46e87b14` → `dbc18c6`) and a fresh-pin re-verification of every claim below — bundled in the same PR because the pin bump is the evidence the re-verification section reports on, not a separable concern.

---

## Context

ADR-001a's *Decision* section describes `HermesBridge.runTask()` as issuing "an authenticated HTTP request to a configured gateway endpoint" against "the `hermes gateway`'s task-submission API," written as if `hermes gateway start` exposes one HTTP surface. ADR-001a's own *Open items* section already flagged that this had not been verified against source — issue #56 was filed specifically to close that gap.

Issue #56's investigation (against the same pinned `hermes-agent` submodule commit `46e87b14fd6c943ef0d6671fb0d74c5dde5d4c6b` ADR-001a's own audit used) found that `hermes gateway start` actually runs **two separate HTTP servers**, not one:

1. **The dashboard server** (`hermes_cli/web_server.py`, default `127.0.0.1:9119`) — a large FastAPI app (150+ routes) serving the human-facing management UI and a WebSocket-based chat backend (`/api/ws`, `/api/console`, `/api/pty`, session/CRUD/config/cron/skills endpoints, etc.). This is what Hermes Desktop connects to. **It is not a task-submission API for a programmatic client** — nothing in it is shaped for CEO Agent's use case.
2. **The `api_server` platform adapter** (`gateway/platforms/api_server.py`) — a separate, **opt-in** adapter. Its module docstring documents it as something "any OpenAI-compatible frontend (Open WebUI, LobeChat, LibreChat, AnythingLLM, NextChat, ChatBox, etc.) can connect to... by pointing at `http://localhost:8642/v1` and authenticating with `API_SERVER_KEY`" — named third-party chat UIs, not literally "a programmatic client" (an earlier draft of this document misquoted that phrase as if it were lifted from the docstring; it wasn't, and this is the corrected wording). The adapter's actual route table — `POST /v1/runs`, `POST /v1/chat/completions`, `POST /v1/responses`, etc., all plain REST/JSON over HTTP with Bearer auth — is what makes it usable by a backend process like CEO Agent too, even though the docstring's own framing is chat-UI-first. This is the surface ADR-001a was actually describing, even though it didn't yet have a name or a verified contract.

Conflating the two would have meant a future `HermesGatewayClient` implementation targeting the wrong port, the wrong auth model, and a route surface (the dashboard's WS-based chat) that was never designed for one-shot programmatic task submission.

## Correction: the real task-submission surface

The `api_server` adapter, not the dashboard, is what `HermesGatewayClient` (per #36, still gated) must target:

- **`POST /v1/runs`** — submit a task; returns immediately with `{"run_id": "run_<uuid>", "status": "started"}`, HTTP `202`.
- **`GET /v1/runs/{run_id}`** — poll status: `{"object": "hermes.run", "run_id", "status", "created_at", "updated_at", ...}`.
- **`GET /v1/runs/{run_id}/events`** — SSE stream of lifecycle events (`message.delta`, `approval.request`, `run.completed`, `run.failed`, `run.cancelled`).
- **`POST /v1/runs/{run_id}/approval`** / **`POST /v1/runs/{run_id}/stop`** — resolve a pending tool-approval, or interrupt a running task.
- **Status vocabulary**: `queued` → `running` → (`waiting_for_approval` ⇄) → `completed` | `failed` | `cancelled`. This maps cleanly onto `HermesBridge`'s existing `triggered`/`queued`/`blocked`/`failed` result vocabulary (`waiting_for_approval` ≈ `blocked`) — ADR-001a's status-mapping intent holds, and now has a concrete contract to map against.
- **Auth**: `Authorization: Bearer <API_SERVER_KEY>`, checked with a constant-time compare. The gateway refuses to start this adapter without a key of at least 16 characters — there is no unauthenticated mode for this surface by design.
- **Default bind**: `127.0.0.1:8642` — distinct from the dashboard's `127.0.0.1:9119`.
- **Opt-in, not default**: enabled via `API_SERVER_ENABLED=1` (or `platforms.api_server.enabled: true` in `config.yaml`) plus `API_SERVER_KEY`. A default `hermes gateway start` does **not** expose this adapter. This is new operator-setup surface — CEO Agent's own setup docs will need to instruct the operator to enable it and provision a key, not just "point at a gateway URL."
- **Concurrency**: `platforms.api_server.extra` / `gateway.api_server.max_concurrent_runs` (default `10`); requests over the cap receive `429` + `Retry-After`.

A worthwhile adjacent distinction, so a future reader doesn't conflate the two: the Hermes Desktop app's OAuth/username-password remote-gateway connection feature (confirmed real in issue #56's investigation) authenticates a *human* to the *dashboard* server — it is unrelated to the `api_server` adapter's Bearer-token auth, which is what `HermesGatewayClient` will use. Different servers, different auth models, different consumers.

## Fresh-pin re-verification — two real drifts found

The pinned submodule commit this document was originally written against (`46e87b14`, 2026-07-14) was confirmed stale relative to upstream — 2,881 commits behind current `main`. Per the follow-up this document's *Non-goals* flagged, the pin was bumped to `dbc18c6` (2026-07-27, upstream's current tip at bump time) in the same change that adds this section, and every claim above was re-read against the fresh commit before being left as-is. Almost everything held byte-for-byte identical — routes, payload shapes, the status vocabulary, SSE event names, the `HERMES_HOME`/config search order, and the dashboard-vs-`api_server` separation are all unchanged. Two real, small drifts did turn up, both relevant to `HermesGatewayClient`'s eventual implementation (#36, still gated):

1. **`API_SERVER_ENABLED` no longer force-enables the adapter on its own.** At the old pin, setting that env var alone was enough to enable `api_server`, even without a valid key — which then failed the startup guard and left the adapter spinning in a broken reconnect loop. Upstream commit `683059feb` ("fail closed when API_SERVER_KEY strength can't be verified") changed this: enablement now depends solely on having an actual usable (≥16-character) `API_SERVER_KEY` — `API_SERVER_ENABLED` is parsed but no longer has any effect. **Implication for `HermesGatewayClient`:** its setup/connection code must treat "adapter enabled" and "adapter has a valid key" as the same fact now (they can no longer diverge into a broken half-enabled state) but should still surface "no key configured" as its own distinct, actionable error rather than assuming any configured gateway URL is necessarily reachable — a key can still be missing or too short, which now means the adapter simply never started, not that it started in a broken state.
2. **The auth-failure error code changed.** Commit `32f7c5afa` ("distinguish gateway auth 401 from provider API key errors") changed a bad/missing `API_SERVER_KEY`'s `401` response body from `{"error": {"code": "invalid_api_key", ...}}` to `{"error": {"code": "gateway_auth_failed", ...}}` (message also changed to explicitly name `API_SERVER_KEY`). **Implication:** `HermesGatewayClient`'s error handling must match against `gateway_auth_failed`, not `invalid_api_key` — the old code would no longer fire on the current adapter and any client-side error classification written against it would silently misclassify a real auth failure.

## Open items status (from ADR-001a)

ADR-001a listed two unresolved open items blocking implementation. Issue #56 answered both:

1. **The `config.yaml`/`HERMES_HOME` layout** — resolved. `HERMES_HOME` resolves via env var → platform default (`~/.hermes` POSIX, `%LOCALAPPDATA%\hermes` Windows) → optional profile-scoped subpath; config search order is `{HERMES_HOME}/config.yaml` → `./cli-config.yaml` fallback, env vars win; full schema documented at `cli-config.yaml.example` in the submodule.
2. **The gateway's task-submission API surface** — resolved by this document, above.

Real unknowns remain, correctly left as operator configuration rather than something resolvable from source: the actual `API_SERVER_KEY` value (must be generated per-deployment), which sandbox/terminal backend the operator's gateway is configured for, whether they've enabled the `api_server` adapter at all, and network reachability if CEO Agent and the gateway aren't co-located. These are the same class of "operator's deployment, not CEO Agent's code" boundary ADR-001a already drew for sandboxing generally.

## Non-goals (unchanged from ADR-001a)

- Does not implement `HermesGatewayClient` or any adapter code — #36 remains gated pending review of this correction and a fresh-pin re-verification pass (tracked separately).
- Does not revisit or change ADR-001a's core decision (gateway API client, not subprocess supervisor) — that reasoning is untouched.
- Does not implement any fix for the two drifts the fresh-pin re-verification found (`API_SERVER_ENABLED`'s changed semantics, the auth-error code change) — those are implementation-time concerns for `HermesGatewayClient` itself (#36, still gated), not something a documentation correction resolves.

## Consequences

- `HermesGatewayClient` (#36, still gated) now has a verified, concrete target: `POST /v1/runs` on the `api_server` adapter, Bearer-token auth, the status vocabulary above — not the dashboard server ADR-001a's language could have been misread as describing.
- CEO Agent's eventual setup/operator documentation for Hermes integration must cover enabling `api_server` and provisioning `API_SERVER_KEY` explicitly — this was not previously known to be necessary.
- Implementation is still gated on Adrian's explicit go-ahead — this document (now including the fresh-pin re-verification and its two drift findings) is a prerequisite satisfied, not a green light in itself.
