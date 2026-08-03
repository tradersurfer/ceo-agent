# Skill Expansion Backlog

This is a **reference document**, not an implementation plan and not a set
of individual tracked issues. It captures a brainstorm of possible
`agent-registry.json` / `workflow-registry.json` expansion — capability and
skill *names* organized by department — for later triage.

> **Update (2026-08-03):** All capabilities and skills listed below have been
> **scaffolded** on branch `feature/c-suite-capability-expansion`. They are
> registered in `agent-registry.json`, `skill-registry.json`,
> `Organization.js`, and `CapabilityResolver.js` with `disableModelInvocation:
> true` and scaffold-stub handlers that return `{ scaffolded: true }`. No
> real logic is implemented. See the implementation status matrix at the
> bottom of this file for what's scaffolded vs. what still needs real
> implementation.

**Nothing here is approved for implementation as-is.** Any candidate that
eventually gets built goes through the existing `core/SkillRegistry.js` /
`core/SkillExecutor.js` path (see `docs/SKILLS.md`), with real logic, real
tests, and real permission wiring in `registry/skill-registry.json` +
`registry/agent-registry.json` + `organization/Organization.js` — the same
standard as `budget_token_allocation` (Priority 3), the schema-markup and
content-quality skills (#31), scope-creep detection (#23), the
document-creation skills (#44), and the financial-model skills (#29).
Department-head-vs-subagent placement for whichever of these end up in
scope is a decision for Priority 7's eventual rollout, not something this
list pre-decides. A name appearing below is not a commitment to build it,
and several items are flagged below as open questions rather than
candidates at all.

Some department heads already have real, shipped skills outside this
brainstorm's specific naming — e.g. CFO's `compute_financial_model` /
`import_revenue_csv` (#29/#64), CTO's `scope_creep_detection` (#23). Where
a name below happens to match an already-shipped skill (CMO's schema/
content/document skills), it's marked explicitly; everything else listed
is a name-only candidate regardless of whether the department already has
unrelated real skills.

---

## By department

### `ceo_agent`

**Capabilities to add:** `cross_subsidiary_coordination`,
`joint_venture_oversight`, `portfolio_resource_allocation`,
`autonomous_framework_governance`

**Skills to add (name-only candidates — no logic, no registration, no tests exist yet):**
- `subsidiary_health_check` ✅ scaffolded
- `partnership_transition_planning` ✅ scaffolded
- `multi_agent_consensus_evaluation` ✅ scaffolded
- `resource_reallocation_directive` ✅ scaffolded
- `launch_roadmap_orchestration` ✅ scaffolded

### `cfo_agent`

**Capabilities to add:** `capital_allocation`, `treasury_management`,
`risk_and_controls`, `unit_economics`, `macro_market_analysis`
(in addition to the existing `financial_strategy`, `financial_forecasting`)

**Skills to add (name-only candidates):**
- `three_statement_modeling` ✅ scaffolded
- `cash_conversion_cycle_calc` ✅ scaffolded
- `dupont_performance_diagnosis` ✅ scaffolded
- `dcf_valuation` ✅ scaffolded
- `scenario_planning_matrix` ✅ scaffolded

**⚠️ OPEN PRODUCT-SCOPE QUESTION — needs an explicit decision before building, not silent inclusion:**
- `digital_asset_treasury_tracking` ✅ scaffolded (flagged)
- `options_chain_analysis` ✅ scaffolded (flagged)
- `real_estate_cap_rate_modeling` ✅ scaffolded (flagged)

These three are plausibly LEVI-specific (a particular tenant/installer's
asset mix) rather than generic CFO capability every CEO Agent install
would want. Building them into the default roster silently would bake a
specific business's needs into the white-label scaffold. Needs a decision
— generic-and-in, LEVI-specific-and-out (custom agent / install-specific
skill instead), or something in between — before any of the three get
implemented.

### `cto_agent`

**Capabilities to add:** `full_stack_architecture`,
`cloud_deployment_orchestration`, `ai_agent_containerization`,
`open_source_risk_assessment`

**Skills to add (name-only candidates):**
- `react_tailwind_ui_generation` ✅ scaffolded
- `node_flask_backend_integration` ✅ scaffolded
- `firebase_vercel_deployment_config` ✅ scaffolded
- `docker_environment_blueprinting` ✅ scaffolded
- `open_source_dependency_audit` ✅ scaffolded

### `cmo_agent`

**Capabilities to add:** `social_media_automation`,
`seo_and_local_directory_optimization`, `brand_identity_architecture`,
`community_engagement_strategy`

**Skills to add (name-only candidates):**
- `social_post_architect_prompting` ✅ scaffolded
- `local_keyword_campaign_builder` ✅ scaffolded
- `brand_guideline_generation` ✅ scaffolded
- `ai_brand_training_manual_creation` ✅ scaffolded
- `visual_layout_review` ✅ scaffolded
- `public_vs_internal_copy_separation` ✅ scaffolded

**✅ Already implemented — not candidates, listed here only because the
original brainstorm included them in CMO's skill set:**
- `schema_reservation_markup`, `schema_order_markup`,
  `schema_discussion_markup`, `schema_profile_markup` (#31,
  `core/skills/schemaMarkupSkills.js`)
- `content_quality_analysis` (#31, `core/skills/contentQualitySkill.js`)
- `generate_docx`, `generate_pdf`, `generate_spreadsheet` (#44/#59,
  `core/skills/documentCreationSkills.js`)

### `chro_agent`

**Capabilities to add:** `organizational_design`,
`talent_density_management`, `performance_and_rewards_strategy`,
`change_management_orchestration`, `people_analytics_synthesis`

**Skills to add (name-only candidates):**
- `spans_and_layers_analysis` ✅ scaffolded
- `nine_box_talent_mapping` ✅ scaffolded
- `compensation_equity_audit` ✅ scaffolded
- `adkar_readiness_assessment` ✅ scaffolded
- `okr_alignment_review` ✅ scaffolded
- `interview_rubric_generation` ✅ scaffolded
- `scarf_threat_assessment` ✅ scaffolded

### `clo_agent`

**Capabilities to add:** `corporate_governance_and_structuring`,
`enterprise_risk_management`, `contract_lifecycle_management`,
`digital_asset_and_open_source_compliance`,
`consumer_credit_compliance`

**Skills to add (name-only candidates):**
- `irac_legal_analysis_memo` ✅ scaffolded
- `regulatory_horizon_scanning` ✅ scaffolded
- `contract_risk_allocation_audit` ✅ scaffolded
- `legislative_language_review` ✅ scaffolded
- `corporate_entity_structuring` ✅ scaffolded
- `credit_infrastructure_compliance_check` ✅ scaffolded
- `incident_response_orchestration` ✅ scaffolded

### `hermes` (Operations / COO)

**Capabilities to add:** `containerized_environment_orchestration`,
`api_webhook_orchestration`, `node_synchronization_monitoring`,
`cross_platform_backend_sync`

**Skills to add (name-only candidates, no ADR-001a conflict):**
- `payment_gateway_sync` ✅ scaffolded
- `webhook_payload_parsing` ✅ scaffolded

**🚫 CONFLICTS WITH ADR-001A — do not implement as CEO-Agent-side skills:**
- `docker_sandbox_management`
- `database_script_execution`
- `shell_script_automation`

[ADR-001a](./adr/ADR-001a-hermes-gateway-client-model.md) settled that CEO
Agent talks to Hermes as an HTTP client of the gateway's task-submission
API — it never spawns processes, manages containers, or executes shell/DB
commands itself, and the hermes-agent gateway already has its own
multi-backend sandboxing (`tools/terminal_tool.py`: local/Docker/Modal/
SSH/Singularity/Daytona) for exactly this class of work. Building these
three as CEO-Agent-side `SkillRegistry` skills would mean CEO Agent's own
process spawning shell commands, managing Docker, and executing arbitrary
database scripts — precisely the ambient-authority/blast-radius problem
ADR-001 and ADR-001a exist to avoid, and a second, competing execution
path alongside the gateway. If any of the three are ever genuinely
needed, they route through the gateway API client once #56 (gateway API
surface investigation) and #36 (real Hermes execution) land — not as
skills implemented here.

---

## Implementation status matrix

All 40 new C-suite skills are **scaffolded** — registered in all four sync
points (`agent-registry.json`, `Organization.js`, `skill-registry.json`,
`CapabilityResolver.js`) with `disableModelInvocation: true`, scaffold-stub
handlers returning `{ scaffolded: true }`, and full input/output schemas.
Tests pass (RegistryDrift, CSuiteSkills, ManagerSkills).

| Agent | New Capabilities | New Skills | Handler File | Status |
|---|---|---|---|---|
| CEO | 4 | 5 | `core/skills/ceoSkills.js` | ✅ scaffolded |
| CFO | 5 | 8 | `core/skills/cfoSkills.js` | ✅ scaffolded (3 flagged open-scope) |
| Hermes/COO | 4 | 2 | `core/skills/cooSkills.js` | ✅ scaffolded (3 excluded per ADR-001a) |
| CTO | 5 | 5 | `core/skills/ctoSkills.js` | ✅ scaffolded |
| CMO | 5 | 6 | `core/skills/cmoSkills.js` | ✅ scaffolded |
| CHRO | 6 | 7 | `core/skills/chroSkills.js` | ✅ scaffolded |
| CLO | 5 | 7 | `core/skills/cloSkills.js` | ✅ scaffolded |
| **Total** | **34** | **40** | 7 files | |

### What "scaffolded" means

- ✅ Capability IDs added to `agent-registry.json` + `Organization.js` + `CapabilityResolver.js`
- ✅ Skill definitions added to `skill-registry.json` with full input/output schemas
- ✅ Scaffold-stub handler files created in `core/skills/` that return `{ scaffolded: true }`
- ✅ `RegistryLoader.js` loads all 7 new skill files
- ✅ `RegistryDrift.test.js` passes (all four registries in sync)
- ✅ `CSuiteSkills.test.js` validates scaffold contracts (8 tests)
- ❌ No real implementation logic — handlers return placeholder data
- ❌ No model invocation — `disableModelInvocation: true` prevents autonomous calling

### Next steps for each skill

To promote a skill from scaffold to production:

1. Replace the scaffold handler in the corresponding `core/skills/*Skills.js` file with real logic.
2. Set `disableModelInvocation: false` (or remove it) in both the handler code and `skill-registry.json`.
3. Update the `risk` field in `skill-registry.json` if the real implementation has different risk characteristics.
4. Add dedicated tests in `tests/` for the skill's real behavior.
5. Update this file to mark the skill as ✅ implemented.
6. Ensure `RegistryDrift.test.js` still passes.

---

## Proposed `tool-registry.json` shape

One bridge per department head — `ceo_bridge`, `cfo_bridge`, `cto_bridge`,
`cmo_bridge`, `chro_bridge`, `clo_bridge`, `hermes_bridge` — each listing
that head's full action set from the expansion above, alongside the
existing `sales_intake_bridge`, `onboarding_comms_bridge`,
`dispute_agent_bridge`.

Not evaluated here whether one-bridge-per-department-head is the right
shape (vs. the current model where most departments have no bridge at all
and only Hermes/sales-intake/onboarding-comms/dispute-agent do) — that's
part of what a real triage pass would need to decide.

## Proposed `workflow-registry.json` shape

`workflows: []` (none pre-built — this scaffold ships no pre-built
workflow definitions by design, matching how `WorkflowScheduler` already
works today), with `executorTypes` listing all ~90 skill/action names
above as available executor types for install-defined workflows.
