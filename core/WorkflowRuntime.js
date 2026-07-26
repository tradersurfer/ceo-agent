const { EventEmitter } = require('events');

const TERMINAL = new Set(['completed', 'failed', 'skipped']);

class InMemoryWorkflowStore {
  constructor() { this.records = new Map(); }
  async save(record) { this.records.set(record.id, JSON.parse(JSON.stringify(record))); return this.get(record.id); }
  async get(id) { const record = this.records.get(id); return record ? JSON.parse(JSON.stringify(record)) : null; }
  async listWaiting() {
    return [...this.records.values()]
      .filter(record => record.status === 'waiting')
      .map(record => JSON.parse(JSON.stringify(record)));
  }
  /**
   * Atomically creates a record only if its id is absent. The has()-check and
   * set() below run synchronously with no intervening await, so even
   * concurrently-issued calls with the same id resolve deterministically —
   * whichever call's synchronous body runs first wins, per JS's run-to-
   * completion semantics between await points.
   * @param {object} record Record to create.
   * @returns {Promise<{record: object, created: boolean}>} The stored record and whether this call created it.
   */
  async createIfAbsent(record) {
    if (this.records.has(record.id)) {
      return { record: JSON.parse(JSON.stringify(this.records.get(record.id))), created: false };
    }
    this.records.set(record.id, JSON.parse(JSON.stringify(record)));
    return { record: JSON.parse(JSON.stringify(this.records.get(record.id))), created: true };
  }
}

class InMemoryAuditLog {
  constructor() { this.entries = []; }
  async append(entry) { const saved = { ...entry, timestamp: entry.timestamp || new Date().toISOString() }; this.entries.push(saved); return saved; }
  list() { return this.entries.map(entry => ({ ...entry })); }
}

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function addDelay(date, step) {
  const milliseconds = ((step.delay_minutes || 0) * 60 + (step.delay_hours || 0) * 3600 + (step.delay_days || 0) * 86400) * 1000;
  return new Date(date.getTime() + milliseconds);
}

class WorkflowRuntime {
  constructor({ store = new InMemoryWorkflowStore(), audit = new InMemoryAuditLog(), eventBus = new EventEmitter(), clock = () => new Date() } = {}) {
    this.store = store;
    this.audit = audit;
    this.eventBus = eventBus;
    this.clock = clock;
    this.executors = new Map();
  }

  registerExecutor(type, executor) {
    if (!type || typeof executor !== 'function') throw new Error('Workflow executor type and function are required.');
    this.executors.set(type, executor);
    return this;
  }

  async execute({ workflow, input = {}, context = {}, id = null } = {}) {
    if (!workflow || !workflow.id || !Array.isArray(workflow.steps)) throw new Error('A workflow with id and steps is required.');
    const now = this.clock();
    const record = {
      id: id || `${workflow.id}:${now.getTime()}`,
      workflowId: workflow.id,
      status: 'running',
      input: clone(input),
      context: clone(context),
      steps: workflow.steps.map(step => ({ id: step.id, status: 'pending', attempts: 0 })),
      outputs: {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // id doubles as the idempotency key (per ADR-002: "accept an idempotency
    // key, or reuse run id"). createIfAbsent() dedupes atomically at the
    // store; a retried or multi-instance execute() call with the same id
    // returns the winner's current state instead of starting a second run.
    // Stores that don't implement createIfAbsent() (custom injected stores)
    // fall back to the prior unconditional-save behavior.
    if (typeof this.store.createIfAbsent === 'function') {
      const { record: stored, created } = await this.store.createIfAbsent(record);
      if (!created) return clone(stored);
      return this._run(stored, workflow);
    }
    await this.store.save(record);
    return this._run(record, workflow);
  }

  async resume(id, workflow) {
    const record = await this.store.get(id);
    if (!record) throw new Error(`Workflow run not found: ${id}`);
    if (!workflow || workflow.id !== record.workflowId) throw new Error('The matching workflow definition is required to resume a run.');
    if (TERMINAL.has(record.status)) return record;
    return this._run(record, workflow);
  }

  async _run(record, workflow) {
    const now = this.clock();
    let waiting = false;
    for (const step of workflow.steps) {
      const state = record.steps.find(item => item.id === step.id);
      if (!state || TERMINAL.has(state.status)) continue;
      if (step.depends_on) {
        const dependency = record.steps.find(item => item.id === step.depends_on);
        if (!dependency || dependency.status === 'failed') { state.status = 'failed'; state.error = `Dependency failed: ${step.depends_on}`; continue; }
        if (dependency.status !== 'completed' && dependency.status !== 'skipped') { waiting = true; continue; }
      }
      if (step.condition && !this._conditionPasses(step.condition, record)) {
        state.status = 'skipped';
        await this._record(record, 'workflow.step.skipped', step, { reason: 'condition' });
        continue;
      }
      const due = addDelay(new Date(record.createdAt), step);
      if (due > now) {
        state.status = 'waiting';
        state.scheduledFor = due.toISOString();
        waiting = true;
        await this._record(record, 'workflow.step.waiting', step, { scheduledFor: state.scheduledFor });
        continue;
      }
      const executor = this.executors.get(step.type);
      if (!executor) { state.status = 'failed'; state.error = `No executor registered for step type: ${step.type}`; await this._record(record, 'workflow.step.failed', step, { error: state.error }); continue; }
      state.attempts += 1;
      try {
        const result = await executor({ step: clone(step), input: clone(record.input), context: clone(record.context), outputs: clone(record.outputs), run: clone(record) });
        if (!result || result.status === 'failed') throw new Error((result && result.error) || 'Workflow executor reported failure.');
        state.status = 'completed';
        state.output = clone(result);
        record.outputs[step.id] = clone(result);
        await this._record(record, 'workflow.step.completed', step, { output: result });
      } catch (error) {
        const maxAttempts = Number(step.max_attempts || (step.retry && step.retry.max_attempts) || 1);
        if (state.attempts < maxAttempts) { state.status = 'pending'; await this._record(record, 'workflow.step.retrying', step, { attempts: state.attempts, error: error.message }); }
        else { state.status = 'failed'; state.error = error.message; await this._record(record, 'workflow.step.failed', step, { attempts: state.attempts, error: error.message }); }
      }
    }
    const failed = record.steps.some(step => step.status === 'failed');
    const pending = record.steps.some(step => !TERMINAL.has(step.status));
    record.status = failed ? 'failed' : pending || waiting ? 'waiting' : 'completed';
    record.updatedAt = this.clock().toISOString();
    await this.store.save(record);
    await this._record(record, `workflow.${record.status}`, null, { workflowId: record.workflowId });
    return clone(record);
  }

  _conditionPasses(condition, record) {
    const value = condition.field.split('.').reduce((current, key) => current == null ? undefined : current[key], { ...record.input, ...record.context });
    if (condition.operator === 'eq') return value === condition.value;
    if (condition.operator === 'exists') return value !== undefined && value !== null;
    throw new Error(`Unsupported workflow condition operator: ${condition.operator}`);
  }

  async _record(record, event, step, data) {
    const context = record.context || {};
    const entry = {
      event,
      workflowId: record.workflowId,
      runId: record.id,
      stepId: step && step.id,
      // Carry tenant/agent from run context when present so a persistent audit
      // log is queryable by those dimensions. Omitted when absent, so in-memory
      // audit entries and existing consumers are unaffected.
      ...(context.tenantId != null ? { tenantId: context.tenantId } : {}),
      ...(context.agentId != null ? { agentId: context.agentId } : {}),
      ...data,
    };
    this.eventBus.emit(event, entry);
    await this.audit.append(entry);
  }
}

module.exports = { WorkflowRuntime, InMemoryWorkflowStore, InMemoryAuditLog };
