# CEO Agent — Master Roadmap (50-Part, Tiered, Multi-Track)
**As of:** September 30, 2026 (revised in place; last content revision Aug 8, 2026)
**Purpose:** the standing end-to-end plan. Current work is Tier 2 — Tier 1 was *believed* closed and is **not**; see the audit below. Each tier splits into parallel tracks assignable to different agents/sessions working the same repo simultaneously, sequenced only where tracks genuinely share files.

**Naming, current and correct:** `ceo-core/`, `departments-subagents/`, `app/` at repo root. Get this right in any new session's context.

---

## GROUND-TRUTH AUDIT — Sep 30, 2026

Read this before trusting any tier status. Two of this audit's own claims were wrong on first pass and were corrected after running the code — the correction is part of the record, because "I checked and I was wrong" is the only reason to trust the rest of it.

**Measured facts, with receipts:**

| Claim | Reality | Receipt |
|---|---|---|
| Part 2 `off_limits` enforcement | **DONE — real code, two chokepoints, hard-block** ⚠️ *corrected* | `ceo-core/SkillExecutor.js:59-76` (skill dispatch, returns `reason:'off_limits_violation'` via `_finish('failed',…)`) and `sdk/BaseBridge.js:91-103` (task-type validation). `tests/OffLimitsEnforcement.test.js` — **9/9 pass**, incl. Bucket A/B `enforceable:false` non-blocking and permission-before-off_limits ordering. ADR-010's "design only" header is **stale** — the code shipped without the ADR being promoted. |
| ADR promotion state | **0 of 9 Accepted** | `grep -h 'Status:' docs/adr/*.md`: 6 × Proposed, 1 × Rejected, 1 × Open question, 1 × docs-only. Note the mismatch above: ADR-010's status line is behind its implementation. |
| Part 7 sidebar drag-resize | **DONE — real and shipped** | `9f49825`; `Sidebar.tsx:40-41` `MIN_WIDTH_PX=140`/`MAX_WIDTH_PX=320`, `:92` clamp, `:169` `role="separator"` + `aria-valuemin/max`, `:176` `onPointerDown` pointer-capture drag. |
| Web app surface | **Real, ~2.2k LOC** | `ChatView.tsx` 391, `ModelSelector.tsx` 230, `ActivityView.tsx` 186, `Sidebar.tsx` 184, `ConnectionsView.tsx` 164, `OrgView.tsx` 91, `SettingsView.tsx` 85. Backend: `api/chat/route.ts` 182, `api/config/route.ts` 157. |
| `tui/` (Parts 11–13) | **Completely empty — 0 LOC** | `find tui -name '*.js' -o -name '*.ts' -o -name '*.tsx' \| grep -v node_modules \| wc -l` → `0`. Each of `tui/{backend,frontend,ui-ux}/` holds only `.gitkeep` + a README reading *"Reserved for future work — not yet populated."* |
| Tests | Real and substantial | `tests/` ~40 files incl. `OffLimitsEnforcement.test.js`, `SkillExecutor.test.js`, `SkillDispatch.test.js`, plus `tests/browser/`, `tests/components/`. |

**Corrections made during this audit — both were my error, both caught by running the code:**

1. **First pass claimed Part 2 was "design-only, zero enforcement, 0 hits repo-wide."** That was wrong. A repo-wide `grep -r` timed out on `node_modules` and returned nothing, which I read as absence instead of as a failed search. The correct scoped search returns three files, two of them real chokepoints, and the test suite proves the behavior. **Part 2 is done.** The genuine finding is narrower and still worth fixing: ADR-010's `Status: Proposed (design only)` header was never updated after the code shipped, so the roadmap's own source of truth was lying. That is a documentation-drift bug, not an enforcement gap.
2. **First pass grepped for `draggable` and reported it absent**, contradicting the `9f49825` commit. The term is `onPointerDown`/`pointerdown` with pointer capture — the commit shipped, the search term was wrong. Re-verified present at the file:line receipts above.

**What this means for sequencing:** the planned "Part 2 is the gate on Parts 27/33/38/40" thesis is **withdrawn** — it was based on the bad grep. Those parts are not blocked by a missing foundation. What remains genuinely unfinished and load-bearing:

- **Parts 11–13 (CLI/TUI) — 0 LOC, and the surface you most want to demo.** Largest verified gap.
- **Parts 14–19 (desktop + mobile) — stub folders, no ADR, no code.**
- **Parts 21–50 — design or stub.** `gateway/`, `cli/`, `tui/`, `desktop/`, `apps-en/` are all reserved.
- **ADR status hygiene** — 9 ADRs, 0 promoted, and at least one header now provably stale. Cheap to fix, and it is what let a wrong "nearly done" claim survive from Aug 8 to Sep 30.

## TIER 1 — Foundation Hardening (Parts 1–10) — Parts 2 & 7 verified done; rest unverified

| # | Part | Track | Status (verified Sep 30) |
|---|---|---|---|
| 1 | Real ground-truth audit (issues/PRs/test count, fresh) | Any | **Done** — this section is its output |
| 2 | `off_limits` real code enforcement (ADR-010: dual chokepoints, structured IDs, hard block) | Backend | **DONE** — `SkillExecutor.js:59-76` + `BaseBridge.js:91-103`, 9/9 tests pass. ADR-010 header is stale and needs promoting. |
| 3 | Hermes async lifecycle (#95: poll/SSE, `waiting_for_approval`, timeouts, never auto-approve) | Backend | Unverified |
| 4 | Live Hermes gateway round trip | Adrian (not agent work) | Unverified |
| 5 | Cost-tracking reconciliation (confirm #51-era work still accurate against current audit schema) | Backend | Unverified |
| 6 | `#86`/`#88` final close (confirm against live model behavior once possible, or formally accept prompt-only verification as the ceiling) | Backend | Unverified |
| 7 | Draggable sidebar resize (#110) | UI/UX | **DONE** — verified in `9f49825` |
| 8 | Stripe route-layer webhook verification (#100) | Backend | Unverified |
| 9 | Full docs pass: README, `CONTRIBUTING.md`, `SECURITY.md` against real current state | Any | Unverified |
| 10 | CI: extend browser-test coverage to remaining untested real UI surfaces | UI/UX | Unverified |

## TIER 2 — Client Surfaces Buildout (Parts 11–20)

The 18 stubbed folders (`cli/`, `tui/`, `desktop/`, `apps-en/`) get real content. Each surface follows this repo's real standard: real code, real tests, no decorative scaffolding.

**Port source for the TUI (Parts 12/13):** NousResearch/hermes-agent `ui-tui/` — an Ink/React terminal client, **~65.8k LOC** across `src/`, plus a Python JSON-RPC backend in `tui_gateway/`. Directly relevant components, by size: `textInput.tsx` 1870, `appChrome.tsx` 976, `activeSessionSwitcher.tsx` 917, `appLayout.tsx` 613, `messageLine.tsx` 359, `streamingMarkdown.tsx` 166, `todoPanel.tsx` 95, `agentsPanel.tsx` 83.

**Scope this honestly — it is not a copy job.** The Hermes TUI is bound to Hermes' own JSON-RPC gateway (`tui_gateway/`), its own agent/session model, its own theme and widget SDK. A straight file-copy produces a non-running client. The portable work is: layout and chrome patterns, the composer/input metrics, message rendering, and the session-switcher interaction model — **rebound to `ceo-core`'s existing agent registry, department, and cost model.** Treat it as a reference implementation to read, not a folder to `cp`.

There is no `sidebar` component in Hermes' TUI (it has an ambient rail + overlays, not a left nav). The draggable-sidebar design that *does* exist is ceo-agent's own `Sidebar.tsx` (Part 7, shipped) — reuse that interaction, don't port one that isn't there.

| # | Part | Track | Status (verified Sep 30) |
|---|---|---|---|
| 11 | CLI backend: real command layer beyond `bin/chat.js`'s current scope, scoped against what a dedicated `cli/` package needs vs. what already exists | CLI/TUI | Unverified |
| 12 | CLI frontend/UI-UX: terminal output formatting, distinct from the web's design system | CLI/TUI | Unverified |
| 13 | TUI backend + frontend: full-screen interactive mode (distinct from line-based CLI) — **port from hermes `ui-tui/`, rebind to `ceo-core`; see scope note above** | CLI/TUI | **Not started — 0 LOC. In progress now.** |
| 14 | Desktop: Electron/Tauri shell scoping — real ADR before code, since this is new security surface (local file/OS access) | Desktop | Unverified |
| 15 | Desktop: Linux build target | Desktop | Unverified |
| 16 | Desktop: macOS build target | Desktop | Unverified |
| 17 | Desktop: Windows build target | Desktop | Unverified |
| 18 | Mobile (`apps-en`): Android — real ADR first (different runtime constraints than web/desktop) | Mobile | Unverified |
| 19 | Mobile (`apps-en`): iOS | Mobile | Unverified |
| 20 | Cross-surface: shared design-token/interaction-pattern reconciliation so web/desktop/mobile feel like one product | UI/UX | Unverified |

## TIER 3 — Integration & Swarm Layer (Parts 21–30)

| # | Part | Track |
|---|---|---|
| 21 | Planner/Worker engineering swarm under CTO — real ADR (coordination pattern, memory isolation, cost control) before code | Backend/Swarm |
| 22 | Swarm registry (active/historical swarm tracking, mirrors existing agent registry pattern) | Backend/Swarm |
| 23 | OpenClaw integration — real bridge, same pattern as Hermes (contract verified against real source first) | Backend/Swarm |
| 24 | T3Agent integration — same discipline, gated on T3Agent actually existing/being real and reachable | Backend/Swarm |
| 25 | Kimi Swarm integration — same discipline | Backend/Swarm |
| 26 | `gateway/` real implementation — what this stub folder actually becomes | Backend |
| 27 | Cross-swarm cost/budget enforcement (ties to Tier 1 Part 5's cost tracking) | Backend |
| 28 | Multi-department parallel execution UX — multiple chat terminals open at once, sharing memory | UI/UX + Backend | Unverified. **This is the "chat bin" work.** The web app's chat surface is a single `ChatView.tsx`; multi-terminal means per-department panes, not just a wider sidebar. Blocked in practice on Part 2 — a multi-department surface that fans out work across agents is exactly where unenforced `off_limits` bites. |
| 29 | Real memory/context injection into swarm workers (layered, isolated by default, per the earlier swarm brainstorm) | Backend |
| 30 | Swarm observability (real tracing across Planner→Workers→Judge, not just top-level audit) | Backend |

## TIER 4 — Protocol & Plugin Ecosystem (Parts 31–40)

| # | Part | Track |
|---|---|---|
| 31 | MCP Import — real ADR first (this is a new, large security surface) | Backend/Protocol |
| 32 | MCP client layer implementation | Backend/Protocol |
| 33 | Tool discovery + department-level permission gating for imported MCP tools | Backend/Protocol |
| 34 | "Connect MCP Server" UI/CLI | UI/UX + CLI |
| 35 | Claude-style bundled plugins — real ADR on what a "plugin" means in this repo's own architecture before building | Backend/Protocol |
| 36 | Plugin dashboard / management UI | UI/UX |
| 37 | Curated skill import at scale from ClawHub (real per-item license verification, same standard as every prior pull — no bulk import) | Backend |
| 38 | MCP Export — selected skills/bridges callable by external clients, gated behind Tier 1 Part 2 (`off_limits` enforcement) actually being real | Backend/Protocol |
| 39 | Connector marketplace UI (discover/install real connectors) | UI/UX |
| 40 | Full plugin/connector security review pass before any of this ships to real users | Backend (security-focused) |

## TIER 5 — WORKSPACES & Relay (Parts 41–45)

| # | Part | Track |
|---|---|---|
| 41 | WORKSPACES abstraction layer — real ADR (provider interface, not Buzz-specific) | Backend |
| 42 | Buzz relay integration as the first real WORKSPACES provider | Backend |
| 43 | Additional providers (Slack, GitHub, Discord, Notion) — one at a time, real bridges | Backend |
| 44 | "Fetch work" actions — one-command pulls (emails, docs, tasks) across connected workspaces | Backend + UI/UX |
| 45 | Cross-workspace unified activity feed (extends Tier 1's existing real audit-log-backed Activity view) | UI/UX + Backend |

## TIER 6 — Executive Marketplace & Scale (Parts 46–50)

| # | Part | Track |
|---|---|---|
| 46 | Executive DNA / personality archetypes — real system, building on the original persona docs already written in `ceo-core/personas/` | Backend + UI/UX |
| 47 | Personality composability (leadership style × reasoning framework × communication register, per the earlier brainstorm) | Backend |
| 48 | Executive Packs (pre-configured department bundles) — design first, real ADR on packaging/versioning | Backend |
| 49 | Multi-tenant / hosted SaaS architecture — this is the biggest single security/architecture shift in the whole roadmap, gets its own dedicated planning pass, not a bullet point | Backend (major) |
| 50 | Desktop-primary cutover — the point where desktop, not web/local, is the recommended default install | Desktop + UI/UX |

---

## How to run this going forward

- **Parallel tracks, same repo, real time:** e.g. UI/UX handles Tier 1 Parts 7/10 + Tier 2 Part 20 while Backend handles Tier 1 Parts 2/3/5/6/8 simultaneously — different files, no collision, no reason to sequence them.
- **Sequence only on real file overlap**, not by default. If two parts might touch the same file, say so explicitly when batching; otherwise assume parallel-safe.
- **Every part still gets the standing rules** — real tests, real license checks, ADR before new security surface, no merge without explicit go/no-go, honest scope-reduction over decorative completeness.
- **This document gets revised as tiers complete**, not re-derived from scratch each time — update it in place.

## Standing rules — added Sep 30, 2026, after the audit

These exist because the audit found the failure modes they prevent — in the roadmap's own prior claims **and** in the audit's own first pass. Not aspirational; each names something that actually happened.

- **A `grep` that times out is not a `grep` that found nothing.** This is the big one. My first pass ran `grep -r` over the repo root, it hit `node_modules` and died, and I reported "0 hits" as if it were evidence. It cost a full wrong conclusion about the security foundation. **Scope every search to real source dirs, and if a search times out or errors, the result is unknown — not negative.** A negative claim about absence is the most expensive kind of mistake in an audit.
- **Verify a claim's real name before reporting it absent.** `9f49825` shipped drag-resize; I searched for the word "draggable" and reported it missing. Search for the *identifier* (`onPointerDown`, `MIN_WIDTH_PX`), not the feature's English description.
- **Run the test, don't infer the behavior from the header.** `OffLimitsEnforcement.test.js` takes 372ms and settles the question definitively. An ADR's `Status:` line is a claim about code; the test is the fact. Where they disagree (ADR-010), the code wins and the header is a bug to fix.
- **A part closes on merged code + a passing test**, never on a design document. 9 ADRs, 0 promoted — and one header provably behind its implementation.
- **Every status cites a receipt** — commit, `file:line`, or command output. "Done" without one is treated as "Unverified."
- **Mark status at the granularity of the risk, not the tier.** Tier status is the least confident thing in the plan. Parts 2 and 7 are genuinely done; that does not make Tier 1 healthy, and 8 unverified parts is not the same as 8 broken ones.
- **Port work states the rebind, not just the source.** Part 13's row names `hermes ui-tui/` and, in the same sentence, what must change for it to run against `ceo-core`. A port that only names the donor is half a spec.

### Known-red baseline, Sep 30, 2026

`npm test` is **not green** and was not green before this audit. Component suite (66 tests) passes. The core suite has **9 failing**, all from `919e188 "changes for v3 - features not bugs"` — that commit added `opencode` to `lib/providers.js` without adding it to the key-prefix/verifier tables the tests assert against. This is ordinary feature debt, unrelated to Parts 1–13, but it means **"npm test" cannot currently be used as the go/no-go gate for new work.** Fix it before the first TUI PR, or the gate is decorative.

| Failing test | File |
|---|---|
| `every provider id in lib/providers.js has both a prefix list and a live verifier` | `tests/ProviderKeyValidation.test.js:28` |
| `validateKeyShape accepts a correctly-prefixed key for every provider` | `tests/ProviderKeyValidation.test.js` |
| `verifyProviderKey reports valid on a 200 from the provider` | `tests/ProviderKeyValidation.test.js` |
| `a network failure is NOT reported as an invalid key` | `tests/ProviderKeyValidation.test.js` |
| `a 429 is reported as rate_limited, not as an invalid key` | `tests/ProviderKeyValidation.test.js` |
| `buildConnections reports hasKey/active per provider and never leaks the raw key` | `tests/ConnectionsConfig.test.js` |
| `buildCatalog reads resolved tiers (including "cheapest") per role from ModelBroker` | `tests/ConnectionsConfig.test.js` |
| `upload directory and file are not group/world readable` | (POSIX-only assertion; likely skips wrong on Windows) |
| `start() polls tick() on an interval and stop() halts it` | scheduler test |

**Fix for the first seven:** add the `opencode` prefix + `verifyProviderKey` entry to the tables in `lib/providers.js` / `lib/connectionsConfig.js`, or scope the assertions to a maintained allowlist. The eighth is a platform-gating bug (a POSIX permission assertion running on Windows) — same class as the repo's standing "use the marker, never a bare skipif" rule. The ninth needs a look.

### Re-run this before trusting the plan again

```bash
# 1. Is off_limits enforcement real code? (SCOPED — never bare -r at repo root; `core/` is stale, the real dir is `ceo-core/`)
grep -rIl 'off_limits\|offLimits' --include=*.js --include=*.ts ceo-core sdk registry
node --test tests/OffLimitsEnforcement.test.js

# 2. Has any ADR been promoted past "Proposed", and does any header contradict its code?
grep -h 'Status:' docs/adr/*.md | sort | uniq -c

# 3. Is the TUI still a stub?
find tui -name '*.js' -o -name '*.ts' -o -name '*.tsx' | grep -v node_modules | wc -l

# 4. What is the red baseline? (expect 9 failures until the opencode provider entry is completed)
npm test 2>&1 | grep -E '^(PASS|FAIL):|ℹ (pass|fail)'
```

**Rule of thumb for this repo:** design discipline is genuinely strong — nine real ADRs is not nothing, and the enforcement foundation in Parts 2/7 is real, tested code. The gap is *promotion and verification*, not thought or effort. **Fix ADR-010's stale status line; it is five minutes and it is what let a wrong "nearly done" claim stand for seven weeks.**
