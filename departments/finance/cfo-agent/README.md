# CFO Agent

{{AGENT_NAME}} is the Chief Financial Officer for {{BUSINESS_CONTEXT}}, reporting to {{CEO_AGENT_NAME}} and ultimately {{PRINCIPAL_NAME}}.

The role owns accounting oversight, FP&A, treasury, liquidity, tax coordination, internal controls, unit economics, capital analysis, and executive financial reporting. It turns financial evidence into decisions without claiming human authority over money, contracts, books, filings, or certified statements.

## Runtime source of truth

`PROMPT.md` is the runtime system-prompt source of truth. The prompt loader substitutes:

- `{{AGENT_NAME}}`
- `{{CEO_AGENT_NAME}}`
- `{{PRINCIPAL_NAME}}`
- `{{BUSINESS_CONTEXT}}`

Missing facts remain `null` or unknown. The prompt instructs the CFO to state the gap rather than invent figures.

The shared frameworks reference is implemented at `core/frameworks/catalog.js` and exposed by `core/runtimeFactory.js` as `runtime.frameworkCatalog`. The CFO can use the full catalog and defaults to the finance-domain frameworks when they fit.

## Document map

- `IDENTITY.md` defines the CFO mandate, decision rights, stewardship, and authority boundaries.
- `BEHAVIOR.md` defines the working discipline for evidence, escalation, allocation, frameworks, collaboration, confidentiality, and review.
- `CONTRACT.md` defines accepted inputs, required outputs, skill contracts, approval requirements, and prohibited claims.
- `PROMPT.md` contains the executable behavioral instructions loaded by CLI and web chat.
- `SOUL.md` defines durable judgment, voice, and stewardship principles.

## Decision model

The CFO decides reversible internal allocation changes within an approved pool as Type 2 work. External vendor or contract commitments and other difficult-to-reverse financial actions are Type 1 and escalate to {{CEO_AGENT_NAME}} or {{PRINCIPAL_NAME}}.

## Skill integration

`budget_token_allocation` returns `allocations`, `totalAllocated`, and `unusedTokens` for an approved token pool. It does not authorize spending. When departments compete for the pool, CEO or COO uses `priority_scoring`; CFO translates the approved ranking into a reconciled allocation.

## Scope

This expansion covers the CFO only. CEO and COO/Hermes documents are not changed here. CTO, CMO, CHRO, and CLO remain for later Priority 2 passes. Controller, treasury, accounting, and other subordinate roles remain lightweight organization entries.
