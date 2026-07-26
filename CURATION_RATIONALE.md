# Curation rationale — issue #23

This documents the actual curation process for issue #23 ("curate top agent
skills from awesome-llm-apps"), including the candidates that were rejected
and why. This supersedes the invented, unregistered, non-functional "skills"
that shipped in PR #42 (closed without merging — see that PR's audit comment
for the full list of defects). Nothing in this document is aspirational:
every claim here ties to a specific file in this repository.

## Source

[`Shubhamsaboo/awesome-llm-apps`](https://github.com/Shubhamsaboo/awesome-llm-apps),
directory `agent_skills/`, fetched directly from the live repository (not
from memory or a prior report). The repository is licensed
[Apache License 2.0](https://github.com/Shubhamsaboo/awesome-llm-apps/blob/main/LICENSE)
at the root; several individual skills additionally carry an explicit
`license: Apache-2.0` field in their `SKILL.md` YAML frontmatter.

As of this curation, `agent_skills/` contains 6 skill directories plus a
shared `evals/` harness:

| Skill | Has `scripts/`? | License evidence |
|---|---|---|
| `advisor-orchestrator-worker` | No (references only) | Apache-2.0 (per README) |
| `commit-archaeologist` | Yes (`archaeologist.py`) | Explicit `license: Apache-2.0` frontmatter |
| `project-graveyard` | Unconfirmed | Explicit `license: Apache-2.0` (per SKILL.md body) |
| `scope-creep-detector` | Yes (`scope_creep.py`) | Explicit `license: Apache-2.0` frontmatter |
| `self-improving-agent-skills` | Unconfirmed | Repo-root Apache-2.0 (no per-skill statement found) |
| `thinking-out-loud` | No (references only) | Repo-root Apache-2.0 (no per-skill statement found) |

## Selected: 1 of 6 — `scope-creep-detector`

**Ported as:** `core/skills/scopeCreepSkill.js`, skill id `scope_creep_detection`.

**Why it's genuinely relevant:** this project already runs on strict
"one department head / one logical concern per PR" discipline (an explicit,
repeatedly-enforced standing rule — most recently the whole reason PR #42 was
closed rather than revised). `scope-creep-detector` classifies a git diff
against a stated one-line intent and flags files, new dependencies, public
API renames, config/CI edits, and oversized hunks that fall outside that
intent. That is a direct, real fit for the CTO department's own code-review
discipline — not an invented use case.

**Why it's real, not decorative:** the source has an actual 528-line Python
implementation (`scripts/scope_creep.py`) with a deterministic unified-diff
parser and classifier — no placeholder logic, no hardcoded output. It has
zero runtime dependencies (Python stdlib only) and, in its `--diff -`/stdin
mode, makes no network calls and touches no filesystem beyond reading the
diff text it's given.

**How it was adapted, and why:**
- The original CLI supports two families of input: (a) point it at `--repo
  <path>` and it shells out to `git diff`/`git log` itself, or (b) hand it
  diff text directly via `--diff -` (stdin) or `--diff <file>`. This port
  implements **only mode (b)**. CEO Agent's skill system has no established
  pattern for a skill that shells out to an external binary against an
  arbitrary filesystem path, and this project's own prior security work
  (ADR-001, on Hermes sandboxing) treats any new process-spawning execution
  capability as something that needs its own dedicated security design, not
  something to introduce incidentally inside a skill-curation PR. The ported
  skill (`core/skills/scopeCreepSkill.js`) therefore takes `diffText` (a
  string) and `intent` (a string) directly as input — no `child_process`, no
  `fs`, no `git` invocation anywhere in the file. This is a real, officially
  supported mode of the original tool, not an invented restriction.
- The algorithm (diff parsing, intent tokenization, dependency-manifest
  detection for `requirements.txt`/`package.json`/`pyproject.toml`, API
  rename pairing by proximity, oversized-hunk and formatting-only-file
  detection) was reimplemented in JavaScript to match the documented Python
  behavior. The symbol-declaration regex was additionally extended to
  recognize JS/TS `function`/`class` declarations alongside the original's
  Python-only `def`/`class`, since this port runs inside a JS/TS-first
  codebase. This is disclosed as a modification in the file's header comment
  per Apache-2.0 §4(b).
- Registered through the **existing** `core/SkillRegistry.js` /
  `registry/skill-registry.json` path — the same registration mechanism
  every other skill in this project uses. No second registry, no
  config-driven auto-loader (that was PR #42's core architectural mistake).
  Wired into `core/RegistryLoader.js` with a plain `require` + registration
  call, exactly mirroring how `registerExampleSkills` and
  `registerManagerSkills` are wired.
- Permission-gated to `cto_agent` only, in both `organization/Organization.js`
  (the structure `SkillExecutor`'s permission check actually reads) and
  `registry/agent-registry.json` (kept in sync for consistency with the
  existing pattern, though it is not itself consumed by the permission
  check). No other department head was given this skill — it doesn't fit
  their mandate.
- Every outcome (success, input-validation failure, permission denial,
  timeout) is audited via the existing `SkillExecutor`/audit-log pattern,
  with no new code path — this is inherited for free from
  `SkillExecutor.run()`.
- Apache-2.0 attribution (original author, source URL, license, and a
  statement that the file has been modified) is preserved in a header
  comment at the top of `core/skills/scopeCreepSkill.js`.

**Real tests:** `tests/ScopeCreepSkill.test.js`, in the same style as
`tests/SkillExecutor.test.js` and `tests/ManagerSkills.test.js` — schema and
permission registration, an in-scope/likely-creep classification on a real
two-file diff, an oversized-hunk detection, a formatting-only-file detection,
an API-rename detection, input validation failure, an invalid
`hunkThreshold`, permission denial for an unauthorized agent, an
unregistered skill name, a successful-execution audit record, and timeout
handling. 12 tests, all exercising real classification logic against real
diff text — none of them assert on hardcoded/mocked output.

## Rejected: 5 of 6

**`commit-archaeologist`** — real code, real Apache-2.0 attribution, and a
genuinely useful concept (explaining why code exists before a risky
refactor). Rejected anyway: unlike `scope-creep-detector`, its actual value
requires reading local git history (`git log`, `git log -L`, `git blame`)
against a real repository path — there is no diff-text-only mode to fall
back to. Wiring that into a CEO Agent skill means either shelling out to
`git` against a caller-supplied path (the exact "arbitrary shell execution
against unrestricted filesystem" class this project has deliberately not
enabled anywhere else — see ADR-001) or scoping it to a single fixed,
server-configured repository root, which is itself a new execution-boundary
design decision this curation pass shouldn't make unilaterally. Flagging as
a strong future candidate *contingent on* a subprocess-execution security
design analogous to ADR-001's for Hermes — not rejected for quality, rejected
for exceeding this project's current security boundary.

**`project-graveyard`** — real code, Apache-2.0. Rejected: its actual job is
scanning the *entire local machine* for git repositories to find abandoned
side projects — a strictly larger filesystem-scanning footprint than
`commit-archaeologist`, with no bounded-input mode at all. Also not really a
CEO Agent department concern (personal developer project archaeology, not a
business function any department head owns).

**`advisor-orchestrator-worker`** — Apache-2.0, but it's a prompt-engineering
orchestration pattern for a coding agent to follow (worker/orchestrator/
advisor roles), not a discrete callable function with an input/output
contract — it has no `scripts/` directory at all, only reference markdown.
It also hardcodes specific external tools ("Antigravity CLI", "Gemini 3.5
Flash", "claude CLI"), which would mean a second, competing model-routing
path outside `core/ModelResolver.js` — exactly the kind of parallel system
this project's standing rule forbids, independent of the missing-scripts
problem.

**`self-improving-agent-skills`** — hard-requires Google ADK and Gemini
specifically (another competing, non-OpenRouter model path), and its actual
function is self-modifying agent capability — a skill that rewrites other
skills. That's a materially different risk class from anything else in this
project's skill system and not something to introduce as a side effect of a
curation pass.

**`thinking-out-loud`** — no `scripts/` directory (reference markdown only),
and its entire premise is auditing *voice dictation* input before acting on
it. CEO Agent's chat pipeline is text-only today (confirmed separately while
investigating issue #44) — there is no voice input path for this skill to
attach to, so it isn't a callable skill in this system's current shape. The
underlying idea (surface inferred assumptions before acting on them) may be
worth revisiting as a future prompt-behavior pattern, but it is not a
SkillRegistry-shaped port today.

## Why 1, not 3–5

The instruction for this curation was "3–5 max, not bulk import" —  an upper
bound against over-importing, not a quota to fill. Applying the same
standard used to close PR #42 (real integration, real tests, real security
boundaries, no invented relevance) to this batch of 6 candidates leaves
exactly one that clears all three bars. Forcing two to four more into this
PR to hit a target number would repeat the mistake this curation exists to
correct.
