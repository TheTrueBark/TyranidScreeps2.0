const startFresh = require('./startFresh');
const rampartMincutPlanner = require('./planner.rampartMincut');

/**
 * Console-friendly helper that boots the standalone rampart debug mode and
 * immediately plans a target coordinate in one command.
 * @codex-owner layoutPlanner
 */

function run(roomName, targetInput, yInput = undefined, options = {}) {
  let normalizedYInput = yInput;
  let normalizedOptions = options;
  if (
    normalizedYInput &&
    typeof normalizedYInput === 'object' &&
    !Array.isArray(normalizedYInput) &&
    !Number.isFinite(normalizedYInput)
  ) {
    normalizedOptions = normalizedYInput;
    normalizedYInput = undefined;
  }

  const fresh = normalizedOptions.fresh !== false;
  const startFreshOptions =
    normalizedOptions.startFresh && typeof normalizedOptions.startFresh === 'object'
      ? normalizedOptions.startFresh
      : {};
  const planOptions =
    normalizedOptions.plan && typeof normalizedOptions.plan === 'object'
      ? normalizedOptions.plan
      : normalizedOptions;

  if (fresh) {
    startFresh(
      Object.assign({}, startFreshOptions, {
        rampartMincutMode: true,
      }),
    );
  }

  const result = rampartMincutPlanner.planRoomTarget(
    roomName,
    targetInput,
    normalizedYInput,
    planOptions,
  );
  const summary = rampartMincutPlanner.summarizePlan(result);
  if (summary && typeof summary === 'object') {
    summary.bootMode = fresh ? 'startFresh+rampartMincut' : 'rampartMincut-only';
  }
  return summary;
}

module.exports = {
  run,
};
