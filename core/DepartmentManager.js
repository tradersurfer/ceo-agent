const DISPLAY_NAMES = Object.freeze({
  executive: 'Executive Office',
  finance: 'Finance',
  operations: 'Operations',
  technology: 'Technology',
  marketing: 'Marketing',
  people: 'People',
  legal: 'Legal',
});

class DepartmentManager {
  /**
   * Creates departments from ids or department records.
   * @param {Array<string|object>} departments Initial departments.
   */
  constructor(departments = []) {
    this.departments = new Map();
    for (const department of departments) {
      if (typeof department === 'string') this.registerDepartment(department);
      else if (department && department.id) this.registerDepartment(department.id, department);
    }
  }

  /**
   * Registers or updates a department.
   * @param {string} id Department id.
   * @param {object} details Department details.
   * @returns {object} Department record.
   */
  registerDepartment(id, details = {}) {
    const normalizedId = this._normalizeId(id);
    if (!normalizedId) throw new TypeError('Department id is required.');
    const current = this.departments.get(normalizedId);
    const department = {
      id: normalizedId,
      name: details.name || (current && current.name) || DISPLAY_NAMES[normalizedId] || this._displayName(normalizedId),
      status: details.status || (current && current.status) || 'active',
      agents: current ? [...current.agents] : [],
    };
    if (Array.isArray(details.agents)) department.agents = [...details.agents];
    this.departments.set(normalizedId, department);
    return this._copyDepartment(department);
  }

  /** Returns all departments. @returns {object[]} Department records. */
  listDepartments() {
    return [...this.departments.values()].map(department => this._copyDepartment(department));
  }

  /** Gets a department. @param {string} id Department id. @returns {object|null} Department or null. */
  getDepartment(id) {
    const department = this.departments.get(this._normalizeId(id));
    return department ? this._copyDepartment(department) : null;
  }

  /**
   * Assigns an agent to a department.
   * @param {object} agent Agent record.
   * @param {string} departmentId Department id.
   * @returns {object} Structured assignment result.
   */
  assignAgentToDepartment(agent, departmentId) {
    if (!agent || !agent.id) return { status: 'blocked', reason: 'Agent with id is required.' };
    const department = this.departments.get(this._normalizeId(departmentId));
    if (!department) return { status: 'blocked', reason: `Department not found: ${departmentId}` };
    const index = department.agents.findIndex(item => item.id === agent.id);
    if (index >= 0) department.agents[index] = agent;
    else department.agents.push(agent);
    return { status: 'assigned', departmentId: department.id, agentId: agent.id, agent };
  }

  /** Lists agents in a department. @param {string} departmentId Department id. @returns {object[]} Agents. */
  listAgentsByDepartment(departmentId) {
    const department = this.departments.get(this._normalizeId(departmentId));
    return department ? [...department.agents] : [];
  }

  /** Finds an agent's department. @param {string} agentId Agent id. @returns {object|null} Department or null. */
  getDepartmentForAgent(agentId) {
    const department = [...this.departments.values()].find(item => item.agents.some(agent => agent.id === agentId));
    return department ? this._copyDepartment(department) : null;
  }

  /**
   * Removes an agent from a department.
   * @param {string} agentId Agent id.
   * @param {string} departmentId Department id.
   * @returns {boolean} Whether an assignment was removed.
   */
  removeAgentFromDepartment(agentId, departmentId) {
    const department = this.departments.get(this._normalizeId(departmentId));
    if (!department) return false;
    const index = department.agents.findIndex(agent => agent.id === agentId);
    if (index < 0) return false;
    department.agents.splice(index, 1);
    return true;
  }

  /** Returns a structured organization chart. @returns {object} Organization chart. */
  getOrgChart() {
    return { departments: this.listDepartments() };
  }

  _normalizeId(id) {
    return String(id || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  _displayName(id) {
    return id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  _copyDepartment(department) {
    return { ...department, agents: [...department.agents] };
  }
}

DepartmentManager.DISPLAY_NAMES = DISPLAY_NAMES;
module.exports = DepartmentManager;
