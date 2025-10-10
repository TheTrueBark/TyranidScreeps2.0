const workerRole = require('./role.worker');

const roleUpgrader = {
  run(creep) {
    if (!creep.memory) creep.memory = {};
    creep.memory.primaryRole = 'upgrader';
    creep.memory.secondaryRole = 'builder';
    workerRole.run(creep);
  },
  onDeath(creep) {
    workerRole.onDeath(creep);
  },
};

module.exports = roleUpgrader;

