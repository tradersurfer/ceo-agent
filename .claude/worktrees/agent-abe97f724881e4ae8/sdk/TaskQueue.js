const Task = require('./Task');
const { Statuses } = require('./constants');

class TaskQueue {
  /** Creates an empty in-memory task queue. */
  constructor() {
    this.items = [];
  }

  /**
   * Adds a task to the end of the queue.
   * @param {Task|object} task Task to enqueue.
   * @returns {Task} Queued task.
   */
  enqueue(task) {
    const item = task instanceof Task ? task : new Task(task);
    item.status = Statuses.QUEUED;
    this.items.push(item);
    return item;
  }

  /**
   * Removes and returns the next task.
   * @returns {Task|null} Next task or null.
   */
  dequeue() {
    return this.items.shift() || null;
  }

  /**
   * Returns the next task without removing it.
   * @returns {Task|null} Next task or null.
   */
  peek() {
    return this.items[0] || null;
  }

  /**
   * Cancels and removes a queued task by id.
   * @param {string} id Task id.
   * @returns {Task|null} Cancelled task or null.
   */
  cancel(id) {
    const index = this.items.findIndex(item => item.id === id);
    if (index < 0) return null;
    const [item] = this.items.splice(index, 1);
    item.status = Statuses.CANCELLED;
    return item;
  }

  /**
   * Removes every queued task.
   * @returns {number} Number of removed tasks.
   */
  clear() {
    const count = this.items.length;
    this.items.length = 0;
    return count;
  }

  /**
   * Returns the number of queued tasks.
   * @returns {number} Queue size.
   */
  size() {
    return this.items.length;
  }
}

module.exports = TaskQueue;
