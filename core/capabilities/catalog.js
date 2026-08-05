const DEPARTMENTS = Object.freeze([
  'executive',
  'finance',
  'operations',
  'technology',
  'marketing',
  'people',
  'legal',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

// The full, real capability catalog — one entry per capability string
// actually declared by an agent in registry/agent-registry.json /
// Organization.js. Mirrors core/frameworks/catalog.js's pattern: pure code,
// deep-frozen, no backing JSON registry file. Kept honest by
// tests/CapabilityCatalog.test.js's drift assertion against
// Organization.createDefault() — a capability id here that doesn't match a
// real agent capability (or vice versa) fails that test, the same
// discipline tests/RegistryDrift.test.js already applies to skills/tools/
// projects/workflows.
const capabilities = deepFreeze([
  // CEO Agent capabilities
  {
    id: 'task_routing',
    name: 'Task Routing',
    department: 'executive',
    description: 'Routes incoming work to the correct department head or agent based on assigned agent, department, or capability match.',
  },
  {
    id: 'agent_supervision',
    name: 'Agent Supervision',
    department: 'executive',
    description: "Oversees subordinate agents' registration, status, and reporting lines across the organization.",
  },
  {
    id: 'project_memory',
    name: 'Project Memory',
    department: 'executive',
    description: 'Retains and recalls context, decisions, and history across sessions and projects.',
  },
  {
    id: 'business_strategy',
    name: 'Business Strategy',
    department: 'executive',
    description: 'Sets overall business direction, priorities, and tradeoffs at the executive level.',
  },
  {
    id: 'research_synthesis',
    name: 'Research Synthesis',
    department: 'executive',
    description: 'Synthesizes findings from multiple sources into a coherent executive-level answer.',
  },
  {
    id: 'quality_control',
    name: 'Quality Control',
    department: 'executive',
    description: "Reviews work product against acceptance criteria before it is treated as complete.",
  },
  {
    id: 'brand_enforcement',
    name: 'Brand Enforcement',
    department: 'executive',
    description: 'Keeps outward-facing communication and deliverables consistent with brand voice and standards.',
  },
  {
    id: 'revenue_prioritization',
    name: 'Revenue Prioritization',
    department: 'executive',
    description: 'Ranks competing initiatives by their expected contribution to revenue.',
  },
  {
    id: 'escalation_management',
    name: 'Escalation Management',
    department: 'executive',
    description: "Identifies when a decision exceeds an agent's authority and routes it to a human principal.",
  },
  {
    id: 'agent_registry_management',
    name: 'Agent Registry Management',
    department: 'executive',
    description: 'Registers, updates, and retires agent records in the canonical agent registry.',
  },
  {
    id: 'cross_subsidiary_coordination',
    name: 'Cross-Subsidiary Coordination',
    department: 'executive',
    description: 'Coordinates objectives and resource use across multiple subsidiaries or business units.',
  },
  {
    id: 'joint_venture_oversight',
    name: 'Joint Venture Oversight',
    department: 'executive',
    description: 'Oversees the health and obligations of joint-venture and partnership arrangements.',
  },
  {
    id: 'portfolio_resource_allocation',
    name: 'Portfolio Resource Allocation',
    department: 'executive',
    description: 'Allocates budget, time, and staffing across a portfolio of initiatives.',
  },
  {
    id: 'autonomous_framework_governance',
    name: 'Autonomous Framework Governance',
    department: 'executive',
    description: 'Governs which strategic frameworks agents may apply autonomously versus escalate for review.',
  },

  // CFO Agent capabilities
  {
    id: 'financial_strategy',
    name: 'Financial Strategy',
    department: 'finance',
    description: "Sets the finance department's overall priorities and financial direction.",
  },
  {
    id: 'financial_forecasting',
    name: 'Financial Forecasting',
    department: 'finance',
    description: 'Projects future financial performance from historical and planned data.',
  },
  {
    id: 'capital_allocation',
    name: 'Capital Allocation',
    department: 'finance',
    description: 'Decides how to deploy capital across investment, debt paydown, and reserves.',
  },
  {
    id: 'treasury_management',
    name: 'Treasury Management',
    department: 'finance',
    description: 'Manages cash position, liquidity, and working capital.',
  },
  {
    id: 'risk_and_controls',
    name: 'Risk and Controls',
    department: 'finance',
    description: 'Designs and monitors financial controls that limit exposure to loss or fraud.',
  },
  {
    id: 'unit_economics',
    name: 'Unit Economics',
    department: 'finance',
    description: 'Analyzes the profitability of a single unit of the business (customer, order, or product).',
  },
  {
    id: 'macro_market_analysis',
    name: 'Macro Market Analysis',
    department: 'finance',
    description: 'Assesses external economic conditions and their effect on the business.',
  },

  // COO/Hermes capabilities
  {
    id: 'operations_strategy',
    name: 'Operations Strategy',
    department: 'operations',
    description: 'Sets overall operating priorities and execution direction for the operations department.',
  },
  {
    id: 'cron_create',
    name: 'Cron Job Creation',
    department: 'operations',
    description: 'Creates a scheduled, recurring job on the connected operations runtime.',
  },
  {
    id: 'webhook_subscribe',
    name: 'Webhook Subscription',
    department: 'operations',
    description: 'Subscribes to an external event source via webhook.',
  },
  {
    id: 'api_trigger',
    name: 'API Trigger',
    department: 'operations',
    description: 'Invokes an external API endpoint as an operational action.',
  },
  {
    id: 'workflow_execution',
    name: 'Workflow Execution',
    department: 'operations',
    description: 'Executes a multi-step workflow definition end to end.',
  },
  {
    id: 'skill_chain',
    name: 'Skill Chaining',
    department: 'operations',
    description: 'Chains multiple skill invocations together into one operational sequence.',
  },
  {
    id: 'sandbox_execution',
    name: 'Sandbox Execution',
    department: 'operations',
    description: 'Runs a task inside an isolated sandbox environment.',
  },
  {
    id: 'system_monitoring',
    name: 'System Monitoring',
    department: 'operations',
    description: 'Monitors the health and availability of connected systems.',
  },
  {
    id: 'alert_dispatch',
    name: 'Alert Dispatch',
    department: 'operations',
    description: 'Sends an alert to the appropriate owner when a monitored condition fires.',
  },
  {
    id: 'intake_parsing',
    name: 'Intake Parsing',
    department: 'operations',
    description: 'Parses incoming intake submissions into structured task data.',
  },
  {
    id: 'crm_action',
    name: 'CRM Action',
    department: 'operations',
    description: 'Performs a create/update/read action against a connected CRM.',
  },
  {
    id: 'scheduled_job',
    name: 'Scheduled Job',
    department: 'operations',
    description: 'Runs a one-time job at a specified future time.',
  },
  {
    id: 'file_processing',
    name: 'File Processing',
    department: 'operations',
    description: 'Processes an uploaded or referenced file (parse, convert, extract).',
  },
  {
    id: 'memory_lookup',
    name: 'Memory Lookup',
    department: 'operations',
    description: "Looks up prior context or state from the operations runtime's memory store.",
  },
  {
    id: 'automation_run',
    name: 'Automation Run',
    department: 'operations',
    description: 'Executes a pre-defined automation sequence.',
  },
  {
    id: 'containerized_environment_orchestration',
    name: 'Containerized Environment Orchestration',
    department: 'operations',
    description: 'Orchestrates containerized environments for isolated task execution.',
  },
  {
    id: 'api_webhook_orchestration',
    name: 'API/Webhook Orchestration',
    department: 'operations',
    description: 'Coordinates inbound webhooks and outbound API calls as one operational flow.',
  },
  {
    id: 'node_synchronization_monitoring',
    name: 'Node Synchronization Monitoring',
    department: 'operations',
    description: 'Monitors synchronization state across distributed operational nodes.',
  },
  {
    id: 'cross_platform_backend_sync',
    name: 'Cross-Platform Backend Sync',
    department: 'operations',
    description: 'Keeps backend state consistent across multiple connected platforms.',
  },

  // CTO Agent capabilities
  {
    id: 'technology_strategy',
    name: 'Technology Strategy',
    department: 'technology',
    description: "Sets the technology department's architecture and build priorities.",
  },
  {
    id: 'software_development',
    name: 'Software Development',
    department: 'technology',
    description: 'Designs, writes, and reviews software.',
  },
  {
    id: 'full_stack_architecture',
    name: 'Full-Stack Architecture',
    department: 'technology',
    description: 'Designs system architecture spanning frontend, backend, and data layers.',
  },
  {
    id: 'cloud_deployment_orchestration',
    name: 'Cloud Deployment Orchestration',
    department: 'technology',
    description: 'Plans and coordinates deployment of services to cloud infrastructure.',
  },
  {
    id: 'ai_agent_containerization',
    name: 'AI Agent Containerization',
    department: 'technology',
    description: 'Packages an AI agent runtime into a deployable containerized unit.',
  },
  {
    id: 'open_source_risk_assessment',
    name: 'Open-Source Risk Assessment',
    department: 'technology',
    description: 'Evaluates license, security, and maintenance risk of an open-source dependency.',
  },
  {
    id: 'technical_debt_management',
    name: 'Technical Debt Management',
    department: 'technology',
    description: 'Tracks and prioritizes remediation of accumulated technical debt.',
  },

  // CMO Agent capabilities
  {
    id: 'marketing_strategy',
    name: 'Marketing Strategy',
    department: 'marketing',
    description: "Sets the marketing department's positioning and channel priorities.",
  },
  {
    id: 'content_creation',
    name: 'Content Creation',
    department: 'marketing',
    description: 'Produces marketing content across written, visual, and structured formats.',
  },
  {
    id: 'social_media_automation',
    name: 'Social Media Automation',
    department: 'marketing',
    description: 'Automates scheduling and posting of social media content.',
  },
  {
    id: 'seo_and_local_directory_optimization',
    name: 'SEO and Local Directory Optimization',
    department: 'marketing',
    description: 'Optimizes search visibility and local business-directory listings.',
  },
  {
    id: 'brand_identity_architecture',
    name: 'Brand Identity Architecture',
    department: 'marketing',
    description: 'Defines and maintains the structural elements of brand identity (voice, visual system, positioning).',
  },
  {
    id: 'community_engagement_strategy',
    name: 'Community Engagement Strategy',
    department: 'marketing',
    description: 'Plans how the business engages and grows its community and customer base.',
  },
  {
    id: 'campaign_performance_analytics',
    name: 'Campaign Performance Analytics',
    department: 'marketing',
    description: 'Measures and reports on marketing campaign performance against goals.',
  },

  // Sales Intake Agent capabilities
  {
    id: 'sales_strategy',
    name: 'Sales Strategy',
    department: 'marketing',
    description: 'Sets priorities and approach for converting inbound interest into qualified leads.',
  },
  {
    id: 'create_lead',
    name: 'Lead Creation',
    department: 'marketing',
    description: 'Creates a new lead record from a captured inquiry.',
  },
  {
    id: 'intake_capture',
    name: 'Intake Capture',
    department: 'marketing',
    description: 'Captures structured intake information from a prospective client.',
  },

  // Onboarding Communications Agent capabilities
  {
    id: 'email_welcome',
    name: 'Welcome Email',
    department: 'marketing',
    description: 'Sends the initial welcome email to a newly onboarded client.',
  },
  {
    id: 'email_score_invite',
    name: 'Score Invite Email',
    department: 'marketing',
    description: 'Invites a client to view or request their score/assessment results.',
  },
  {
    id: 'email_upload_reminder',
    name: 'Upload Reminder Email',
    department: 'marketing',
    description: 'Reminds a client to upload outstanding required documents.',
  },
  {
    id: 'email_review_call',
    name: 'Review Call Email',
    department: 'marketing',
    description: 'Invites a client to schedule a review call.',
  },
  {
    id: 'email_scan_complete',
    name: 'Scan Complete Email',
    department: 'marketing',
    description: 'Notifies a client that their scan or analysis has completed.',
  },
  {
    id: 'email_mail_reminder',
    name: 'Mail Reminder Email',
    department: 'marketing',
    description: 'Reminds a client of pending physical mail action required.',
  },
  {
    id: 'email_bureau_checkin',
    name: 'Bureau Check-In Email',
    department: 'marketing',
    description: 'Sends a scheduled check-in update related to bureau/reporting status.',
  },
  {
    id: 'email_sweep_upgrade',
    name: 'Sweep Upgrade Email',
    department: 'marketing',
    description: 'Notifies a client of an available service sweep or upgrade.',
  },
  {
    id: 'email_testimonial',
    name: 'Testimonial Request Email',
    department: 'marketing',
    description: 'Requests a testimonial from a satisfied client.',
  },
  {
    id: 'email_sequence_queue',
    name: 'Email Sequence Queueing',
    department: 'marketing',
    description: 'Queues a client into a multi-step onboarding email sequence.',
  },

  // CHRO Agent capabilities
  {
    id: 'people_strategy',
    name: 'People Strategy',
    department: 'people',
    description: "Sets the people department's organizational and talent priorities.",
  },
  {
    id: 'organizational_design',
    name: 'Organizational Design',
    department: 'people',
    description: 'Designs reporting structure, spans of control, and team boundaries.',
  },
  {
    id: 'talent_density_management',
    name: 'Talent Density Management',
    department: 'people',
    description: 'Manages the concentration of high performers relative to total headcount.',
  },
  {
    id: 'performance_and_rewards_strategy',
    name: 'Performance and Rewards Strategy',
    department: 'people',
    description: 'Designs how performance is measured and rewarded.',
  },
  {
    id: 'change_management_orchestration',
    name: 'Change Management Orchestration',
    department: 'people',
    description: 'Plans and sequences organizational change to minimize disruption.',
  },
  {
    id: 'people_analytics_synthesis',
    name: 'People Analytics Synthesis',
    department: 'people',
    description: 'Synthesizes workforce data into actionable people insights.',
  },
  {
    id: 'culture_and_employee_experience',
    name: 'Culture and Employee Experience',
    department: 'people',
    description: 'Shapes the day-to-day experience and culture employees encounter.',
  },

  // CLO Agent capabilities
  {
    id: 'legal_strategy',
    name: 'Legal Strategy',
    department: 'legal',
    description: "Sets the legal department's risk posture and priorities.",
  },
  {
    id: 'regulatory_compliance',
    name: 'Regulatory Compliance',
    department: 'legal',
    description: 'Ensures operations comply with applicable laws and regulations.',
  },
  {
    id: 'corporate_governance_and_structuring',
    name: 'Corporate Governance and Structuring',
    department: 'legal',
    description: 'Designs corporate governance structure and entity organization.',
  },
  {
    id: 'enterprise_risk_management',
    name: 'Enterprise Risk Management',
    department: 'legal',
    description: 'Identifies, assesses, and mitigates enterprise-wide legal and operational risk.',
  },
  {
    id: 'contract_lifecycle_management',
    name: 'Contract Lifecycle Management',
    department: 'legal',
    description: 'Manages contracts from drafting through execution, renewal, and expiry.',
  },
  {
    id: 'digital_asset_and_open_source_compliance',
    name: 'Digital Asset and Open-Source Compliance',
    department: 'legal',
    description: 'Ensures compliance obligations around digital assets and open-source usage are met.',
  },
  {
    id: 'consumer_credit_compliance',
    name: 'Consumer Credit Compliance',
    department: 'legal',
    description: 'Ensures compliance with consumer credit and lending regulation.',
  },
]);

function getAllCapabilities() {
  return capabilities;
}

function getCapabilitiesByDepartment(department) {
  return capabilities.filter(capability => capability.department === String(department || '').trim().toLowerCase());
}

function getCapabilityById(id) {
  return capabilities.find(capability => capability.id === String(id || '').trim().toLowerCase()) || null;
}

module.exports = {
  DEPARTMENTS,
  capabilities,
  getAllCapabilities,
  getCapabilitiesByDepartment,
  getCapabilityById,
};
