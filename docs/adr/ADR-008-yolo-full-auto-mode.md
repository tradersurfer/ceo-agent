# ADR-008: YOLO / full-auto mode — not now

- **Status:** Rejected for the current roadmap (design analysis only — no execution code in this change; may be revisited if the prerequisites below are later satisfied)
- **Date:** 2026-07-28
- **Related:** `SECURITY.md`; [`ADR-001`](./ADR-001-hermes-sandboxed-execution.md) / [`ADR-001a`](./ADR-001a-hermes-gateway-client-model.md) (default-deny precedent for untrusted execution surfaces); `docs/BACKLOG-vision.md` ("YOLO / full-auto mode" backlog entry, which this ADR resolves); `departments/executive/ceo-agent/CONTRACT.md` (Type 1/Type 2 escalation authority); `registry/agent-registry.json` (`off_limits` fields)
- **Origin:** `docs/BACKLOG-vision.md` flagged this as needing "its own ADR first — explicit scope, explicit non-goals, reviewed before code" before any implementation could be considered. This is that ADR.

---

## Context

AionUi (Apache-2.0, an open-source agent UI Adrian reviewed as product reference — see `docs/BACKLOG-vision.md`) ships a "YOLO mode" / full-auto feature: auto-approve all agent actions without confirmation, removing the human-in-the-loop step entirely. The backlog entry asks whether CEO Agent should build a comparable feature.

This ADR evaluates that question against what this project's own documents already commit to, verified directly from source rather than assumed.

### What "auto-approve all agent actions" would have to override

**1. `SECURITY.md`'s own documented gap.** As of this ADR, `SECURITY.md`'s "What's NOT yet handled" section states, verbatim:

> **Human-in-the-loop enforcement beyond task-type allowlisting** — the bridges block unauthorized task types, but no additional confirmation step exists for high-stakes actions (e.g. sending real client emails, real financial transactions) beyond what you configure in your own runtime wiring.

Read plainly, this is not a gap that full-auto mode would close — it is the exact gap full-auto mode would widen. The sentence already concedes that no confirmation step exists today beyond task-type allowlisting; a YOLO mode's entire premise is removing whatever confirmation steps an operator *does* configure in their own runtime wiring, which is the one mitigation `SECURITY.md` points to as currently available. Shipping full-auto would change this line from "a documented gap the operator can partially close themselves" to "a gap this scaffold actively encourages closing in the wrong direction."

**2. `CONTRACT.md`'s Type 1 / Type 2 escalation authority.** `departments/executive/ceo-agent/CONTRACT.md` draws the actual human-in-the-loop line this codebase currently has:

> You may autonomously decide Type 2 matters: reversible, low-cost, bounded actions within assigned authority and configured permissions. These do not require approval merely because they involve judgment.
>
> You must escalate Type 1 matters: irreversible or difficult-to-reverse commitments, high-cost or high-impact actions, decisions outside assigned authority, or decisions with material legal, financial, security, people, regulatory, or reputation exposure. Consult the relevant department heads and obtain explicit authorization from {{PRINCIPAL_NAME}} before execution.

and, in the same document:

> Permission is deny-by-default. A skill appearing in an agent profile permits invocation through the configured executor; it does not expand the handler's authority, authorize external side effects, or **bypass human approval**.

A global auto-approve toggle is, definitionally, a way to bypass this Type 1 escalation path and the "does not... bypass human approval" clause — not an adjustment to it. Any full-auto design has to either exempt itself from `CONTRACT.md` (a contract change, not a feature flag) or find a way to keep Type 1 escalation intact while auto-approving Type 2 only — which is a materially narrower feature than what "auto-approve all agent actions" and AionUi's feature both describe.

**3. The standing no-merge-without-human-go/no-go rule.** This project has never had this written as a single freestanding policy document; it is enforced by practice and referenced in-line. Verified occurrences:
   - `CURATION_RATIONALE.md` describes it as a "repeatedly-enforced standing rule," citing PR #42 — closed rather than merged specifically because it violated this discipline (invented, unregistered, non-functional skills shipped without the review this rule requires).
   - `docs/BACKLOG-vision.md` restates it directly in the YOLO/full-auto backlog entry itself: "The standing no-merge-without-human-go/no-go rule this project operates under — nothing here ships without an explicit human decision, which is close to the opposite of what full-auto mode asks for by design."

   This ADR did not find a dedicated policy file (e.g. a section in `CONTRIBUTING.md`) stating the rule in isolation — `CONTRIBUTING.md` gets close ("open an issue before starting significant work," "keep PRs focused") but doesn't use this exact language. The rule exists as consistently-cited practice, not as a single canonical source. That itself is worth naming plainly rather than overstating: this ADR is not pointing at one paragraph that says "no merge without a human"; it's pointing at a pattern applied every time it has come up (PR #42, and this backlog entry's own framing).

**4. Every department's `off_limits` list.** Verified directly in `registry/agent-registry.json` (all nine agent entries carry one). Representative examples, quoted verbatim:
   - `ceo_agent`: `"Live financial transactions"`, `"Unauthorized production deployments"`, `"Changing secrets or credentials"`, `"Making legal guarantees"`, `"Making financial promises"`
   - `cfo_agent`: `"Live financial transactions without approval"`, `"Overriding the CEO Agent"`
   - `hermes`: `"Changing credentials"`, `"Moving money"`, `"Making legal claims"`, `"Changing pricing"`, `"Approving production deployments"`, `"Deleting source files"`, `"Overriding the CEO Agent"`
   - `clo_agent`: `"Making legal guarantees"`, `"Overriding the CEO Agent"`

   Structurally, `off_limits` is a flat array of plain-English strings per agent object in `registry/agent-registry.json` — declarative documentation of what an agent must not do, co-located with that agent's `capabilities`/`skills` arrays. **It is important to state accurately, not assume: a repo-wide search of every `.js` file in this codebase found zero references to `off_limits`.** Nothing in `SkillExecutor`, `Organization.js`, or any bridge currently reads this field at runtime to block an action. It is asserted in the registry and in each agent's contract/behavior docs, not mechanically enforced by code today.

   This cuts against full-auto mode in the opposite direction from what it might first appear: it is not that `off_limits` is a robust code gate that YOLO mode would need to bypass — it is that `off_limits` is currently **only** upheld by the human-in-the-loop review this project relies on in the gap left by code enforcement. Removing that human review, as full-auto mode's premise requires, would remove the only mechanism currently keeping `off_limits` meaningful at all. A future full-auto design would need `off_limits` to become code-enforced *first*; today it would just go unenforced, silently.

### The AionUi precedent

`docs/BACKLOG-vision.md` already records the relevant finding from prior research in this project, cited here rather than re-derived: AionUi is Apache-2.0 and treated elsewhere in this backlog as a reasonable architectural reference point (see the "Team Mode" entry, validated conceptually), but **it independently failed a third-party automated security scan with high-severity findings**, specifically flagged in the same backlog entry that raised YOLO mode as an idea worth evaluating. The backlog document is explicit that this is "a signal about the specific auto-approval feature class, not a judgment on the rest of this backlog" — i.e., it isn't grounds to distrust AionUi generally, but it is a concrete, sourced data point that the specific feature class this ADR evaluates has already produced a high-severity security outcome in a comparable, same-license, same-domain implementation. That is directly on point for a design that proposes removing confirmation gates, and this ADR treats it as such rather than as incidental background.

## Decision drivers

1. A feature whose entire purpose is removing confirmation steps must be evaluated against what those confirmation steps are currently protecting — not designed first and reconciled with policy later. Three separate documents (`SECURITY.md`, `CONTRACT.md`, `registry/agent-registry.json`) already describe what full-auto mode would remove.
2. Precedent set by `ADR-001`/`ADR-001a`: an execution-affecting capability gets a security design *before* code, not as a follow-up. This ADR applies that same discipline to an approval-affecting capability, which is the same class of risk from the opposite direction — `ADR-001` is about containing what an untrusted external runtime can do; full-auto mode is about removing the human step that currently catches what *this project's own* agents shouldn't do unsupervised.
3. A same-license, same-domain prior implementation of this exact feature class (AionUi) has an independently documented high-severity security-scan failure. That is evidence, not speculation, and belongs in the record.
4. `off_limits` being declarative-only (not code-enforced) is a materially different, and materially weaker, starting point than the backlog entry's framing might suggest to a future reader who assumes the registry field is an active gate. Getting this fact wrong would let a future full-auto design understate what it needs to build first.

## Decision

**Do not build YOLO / full-auto mode. Not now.**

This ADR closes the open question `docs/BACKLOG-vision.md` raised, with a documented "not now" rather than leaving it as an unresolved backlog item. The reasoning above — the direct conflict with `SECURITY.md`'s stated gap, `CONTRACT.md`'s Type 1/Type 2 escalation contract, the standing no-merge-without-human-go/no-go practice, the currently-declarative-only `off_limits` lists, and the AionUi security-scan precedent — is sufficient on its own to reject the feature as scoped (a single toggle that suppresses confirmation for all agent actions across all departments). No implementation should proceed under that scoping.

### What would have to be true before revisiting this

Not a roadmap, not a commitment — the conditions under which a *narrower*, future proposal might be worth a fresh ADR:

1. `off_limits` becomes a code-enforced gate (read and checked by `SkillExecutor`/`Organization.js` or equivalent) rather than documentation-only. Auto-approving actions that aren't even mechanically checked against `off_limits` today would be strictly worse than the status quo.
2. Any such proposal is scoped per-action-class (e.g. "auto-approve read-only research skills only"), never as a single blanket toggle, and is evaluated against `CONTRACT.md`'s Type 1/Type 2 boundary explicitly — Type 2 (reversible, low-cost, bounded, already-permitted) actions are the only plausible candidate; Type 1 actions are not on the table under any scoping this ADR can imagine.
3. The proposal names, explicitly, which specific confirmation steps it removes and which it leaves intact — never "confirmation, generally."
4. A security review addresses the AionUi high-severity findings directly: what those findings actually were (this ADR did not re-derive them; it cites the existing backlog citation) and whether this project's proposed scoping avoids the same class of defect.
5. The standing no-merge-without-human-go/no-go rule continues to govern the *decision to build this feature* even if the feature itself narrows — i.e., this ADR's "not now" is itself subject to that same rule: no future implementation merges without an explicit human go/no-go, independent of whatever the feature ends up doing at runtime.

## Non-goals

- **No auto-approval toggle, global or per-department, ships as a result of this ADR.** This document is a rejection with recorded reasoning, not a deferred build.
- **No change to `SECURITY.md`, `CONTRACT.md`, or `registry/agent-registry.json`.** This ADR cites their current content; it does not propose editing any of them.
- **No code-enforcement of `off_limits` is designed here.** Section "What would have to be true before revisiting this" names it as a prerequisite for any future proposal; building it is out of scope for this ADR.
- **No re-derivation of AionUi's security-scan findings.** This ADR cites the existing `docs/BACKLOG-vision.md` finding rather than re-running or re-analyzing that scan; if a future proposal needs the specific finding detail, that is separate research, not settled here.
- **Not a judgment on AionUi generally**, consistent with how `docs/BACKLOG-vision.md` already frames it — the rejection here is about this one feature class, not about AionUi as a reference point for other backlog items (e.g. "Team Mode," which remains validated conceptually elsewhere in the backlog).
- **Not a statement that human-in-the-loop enforcement is finished or sufficient.** `SECURITY.md`'s gap (no confirmation step beyond task-type allowlisting, beyond what the operator configures) remains open and unrelated to this ADR's decision; closing that gap is a different, separately-scoped problem from whether to build a feature that would widen it.

## Consequences

- **No runtime behavior changes from this ADR.** Nothing in this document adds, removes, or modifies code.
- The `docs/BACKLOG-vision.md` "YOLO / full-auto mode" entry is now resolved by reference to this ADR rather than left open — future readers of that backlog land here instead of re-litigating the same question from scratch.
- The project's honest-posture discipline (`SECURITY.md` says only what's actually true; `ADR-001` designs before building) is extended to cover approval/confirmation surfaces, not just execution/sandboxing surfaces — the same standard, applied to a different risk.
- Documents plainly, for the first time in one place, that `off_limits` in `registry/agent-registry.json` is declarative today, not code-enforced — a fact any future security-relevant proposal touching agent permissions should treat as a known gap, independent of this ADR's specific rejection.
- If a narrower, differently-scoped proposal is raised later, it starts from this ADR's five prerequisites rather than from the original unscoped "auto-approve all agent actions" framing.
