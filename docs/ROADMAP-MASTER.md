# CEO Agent — Master Roadmap (50-Part, Tiered, Multi-Track)
**As of:** August 8, 2026
**Purpose:** the standing end-to-end plan. Current work is Tier 1 — not the whole plan, the first tenth of it. Each tier splits into parallel tracks assignable to different agents/sessions working the same repo simultaneously, sequenced only where tracks genuinely share files.

**Naming, current and correct:** `ceo-core/`, `departments-subagents/`, `app/` at repo root. Get this right in any new session's context.

---

## TIER 1 — Foundation Hardening (Parts 1–10) — nearly done, closing out now

| # | Part | Track |
|---|---|---|
| 1 | Real ground-truth audit (issues/PRs/test count, fresh) | Any |
| 2 | `off_limits` real code enforcement (ADR-010: dual chokepoints, structured IDs, hard block) | Backend |
| 3 | Hermes async lifecycle (#95: poll/SSE, `waiting_for_approval`, timeouts, never auto-approve) | Backend |
| 4 | Live Hermes gateway round trip | Adrian (not agent work) |
| 5 | Cost-tracking reconciliation (confirm #51-era work still accurate against current audit schema) | Backend |
| 6 | `#86`/`#88` final close (confirm against live model behavior once possible, or formally accept prompt-only verification as the ceiling) | Backend |
| 7 | Draggable sidebar resize (#110) | UI/UX |
| 8 | Stripe route-layer webhook verification (#100) | Backend |
| 9 | Full docs pass: README, `CONTRIBUTING.md`, `SECURITY.md` against real current state | Any |
| 10 | CI: extend browser-test coverage to remaining untested real UI surfaces | UI/UX |

## TIER 2 — Client Surfaces Buildout (Parts 11–20)

The 18 stubbed folders (`cli/`, `tui/`, `desktop/`, `apps-en/`) get real content. Each surface follows this repo's real standard: real code, real tests, no decorative scaffolding.

| # | Part | Track |
|---|---|---|
| 11 | CLI backend: real command layer beyond `bin/chat.js`'s current scope, scoped against what a dedicated `cli/` package needs vs. what already exists | CLI/TUI |
| 12 | CLI frontend/UI-UX: terminal output formatting, distinct from the web's design system | CLI/TUI |
| 13 | TUI backend + frontend: full-screen interactive mode (distinct from line-based CLI) | CLI/TUI |
| 14 | Desktop: Electron/Tauri shell scoping — real ADR before code, since this is new security surface (local file/OS access) | Desktop |
| 15 | Desktop: Linux build target | Desktop |
| 16 | Desktop: macOS build target | Desktop |
| 17 | Desktop: Windows build target | Desktop |
| 18 | Mobile (`apps-en`): Android — real ADR first (different runtime constraints than web/desktop) | Mobile |
| 19 | Mobile (`apps-en`): iOS | Mobile |
| 20 | Cross-surface: shared design-token/interaction-pattern reconciliation so web/desktop/mobile feel like one product | UI/UX |

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
| 28 | Multi-department parallel execution UX — multiple chat terminals open at once, sharing memory | UI/UX + Backend |
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
