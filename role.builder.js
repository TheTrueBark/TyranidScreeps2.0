const workerRole = require('./role.worker');

module.exports = {
  run(creep) {
    if (!creep.memory) creep.memory = {};
    if (!creep.memory.role || creep.memory.role === 'worker') {
      creep.memory.role = 'builder';
    }
    if (creep.memory.primaryRole === 'builder') {
      delete creep.memory.primaryRole;
    }
    workerRole.run(creep);
  },
  onDeath(creep) {
    workerRole.onDeath(creep);
  },
};
