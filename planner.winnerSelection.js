/**
 * Winner-selection heuristics for the theoretical layout planner.
 * Keeps candidate scoring, rejection, reranking, and compact debug output in a
 * standalone module so the main planner only orchestrates the pipeline.
 * @codex-owner layoutPlanner
 */

const DEFAULT_PROFILE = 'strict';
const DEFAULT_RERANK_TOP_N = 3;
const DEFAULT_RERANK_DEFENSE_MODE = 'estimate';
const MAX_RERANK_TOP_N = 10;
const DEFAULT_TIE_BREAKERS = [
  'selectionRejected',
  'weightedScore',
  'selectionPenalty',
  'rawWeightedScore',
  'defenseScore',
  'index',
];

const DEFAULT_HARD_REJECT_PREFIXES = [
  'controller-stamp-missing',
  'controller-stamp-incomplete',
  'missing-logistics-route',
  'source-road-anchor-missing',
  'road-network-disconnected',
  'spawn-exit-blocked',
  'extension-foundation-rank-missing',
];

const DEFAULT_CRITICAL_PREFIXES = [
  'rampart-boundary-leak',
  'road-network-disconnected',
  'base-road-redundancy-missing',
  'missing-logistics-route',
  'source-road-anchor-missing',
  'rampart-road-missing',
  'rampart-road-disconnected',
  'controller-stamp-missing',
  'controller-stamp-incomplete',
  'core-stamp-storage-fallback',
  'core-stamp-spawn1-fallback',
  'core-stamp-terminal-fallback',
  'core-stamp-link-fallback',
  'controller-link-missing',
  'controller-link-range-fail',
  'source-link-range-fail',
  'source-link-container-range-fail',
  'extension-foundation-rank-missing',
];

const DEFAULT_MAJOR_PREFIXES = [
  'rampart-standoff-fail',
  'defense-score-low',
  'rampart-rogue-edge',
  'rampart-rogue-corridor',
  'rampart-diagonal-gap',
  'sink-link-range-storage-fail',
  'terminal-range-storage-fail',
  'storage-neighbor-fail',
  'spawn-neighbor-fail',
  'spawn-spread-fail',
  'spawn-exit-blocked',
  'container-count-fail',
  'exit-proximity-fail',
];

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizePrefixes(value, fallback = []) {
  if (!Array.isArray(value)) return fallback.slice();
  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function normalizeNumber(value, fallback, minimum, maximum) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(minimum, Math.min(maximum, num));
}

function normalizeMode(value, fallback) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'full' || normalized === 'estimate') return normalized;
  return fallback;
}

function normalizeTieBreakers(value) {
  const allowed = new Set(DEFAULT_TIE_BREAKERS);
  if (!Array.isArray(value)) return DEFAULT_TIE_BREAKERS.slice();
  const normalized = value
    .map((entry) => String(entry || '').trim())
    .filter((entry) => allowed.has(entry));
  return normalized.length > 0 ? normalized : DEFAULT_TIE_BREAKERS.slice();
}

function validationMatchesPrefix(flag, prefixes = []) {
  const value = String(flag || '');
  return prefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}:`));
}

function classifyValidationFlags(validation = [], configInput = {}) {
  const config = configInput && configInput._winnerSelectionConfig === true
    ? configInput
    : resolveConfig(configInput);
  const flags = Array.isArray(validation) ? validation.filter(Boolean).map(String) : [];
  const hardRejectFlags = [];
  const criticalFlags = [];
  const majorFlags = [];
  const minorFlags = [];

  for (const flag of flags) {
    const hardRejectMatched = validationMatchesPrefix(flag, config.hardRejectPrefixes);
    if (hardRejectMatched) {
      hardRejectFlags.push(flag);
    }
    if (validationMatchesPrefix(flag, config.penaltyBuckets.critical.prefixes)) {
      criticalFlags.push(flag);
      continue;
    }
    if (validationMatchesPrefix(flag, config.penaltyBuckets.major.prefixes)) {
      majorFlags.push(flag);
      continue;
    }
    if (hardRejectMatched) continue;
    minorFlags.push(flag);
  }

  return {
    flags,
    hardRejectFlags,
    criticalFlags,
    majorFlags,
    minorFlags,
    hardReject: hardRejectFlags.length > 0,
    criticalCount: criticalFlags.length,
    majorCount: majorFlags.length,
    minorCount: minorFlags.length,
  };
}

function computePenalty(classification = {}, configInput = {}) {
  const config = configInput && configInput._winnerSelectionConfig === true
    ? configInput
    : resolveConfig(configInput);
  const criticalWeight = Number(config.penaltyBuckets.critical.weight || 0);
  const majorWeight = Number(config.penaltyBuckets.major.weight || 0);
  const minorWeight = Number(config.penaltyBuckets.minor.weight || 0);
  const minorCap = Number(config.penaltyBuckets.minor.cap || 0);
  const criticalPenalty = Number(classification.criticalCount || 0) * criticalWeight;
  const majorPenalty = Number(classification.majorCount || 0) * majorWeight;
  const minorPenalty = Math.min(minorCap, Number(classification.minorCount || 0) * minorWeight);
  return {
    criticalPenalty,
    majorPenalty,
    minorPenalty,
    total: criticalPenalty + majorPenalty + minorPenalty,
  };
}

function tieBreakerSnapshot(evaluation, context = {}) {
  const defenseScore =
    typeof context.defenseScore === 'number' && Number.isFinite(context.defenseScore)
      ? Number(context.defenseScore)
      : 0;
  const index =
    typeof context.candidateIndex === 'number' && Number.isFinite(context.candidateIndex)
      ? Number(context.candidateIndex)
      : null;
  return {
    selectionRejected: evaluation.selectionRejected === true,
    weightedScore: Number(evaluation.weightedScore || 0),
    selectionPenalty: Number(evaluation.selectionPenalty || 0),
    rawWeightedScore: Number(evaluation.rawWeightedScore || 0),
    defenseScore,
    index,
  };
}

function buildSelectionBreakdown(evaluation, classification, penalty, config, context = {}) {
  return {
    stage: context.stage || 'foundation',
    profile: config.profile,
    rawWeightedScore: Number(evaluation.rawWeightedScore || 0),
    penalty: Number(penalty.total || 0),
    rejected: evaluation.selectionRejected === true,
    bucketCounts: {
      hardReject: Number(classification.hardRejectFlags.length || 0),
      critical: Number(classification.criticalCount || 0),
      major: Number(classification.majorCount || 0),
      minor: Number(classification.minorCount || 0),
    },
    matchedFlags: {
      hardReject: classification.hardRejectFlags.slice(),
      critical: classification.criticalFlags.slice(),
      major: classification.majorFlags.slice(),
      minor: classification.minorFlags.slice(),
    },
    tieBreakers: tieBreakerSnapshot(evaluation, context),
  };
}

function resolveConfig(settings = {}) {
  const branch =
    settings && settings.layoutWinnerSelection && typeof settings.layoutWinnerSelection === 'object'
      ? settings.layoutWinnerSelection
      : {};
  const penaltyBuckets =
    branch.penaltyBuckets && typeof branch.penaltyBuckets === 'object'
      ? branch.penaltyBuckets
      : {};
  const fallbackDefense = normalizeMode(settings.layoutDefensePlanningMode, DEFAULT_RERANK_DEFENSE_MODE);
  return {
    _winnerSelectionConfig: true,
    profile: String(branch.profile || DEFAULT_PROFILE).toLowerCase() === 'strict'
      ? 'strict'
      : DEFAULT_PROFILE,
    rerankTopN: Math.trunc(
      normalizeNumber(branch.rerankTopN, DEFAULT_RERANK_TOP_N, 1, MAX_RERANK_TOP_N),
    ),
    rerankDefenseMode: normalizeMode(branch.rerankDefenseMode, fallbackDefense),
    hardRejectPrefixes: normalizePrefixes(branch.hardRejectPrefixes, DEFAULT_HARD_REJECT_PREFIXES),
    penaltyBuckets: {
      critical: {
        prefixes: normalizePrefixes(
          penaltyBuckets.critical && penaltyBuckets.critical.prefixes,
          DEFAULT_CRITICAL_PREFIXES,
        ),
        weight: normalizeNumber(
          penaltyBuckets.critical && penaltyBuckets.critical.weight,
          5,
          0,
          100,
        ),
      },
      major: {
        prefixes: normalizePrefixes(
          penaltyBuckets.major && penaltyBuckets.major.prefixes,
          DEFAULT_MAJOR_PREFIXES,
        ),
        weight: normalizeNumber(
          penaltyBuckets.major && penaltyBuckets.major.weight,
          1.5,
          0,
          100,
        ),
      },
      minor: {
        weight: normalizeNumber(
          penaltyBuckets.minor && penaltyBuckets.minor.weight,
          0.1,
          0,
          100,
        ),
        cap: normalizeNumber(
          penaltyBuckets.minor && penaltyBuckets.minor.cap,
          1,
          0,
          100,
        ),
      },
    },
    tieBreakers: normalizeTieBreakers(branch.tieBreakers),
  };
}

function evaluateGeneratedPlan(generated, configInput = {}, context = {}) {
  const config = configInput && configInput._winnerSelectionConfig === true
    ? configInput
    : resolveConfig(configInput);
  const rawWeightedScore =
    generated &&
    generated.evaluation &&
    typeof generated.evaluation.weightedScore === 'number' &&
    Number.isFinite(generated.evaluation.weightedScore)
      ? Number(generated.evaluation.weightedScore)
      : 0;
  const validation = generated && generated.meta && Array.isArray(generated.meta.validation)
    ? generated.meta.validation
    : [];
  const defenseScore =
    generated && generated.meta && typeof generated.meta.defenseScore === 'number'
      ? Number(generated.meta.defenseScore)
      : 0;
  const classification = classifyValidationFlags(validation, config);
  const penalty = computePenalty(classification, config);
  const selectionRejected = classification.hardReject === true;
  const weightedScore = selectionRejected
    ? Number.NEGATIVE_INFINITY
    : rawWeightedScore - Number(penalty.total || 0);
  const evaluation = {
    rawWeightedScore,
    selectionPenalty: Number(penalty.total || 0),
    weightedScore,
    selectionRejected,
    hardRejectFlags: classification.hardRejectFlags.slice(),
    validationSummary: {
      hardRejectFlags: classification.hardRejectFlags.slice(),
      criticalFlags: classification.criticalFlags.slice(),
      majorFlags: classification.majorFlags.slice(),
      minorFlags: classification.minorFlags.slice(),
      hardReject: classification.hardReject,
      criticalCount: classification.criticalCount,
      majorCount: classification.majorCount,
      minorCount: classification.minorCount,
      penalty: Number(penalty.total || 0),
      criticalPenalty: Number(penalty.criticalPenalty || 0),
      majorPenalty: Number(penalty.majorPenalty || 0),
      minorPenalty: Number(penalty.minorPenalty || 0),
    },
    selectionStage: context.stage || 'foundation',
  };
  evaluation.selectionBreakdown = buildSelectionBreakdown(
    evaluation,
    classification,
    penalty,
    config,
    Object.assign({}, context, { defenseScore }),
  );
  return evaluation;
}

function compareByTieBreaker(left, right, tieBreaker) {
  const lRejected = left && left.selectionRejected === true ? 1 : 0;
  const rRejected = right && right.selectionRejected === true ? 1 : 0;
  const lWeighted = Number(left && left.weightedScore !== undefined ? left.weightedScore : 0);
  const rWeighted = Number(right && right.weightedScore !== undefined ? right.weightedScore : 0);
  const lPenalty = Number(left && left.selectionPenalty !== undefined ? left.selectionPenalty : 0);
  const rPenalty = Number(right && right.selectionPenalty !== undefined ? right.selectionPenalty : 0);
  const lRaw = Number(left && left.rawWeightedScore !== undefined ? left.rawWeightedScore : 0);
  const rRaw = Number(right && right.rawWeightedScore !== undefined ? right.rawWeightedScore : 0);
  const lDefense = Number(left && left.defenseScore !== undefined ? left.defenseScore : 0);
  const rDefense = Number(right && right.defenseScore !== undefined ? right.defenseScore : 0);
  const lIndex = Number(left && left.index !== undefined ? left.index : 0);
  const rIndex = Number(right && right.index !== undefined ? right.index : 0);

  switch (tieBreaker) {
    case 'selectionRejected':
      return lRejected - rRejected;
    case 'weightedScore':
      return rWeighted - lWeighted;
    case 'selectionPenalty':
      return lPenalty - rPenalty;
    case 'rawWeightedScore':
      return rRaw - lRaw;
    case 'defenseScore':
      return rDefense - lDefense;
    case 'index':
      return lIndex - rIndex;
    default:
      return 0;
  }
}

function rankResults(results = {}, configInput = {}) {
  const config = configInput && configInput._winnerSelectionConfig === true
    ? configInput
    : resolveConfig(configInput);
  return Object.values(results || {}).sort((left, right) => {
    for (const tieBreaker of config.tieBreakers) {
      const delta = compareByTieBreaker(left, right, tieBreaker);
      if (delta !== 0) return delta;
    }
    return compareByTieBreaker(left, right, 'index');
  });
}

function pickBestSelectableResult(ranked = []) {
  if (!Array.isArray(ranked) || ranked.length === 0) return null;
  return ranked.find((result) => !(result && result.selectionRejected === true)) || null;
}

function compactRerankDebug(debug) {
  if (!debug || typeof debug !== 'object') return {};
  const candidateRows = Array.isArray(debug.candidates) ? debug.candidates : [];
  return {
    enabled: debug.enabled === true,
    defensePlanningMode:
      typeof debug.defensePlanningMode === 'string' ? debug.defensePlanningMode : null,
    rerankedCount: Number(debug.rerankedCount || 0),
    topN: Number(debug.topN || 0),
    selectedIndex:
      typeof debug.selectedIndex === 'number' && Number.isFinite(debug.selectedIndex)
        ? debug.selectedIndex
        : null,
    candidates: candidateRows.map((row) => ({
      index:
        typeof row.index === 'number' && Number.isFinite(row.index)
          ? row.index
          : null,
      foundationScore: Number(row.foundationScore || 0),
      rawWeightedScore: Number(row.rawWeightedScore || 0),
      weightedScore: Number(row.weightedScore || 0),
      selectionPenalty: Number(row.selectionPenalty || 0),
      selectionRejected: row.selectionRejected === true,
      selectionStage: row.selectionStage || null,
      criticalCount: Number(row.criticalCount || 0),
      majorCount: Number(row.majorCount || 0),
      minorCount: Number(row.minorCount || 0),
      selectionBreakdown:
        row.selectionBreakdown && typeof row.selectionBreakdown === 'object'
          ? cloneSerializable(row.selectionBreakdown)
          : null,
    })),
  };
}

function rerankTopCandidates(roomName, pipeline, mem, ranked = [], deps = {}) {
  if (!pipeline || !mem || !mem.layout) {
    return Array.isArray(ranked) ? ranked : [];
  }
  const requestedHarabiStage =
    typeof pipeline.requestedHarabiStage === 'string' ? pipeline.requestedHarabiStage : 'foundation';
  const candidateHarabiStage =
    typeof pipeline.candidateHarabiStage === 'string' ? pipeline.candidateHarabiStage : requestedHarabiStage;
  const finalHarabiStage =
    typeof pipeline.finalHarabiStage === 'string' ? pipeline.finalHarabiStage : requestedHarabiStage;
  if (
    requestedHarabiStage !== 'full' ||
    finalHarabiStage !== 'full' ||
    candidateHarabiStage === finalHarabiStage
  ) {
    return Array.isArray(ranked) && ranked.length > 0
      ? ranked
      : rankResults(pipeline.results, deps.settings || {});
  }

  const generatePlanForAnchor = deps.generatePlanForAnchor;
  const readLayoutPattern = deps.readLayoutPattern;
  const summarizeRefinement = deps.summarizeRefinement;
  if (
    typeof generatePlanForAnchor !== 'function' ||
    typeof readLayoutPattern !== 'function' ||
    typeof summarizeRefinement !== 'function'
  ) {
    return Array.isArray(ranked) && ranked.length > 0
      ? ranked
      : rankResults(pipeline.results, deps.settings || {});
  }

  const config = resolveConfig(deps.settings || {});
  const rankedRows = Array.isArray(ranked) && ranked.length > 0
    ? ranked.slice()
    : rankResults(pipeline.results, config);
  const rerankBaseRows = rankedRows
    .filter((row) => !(row && row.selectionRejected === true))
    .slice(0, Math.max(1, Math.min(config.rerankTopN, rankedRows.length)));
  if (rerankBaseRows.length === 0) return rankedRows;

  const defensePlanningMode = config.rerankDefenseMode;
  mem.layout.theoreticalCandidatePlans = mem.layout.theoreticalCandidatePlans || {};
  const rerankedCandidates = [];

  for (const baseResult of rerankBaseRows) {
    if (!baseResult || typeof baseResult.index !== 'number') continue;
    const selectedCandidate = (pipeline.candidates || []).find((candidate) => candidate.index === baseResult.index);
    if (!selectedCandidate || !selectedCandidate.anchor) continue;
    const selectedPlan = mem.layout.theoreticalCandidatePlans[String(selectedCandidate.index)] || null;
    const refinementInput =
      selectedPlan &&
      selectedPlan.refinementInput &&
      selectedPlan.refinementInput.anchor &&
      selectedPlan.refinementInput.mutation
        ? selectedPlan.refinementInput
        : null;

    const generated = generatePlanForAnchor(
      roomName,
      refinementInput && refinementInput.anchor ? refinementInput.anchor : selectedCandidate.anchor,
      {
        candidateMeta: selectedCandidate,
        extensionPattern: readLayoutPattern(),
        harabiStage: finalHarabiStage,
        defensePlanningMode,
        mutation: refinementInput ? refinementInput.mutation : null,
      },
    );
    if (!generated) continue;

    generated.meta = generated.meta || {};
    generated.meta.refinementDebug = summarizeRefinement(pipeline.refinement);
    const selectionEvaluation = evaluateGeneratedPlan(generated, config, {
      stage: 'full-rerank',
      candidateIndex: selectedCandidate.index,
    });
    const validationSummary = selectionEvaluation.validationSummary || {};
    const defenseScore =
      generated.meta && typeof generated.meta.defenseScore === 'number'
        ? Number(generated.meta.defenseScore)
        : 0;

    pipeline.results[selectedCandidate.index] = {
      index: selectedCandidate.index,
      weightedScore: selectionEvaluation.weightedScore,
      rawWeightedScore: selectionEvaluation.rawWeightedScore,
      selectionPenalty: selectionEvaluation.selectionPenalty,
      selectionRejected: selectionEvaluation.selectionRejected,
      hardRejectFlags: selectionEvaluation.hardRejectFlags,
      selectionBreakdown: selectionEvaluation.selectionBreakdown,
      selectionStage: selectionEvaluation.selectionStage,
      weightedMetrics: generated.evaluation ? generated.evaluation.metrics || {} : {},
      weightedContributions: generated.evaluation ? generated.evaluation.contributions || {} : {},
      validation: generated.meta.validation || [],
      defenseScore,
      completedAt: Game.time,
      fullMaterialized: true,
      rerankedFromFoundationScore: Number(baseResult.weightedScore || 0),
    };

    mem.layout.theoreticalCandidatePlans[selectedCandidate.index] = {
      index: selectedCandidate.index,
      anchor: { x: generated.anchor.x, y: generated.anchor.y },
      placements: generated.placements,
      weightedScore: selectionEvaluation.weightedScore,
      rawWeightedScore: selectionEvaluation.rawWeightedScore,
      selectionPenalty: selectionEvaluation.selectionPenalty,
      selectionRejected: selectionEvaluation.selectionRejected,
      hardRejectFlags: selectionEvaluation.hardRejectFlags,
      selectionBreakdown: selectionEvaluation.selectionBreakdown,
      selectionStage: selectionEvaluation.selectionStage,
      weightedMetrics: generated.evaluation ? generated.evaluation.metrics || {} : {},
      weightedContributions: generated.evaluation ? generated.evaluation.contributions || {} : {},
      validation: generated.meta.validation || [],
      stampStats: generated.meta.stampStats || {},
      stampPruning: generated.meta.stampPruning || {},
      sourceLogistics: generated.meta.sourceLogistics || {},
      foundationDebug: generated.meta.foundationDebug || {},
      sourceResourceDebug: generated.meta.sourceResourceDebug || {},
      logisticsRoutes: generated.meta.logisticsRoutes || {},
      labPlanning: generated.meta.labPlanning || {},
      structurePlanning: generated.meta.structurePlanning || {},
      foundationSnapshot: generated.meta.foundationSnapshot || null,
      fullOptimization: generated.meta.fullOptimization || null,
      refinementDebug: generated.meta.refinementDebug || {},
      validStructurePositions: generated.meta.validStructurePositions || {},
      defenseScore,
      completedAt: Game.time,
      refinementInput: refinementInput || null,
    };

    rerankedCandidates.push({
      index: selectedCandidate.index,
      foundationScore: Number(baseResult.weightedScore || 0),
      rawWeightedScore: selectionEvaluation.rawWeightedScore,
      weightedScore: selectionEvaluation.weightedScore,
      selectionPenalty: selectionEvaluation.selectionPenalty,
      selectionRejected: selectionEvaluation.selectionRejected,
      selectionStage: selectionEvaluation.selectionStage,
      criticalCount: Number(validationSummary.criticalCount || 0),
      majorCount: Number(validationSummary.majorCount || 0),
      minorCount: Number(validationSummary.minorCount || 0),
      selectionBreakdown: selectionEvaluation.selectionBreakdown,
    });
  }

  const reranked = rankResults(pipeline.results, config);
  const bestSelectable = pickBestSelectableResult(reranked);
  pipeline.fullSelectionRerank = {
    enabled: rerankedCandidates.length > 0,
    defensePlanningMode,
    rerankedCount: rerankedCandidates.length,
    topN: Math.max(1, Math.min(config.rerankTopN, rankedRows.length)),
    selectedIndex: bestSelectable ? bestSelectable.index : null,
    candidates: rerankedCandidates,
    completedAt: Game.time,
  };
  return reranked;
}

module.exports = {
  resolveConfig,
  evaluateGeneratedPlan,
  rankResults,
  pickBestSelectableResult,
  rerankTopCandidates,
  compactRerankDebug,
  _helpers: {
    validationMatchesPrefix,
    classifyValidationFlags,
    computePenalty,
  },
};
