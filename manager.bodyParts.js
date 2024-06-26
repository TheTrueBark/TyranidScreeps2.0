const debugConfig = require("console.debugLogs");

const bodyPartManager = {
    calculateBodyParts(role, availableEnergy) {
        if (debugConfig.bodyPartManager) console.log(`Calculating body parts for role: ${role} with available energy: ${availableEnergy}`);
        let bodyParts = [];
        switch (role) {
            case 'miner':
                bodyParts = this.calculateMinerBodyParts(availableEnergy);
                break;
            case 'hauler':
                bodyParts = this.calculateHaulerBodyParts(availableEnergy);
                break;
            case 'builder':
                bodyParts = this.calculateBuilderBodyParts(availableEnergy);
                break;
            case 'upgrader':
                bodyParts = this.calculateUpgraderBodyParts(availableEnergy);
                break;
            case 'allPurpose':
                bodyParts = this.calculateAllPurposeBodyParts(availableEnergy);
                break;
            default:
                if (debugConfig.bodyPartManager) console.log(`Unknown role: ${role}`);
        }
        if (debugConfig.bodyPartManager) console.log(`Calculated body parts for ${role}: ${bodyParts}`);
        return bodyParts;
    },

    calculateMinerBodyParts(availableEnergy) {
        const bodyParts = [];
        const workCost = 100;
        const moveCost = 50;
        const numWorkParts = Math.floor(availableEnergy / (workCost + moveCost));
        for (let i = 0; i < numWorkParts; i++) {
            bodyParts.push(WORK);
            if (i < Math.floor(availableEnergy / moveCost)) {
                bodyParts.push(MOVE);
            }
        }
        return bodyParts;
    },

    calculateHaulerBodyParts(availableEnergy) {
        const bodyParts = [];
        const carryCost = 50;
        const moveCost = 50;
        const numParts = Math.floor(availableEnergy / (carryCost + moveCost));
        for (let i = 0; i < numParts; i++) {
            bodyParts.push(CARRY);
            bodyParts.push(MOVE);
        }
        return bodyParts;
    },

    calculateBuilderBodyParts(availableEnergy) {
        const bodyParts = [];
        const workCost = 100;
        const carryCost = 50;
        const moveCost = 50;
        const partCost = workCost + carryCost + moveCost;
        const numParts = Math.floor(availableEnergy / partCost);

        for (let i = 0; i < numParts; i++) {
            bodyParts.push(WORK);
            bodyParts.push(CARRY);
            bodyParts.push(MOVE);
        }

        return bodyParts;
    },

    calculateUpgraderBodyParts(availableEnergy) {
        const bodyParts = [];
        const workCost = 100;
        const carryCost = 50;
        const moveCost = 50;
        const partCost = workCost + carryCost + moveCost;
        const numParts = Math.floor(availableEnergy / partCost);

        for (let i = 0; i < numParts; i++) {
            bodyParts.push(WORK);
            bodyParts.push(CARRY);
            bodyParts.push(MOVE);
        }

        return bodyParts;
    },

    calculateAllPurposeBodyParts(availableEnergy) {
        const bodyParts = [];
        const workCost = 100;
        const carryCost = 50;
        const moveCost = 50;
        const partCost = workCost + carryCost + moveCost;
        const numParts = Math.floor(availableEnergy / partCost);

        for (let i = 0; i < numParts; i++) {
            bodyParts.push(WORK);
            bodyParts.push(CARRY);
            bodyParts.push(MOVE);
        }

        if (bodyParts.length === 0) {
            if (debugConfig.bodyPartManager) console.log(`Not enough energy to spawn creep`);
        }

        return bodyParts;
    }
};

module.exports = bodyPartManager;
