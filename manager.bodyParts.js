/**
 * Calculates the body parts for different roles based on available energy.
 * @param {string} role - The role of the creep.
 * @param {number} availableEnergy - The available energy capacity.
 * @returns {Array} - An array of body parts.
 */
function calculateBodyParts(role, availableEnergy) {
    switch (role) {
        case 'miner':
            return calculateMinerBodyParts(availableEnergy);
        case 'hauler':
            return calculateHaulerBodyParts(availableEnergy);
        case 'builder':
            return calculateBuilderBodyParts(availableEnergy);
        case 'upgrader':
            return calculateUpgraderBodyParts(availableEnergy);
        case 'allPurpose':
            return calculateAllPurposeBodyParts(availableEnergy);
        default:
            return [];
    }
}

/**
 * Calculates the body parts for a miner based on available energy.
 * @param {number} availableEnergy - The available energy capacity.
 * @returns {Array} - An array of body parts for a miner.
 */
function calculateMinerBodyParts(availableEnergy) {
    // Define configurations for miners based on energy thresholds
    const minerConfigurations = [
        { energy: 300, bodyParts: [WORK, WORK, MOVE] },
        { energy: 550, bodyParts: [WORK, WORK, WORK, MOVE] },
        { energy: 800, bodyParts: [WORK, WORK, WORK, WORK, WORK, WORK, MOVE] }
    ];

    // Find the best configuration based on the available energy
    for (let i = minerConfigurations.length - 1; i >= 0; i--) {
        if (availableEnergy >= minerConfigurations[i].energy) {
            return minerConfigurations[i].bodyParts;
        }
    }

    // Default to the smallest configuration if not enough energy
    return [WORK, WORK, MOVE];
}

/**
 * Calculates the body parts for a hauler based on available energy.
 * @param {number} availableEnergy - The available energy capacity.
 * @returns {Array} - An array of body parts for a hauler.
 */
function calculateHaulerBodyParts(availableEnergy) {
    const bodyParts = [];
    const partCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE];

    while (availableEnergy >= partCost) {
        bodyParts.push(CARRY, MOVE);
        availableEnergy -= partCost;
    }

    return bodyParts;
}

/**
 * Calculates the body parts for a builder based on available energy.
 * @param {number} availableEnergy - The available energy capacity.
 * @returns {Array} - An array of body parts for a builder.
 */
function calculateBuilderBodyParts(availableEnergy) {
    const bodyParts = [];
    const partCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];

    while (availableEnergy >= partCost) {
        bodyParts.push(WORK, CARRY, MOVE);
        availableEnergy -= partCost;
    }

    return bodyParts;
}

/**
 * Calculates the body parts for an upgrader based on available energy.
 * @param {number} availableEnergy - The available energy capacity.
 * @returns {Array} - An array of body parts for an upgrader.
 */
function calculateUpgraderBodyParts(availableEnergy) {
    const bodyParts = [];
    const partCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];

    while (availableEnergy >= partCost) {
        bodyParts.push(WORK, CARRY, MOVE);
        availableEnergy -= partCost;
    }

    return bodyParts;
}

/**
 * Calculates the body parts for an all-purpose creep based on available energy.
 * @param {number} availableEnergy - The available energy capacity.
 * @returns {Array} - An array of body parts for an all-purpose creep.
 */
function calculateAllPurposeBodyParts(availableEnergy) {
    const bodyParts = [];
    const partCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];

    while (availableEnergy >= partCost) {
        bodyParts.push(WORK, CARRY, MOVE);
        availableEnergy -= partCost;
    }

    return bodyParts;
}

module.exports = {
    calculateBodyParts,
    calculateMinerBodyParts,
    calculateHaulerBodyParts,
    calculateBuilderBodyParts,
    calculateUpgraderBodyParts,
    calculateAllPurposeBodyParts
};
