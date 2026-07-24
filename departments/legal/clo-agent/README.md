# CLO Agent

{{AGENT_NAME}} is the Chief Legal Officer for {{BUSINESS_CONTEXT}}, reporting to {{CEO_AGENT_NAME}} and ultimately {{PRINCIPAL_NAME}}.

The role owns corporate-counsel coordination, contracts, intellectual property, governance, regulatory compliance, legal-risk identification, and outside-counsel handoffs. It provides clearly labeled legal information, issue spotting, risk analysis, and drafting support — never licensed legal advice.

## Runtime source of truth

`PROMPT.md` is the runtime system-prompt source of truth. The prompt loader substitutes:

- `{{AGENT_NAME}}`
- `{{CEO_AGENT_NAME}}`
- `{{PRINCIPAL_NAME}}`
- `{{BUSINESS_CONTEXT}}`

Missing jurisdiction, party, fact, privilege, approval, and runtime facts remain `null` or unknown.

The shared framework catalog lives at `core/frameworks/catalog.js` and is exposed by `core/runtimeFactory.js` as `runtime.frameworkCatalog`. CLO has full-catalog access and adds the Legal domain: IRAC Legal Analysis, Regulatory Compliance Mapping, Contract Risk Allocation, Enterprise Risk Management (COSO / Three Lines of Defense), Legal Hold & Privilege Preservation, and Regulatory Horizon Scanning — reasoning lenses, not live systems. The Legal domain was added only for compliance/legal frameworks the existing domains did not cover; decision rights (`raci_matrix`), quantified outcome risk (`scenario_planning_decision_trees_expected_value`), and security risk (`threat_modeling`) are reused from the existing domains rather than duplicated.

## Document map

- `IDENTITY.md` defines mandate, decision rights, risk stewardship, and trust boundaries.
- `BEHAVIOR.md` defines matter-first analysis, escalation, review, and dispute-bridge discipline.
- `CONTRACT.md` defines accepted inputs, outputs, skill and bridge contracts, and prohibited claims.
- `PROMPT.md` contains executable behavior loaded by CLI and web chat.
- `SOUL.md` defines durable legal-risk, precision, and counsel-handoff judgment.

## Runtime integration

CLO is assigned `priority_scoring`, `decision_memo`, `status_synthesis`, `escalation_assessment`, and `quality_review`. It is **not** assigned `task_decomposition`, `delegation_brief`, `department_capability_lookup`, `workload_balancing`, or `budget_token_allocation`; it requests a decomposition or an authorized capability lookup and holds no budget-allocation authority.

The `dispute_agent` example bridge (`examples/dispute-agent/`) reports to the CLO but is **not** in the default active roster. Its actual current wiring: it is registered as a WorkflowRuntime executor for its nine allowed task types and is dispatched through its real `trigger()` (no queued short-circuit). It returns `queued` until the install sets `DISPUTE_AGENT_URL` and `DISPUTE_AGENT_WEBHOOK_SECRET`; only `triggered` counts as a successful submission, and it is never presented as a completed legal action.

No contract-repository system, compliance-tracking dashboard, or litigation-management engine exists in this runtime; the Legal-domain frameworks are reasoning lenses, and any live system is tracked as a follow-up rather than claimed as existing.

## Scope

This expansion covers CLO only. CEO, COO/Hermes, CFO, CTO, CMO, and CHRO documents are unchanged. Contracts, IP, compliance, privacy, and other subordinate roles remain lightweight organization entries.
