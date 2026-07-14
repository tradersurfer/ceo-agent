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
      ['operations', 'Operations'],
      ['engineering', 'Engineering'],
      ['marketing', 'Marketing'],
      ['finance', 'Finance'],
      ['research', 'Research'],
      ['growth', 'Growth'],
      ['client_services', 'Client Services'],
      ['design', 'Design'],
    ];
    for (const [id, name] of departments) organization.registerDepartment({ id, name });

    const roles = [
      ['chief_intelligence_officer', 'Chief Intelligence Officer', 'executive', ['executive_orchestration']],
      ['operations_supervisor', 'Operations Supervisor', 'operations', ['workflow_execution']],
      ['senior_software_engineer', 'Senior Software Engineer', 'engineering', ['software_development']],
      ['creative_director', 'Creative Director', 'marketing', ['content_creation']],
      ['financial_intelligence_analyst', 'Financial Intelligence Analyst', 'finance', ['financial_forecasting']],
      ['research_lead', 'Research Lead', 'research', ['research']],
      ['growth_strategist', 'Growth Strategist', 'growth', ['seo_optimization']],
      ['client_success_lead', 'Client Success Lead', 'client_services', ['community_engagement']],
      ['design_director', 'Design Director', 'design', ['design_generation']],
    ];
    for (const [id, title, department, requiredCapabilities] of roles) {
      organization.registerRole({ id, title, department, requiredCapabilities });
    }

    const agents = [
      { id: 'ceo_agent', name: 'CEO Agent', title: 'Chief Intelligence & Orchestration Agent', department: 'executive', role: 'chief_intelligence_officer', capabilities: ['executive_orchestration'], models: ['GPT', 'Claude'], reportsTo: null },
      { id: 'hermes', name: 'Hermes', title: 'Head of Operations & Execution Agent', department: 'operations', role: 'operations_supervisor', capabilities: ['workflow_execution', 'cron_create', 'webhook_subscribe'], models: ['Hermes', 'Hermes Runtime'], reportsTo: 'ceo_agent' },
      { id: 'content_lead', name: 'Content Lead', title: 'Creative Director', department: 'marketing', role: 'creative_director', capabilities: ['content_creation'], models: ['Claude', 'GPT'], reportsTo: 'ceo_agent' },
      { id: 'finance_analyst', name: 'Finance Analyst', title: 'Financial Intelligence Analyst', department: 'finance', role: 'financial_intelligence_analyst', capabilities: ['financial_forecasting', 'financial_statement_analysis'], models: ['GPT', 'Claude'], reportsTo: 'ceo_agent' },
      { id: 'growth_strategist', name: 'Growth Strategist', title: 'Growth Strategist', department: 'growth', role: 'growth_strategist', capabilities: ['seo_optimization'], models: ['GPT'], reportsTo: 'ceo_agent' },
      { id: 'claude_code', name: 'Claude Code', title: 'Senior Software Engineer', department: 'engineering', role: 'senior_software_engineer', capabilities: ['software_development'], models: ['Codex', 'GPT'], reportsTo: 'ceo_agent' },
      { id: 'design_lead', name: 'Design Lead', title: 'Design Director', department: 'design', role: 'design_director', capabilities: ['design_generation', 'image_generation'], models: ['Gemini'], reportsTo: 'ceo_agent' },
    ];
    for (const agent of agents) organization.registerAgent(agent);

    return organization;
  }
}

module.exports = Organization;
