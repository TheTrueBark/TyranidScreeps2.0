const statsConsole = require("statsConsole");
const roomManager = require("roomManager");
const spawnManager = require("spawnManager");
const roleAllPurpose = require("role.allPurpose");

// Sample data format ["Name for Stat", variableForStat]
let myStats = [];

module.exports.loop = function () {
	// Log "Running main loop" every 5 ticks
	//		statsConsole.log("Running main loop", 5);

	// Collect CPU stats
	let totalCPUUsage = Game.cpu.getUsed();
	let initCPUUsage = 0;
	let CreepManagersCPUUsage = 0;
	let towersCPUUsage = 0;
	let linksCPUUsage = 0;
	let SetupRolesCPUUsage = 0;
	let CreepsCPUUsage = 0;
	let statsCPUUsage = 0;

	myStats = [
		["Creep Managers", CreepManagersCPUUsage],
		["Towers", towersCPUUsage],
		["Links", linksCPUUsage],
		["Setup Roles", SetupRolesCPUUsage],
		["Creeps", CreepsCPUUsage],
		["Init", initCPUUsage],
		["Stats", statsCPUUsage],
		["Total", totalCPUUsage]
	];

	statsConsole.run(myStats);

	if (totalCPUUsage > Game.cpu.limit) {
		statsConsole.log("Tick: " + Game.time + "  CPU OVERRUN: " + Game.cpu.getUsed().toFixed(2) + "  Bucket:" + Game.cpu.bucket, 5);
	}

	if (Game.time % 5 === 0) {
		console.log(statsConsole.displayHistogram());
		console.log(statsConsole.displayStats());
		console.log(statsConsole.displayLogs());
		let drawTime = Game.cpu.getUsed() - totalCPUUsage;
		console.log("Time to Draw: " + drawTime.toFixed(2));
	}

	// Scan rooms and spawn initial creeps
	for (const roomName in Game.rooms) {
		const room = Game.rooms[roomName];
		roomManager.scanRoom(room);
	}

	for (const spawnName in Game.spawns) {
		const spawn = Game.spawns[spawnName];
		spawnManager.spawnAllPurposeCreeps(spawn);
	}

	// Run creep roles
	for (const name in Game.creeps) {
		const creep = Game.creeps[name];
		if (creep.memory.role === 'allPurpose') {
			roleAllPurpose.run(creep);
		}
	}
}
