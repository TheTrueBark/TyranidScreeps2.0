var statsConsole = {
  run: function (data, logCpu = true, opts = {}) {
    if (Memory.stats === undefined) {
      Memory.stats = {};
    }
    Memory.stats.cpu = data;

    let max = opts.max || 100;
    let display = opts.display || 10;
    Memory.stats["gcl.progress"] = Game.gcl.progress || 0;
    Memory.stats["gcl.progressTotal"] = Game.gcl.progressTotal || 1;
    Memory.stats["gcl.level"] = Game.gcl.level || 1;
    Memory.stats["cpu.bucket"] = Game.cpu.bucket || 0;
    Memory.stats["cpu.limit"] = Game.cpu.limit || 0;
    Memory.stats["cpu.current"] = Game.cpu.getUsed() || 0;

    if (logCpu) {
      if (!Memory.stats.__cpu && Memory.stats.__cpu === undefined) {
        Memory.stats["__cpu"] = new Array(0);
      }
      Memory.stats.__cpu.unshift(Game.cpu.getUsed());
      if (Memory.stats["__cpu"].length > max - 6) {
        Memory.stats["__cpu"].pop();
      }

      if (Memory.stats.logs === undefined) {
        Memory.stats.logs = [["Logging Initialized!", 3]];
      }

      if (Memory.stats.logs && Memory.stats.logs.length >= display) {
        for (let i = 0; i <= Memory.stats.logs.length - display; i++) {
          Memory.stats.logs.shift();
        }
      }
    }
    return true;
  },

  displayHistogram: function (width = 100, height = 20) {
    var asciiChart = require("console.ascii-chart");
    let cpuData = Memory.stats.__cpu || [0];
    let output = asciiChart.chart(
      cpuData.slice(0, Math.floor(width / 3)).reverse(),
      {
        width: width,
        height: height,
      },
    );
    let style = {
      lineHeight: "1",
    };
    let styleStr = _.reduce(
      style,
      (l, v, k) => `${l}${_.kebabCase(k)}: ${v};`,
      "",
    );
    output = `<span style="${styleStr}">${output}</span>`;
    return output;
  },

  displayStats: function (opts = {}) {
    let totalWidth = opts.totalWidth || 100;
    let cpuAvgCount = opts.cpuHistory || 10;
    let title = opts.cpuTitle || "CPU";
    let statsTitle = opts.statsTitle || "Stats";
    let leftTopCorner = opts.leftTopCorner || "+";
    let rightTopCorner = opts.rightTopCorner || "+";
    let leftBottomCorner = opts.leftBottomCorner || "+";
    let rightBottomCorner = opts.rightBottomCorner || "+";
    let hBar = opts.hBar || "-";
    let vbar = opts.vBar || "|";
    let percent = opts.percent || "%";
    let useProgressBar = opts.useProgressBar || "yes";
    let percentInProgressBar = opts.percentInProgressBar || "yes";
    let progressBar = opts.progressBar || "#";
    let spacing = opts.spacing || " ";
    let addLinks = opts.links || "yes";

    let boxWidth = totalWidth - hBar.length * 4 - vbar.length * 4;
    let rooms = Game.rooms;
    let cpuLimit = Game.cpu.limit || 1;
    let cpuBucket = Game.cpu.bucket || 0;
    let cpuTotal = Game.cpu.getUsed() || 0;

    let addSpace = 0;
    if (!(boxWidth % 2 === 0)) {
      addSpace = 1;
    }

    let cpuAverage = 0;
    for (let i = cpuAvgCount; i > 0; i--) {
      cpuAverage = cpuAverage + (Memory.stats.__cpu[i] || 0);
    }
    cpuAverage = cpuAverage / cpuAvgCount;

    var spacesToEnd = function (count, len) {
      return _.repeat(" ", len - count.length);
    };

    let lineName = ["Usage", "Usage Avg", "Bucket"];
    let lineStat = [
      ((cpuTotal / cpuLimit) * 100).toFixed(2) + percent,
      ((cpuAverage / cpuLimit) * 100).toFixed(2) + percent,
      cpuBucket.toFixed(0).toString(),
    ];

    for (let i = 0; i < Memory.stats.cpu.length; i++) {
      let name = [Memory.stats.cpu[i][0]];
      let stat = [Memory.stats.cpu[i][1].toFixed(0)];
      lineName.push(name);
      lineStat.push(stat);
    }

    let cpuStats =
      leftTopCorner +
      _.repeat(
        hBar,
        boxWidth / 4 - (spacing.length + title.length + spacing.length) / 2,
      ) +
      spacing +
      title +
      spacing +
      _.repeat(
        hBar,
        boxWidth / 4 - (spacing.length + title.length + spacing.length) / 2,
      ) +
      rightTopCorner +
      "\n";
    for (let i = 0; i < lineName.length && i < lineStat.length; i++) {
      cpuStats =
        cpuStats +
        vbar +
        spacing +
        lineName[i] +
        _.repeat(
          spacing,
          boxWidth / 4 - (spacing + spacing + lineName[i]).length,
        ) +
        spacing +
        ":" +
        spacing +
        lineStat[i] +
        _.repeat(
          spacing,
          boxWidth / 4 - (spacing + spacing + lineStat[i]).length,
        ) +
        spacing +
        vbar +
        "\n";
    }
    cpuStats =
      cpuStats +
      leftBottomCorner +
      _.repeat(hBar, boxWidth / 2 + 1 + addSpace) +
      rightBottomCorner;

    title = statsTitle;
    let gclProgress = Game.gcl.progress || 0;
    let gclProgressTotal = Game.gcl.progressTotal || 1;
    let secondLineName = [
      "GCL" +
        (Game.gcl.level + 1) +
        " - " +
        ((gclProgress / gclProgressTotal) * 100).toFixed(0) +
        "%",
    ];
    let secondLineStat = [
      ((gclProgress / gclProgressTotal) * 100).toFixed(2) + percent,
    ];
    if (useProgressBar === "yes") {
      secondLineStat = [
        _.repeat(
          progressBar,
          (gclProgress / gclProgressTotal) * (boxWidth / 4 - 2),
        ),
      ];
    }

    for (let roomKey in rooms) {
      if (!rooms.hasOwnProperty(roomKey)) {
        continue;
      }
      let room = Game.rooms[roomKey];
      let isMyRoom = room.controller ? room.controller.my : 0;
      if (isMyRoom) {
        secondLineName = secondLineName.concat(["Room"]);
        secondLineName = secondLineName.concat(["Energy Capacity"]);
        if (room.controller.level < 8) {
          secondLineName = secondLineName.concat(["Controller Progress"]);
        }

        secondLineStat = secondLineStat.concat([room.name]);
        if (useProgressBar === "yes") {
          let progress =
            (
              (room.energyAvailable / room.energyCapacityAvailable) *
              100
            ).toFixed(0) + percent;
          if (percentInProgressBar === "yes") {
            let progressBarLength =
              (room.energyAvailable / room.energyCapacityAvailable) *
              (boxWidth / 4 - 2);
            if (progressBarLength + 2 > progress.length) {
              secondLineStat = secondLineStat.concat([
                progressBar +
                  spacing +
                  progress +
                  spacing +
                  _.repeat(
                    progressBar,
                    progressBarLength - (progress.length + 3),
                  ),
              ]);
            } else {
              secondLineStat = secondLineStat.concat([
                _.repeat(progressBar, progressBarLength),
              ]);
            }
          } else {
            secondLineStat = secondLineStat.concat([
              _.repeat(
                progressBar,
                (room.energyAvailable / room.energyCapacityAvailable) *
                  (boxWidth / 4 - 2),
              ),
            ]);
          }
        } else {
          secondLineStat = secondLineStat.concat([
            (
              (room.energyAvailable / room.energyCapacityAvailable) *
              100
            ).toFixed(2) + percent,
          ]);
        }
        if (room.controller.level < 8) {
          let progress =
            (
              (room.controller.progress / room.controller.progressTotal) *
              100
            ).toFixed(0) + percent;
          if (useProgressBar === "yes") {
            if (percentInProgressBar === "yes") {
              let progressBarLength =
                (room.controller.progress / room.controller.progressTotal) *
                (boxWidth / 4 - 2);
              if (progressBarLength + 2 > progress.length) {
                secondLineStat = secondLineStat.concat([
                  progressBar +
                    spacing +
                    progress +
                    spacing +
                    _.repeat(
                      progressBar,
                      progressBarLength - (progress.length + 3),
                    ),
                ]);
              } else {
                secondLineStat = secondLineStat.concat([
                  _.repeat(progressBar, progressBarLength),
                ]);
              }
            } else {
              secondLineStat = secondLineStat.concat([
                _.repeat(
                  progressBar,
                  (room.controller.progress / room.controller.progressTotal) *
                    (boxWidth / 4 - 2),
                ),
              ]);
            }
          } else {
            secondLineStat = secondLineStat.concat([progress]);
          }
        }

        if (room.storage) {
          secondLineName = secondLineName.concat(["Stored Energy"]);
          secondLineStat = secondLineStat.concat(
            [room.storage.store[RESOURCE_ENERGY]]
              .toString()
              .replace(/\B(?=(\d{3})+(?!\d))/g, ","),
          );
        } else {
          secondLineName = secondLineName.concat(["Stored Energy"]);
          secondLineStat = secondLineStat.concat(["0"]);
        }
      }
    }

    let Stats =
      leftTopCorner +
      _.repeat(hBar, boxWidth / 4 + 3 - (spacing + title + spacing).length) +
      spacing +
      title +
      spacing +
      _.repeat(hBar, boxWidth / 4 + 3 - title.length + addSpace) +
      rightTopCorner +
      "\n";
    for (
      let i = 0;
      i < secondLineName.length && i < secondLineStat.length;
      i++
    ) {
      if (addLinks == "yes" && secondLineName[i] == "Room") {
        Stats =
          Stats +
          vbar +
          spacing +
          secondLineName[i] +
          spacesToEnd(
            (spacing + addSpace + secondLineName[i]).toString(),
            boxWidth / 4,
          ) +
          ":" +
          spacing +
          `<a href="#!/room/${secondLineStat[i]}">${secondLineStat[i]}</a>` +
          spacesToEnd((spacing + secondLineStat[i]).toString(), boxWidth / 4) +
          spacing +
          vbar +
          "\n";
      } else {
        Stats =
          Stats +
          vbar +
          spacing +
          secondLineName[i] +
          spacesToEnd(
            (spacing + addSpace + secondLineName[i]).toString(),
            boxWidth / 4,
          ) +
          ":" +
          spacing +
          secondLineStat[i] +
          spacesToEnd((spacing + secondLineStat[i]).toString(), boxWidth / 4) +
          spacing +
          vbar +
          "\n";
      }
    }
    Stats =
      Stats +
      leftBottomCorner +
      _.repeat(hBar, boxWidth / 2 + 1 + addSpace) +
      rightBottomCorner;

    let outputCpu = cpuStats.split("\n");
    let outputStats = Stats.split("\n");
    let output = "";

    if (outputCpu.length == outputStats.length) {
      for (let i = 0; i < outputCpu.length && i < outputStats.length; i++) {
        output = output + outputCpu[i] + " " + outputStats[i] + "\n";
      }
    } else if (outputCpu.length > outputStats.length) {
      for (let i = 0; i < outputCpu.length; i++) {
        if (outputStats.length <= i) {
          output =
            output +
            outputCpu[i] +
            " " +
            _.repeat(" ", boxWidth / 2 + 3 + addSpace) +
            "\n";
        } else {
          output = output + outputCpu[i] + " " + outputStats[i] + "\n";
        }
      }
    } else if (outputCpu.length < outputStats.length) {
      for (let i = 0; i < outputStats.length; i++) {
        if (outputCpu.length <= i) {
          output =
            output +
            _.repeat(" ", boxWidth / 2 + 3 + addSpace) +
            " " +
            outputStats[i] +
            "\n";
        } else {
          output = output + outputCpu[i] + " " + outputStats[i] + "\n";
        }
      }
    }
    let style = {
      lineHeight: "1",
    };
    let styleStr = _.reduce(
      style,
      (l, v, k) => `${l}${_.kebabCase(k)}: ${v};`,
      "",
    );
    output = `<span style="${styleStr}">${output}</span>`;
    return output;
  },

  /**
   * Record a log message with a severity level.
   *
   * Messages are counted and their severity escalates when repeated.
   *
   * @param {string} message  The message to log.
   * @param {number} [severity=3] Severity level 0-5.
   */
  log: function (message, severity = 3) {
    if (!Memory.stats.logCounts) Memory.stats.logCounts = {};
    const count = (Memory.stats.logCounts[message] || 0) + 1;
    Memory.stats.logCounts[message] = count;

    // Increase severity when a message is repeated many times
    const escalatedSeverity = Math.min(5, severity + Math.floor(count / 10));

    Memory.stats.logs.push([Game.time + ": " + message, escalatedSeverity]);
  },

  displayLogs: function (logs = Memory.stats.logs, opts = {}) {
    let totalWidth = opts.width || 100;
    let title = opts.title || " Logs ";
    const minSeverity = opts.minSeverity || 0;
    let leftTopCorner = opts.leftTopCorner || "+";
    let rightTopCorner = opts.rightTopCorner || "+";
    let leftBottomCorner = opts.leftBottomCorner || "+";
    let rightBottomCorner = opts.rightBottomCorner || "+";
    let hBar = opts.hBar || "-";
    let vbar = opts.vBar || "|";
    let spacing = opts.spacing || " ";

    const filteredLogs = logs.filter((l) => l[1] >= minSeverity);
    let boxHeight = filteredLogs.length - 1;
    let boxWidth = totalWidth - 3; // Inside of the box
    let borderWidth = 5;

    let addSpace = 0;
    if (!(boxWidth % 2 === 0)) {
      addSpace = 1;
    }
    var colors = {
      5: "#ff0066",
      4: "#e65c00",
      3: "#809fff",
      2: "#999999",
      1: "#737373",
      0: "#666666",
      highlight: "#ffff00",
    };

    var outputLog =
      leftTopCorner +
      hBar.repeat((boxWidth - title.length) / 2) +
      title +
      hBar.repeat((boxWidth - title.length) / 2 + addSpace) +
      rightTopCorner +
      "\n";
    for (let i = 0; i < boxHeight; i++) {
      let severity = filteredLogs[i][(0, 1)];
      let message = filteredLogs[i][(0, 0)];

      let htmlFontStart =
        '<log severity="' +
        severity +
        "\"><span style='color: " +
        colors[severity] +
        "' severity='" +
        severity +
        "'><log severity=\"" +
        severity +
        '">';
      let htmlStart =
        '<log severity="' +
        severity +
        "\"><span style='color: " +
        colors[severity] +
        "' severity='" +
        severity +
        "'><log severity=\"" +
        severity +
        '">';
      let htmlEnd = "</span></log>";

      if (severity > 5) {
        severity = 5;
      } else if (severity < 0) {
        severity = 0;
      } else if (!Number.isInteger(severity)) {
        severity = 3;
      } else {
        htmlStart = htmlFontStart;
      }

      if (message.length > boxWidth) {
        outputLog =
          outputLog +
          vbar +
          htmlStart +
          message.substring(0, boxWidth - borderWidth) +
          htmlEnd +
          spacing.repeat(boxWidth - message.length) +
          vbar +
          "\n";
        outputLog =
          outputLog +
          vbar +
          htmlStart +
          message.substring(boxWidth - borderWidth) +
          htmlEnd +
          spacing.repeat(boxWidth - message.length) +
          vbar +
          "\n";
      } else if (message.length > boxWidth * 2) {
        outputLog =
          outputLog +
          vbar +
          htmlStart +
          message.substring(0, boxWidth - borderWidth) +
          htmlEnd +
          spacing.repeat(boxWidth - message.length) +
          vbar +
          "\n";
        outputLog =
          outputLog +
          vbar +
          htmlStart +
          message.substring(
            boxWidth - borderWidth,
            boxWidth * 2 - borderWidth,
          ) +
          htmlEnd +
          spacing.repeat(boxWidth - message.length) +
          vbar +
          "\n";
        outputLog =
          outputLog +
          vbar +
          htmlStart +
          message.substring(boxWidth * 2 - borderWidth) +
          htmlEnd +
          spacing.repeat(boxWidth - message.length) +
          vbar +
          "\n";
      } else {
        outputLog =
          outputLog +
          vbar +
          htmlStart +
          message +
          htmlEnd +
          spacing.repeat(boxWidth - message.length) +
          vbar +
          "\n";
      }
    }
    let tick = hBar + " Tick: " + Game.time + " ";
    outputLog =
      outputLog +
      leftBottomCorner +
      tick +
      hBar.repeat(boxWidth - tick.length) +
      rightBottomCorner +
      "\n";
    let style = {
      lineHeight: "1",
    };
    let styleStr = _.reduce(
      style,
      (l, v, k) => `${l}${_.kebabCase(k)}: ${v};`,
      "",
    );
    outputLog = `<span style="${styleStr}">${outputLog}</span>`;
    return outputLog;
  },
};

module.exports = statsConsole;
