/**
 * Simple registry storing metadata about HTM tasks.
 * Allows docs and GUI tools to introspect available task types.
 * @codex-owner htm
 */
const registry = {};

/**
 * Register a task with descriptive metadata.
 * @param {string} name - Unique task name.
 * @param {object} meta - Information such as default priority or TTL.
 * @param {Trigger} [meta.trigger] - When and how the task should run.
 * @param {string} meta.owner - Owning module.
 */
function register(name, meta) {
  registry[name] = meta;
}

/**
 * Retrieve metadata for a task name.
 * @param {string} name
 * @returns {object|undefined}
 */
function get(name) {
  return registry[name];
}

module.exports = { register, get, registry };
