const workerRole = require('./role.worker');

const roleBuilder = {
  run(creep) {
    if (!creep.memory) creep.memory = {};
    creep.memory.primaryRole = 'builder';
    creep.memory.secondaryRole = 'upgrader';
    workerRole.run(creep);
  },
  onDeath(creep) {
    workerRole.onDeath(creep);
  },
};

module.exports = roleBuilder;

