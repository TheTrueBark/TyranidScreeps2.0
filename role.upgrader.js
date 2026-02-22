const workerRole = require('./role.worker');

module.exports = {
  run(creep) {
    if (!creep.memory) creep.memory = {};
    if (!creep.memory.role || creep.memory.role === 'worker') {
      creep.memory.role = 'upgrader';
    }
    if (creep.memory.primaryRole === 'upgrader') {
      delete creep.memory.primaryRole;
    }
    workerRole.run(creep);
  },
  onDeath(creep) {
    workerRole.onDeath(creep);
  },
};
