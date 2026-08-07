const Department = require('./Department');
const Role = require('./Role');
const AgentProfile = require('./AgentProfile');

class Organization {
  /**
   * Creates one runtime-independent AI organization.
   * @param {object} options Organization fields and initial records.
   */
  constructor(options = {}) {
    this.organizationId = options.organizationId || 'business_org';
    this.organizationName = options.organizationName || null;
    this.owner = options.owner || null;
    this.runtime = options.runtime || 'CEO Agent Runtime';
    this.departments = new Map();
    this.roles = new Map();
    this.agents = new Map();
    this.created = options.created || new Date().toISOString();
    this.status = options.status || 'active';

    for (const department of options.departments || []) this.registerDepartment(department);
    for (const role of options.roles || []) this.registerRole(role);
    for (const agent of options.agents || []) this.registerAgent(agent);
  }

  /** Registers or replaces a department. @param {Department|object} input Department input. @returns {Department} Department. */
  registerDepartment(input) {
    const department = input instanceof Department ? input : new Department(input);
    this.departments.set(department.id, department);
    return department;
  }

  /**
   * Registers or replaces a role and links it to its department.
   * @param {Role|object} input Role input.
   * @returns {Role} Role.
   */
  registerRole(input) {
    const role = input instanceof Role ? input : new Role(input);
    this.roles.set(role.id, role);
    const department = this.findDepartment(role.department);
    if (department) department.addRole(role);
    return role;
  }

  /**
   * Registers or replaces an agent and links its department and role.
   * @param {AgentProfile|object} input Agent profile input.
   * @returns {AgentProfile} Agent profile.
   */
  registerAgent(input) {
    const agent = input instanceof AgentProfile ? input : new AgentProfile(input);
    const previous = this.agents.get(agent.id);
    if (previous && previous.department && previous.department !== agent.department) {
      const oldDepartment = this.findDepartment(previous.department);
      if (oldDepartment) oldDepartment.removeAgent(agent.id);
    }
    this.agents.set(agent.id, agent);
    const department = this.findDepartment(agent.department);
    if (department) department.addAgent(agent);
    const role = this.findRole(agent.role);
    if (role) role.assignAgent(agent);
    return agent;
  }

  /** Finds a department. @param {string} id Department id. @returns {Department|null} Department or null. */
  findDepartment(id) {
    return this.departments.get(id) || null;
  }

  /** Finds a role. @param {string} id Role id. @returns {Role|null} Role or null. */
  findRole(id) {
    return this.roles.get(id) || null;
  }

  /** Finds an agent. @param {string} id Agent id. @returns {AgentProfile|null} Agent or null. */
  findAgent(id) {
    return this.agents.get(id) || null;
  }

  /** Lists departments. @returns {Department[]} Departments. */
  listDepartments() {
    return [...this.departments.values()];
  }

  /** Lists roles. @returns {Role[]} Roles. */
  listRoles() {
    return [...this.roles.values()];
  }

  /** Lists agents. @returns {AgentProfile[]} Agents. */
  listAgents() {
    return [...this.agents.values()];
  }

  /** Returns a resolved organization chart. @returns {object} Organization chart. */
  getOrganizationChart() {
    return {
      organizationId: this.organizationId,
      organizationName: this.organizationName,
      owner: this.owner,
      departments: this.listDepartments().map(department => ({
        id: department.id,
        name: department.name,
        description: department.description,
        managerRole: department.managerRole,
        status: department.status,
        roles: department.listRoles().map(id => {
          const role = this.findRole(id);
          return role ? {
            id: role.id,
            title: role.title,
            assignedAgent: role.assignedAgent,
            filled: role.isFilled(),
          } : { id };
        }),
        agents: department.listAgents().map(id => {
          const agent = this.findAgent(id);
          return agent ? agent.getSummary() : { id };
        }),
      })),
    };
  }

  /** Returns a serializable organization blueprint. @returns {object} Organization blueprint. */
  exportBlueprint() {
    return {
      organizationId: this.organizationId,
      organizationName: this.organizationName,
      owner: this.owner,
      runtime: this.runtime,
      created: this.created,
      status: this.status,
      departments: this.listDepartments().map(department => ({
        id: department.id,
        name: department.name,
        description: department.description,
        managerRole: department.managerRole,
        roles: department.listRoles(),
        agents: department.listAgents(),
        status: department.status,
      })),
      roles: this.listRoles().map(role => ({
        id: role.id,
        title: role.title,
        department: role.department,
        description: role.description,
        requiredCapabilities: [...role.requiredCapabilities],
        assignedAgent: role.assignedAgent,
      })),
      agents: this.listAgents().map(agent => agent.getSummary()),
    };
  }

  /**
   * Creates the default CEO Agent organization blueprint — a generic starting
   * org chart. Installers rename/reconfigure this to fit their own business;
   * nothing here is tied to a specific company or owner.
   * @returns {Organization} Default organization.
   */
  static createDefault() {
    const organization = new Organization({
      organizationId: 'business_org',
      organizationName: null,
      owner: null,
      runtime: 'CEO Agent Runtime',
    });

    const departments = [
      ['executive', 'Executive Office'],
      ['finance', 'Finance'],
      ['operations', 'Operations'],
      ['technology', 'Technology'],
      ['marketing', 'Marketing'],
      ['people', 'People'],
      ['legal', 'Legal & Compliance'],
    ];
    for (const [id, name] of departments) organization.registerDepartment({ id, name });

    const roles = [
      ['chief_intelligence_officer', 'Chief Intelligence & Orchestration Agent', 'executive', ['executive_orchestration']],
      ['chief_financial_officer', 'Chief Financial Officer', 'finance', ['financial_strategy', 'financial_forecasting']],
      ['chief_operating_officer', 'Chief Operating Officer', 'operations', ['operations_strategy']],
      ['chief_technology_officer', 'Chief Technology Officer', 'technology', ['technology_strategy', 'software_development']],
      ['chief_marketing_officer', 'Chief Marketing Officer', 'marketing', ['marketing_strategy', 'content_creation']],
      ['chief_people_officer', 'Chief People Officer', 'people', ['people_strategy']],
      ['chief_legal_officer', 'Chief Legal Officer', 'legal', ['legal_strategy', 'regulatory_compliance']],
      ['vp_sales', 'VP of Sales', 'marketing', ['sales_strategy', 'create_lead', 'intake_capture']],
      ['onboarding_comms_lead', 'Client Onboarding Email Lifecycle Agent', 'marketing', ['email_sequence_queue']],
    ];
    for (const [id, title, department, requiredCapabilities] of roles) {
      organization.registerRole({ id, title, department, requiredCapabilities });
    }

    const agents = [
      { id: 'ceo_agent', name: 'CEO Agent', title: 'Chief Intelligence & Orchestration Agent', department: 'executive', role: 'chief_intelligence_officer', skills: ['task_decomposition', 'delegation_brief', 'priority_scoring', 'decision_memo', 'status_synthesis', 'escalation_assessment', 'department_capability_lookup', 'workload_balancing', 'quality_review', 'budget_token_allocation'], capabilities: ['task_routing', 'agent_supervision', 'project_memory', 'business_strategy', 'research_synthesis', 'quality_control', 'brand_enforcement', 'revenue_prioritization', 'escalation_management', 'agent_registry_management'], models: ['GPT', 'Claude'], reportsTo: null },
      { id: 'cfo_agent', name: 'CFO Agent', title: 'Chief Financial Officer', department: 'finance', role: 'chief_financial_officer', skills: ['priority_scoring', 'decision_memo', 'status_synthesis', 'escalation_assessment', 'quality_review', 'budget_token_allocation', 'compute_financial_model', 'import_revenue_csv'], capabilities: ['financial_strategy', 'financial_forecasting'], models: ['GPT', 'Claude'], reportsTo: 'ceo_agent' },
      { id: 'cto_agent', name: 'CTO Agent', title: 'Chief Technology Officer', department: 'technology', role: 'chief_technology_officer', skills: ['task_decomposition', 'delegation_brief', 'priority_scoring', 'decision_memo', 'status_synthesis', 'escalation_assessment', 'workload_balancing', 'quality_review', 'budget_token_allocation', 'scope_creep_detection'], capabilities: ['technology_strategy', 'software_development'], models: ['Codex', 'GPT'], reportsTo: 'ceo_agent' },
      { id: 'cmo_agent', name: 'CMO Agent', title: 'Chief Marketing Officer', department: 'marketing', role: 'chief_marketing_officer', skills: ['task_decomposition', 'delegation_brief', 'priority_scoring', 'decision_memo', 'status_synthesis', 'escalation_assessment', 'workload_balancing', 'quality_review', 'budget_token_allocation', 'schema_reservation_markup', 'schema_order_markup', 'schema_discussion_markup', 'schema_profile_markup', 'content_quality_analysis', 'generate_docx', 'generate_pdf', 'generate_spreadsheet'], capabilities: ['marketing_strategy', 'content_creation'], models: ['Claude', 'GPT'], reportsTo: 'ceo_agent' },
      { id: 'chro_agent', name: 'CHRO Agent', title: 'Chief People Officer', department: 'people', role: 'chief_people_officer', skills: ['delegation_brief', 'priority_scoring', 'decision_memo', 'status_synthesis', 'escalation_assessment', 'department_capability_lookup', 'workload_balancing', 'quality_review'], capabilities: ['people_strategy'], models: ['GPT', 'Claude'], reportsTo: 'ceo_agent' },
      { id: 'clo_agent', name: 'CLO Agent', title: 'Chief Legal Officer', department: 'legal', role: 'chief_legal_officer', skills: ['priority_scoring', 'decision_memo', 'status_synthesis', 'escalation_assessment', 'quality_review'], capabilities: ['legal_strategy', 'regulatory_compliance'], models: ['GPT', 'Claude'], reportsTo: 'ceo_agent' },
      { id: 'hermes', name: 'Hermes', title: 'Chief Operating Officer', department: 'operations', role: 'chief_operating_officer', skills: ['task_decomposition', 'delegation_brief', 'priority_scoring', 'status_synthesis', 'escalation_assessment', 'department_capability_lookup', 'workload_balancing', 'quality_review', 'budget_token_allocation'], capabilities: ['operations_strategy', 'cron_create', 'webhook_subscribe', 'api_trigger', 'workflow_execution', 'skill_chain', 'sandbox_execution', 'system_monitoring', 'alert_dispatch', 'intake_parsing', 'crm_action', 'scheduled_job', 'file_processing', 'memory_lookup', 'automation_run'], models: ['Hermes', 'Hermes Runtime'], reportsTo: 'ceo_agent' },
      { id: 'sales_intake_agent', name: 'Sales Intake Agent', title: 'VP of Sales', department: 'marketing', role: 'vp_sales', capabilities: ['sales_strategy', 'create_lead', 'intake_capture'], models: ['GPT'], reportsTo: 'cmo_agent' },
      { id: 'onboarding_comms_agent', name: 'Onboarding Communications Agent', title: 'Client Onboarding Email Lifecycle Agent', department: 'marketing', role: 'onboarding_comms_lead', capabilities: ['email_welcome', 'email_score_invite', 'email_upload_reminder', 'email_review_call', 'email_scan_complete', 'email_mail_reminder', 'email_bureau_checkin', 'email_sweep_upgrade', 'email_testimonial', 'email_sequence_queue'], models: ['GPT'], reportsTo: 'cmo_agent' },
    ];
    for (const agent of agents) organization.registerAgent(agent);

    return organization;
  }
}

module.exports = Organization;
