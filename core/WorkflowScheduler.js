/**
 * Polls a WorkflowRuntime's store for `waiting` runs whose earliest due step
 * has passed and resumes them. Single-process operation works with any
 * conforming store; durable, cross-restart scheduling requires a persistent
 * store (Priority 5a) since the poller only ever discovers state through
 * `store.listWaiting()` — it holds no in-memory schedule of its own.
 */

function earliestDueStep(record) {
  let earliest = null;
  for (const step of record.steps || []) {
    if (step.status !== 'waiting' || !step.scheduledFor) continue;
    const due = new Date(step.scheduledFor);
    if (!earliest || due < earliest) earliest = due;
  }
  return earliest;
}

class WorkflowScheduler {
  /**
   * @param {object} options
   * @param {import('./WorkflowRuntime').WorkflowRuntime} options.runtime A runtime whose store implements `listWaiting()`.
   * @param {(workflowId: string) => object|null} options.workflowResolver Looks up the workflow definition a due run needs to resume.
   * @param {() => Date} [options.clock] Injectable clock, defaults to wall-clock time.
   */
  constructor({ runtime, workflowResolver, clock = () => new Date() } = {}) {
    if (!runtime || typeof runtime.resume !== 'function') {
      throw new Error('WorkflowScheduler requires a WorkflowRuntime instance.');
    }
    if (typeof workflowResolver !== 'function') {
      throw new Error('WorkflowScheduler requires a workflowResolver(workflowId) function.');
    }
    if (!runtime.store || typeof runtime.store.listWaiting !== 'function') {
      throw new Error("WorkflowScheduler requires a store that implements listWaiting().");
    }
    this.runtime = runtime;
    this.workflowResolver = workflowResolver;
    this.clock = clock;
    this._resuming = new Set();
    this._timer = null;
  }

  /**
   * Finds due `waiting` runs and resumes each once. Safe to call repeatedly
   * (e.g. from `start()`'s interval) or directly in tests with a controlled
   * clock. Concurrent/overlapping calls never resume the same run twice.
   * @returns {Promise<Array<{id: string, status: string, reason?: string}>>}
   */
  async tick() {
    const now = this.clock();
    const waitingRuns = await this.runtime.store.listWaiting();
    const results = [];

    for (const record of waitingRuns) {
      if (this._resuming.has(record.id)) continue;
      const due = earliestDueStep(record);
      if (!due || due > now) continue;

      const workflow = this.workflowResolver(record.workflowId);
      if (!workflow) {
        results.push({ id: record.id, status: 'skipped', reason: 'workflow_not_found' });
        continue;
      }

      this._resuming.add(record.id);
      try {
        const resumed = await this.runtime.resume(record.id, workflow);
        results.push({ id: record.id, status: resumed.status });
      } finally {
        this._resuming.delete(record.id);
      }
    }

    return results;
  }

  /**
   * Starts polling `tick()` on an interval. No-op if already started.
   * @param {number} intervalMs Poll interval in milliseconds.
   * @returns {WorkflowScheduler}
   */
  start(intervalMs) {
    if (this._timer) return this;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error('WorkflowScheduler.start requires a positive intervalMs.');
    }
    this._timer = setInterval(() => { this.tick().catch(() => {}); }, intervalMs);
    if (this._timer.unref) this._timer.unref();
    return this;
  }

  /**
   * Stops polling. No-op if not started.
   * @returns {WorkflowScheduler}
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }
}

module.exports = { WorkflowScheduler, earliestDueStep };
