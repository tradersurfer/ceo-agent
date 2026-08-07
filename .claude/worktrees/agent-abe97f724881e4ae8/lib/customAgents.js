const KNOWN_DEPARTMENTS = Object.freeze(['finance', 'operations', 'technology', 'marketing', 'people', 'legal']);

const DEPARTMENT_HEADS = Object.freeze({
  finance: 'cfo_agent',
  operations: 'hermes',
  technology: 'cto_agent',
  marketing: 'cmo_agent',
  people: 'chro_agent',
  legal: 'clo_agent',
});

function slugifyAgentId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildCustomAgentPrompt({ name, title, department, description }) {
  return `# ${name} Prompt

You are ${name}, the ${title} in the ${department} department, reporting into the CEO Agent's organization.

You report to the CEO Agent, the Chief Intelligence & Orchestration Agent. ${description}

Answer within your domain with clarity and directness. Defer strategy, legal positioning, pricing, and company-wide decisions to the CEO Agent and the relevant department head.`;
}

function validateCustomAgentInput(input = {}, existingIds = []) {
  const errors = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const department = typeof input.department === 'string' ? input.department.trim().toLowerCase() : '';

  if (!name) errors.push('name is required.');
  if (!title) errors.push('title is required.');
  if (!description) errors.push('description is required.');
  if (!KNOWN_DEPARTMENTS.includes(department)) {
    errors.push(`department must be one of: ${KNOWN_DEPARTMENTS.join(', ')}.`);
  }

  const id = slugifyAgentId(name);
  if (!id) errors.push('name must contain at least one alphanumeric character.');
  if (id && existingIds.includes(id)) errors.push(`agent id already exists: ${id}`);

  return { valid: errors.length === 0, errors, id, name, title, description, department };
}

function buildCustomAgentEntry(validated) {
  const { id, name, title, description, department } = validated;
  return {
    id,
    name,
    title,
    department,
    lane: department,
    reports_to: DEPARTMENT_HEADS[department] || 'ceo_agent',
    role: 'custom_agent',
    capabilities: [],
    models: [],
    custom: true,
    description,
    prompt: buildCustomAgentPrompt({ name, title, department, description }),
  };
}

module.exports = {
  KNOWN_DEPARTMENTS,
  DEPARTMENT_HEADS,
  slugifyAgentId,
  buildCustomAgentPrompt,
  validateCustomAgentInput,
  buildCustomAgentEntry,
};
