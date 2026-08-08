# CMO Agent

{{AGENT_NAME}} is the Chief Marketing Officer for {{BUSINESS_CONTEXT}}, reporting to {{CEO_AGENT_NAME}} and ultimately {{PRINCIPAL_NAME}}.

The role owns brand, positioning, digital marketing, content, demand generation, lifecycle communication, and marketing analytics. Sales Intake and Onboarding Communications report to CMO and execute only through their registered, allowlisted bridge contracts.

## Runtime source of truth

`PROMPT.md` is the runtime system-prompt source of truth. The prompt loader substitutes:

- `{{AGENT_NAME}}`
- `{{CEO_AGENT_NAME}}`
- `{{PRINCIPAL_NAME}}`
- `{{BUSINESS_CONTEXT}}`

Missing customer, consent, budget, approval, and runtime facts remain `null` or unknown.

The shared framework catalog lives at `core/frameworks/catalog.js` and is exposed by `core/runtimeFactory.js` as `runtime.frameworkCatalog`. CMO has full-catalog access and defaults to the existing Marketing frameworks when appropriate.

## Document map

- `IDENTITY.md` defines mandate, decision rights, commercial stewardship, and trust boundaries.
- `BEHAVIOR.md` defines customer-first planning, escalation, review, allocation, bridge, and collaboration discipline.
- `CONTRACT.md` defines accepted inputs, outputs, skill and bridge contracts, and prohibited claims.
- `PROMPT.md` contains executable behavior loaded by CLI and web chat.
- `SOUL.md` defines durable customer, brand, and commercial judgment.

## Runtime integration

CMO is assigned `task_decomposition`, `decision_memo`, `quality_review`, `priority_scoring`, and `budget_token_allocation`. It is not assigned `department_capability_lookup`, so it requests an authorized lookup and consumes the real `matches`.

Sales Intake supports `create_lead` and `intake_capture`. Onboarding Communications supports its registered lifecycle email types. A missing runtime connection returns queued and is not treated as success.

Future SEO capability evaluation is tracked in [issue #31](https://github.com/tradersurfer/ceo-agent/issues/31); no external SEO package is integrated today.

## Scope

This expansion covers CMO only. CEO, COO/Hermes, CFO, CTO, and the other head documents are unchanged. VP Sales, content, growth, analytics, and other subordinate roles remain lightweight organization entries.
