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
    return Object.values(stamps).filter((stamp) => stamp.rcl <= rcl);
  },

  visualizeStamp: function (room, rcl, angle = 0) {
    const stamp = stamps["main"];
    if (!stamp) return;

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
    const decoded = { structures: {} };

    const rows = encodedStamp.split("\n");
    for (const row of rows) {
      const parts = row.split("[");
      for (const part of parts) {
        if (part) {
          const [rcl, structureCode] = part.split(":");
          const structureType = structureMapping[structureCode[0]];
          const x = parseInt(part[1]);
          const y = parseInt(part[3]);

          if (!decoded.structures[structureType]) {
            decoded.structures[structureType] = [];
          }

          decoded.structures[structureType].push({ x, y, rcl: parseInt(rcl) });
        }
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
