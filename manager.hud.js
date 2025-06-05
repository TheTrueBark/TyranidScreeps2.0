// hudManager.js

module.exports = {
  createHUD: function (room) {
    const visual = new RoomVisual(room.name);

    // Distance Transform Status
    const dtStatus = room.memory.distanceTransform ? "✓" : "X";
    visual.text(`DT: ${dtStatus}`, 1, 1, { color: "white", font: 1 });

    // Add more statuses as needed
  },
};
