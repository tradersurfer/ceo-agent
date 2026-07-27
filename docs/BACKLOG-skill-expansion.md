# Skill Expansion Backlog

This is a **reference document**, not an implementation plan and not a set
of individual tracked issues. It captures a brainstorm of possible
`agent-registry.json` / `workflow-registry.json` expansion — capability and
skill *names* organized by department — for later triage.

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
- `subsidiary_health_check`
- `partnership_transition_planning`
- `multi_agent_consensus_evaluation`
- `resource_reallocation_directive`
- `launch_roadmap_orchestration`

### `cfo_agent`

**Capabilities to add:** `capital_allocation`, `treasury_management`,
`risk_and_controls`, `unit_economics`, `macro_market_analysis`
(in addition to the existing `financial_strategy`, `financial_forecasting`)

**Skills to add (name-only candidates):**
- `three_statement_modeling`
- `cash_conversion_cycle_calc`
- `dupont_performance_diagnosis`
- `dcf_valuation`
- `scenario_planning_matrix`

**⚠️ OPEN PRODUCT-SCOPE QUESTION — needs an explicit decision before building, not silent inclusion:**
- `digital_asset_treasury_tracking`
- `options_chain_analysis`
- `real_estate_cap_rate_modeling`

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
- `react_tailwind_ui_generation`
- `node_flask_backend_integration`
- `firebase_vercel_deployment_config`
- `docker_environment_blueprinting`
- `open_source_dependency_audit`

### `cmo_agent`

**Capabilities to add:** `social_media_automation`,
`seo_and_local_directory_optimization`, `brand_identity_architecture`,
`community_engagement_strategy`

**Skills to add (name-only candidates):**
- `social_post_architect_prompting`
- `local_keyword_campaign_builder`
- `brand_guideline_generation`
- `ai_brand_training_manual_creation`
- `visual_layout_review`
- `public_vs_internal_copy_separation`

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
- `spans_and_layers_analysis`
- `nine_box_talent_mapping`
- `compensation_equity_audit`
- `adkar_readiness_assessment`
- `okr_alignment_review`
- `interview_rubric_generation`
- `scarf_threat_assessment`

### `clo_agent`

**Capabilities to add:** `corporate_governance_and_structuring`,
`enterprise_risk_management`, `contract_lifecycle_management`,
`digital_asset_and_open_source_compliance`,
`consumer_credit_compliance`

**Skills to add (name-only candidates):**
- `irac_legal_analysis_memo`
- `regulatory_horizon_scanning`
- `contract_risk_allocation_audit`
- `legislative_language_review`
- `corporate_entity_structuring`
- `credit_infrastructure_compliance_check`
- `incident_response_orchestration`

### `hermes` (Operations / COO)

**Capabilities to add:** `containerized_environment_orchestration`,
`api_webhook_orchestration`, `node_synchronization_monitoring`,
`cross_platform_backend_sync`

**Skills to add (name-only candidates, no ADR-001a conflict):**
- `payment_gateway_sync`
- `webhook_payload_parsing`

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
