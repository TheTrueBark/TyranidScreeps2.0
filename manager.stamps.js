// stampManager.js

const stamps = {
  main: {
    structures: {
      spawn: [{ x: 1, y: 0, rcl: 1 }],
      link: [{ x: 3, y: 2, rcl: 5 }],
      road: [{ x: 0, y: 0, rcl: 1 }],
      storage: [{ x: 1, y: 1, rcl: 4 }],
      tower: [
        { x: 2, y: 0, rcl: 3 },
        { x: 2, y: 2, rcl: 5 },
      ],
      powerSpawn: [{ x: 1, y: 2, rcl: 8 }],
      terminal: [{ x: 3, y: 1, rcl: 6 }],
      nuker: [{ x: 3, y: 0, rcl: 8 }],
    },
  },
  // Add more stamps here if needed
};

const structureMapping = {
  road: "R",
  spawn: "S",
  tower: "T",
  nuker: "N",
  storage: "St",
  terminal: "Te",
  powerSpawn: "Ps",
  link: "L",
};

function rotateCoordinates(x, y, angle) {
  switch (angle) {
    case 90:
      return { x: y, y: -x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: -y, y: x };
    default:
      return { x, y };
  }
}

function rotateStamp(stamp, angle) {
  const rotatedStamp = { structures: {} };
  for (const [structureType, positions] of Object.entries(stamp.structures)) {
    rotatedStamp.structures[structureType] = positions.map(({ x, y, rcl }) => ({
      ...rotateCoordinates(x, y, angle),
      rcl,
    }));
  }
  return rotatedStamp;
}

module.exports = {
  getStamps: function (rcl) {
    const result = [];
    for (const stamp of Object.values(stamps)) {
      const filtered = { structures: {} };
      for (const [type, positions] of Object.entries(stamp.structures)) {
        filtered.structures[type] = positions.filter(p => p.rcl <= rcl);
      }
      result.push(filtered);
    }
    return result;
  },

  visualizeStamp: function (room, rcl, angle = 0) {
    const stamp = stamps["main"];
    if (!stamp) return;

    // Initialize spawn position from the first available spawn if missing
    if (!room.memory.spawnPos) {
      const spawn = room.find(FIND_MY_SPAWNS)[0];
      if (!spawn) return;
      room.memory.spawnPos = { x: spawn.pos.x, y: spawn.pos.y };
    }

    const rotatedStamp = rotateStamp(stamp, angle);
    const visual = new RoomVisual(room.name);

    for (const [structureType, positions] of Object.entries(
      rotatedStamp.structures,
    )) {
      for (const pos of positions) {
        if (pos.rcl <= rcl) {
          const x = room.memory.spawnPos.x + pos.x;
          const y = room.memory.spawnPos.y + pos.y;
          const abbreviation = structureMapping[structureType] || structureType;
          visual.text(`${abbreviation}`, x, y, { color: "yellow", font: 0.5 });
        }
      }
    }
  },

  decodeStamp: function (encodedStamp) {
    const reverse = {};
    for (const [type, code] of Object.entries(structureMapping)) {
      reverse[code] = type;
    }

    const decoded = { structures: {} };
    const rows = encodedStamp.trim().split("\n");
    for (const row of rows) {
      const parts = row.trim().split(/\s+/);
      for (const part of parts) {
        const match = part.match(/(\d+):([A-Za-z]+)\(([-\d]+),([-\d]+)\)/);
        if (!match) continue;
        const [, rclStr, code, xStr, yStr] = match;
        const structureType = reverse[code];
        if (!structureType) continue;
        if (!decoded.structures[structureType]) decoded.structures[structureType] = [];
        decoded.structures[structureType].push({
          x: parseInt(xStr, 10),
          y: parseInt(yStr, 10),
          rcl: parseInt(rclStr, 10),
        });
      }
    }

    return decoded;
  },

  saveStampToMemory: function (room, stamp) {
    if (!room.memory.buildPlan) {
      room.memory.buildPlan = [];
    }
    room.memory.buildPlan = stamp.structures;
  },

  loadStampFromMemory: function (room) {
    return room.memory.buildPlan || [];
  },
};
