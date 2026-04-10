export const DEFAULT_VIEWER_PIXELS_PER_SECOND = 160;
export const DEFAULT_EDITOR_PIXELS_PER_BEAT = 64;
export const DEFAULT_VIEWER_MODE = "time";
export const DEFAULT_INVISIBLE_NOTE_VISIBILITY = "hide";
export const DEFAULT_JUDGE_LINE_POSITION_RATIO = 0.5;
export const DEFAULT_GAME_DURATION_MS = 500;
export const MIN_GAME_DURATION_MS = 1;
export const MAX_GAME_DURATION_MS = 5000;
export const DEFAULT_GAME_LANE_HEIGHT_PX = 300;
export const MIN_GAME_LANE_HEIGHT_PX = 1;
export const MAX_GAME_LANE_HEIGHT_PX = 2160;
export const DEFAULT_GAME_LANE_COVER_PERMILLE = 0;
export const DEFAULT_GAME_LANE_COVER_VISIBLE = true;
export const DEFAULT_GAME_HS_FIX_MODE = "main";
export const DEFAULT_GAME_HS_FIX_FALLBACK_BPM = 150;
export const GAME_GREEN_NUMBER_RATIO = 0.6;
export const GAME_HS_FIX_MODES = Object.freeze(["start", "max", "main", "min"]);
const LUNATIC_INVALID_STOP_WARP_BEATS = 1 / 48;
export const TIME_SELECTION_EPSILON_SEC = 0.0005;
export const BEAT_SELECTION_EPSILON = 0.000001;

const ACTION_PRECEDENCE = {
  bpm: 1,
  stop: 2,
};
const gameTimingDerivedMetricsCacheByModel = new WeakMap();

export function normalizeViewerMode(value) {
  return value === "editor" || value === "game" || value === "lunatic" || value === "time"
    ? value
    : DEFAULT_VIEWER_MODE;
}

export function resolveViewerModeForModel(model, viewerMode) {
  const normalizedMode = normalizeViewerMode(viewerMode);
  if (normalizedMode === "editor" && model?.supportsEditorMode) {
    return "editor";
  }
  if ((normalizedMode === "game" || normalizedMode === "lunatic") && model?.supportsGameMode) {
    return normalizedMode;
  }
  return DEFAULT_VIEWER_MODE;
}

export function normalizeInvisibleNoteVisibility(value) {
  return value === "show" ? "show" : DEFAULT_INVISIBLE_NOTE_VISIBILITY;
}

export function normalizeJudgeLinePositionRatio(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_JUDGE_LINE_POSITION_RATIO;
}

export function getJudgeLineY(viewportHeight, judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO) {
  const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
  return normalizedViewportHeight * normalizeJudgeLinePositionRatio(judgeLinePositionRatio);
}

export function normalizeGameDurationMs(value) {
  return clampRoundedValue(value, MIN_GAME_DURATION_MS, MAX_GAME_DURATION_MS, DEFAULT_GAME_DURATION_MS);
}

export function normalizeGameLaneHeightPx(value) {
  return clampRoundedValue(value, MIN_GAME_LANE_HEIGHT_PX, MAX_GAME_LANE_HEIGHT_PX, DEFAULT_GAME_LANE_HEIGHT_PX);
}

export function normalizeGameLaneHeightPxForSlider(value) {
  return clampRoundedValue(value, MIN_GAME_LANE_HEIGHT_PX, MAX_GAME_LANE_HEIGHT_PX, DEFAULT_GAME_LANE_HEIGHT_PX, 10);
}

export function normalizeGameLaneHeightPxForWheel(value) {
  return normalizeGameLaneHeightPx(value);
}

export function normalizeGameLaneCoverPermille(value) {
  return clampRoundedValue(value, 0, 1000, DEFAULT_GAME_LANE_COVER_PERMILLE);
}

export function normalizeGameLaneCoverVisible(value) {
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return value === true || value === "true" || value === 1 || value === "1" || value === undefined || value === null
    ? DEFAULT_GAME_LANE_COVER_VISIBLE
    : Boolean(value);
}

export function normalizeGameHsFixMode(value) {
  return GAME_HS_FIX_MODES.includes(value) ? value : DEFAULT_GAME_HS_FIX_MODE;
}

export function createDefaultGameTimingConfig() {
  return {
    durationMs: DEFAULT_GAME_DURATION_MS,
    laneHeightPx: DEFAULT_GAME_LANE_HEIGHT_PX,
    laneCoverPermille: DEFAULT_GAME_LANE_COVER_PERMILLE,
    laneCoverVisible: DEFAULT_GAME_LANE_COVER_VISIBLE,
    hsFixMode: DEFAULT_GAME_HS_FIX_MODE,
  };
}

export function normalizeGameTimingConfig(config = {}) {
  return {
    durationMs: normalizeGameDurationMs(config.durationMs),
    laneHeightPx: normalizeGameLaneHeightPx(config.laneHeightPx),
    laneCoverPermille: normalizeGameLaneCoverPermille(config.laneCoverPermille),
    laneCoverVisible: normalizeGameLaneCoverVisible(config.laneCoverVisible),
    hsFixMode: normalizeGameHsFixMode(config.hsFixMode),
  };
}

export function getGameLaneGeometry(
  viewportHeight,
  judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO,
  laneHeightPx = DEFAULT_GAME_LANE_HEIGHT_PX,
) {
  const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
  const normalizedLaneHeightPx = normalizeGameLaneHeightPx(laneHeightPx);
  const judgeLineY = getJudgeLineY(normalizedViewportHeight, judgeLinePositionRatio);
  const unclampedLaneTopY = Math.max(judgeLineY - Math.min(normalizedLaneHeightPx, Math.max(judgeLineY, 0)), 0);
  const laneBottomY = normalizedViewportHeight;
  const laneTopY = Math.floor(unclampedLaneTopY);
  const actualLaneHeightPx = Math.max(judgeLineY - laneTopY, 0);
  return {
    viewportHeight: normalizedViewportHeight,
    laneTopY,
    laneBottomY,
    laneHeightPx: actualLaneHeightPx,
    configuredLaneHeightPx: normalizedLaneHeightPx,
    judgeLineY,
    judgeDistancePx: Math.max(judgeLineY - laneTopY, 0),
  };
}

export function getGameLaneTopY(viewportHeight, laneHeightPx = DEFAULT_GAME_LANE_HEIGHT_PX) {
  return getGameLaneGeometry(viewportHeight, DEFAULT_JUDGE_LINE_POSITION_RATIO, laneHeightPx).laneTopY;
}

export function getGameJudgeLineY(
  viewportHeight,
  judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO,
) {
  return getJudgeLineY(viewportHeight, judgeLinePositionRatio);
}

export function getGameJudgeDistancePx(
  viewportHeight,
  judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO,
  laneHeightPx = DEFAULT_GAME_LANE_HEIGHT_PX,
) {
  return getGameLaneGeometry(viewportHeight, judgeLinePositionRatio, laneHeightPx).judgeDistancePx;
}

export function getGameJudgeLinePositionRatioFromPointer(
  pointerOffsetY,
  viewportHeight,
) {
  return normalizeJudgeLinePositionRatio(
    clamp(pointerOffsetY / Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 1), 0, 1),
  );
}

export function getGameLaneHeightPxFromPointer(
  pointerOffsetY,
  viewportHeight,
  judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO,
  fallbackLaneHeightPx = DEFAULT_GAME_LANE_HEIGHT_PX,
) {
  const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
  if (!(normalizedViewportHeight > 0)) {
    return normalizeGameLaneHeightPx(fallbackLaneHeightPx);
  }
  return normalizeGameLaneHeightPx(
    getJudgeLineY(normalizedViewportHeight, judgeLinePositionRatio) - pointerOffsetY,
  );
}

export function getGameLaneCoverPermilleFromPointer(
  pointerOffsetY,
  viewportHeight,
  judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO,
  laneHeightPx = DEFAULT_GAME_LANE_HEIGHT_PX,
  fallbackLaneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE,
) {
  const geometry = getGameLaneGeometry(
    viewportHeight,
    judgeLinePositionRatio,
    laneHeightPx,
  );
  if (!(geometry.judgeDistancePx > 0)) {
    return normalizeGameLaneCoverPermille(fallbackLaneCoverPermille);
  }
  return normalizeGameLaneCoverPermille(
    clamp((pointerOffsetY - geometry.laneTopY) / geometry.judgeDistancePx, 0, 1) * 1000,
  );
}

export function createScoreViewerModel(score, { bpmSummary = undefined, gameProfile = "game" } = {}) {
  if (!score) {
    return null;
  }
  const normalizedGameProfile = normalizeGameProfile(gameProfile);
  const canonicalBeatTimingIndex = createCanonicalBeatTimingIndex(score);
  const profiledScore = normalizedGameProfile === "lunatic"
    ? createLunaticProfileScore(score)
    : score;

  const rawAllNotes = profiledScore.notes
    .map((note) => ({ ...note }))
    .sort(compareNoteLike);
  const rawBarLines = [...profiledScore.barLines].sort(compareTimedBeatLike);
  const rawBpmChanges = [...profiledScore.bpmChanges].sort(compareTimedBeatLike);
  const rawStops = [...profiledScore.stops].sort(compareTimedBeatLike);
  const rawScrollChanges = [...(profiledScore.scrollChanges ?? [])].sort(compareTimedBeatLike);

  const comboEvents = (profiledScore.comboEvents?.length > 0
    ? profiledScore.comboEvents
    : createFallbackComboEvents(profiledScore.notes))
    .map((event) => ({ ...event }))
    .sort(compareComboEvent)
    .map((event, index) => ({
      ...event,
      combo: index + 1,
    }));

  const longEndEventKeys = new Set(
    rawAllNotes
      .filter((note) => shouldNoteDrawLongEndCap(note))
      .map((note) => ({
        lane: note.lane,
        timeSec: note.endTimeSec,
        side: note.side,
      }))
      .map(createTimedLaneKey),
  );

  const beatTimingIndex = createBeatTimingIndex(profiledScore);
  const gameScrollIndex = createGameScrollIndex(rawScrollChanges);
  const gameTimingEvents = createGameTimelineTimingEvents(profiledScore, normalizedGameProfile);
  const allNotes = annotateNotesWithGameTrackPosition(rawAllNotes, gameScrollIndex);
  const notes = allNotes.filter((note) => note.kind !== "invisible");
  const invisibleNotes = allNotes.filter((note) => note.kind === "invisible");
  const barLines = annotateEventsWithGameTrackPosition(rawBarLines, gameScrollIndex);
  const bpmChanges = annotateEventsWithGameTrackPosition(rawBpmChanges, gameScrollIndex);
  const stops = annotateEventsWithGameTrackPosition(rawStops, gameScrollIndex);
  const warps = annotateEventsWithGameTrackPosition(gameTimingEvents.warps, gameScrollIndex);
  const scrollChanges = annotateEventsWithGameTrackPosition(rawScrollChanges, gameScrollIndex);
  const gameTimelineBpmChanges = annotateEventsWithGameTrackPosition(gameTimingEvents.bpmChanges, gameScrollIndex);
  const gameTimelineStops = annotateEventsWithGameTrackPosition(gameTimingEvents.stops, gameScrollIndex);
  const gameBarLinesByTrack = createGamePointIndex(barLines);
  const gameBpmChangesByTrack = createGamePointIndex(bpmChanges);
  const gameStopsByTrack = createGamePointIndex(stops);
  const gameScrollChangesByTrack = createGamePointIndex(scrollChanges);
  const gameTimeline = createGameTimeline({
    notes: allNotes,
    barLines,
    bpmChanges: gameTimelineBpmChanges,
    stops: gameTimelineStops,
    warps: gameTimingEvents.warps,
    scrollChanges,
    gameScrollIndex,
  });
  const lunaticReverseMeta = normalizeLunaticReverseMeta(profiledScore.lunaticReverseMeta, gameTimeline);
  const resolvedBpmSummary = resolveBpmSummary(profiledScore, bpmSummary);
  const gameTimingStatePoints = createGameTimingStatePoints(gameTimeline, resolvedBpmSummary.startBpm);
  const totalBeat = getScoreTotalBeat(profiledScore);
  const editorNotes = notes.filter((note) => Number.isFinite(note.beat));
  const editorInvisibleNotes = invisibleNotes.filter((note) => Number.isFinite(note.beat));
  const notesByBeat = [...editorNotes].sort(compareBeatNoteLike);
  const invisibleNotesByBeat = [...editorInvisibleNotes].sort(compareBeatNoteLike);
  const longNotesByBeat = notesByBeat.filter((note) => note.kind === "long" && Number.isFinite(note.endBeat ?? note.beat));
  const longNotesByEndBeat = [...longNotesByBeat].sort(compareLongNoteEndBeat);
  const gameNotesByTrack = createGamePointIndex(notes);
  const gameInvisibleNotesByTrack = createGamePointIndex(invisibleNotes);
  const gameLongNotesByEndTrack = createGameLongEndIndex(notes);
  const gameLongBodiesByStartTrack = createGameLongBodyStartIndex(notes);
  const gameLongBodiesByEndTrack = [...gameLongBodiesByStartTrack].sort(compareGameLongBodyEndTrack);
  const measureRanges = createEditorMeasureRanges(barLines, totalBeat);

  return {
    score: profiledScore,
    sourceScore: score,
    gameProfile: normalizedGameProfile,
    notes,
    invisibleNotes,
    notesByBeat,
    invisibleNotesByBeat,
    longNotesByBeat,
    longNotesByEndBeat,
    gameNotesByTrack,
    gameInvisibleNotesByTrack,
    gameLongNotesByEndTrack,
    gameLongBodiesByStartTrack,
    gameLongBodiesByEndTrack,
    measureRanges,
    comboEvents,
    longEndEventKeys,
    lunaticReverseMeta,
    barLines,
    bpmChanges,
    stops,
    warps,
    scrollChanges,
    gameBarLinesByTrack,
    gameBpmChangesByTrack,
    gameStopsByTrack,
    gameScrollChangesByTrack,
    gameTimeline,
    gameTimingStatePoints,
    bpmSummary: resolvedBpmSummary,
    totalCombo: comboEvents.length,
    beatTimingIndex,
    canonicalBeatTimingIndex,
    gameScrollIndex,
    totalBeat,
    supportsEditorMode: Boolean(beatTimingIndex && Number.isFinite(totalBeat)),
    supportsGameMode: Boolean(beatTimingIndex && gameScrollIndex && Number.isFinite(totalBeat)),
  };
}

export function getScoreTotalDurationSec(score) {
  if (!score || typeof score !== "object") {
    return 0;
  }
  const totalDurationSec = Number.isFinite(score.totalDurationSec) ? score.totalDurationSec : null;
  const lastTimelineTimeSec = Number.isFinite(score.lastTimelineTimeSec) ? score.lastTimelineTimeSec : null;
  const lastPlayableTimeSec = Number.isFinite(score.lastPlayableTimeSec) ? score.lastPlayableTimeSec : 0;
  return Math.max(totalDurationSec ?? lastTimelineTimeSec ?? lastPlayableTimeSec, 0);
}

export function getCanonicalScoreTotalDurationSec(modelOrScore) {
  if (!modelOrScore || typeof modelOrScore !== "object") {
    return 0;
  }
  if ("score" in modelOrScore || "sourceScore" in modelOrScore) {
    return getScoreTotalDurationSec(modelOrScore.sourceScore ?? modelOrScore.score);
  }
  return getScoreTotalDurationSec(modelOrScore);
}

export function getScoreTotalBeat(score) {
  if (!score || typeof score !== "object") {
    return 0;
  }

  let maxBeat = 0;
  for (const note of score.notes ?? []) {
    maxBeat = Math.max(maxBeat, finiteOrZero(note.endBeat), finiteOrZero(note.beat));
  }
  for (const event of score.comboEvents ?? []) {
    maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
  }
  for (const event of score.barLines ?? []) {
    maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
  }
  for (const event of score.bpmChanges ?? []) {
    maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
  }
  for (const event of score.stops ?? []) {
    maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
  }
  for (const event of score.scrollChanges ?? []) {
    maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
  }
  for (const event of score.timingActions ?? []) {
    maxBeat = Math.max(maxBeat, finiteOrZero(event.beat));
  }
  return Math.max(maxBeat, 0);
}

export function mapCanonicalTimeToViewerTime(model, timeSec, viewerMode = DEFAULT_VIEWER_MODE) {
  if (!model) {
    return 0;
  }
  const resolvedMode = resolveViewerModeForModel(model, viewerMode);
  const numericTimeSec = Number.isFinite(timeSec) ? Math.max(timeSec, 0) : 0;
  if (resolvedMode !== "lunatic" || model.gameProfile !== "lunatic") {
    return getClampedSelectedTimeSec(model, numericTimeSec);
  }
  if (!model.canonicalBeatTimingIndex || !model.beatTimingIndex) {
    return getClampedSelectedTimeSec(model, numericTimeSec);
  }
  const clampedCanonicalTimeSec = clamp(numericTimeSec, 0, getCanonicalScoreTotalDurationSec(model));
  const canonicalBeat = model.canonicalBeatTimingIndex.secondsToBeat(clampedCanonicalTimeSec);
  return getClampedSelectedTimeSec(model, model.beatTimingIndex.beatToSeconds(canonicalBeat));
}

export function mapViewerTimeToCanonicalTime(model, timeSec, viewerMode = DEFAULT_VIEWER_MODE) {
  if (!model) {
    return 0;
  }
  const resolvedMode = resolveViewerModeForModel(model, viewerMode);
  const numericTimeSec = Number.isFinite(timeSec) ? Math.max(timeSec, 0) : 0;
  if (resolvedMode !== "lunatic" || model.gameProfile !== "lunatic") {
    return getClampedSelectedTimeSec(model, numericTimeSec);
  }
  if (!model.canonicalBeatTimingIndex || !model.beatTimingIndex) {
    return clamp(numericTimeSec, 0, getCanonicalScoreTotalDurationSec(model));
  }
  const clampedViewerTimeSec = getClampedSelectedTimeSec(model, numericTimeSec);
  const viewerBeat = model.beatTimingIndex.secondsToBeat(clampedViewerTimeSec);
  return clamp(model.canonicalBeatTimingIndex.beatToSeconds(viewerBeat), 0, getCanonicalScoreTotalDurationSec(model));
}

export function getClampedSelectedTimeSec(model, timeSec) {
  if (!model) {
    return 0;
  }
  const numericValue = Number.isFinite(timeSec) ? timeSec : 0;
  return clamp(numericValue, 0, getScoreTotalDurationSec(model.score));
}

export function getClampedSelectedBeat(model, beat) {
  if (!model) {
    return 0;
  }
  const numericValue = Number.isFinite(beat) ? beat : 0;
  return clamp(numericValue, 0, model.totalBeat ?? 0);
}

export function getBeatAtTimeSec(model, timeSec) {
  if (!model || !model.beatTimingIndex) {
    return 0;
  }
  const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
  return getClampedSelectedBeat(model, model.beatTimingIndex.secondsToBeat(clampedTimeSec));
}

export function getTimeSecForBeat(model, beat) {
  if (!model || !model.beatTimingIndex) {
    return 0;
  }
  const clampedBeat = getClampedSelectedBeat(model, beat);
  return clamp(model.beatTimingIndex.beatToSeconds(clampedBeat), 0, getScoreTotalDurationSec(model.score));
}

export function getGameTrackPositionForBeat(model, beat) {
  if (!model?.gameScrollIndex) {
    return 0;
  }
  return model.gameScrollIndex.beatToDisplacement(getClampedSelectedBeat(model, beat));
}

export function getGameTrackPositionAtTimeSec(model, timeSec) {
  if (!model?.gameScrollIndex) {
    return 0;
  }
  return getGameTrackPositionForBeat(model, getBeatAtTimeSec(model, timeSec));
}

export function getContentHeightPx(model, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
  if (!model) {
    return Math.max(1, viewportHeight);
  }
  return Math.max(
    Math.max(1, viewportHeight),
    Math.ceil(getScoreTotalDurationSec(model.score) * pixelsPerSecond + viewportHeight),
  );
}

export function getEditorContentHeightPx(model, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
  if (!model) {
    return Math.max(1, viewportHeight);
  }
  return Math.max(
    Math.max(1, viewportHeight),
    Math.ceil((model.totalBeat ?? 0) * pixelsPerBeat + viewportHeight),
  );
}

export function getTimeSecForScrollTop(model, scrollTop, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
  if (!model) {
    return 0;
  }
  return getClampedSelectedTimeSec(model, scrollTop / pixelsPerSecond);
}

export function getTimeSecForEditorScrollTop(model, scrollTop, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
  if (!model) {
    return 0;
  }
  return getTimeSecForBeat(model, scrollTop / pixelsPerBeat);
}

export function getScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
  if (!model) {
    return 0;
  }
  const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
  const maxScrollTop = Math.max(0, getContentHeightPx(model, viewportHeight, pixelsPerSecond) - viewportHeight);
  return clamp(clampedTimeSec * pixelsPerSecond, 0, maxScrollTop);
}

export function getEditorScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
  if (!model) {
    return 0;
  }
  const clampedBeat = getBeatAtTimeSec(model, timeSec);
  const maxScrollTop = Math.max(0, getEditorContentHeightPx(model, viewportHeight, pixelsPerBeat) - viewportHeight);
  return clamp(clampedBeat * pixelsPerBeat, 0, maxScrollTop);
}

export function getVisibleTimeRange(
  model,
  selectedTimeSec,
  viewportHeight,
  pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND,
  judgeLineY = getJudgeLineY(viewportHeight),
) {
  if (!model) {
    return { startTimeSec: 0, endTimeSec: 0 };
  }
  const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
  const futureViewportSec = Math.max(judgeLineY, 0) / pixelsPerSecond;
  const pastViewportSec = Math.max(viewportHeight - judgeLineY, 0) / pixelsPerSecond;
  const overscanSec = Math.max(Math.max(futureViewportSec, pastViewportSec) * 0.35, 0.75);
  return {
    startTimeSec: Math.max(0, clampedTimeSec - pastViewportSec - overscanSec),
    endTimeSec: Math.min(getScoreTotalDurationSec(model.score), clampedTimeSec + futureViewportSec + overscanSec),
  };
}

export function getVisibleBeatRange(
  model,
  selectedTimeSec,
  viewportHeight,
  pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
  judgeLineY = getJudgeLineY(viewportHeight),
) {
  return getEditorFrameState(model, selectedTimeSec, viewportHeight, pixelsPerBeat, judgeLineY);
}

export function getEditorFrameStateForBeat(
  model,
  selectedBeat,
  viewportHeight,
  pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
  judgeLineY = getJudgeLineY(viewportHeight),
) {
  if (!model) {
    return {
      selectedBeat: 0,
      startBeat: 0,
      endBeat: 0,
      viewportHeight: Math.max(viewportHeight, 0),
    };
  }
  const clampedBeat = getClampedSelectedBeat(model, selectedBeat);
  const futureViewportBeat = Math.max(judgeLineY, 0) / pixelsPerBeat;
  const pastViewportBeat = Math.max(viewportHeight - judgeLineY, 0) / pixelsPerBeat;
  const overscanBeat = Math.max(Math.max(futureViewportBeat, pastViewportBeat) * 0.35, 1);
  return {
    selectedBeat: clampedBeat,
    startBeat: Math.max(0, clampedBeat - pastViewportBeat - overscanBeat),
    endBeat: Math.min(model.totalBeat ?? 0, clampedBeat + futureViewportBeat + overscanBeat),
    viewportHeight,
  };
}

export function getEditorFrameState(
  model,
  selectedTimeSec,
  viewportHeight,
  pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
  judgeLineY = getJudgeLineY(viewportHeight),
) {
  return getEditorFrameStateForBeat(
    model,
    getBeatAtTimeSec(model, selectedTimeSec),
    viewportHeight,
    pixelsPerBeat,
    judgeLineY,
  );
}

export function getGameVisibleTrackRange(
  selectedTrackPosition,
  viewportHeight,
  pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
  judgeLineY = getJudgeLineY(viewportHeight),
) {
  const normalizedTrackPosition = Number.isFinite(selectedTrackPosition) ? selectedTrackPosition : 0;
  const normalizedViewportHeight = Math.max(viewportHeight, 0);
  const futureViewportTrack = Math.max(judgeLineY, 0) / Math.max(pixelsPerBeat, 1e-9);
  const pastViewportTrack = Math.max(normalizedViewportHeight - judgeLineY, 0) / Math.max(pixelsPerBeat, 1e-9);
  const overscanTrack = Math.max(Math.max(futureViewportTrack, pastViewportTrack) * 0.35, 1);
  return {
    startTrackPosition: normalizedTrackPosition - pastViewportTrack - overscanTrack,
    endTrackPosition: normalizedTrackPosition + futureViewportTrack + overscanTrack,
  };
}

export function getGameTimingStateAtTimeSec(model, timeSec) {
  const statePoints = model?.gameTimingStatePoints ?? [];
  if (statePoints.length === 0) {
    return {
      bpm: resolvePositiveBpm(model?.bpmSummary?.startBpm),
      scrollRate: 1,
    };
  }
  const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
  const stateIndex = upperBoundByTime(statePoints, clampedTimeSec) - 1;
  if (stateIndex < 0) {
    return statePoints[0];
  }
  return statePoints[stateIndex];
}

export function getGameHsFixBaseBpm(model, hsFixMode = DEFAULT_GAME_HS_FIX_MODE) {
  const normalizedMode = normalizeGameHsFixMode(hsFixMode);
  const bpmSummary = model?.bpmSummary ?? {};
  switch (normalizedMode) {
    case "start":
      return resolvePositiveBpm(bpmSummary.startBpm);
    case "max":
      return resolvePositiveBpm(bpmSummary.maxBpm, resolvePositiveBpm(bpmSummary.startBpm));
    case "min":
      return resolvePositiveBpm(bpmSummary.minBpm, resolvePositiveBpm(bpmSummary.startBpm));
    case "main":
    default:
      return resolvePositiveBpm(bpmSummary.mainBpm, resolvePositiveBpm(bpmSummary.startBpm));
  }
}

export function getGameLaneCoverRatio(laneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE) {
  return normalizeGameLaneCoverPermille(laneCoverPermille) / 1000;
}

export function getGameHispeed(
  baseBpm,
  durationMs = DEFAULT_GAME_DURATION_MS,
  laneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE,
) {
  const resolvedBaseBpm = resolvePositiveBpm(baseBpm);
  const normalizedDurationMs = normalizeGameDurationMs(durationMs);
  const laneCoverRatio = getGameLaneCoverRatio(laneCoverPermille);
  if (!(resolvedBaseBpm > 0) || !(normalizedDurationMs > 0) || laneCoverRatio >= 1) {
    return 0;
  }
  return 240000 / resolvedBaseBpm / normalizedDurationMs * (1 - laneCoverRatio);
}

export function getGameTimingDerivedMetrics(
  model,
  gameTimingConfig = createDefaultGameTimingConfig(),
  { includeGreenNumberRange = false } = {},
) {
  const normalizedConfig = normalizeGameTimingConfig(gameTimingConfig);
  const derivedMetrics = getOrCreateGameTimingDerivedMetrics(model, normalizedConfig);
  if (includeGreenNumberRange && derivedMetrics.greenNumberRange === undefined) {
    derivedMetrics.greenNumberRange = computeGameGreenNumberRange(model, derivedMetrics);
  }
  return derivedMetrics;
}

export function getGameCurrentDurationMs(
  model,
  timeSec,
  gameTimingConfig = createDefaultGameTimingConfig(),
) {
  const derivedMetrics = getGameTimingDerivedMetrics(model, gameTimingConfig);
  return getGameCurrentDurationForTimingState(
    getGameTimingStateAtTimeSec(model, timeSec),
    derivedMetrics,
  );
}

export function getGameCurrentGreenNumber(
  model,
  timeSec,
  gameTimingConfig = createDefaultGameTimingConfig(),
) {
  const derivedMetrics = getGameTimingDerivedMetrics(model, gameTimingConfig);
  return getGameCurrentGreenNumberForTimingState(
    getGameTimingStateAtTimeSec(model, timeSec),
    derivedMetrics,
  );
}

export function getGameGreenNumberRange(
  model,
  gameTimingConfig = createDefaultGameTimingConfig(),
) {
  return getGameTimingDerivedMetrics(
    model,
    gameTimingConfig,
    { includeGreenNumberRange: true },
  ).greenNumberRange;
}

export function getGameSettingGreenNumber(durationMs = DEFAULT_GAME_DURATION_MS) {
  return Math.floor(normalizeGameDurationMs(durationMs) * 3 / 5);
}

export function getGameLaneCoverHeightPx(
  viewportHeight,
  judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO,
  laneHeightPx = DEFAULT_GAME_LANE_HEIGHT_PX,
  laneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE,
) {
  return getGameJudgeDistancePx(
    viewportHeight,
    judgeLinePositionRatio,
    laneHeightPx,
  ) * getGameLaneCoverRatio(laneCoverPermille);
}

export function getGameLaneCoverBounds(
  viewportHeight,
  judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO,
  laneHeightPx = DEFAULT_GAME_LANE_HEIGHT_PX,
  laneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE,
) {
  const laneGeometry = getGameLaneGeometry(
    viewportHeight,
    judgeLinePositionRatio,
    laneHeightPx,
  );
  const rawBottomY = Math.min(
    laneGeometry.laneTopY + getGameLaneCoverHeightPx(
      viewportHeight,
      judgeLinePositionRatio,
      laneHeightPx,
      laneCoverPermille,
    ),
    laneGeometry.judgeLineY,
  );
  const bottomY = clamp(Math.round(rawBottomY), laneGeometry.laneTopY, laneGeometry.laneBottomY);
  return {
    topY: laneGeometry.laneTopY,
    bottomY,
    heightPx: Math.max(bottomY - laneGeometry.laneTopY, 0),
    rawBottomY,
  };
}

export function hasViewerSelectionChanged(
  model,
  viewerMode,
  previousTimeSec,
  nextTimeSec,
  previousBeat = undefined,
  nextBeat = undefined,
) {
  const resolvedMode = resolveViewerModeForModel(model, viewerMode);
  if (resolvedMode === "editor" && model?.supportsEditorMode) {
    const normalizedPreviousBeat = Number.isFinite(previousBeat)
      ? getClampedSelectedBeat(model, previousBeat)
      : getBeatAtTimeSec(model, previousTimeSec);
    const normalizedNextBeat = Number.isFinite(nextBeat)
      ? getClampedSelectedBeat(model, nextBeat)
      : getBeatAtTimeSec(model, nextTimeSec);
    return Math.abs(normalizedNextBeat - normalizedPreviousBeat) >= BEAT_SELECTION_EPSILON;
  }
  return Math.abs(
    getClampedSelectedTimeSec(model, nextTimeSec) - getClampedSelectedTimeSec(model, previousTimeSec),
  ) >= TIME_SELECTION_EPSILON_SEC;
}

export function createEditorMeasureRanges(barLines, totalBeat) {
  const sortedBarLines = [...(barLines ?? [])]
    .filter((barLine) => Number.isFinite(barLine?.beat))
    .sort(compareTimedBeatLike);
  const ranges = [];
  let previousBeat = 0;

  if (sortedBarLines.length === 0) {
    if (Number.isFinite(totalBeat) && totalBeat > 0) {
      ranges.push({ startBeat: 0, endBeat: totalBeat });
    }
    return ranges;
  }

  for (const barLine of sortedBarLines) {
    const currentBeat = barLine.beat;
    if (currentBeat > previousBeat) {
      ranges.push({ startBeat: previousBeat, endBeat: currentBeat });
    }
    previousBeat = currentBeat;
  }

  if (Number.isFinite(totalBeat) && totalBeat > previousBeat) {
    ranges.push({ startBeat: previousBeat, endBeat: totalBeat });
  }

  return ranges;
}

export function getViewerCursor(
  model,
  selectedTimeSec,
  viewerMode = DEFAULT_VIEWER_MODE,
  selectedBeatOverride = undefined,
) {
  if (!model) {
    return {
      timeSec: 0,
      beat: 0,
      measureIndex: 0,
      totalMeasureIndex: 0,
      comboCount: 0,
      totalCombo: 0,
    };
  }

  const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
  const totalMeasureIndex = getTotalMeasureIndex(model);
  const resolvedMode = resolveViewerModeForModel(model, viewerMode);
  const selectedBeat = Number.isFinite(selectedBeatOverride)
    ? getClampedSelectedBeat(model, selectedBeatOverride)
    : getBeatAtTimeSec(model, clampedTimeSec);
  return {
    timeSec: clampedTimeSec,
    beat: resolvedMode === "time" ? 0 : selectedBeat,
    measureIndex: Math.min(getMeasureIndexAtTime(model, clampedTimeSec), totalMeasureIndex),
    totalMeasureIndex,
    comboCount: getComboCountAtTime(model, clampedTimeSec),
    totalCombo: model.totalCombo,
  };
}

export function getMeasureIndexAtTime(model, timeSec) {
  if (!model || model.barLines.length === 0) {
    return 0;
  }
  const index = upperBoundByTime(model.barLines, timeSec) - 1;
  return Math.max(0, index);
}

export function getComboCountAtTime(model, timeSec) {
  if (!model || model.comboEvents.length === 0) {
    return 0;
  }
  return upperBoundByTime(model.comboEvents, timeSec);
}

export function shouldDrawLongEndCap(model, note) {
  if (!model || !shouldNoteDrawLongEndCap(note)) {
    return false;
  }
  return model.longEndEventKeys.has(createTimedLaneKey(note.lane, note.endTimeSec, note.side));
}

export function getEditorScrollTopForBeat(
  model,
  beat,
  viewportHeight,
  pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
) {
  if (!model) {
    return 0;
  }
  const clampedBeat = getClampedSelectedBeat(model, beat);
  const maxScrollTop = Math.max(0, getEditorContentHeightPx(model, viewportHeight, pixelsPerBeat) - viewportHeight);
  return clamp(clampedBeat * pixelsPerBeat, 0, maxScrollTop);
}

function getTotalMeasureIndex(model) {
  if (!model || model.barLines.length === 0) {
    return 0;
  }
  return Math.max(model.barLines.length - 2, 0);
}

function createFallbackComboEvents(notes) {
  const comboEvents = [];
  for (const note of notes ?? []) {
    if (note.kind === "normal") {
      comboEvents.push({
        lane: note.lane,
        beat: Number.isFinite(note.beat) ? note.beat : 0,
        timeSec: note.timeSec,
        kind: "normal",
        ...(note.side ? { side: note.side } : {}),
      });
      continue;
    }
    if (note.kind !== "long") {
      continue;
    }
    if (shouldCountLongStartCombo(note)) {
      comboEvents.push({
        lane: note.lane,
        beat: Number.isFinite(note.beat) ? note.beat : 0,
        timeSec: note.timeSec,
        kind: "long-start",
        ...(note.side ? { side: note.side } : {}),
      });
    }
    if (Number.isFinite(note.endTimeSec)) {
      comboEvents.push({
        lane: note.lane,
        beat: Number.isFinite(note.endBeat) ? note.endBeat : Number.isFinite(note.beat) ? note.beat : 0,
        timeSec: note.endTimeSec,
        kind: "long-end",
        ...(note.side ? { side: note.side } : {}),
      });
    }
  }
  return comboEvents;
}

function normalizeGameProfile(value) {
  return value === "lunatic" ? "lunatic" : "game";
}

function createCanonicalBeatTimingIndex(score) {
  if (!score || typeof score !== "object") {
    return null;
  }
  const canonicalTimingActions = createTimingActionsFromCanonicalScore(score, { includeNegativeBpm: false }).map((action) => (
    action?.type === "stop"
      ? {
        ...action,
        stopLunaticBehavior: undefined,
      }
      : action
  ));
  return createBeatTimingIndex({
    ...score,
    timingActions: canonicalTimingActions,
  });
}

function createLunaticProfileScore(score) {
  if (!score || typeof score !== "object") {
    return score;
  }
  const baseTimingActions = createTimingActionsFromCanonicalScore(score, { includeNegativeBpm: true });
  const { timingActions: transformedTimingActions, reverseMeta } = materializeTimingActionsForViewer(
    score.initialBpm,
    baseTimingActions
      .filter((action) => action?.type === "bpm" || action?.type === "stop")
      .map((action) => (
        action.type === "bpm"
          ? {
            type: "bpm",
            beat: action.beat,
            bpm: action.bpm,
          }
          : {
            type: "stop",
            beat: action.beat,
            stopBeats: action.stopLunaticBehavior === "warp"
              ? LUNATIC_INVALID_STOP_WARP_BEATS
              : action.stopBeats,
            stopResolution: action.stopResolution,
            stopLunaticBehavior: action.stopLunaticBehavior,
          }
      )),
    getScoreTotalBeat(score),
  );
  const timingSeed = {
    initialBpm: score.initialBpm,
    timingActions: transformedTimingActions,
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
  };
  const beatTimingIndex = createBeatTimingIndex(timingSeed);
  if (!beatTimingIndex) {
    return {
      ...score,
      scrollChanges: [],
      timingActions: transformedTimingActions,
      lunaticReverseMeta: reverseMeta,
    };
  }

  const notes = (score.notes ?? []).map((note) => transformLunaticNote(note, beatTimingIndex));
  const comboEvents = createFallbackComboEvents(notes)
    .filter((event) => !reverseMeta || finiteOrZero(event?.beat) < reverseMeta.startBeat)
    .map((event) => transformLunaticTimedBeatEvent(event, beatTimingIndex));
  const barLines = (score.barLines ?? []).map((event) => transformLunaticTimedBeatEvent(event, beatTimingIndex));
  const bpmChanges = buildBpmChangesFromTimingActionsForViewer(score.initialBpm, transformedTimingActions);
  const stops = buildStopsFromTimingActionsForViewer(transformedTimingActions);
  const lastPlayableTimeSec = notes.reduce((maxTimeSec, note) => Math.max(
    maxTimeSec,
    finiteOrZero(note.endTimeSec),
    finiteOrZero(note.timeSec),
  ), 0);
  const lastTimelineTimeSec = Math.max(
    lastPlayableTimeSec,
    finiteOrZero(reverseMeta?.endTimeSec),
    ...barLines.map((event) => finiteOrZero(event.timeSec)),
    ...bpmChanges.map((event) => finiteOrZero(event.timeSec)),
    ...stops.map((event) => finiteOrZero(event.timeSec)),
  );

  return {
    ...score,
    notes,
    comboEvents,
    barLines,
    bpmChanges,
    stops,
    scrollChanges: [],
    timingActions: transformedTimingActions,
    totalDurationSec: lastTimelineTimeSec,
    lastPlayableTimeSec,
    lastTimelineTimeSec,
    lunaticReverseMeta: reverseMeta,
  };
}

function transformLunaticTimedBeatEvent(event, beatTimingIndex) {
  if (!Number.isFinite(event?.beat)) {
    return { ...event };
  }
  return {
    ...event,
    timeSec: beatTimingIndex.beatToSeconds(event.beat),
  };
}

function transformLunaticNote(note, beatTimingIndex) {
  const transformedNote = { ...note };
  if (Number.isFinite(note?.beat)) {
    transformedNote.timeSec = beatTimingIndex.beatToSeconds(note.beat);
  }
  if (Number.isFinite(note?.endBeat)) {
    transformedNote.endTimeSec = beatTimingIndex.beatToSeconds(note.endBeat);
  }
  if (transformedNote.kind === "long") {
    transformedNote.longNoteType = "ln";
  }
  return transformedNote;
}

function shouldNoteDrawLongEndCap(note) {
  return note?.kind === "long"
    && Number.isFinite(note?.endTimeSec)
    && (note?.longNoteType === "cn" || note?.longNoteType === "hcn");
}

function shouldCountLongStartCombo(note) {
  return note?.kind === "long" && (note?.longNoteType === "cn" || note?.longNoteType === "hcn");
}

function materializeTimingActionsForViewer(initialBpm, actions, terminalBeat = 0) {
  const resolvedInitialBpm = Number.isFinite(initialBpm) && initialBpm > 0 ? initialBpm : null;
  if (!resolvedInitialBpm) {
    return {
      timingActions: actions.map((action) => ({ ...action })),
      reverseMeta: null,
    };
  }
  const sortedActions = [...(actions ?? [])]
    .filter((action) => Number.isFinite(action?.beat))
    .sort(compareTimingAction);
  const materializedActions = [];
  let currentBeat = 0;
  let currentSeconds = 0;
  let currentBpm = resolvedInitialBpm;
  let reverseMeta = null;
  let reverseBpm = null;

  for (const action of sortedActions) {
    const actionBeat = Math.max(action.beat, currentBeat);
    currentSeconds += ((actionBeat - currentBeat) * 60) / currentBpm;
    currentBeat = actionBeat;
    if (action.type === "bpm") {
      if (reverseMeta) {
        continue;
      }
      if (Number.isFinite(action.bpm) && action.bpm < 0) {
        reverseBpm = Math.abs(action.bpm);
        reverseMeta = {
          startBeat: actionBeat,
          startTimeSec: currentSeconds,
          sourceBpm: action.bpm,
          activeBpm: reverseBpm,
          endBeat: Math.max(Number.isFinite(terminalBeat) ? terminalBeat : actionBeat, actionBeat),
          endTimeSec: currentSeconds,
        };
        materializedActions.push({
          type: "bpm",
          beat: actionBeat,
          timeSec: currentSeconds,
          bpm: reverseBpm,
          displayBpm: action.bpm,
          effectiveBpm: reverseBpm,
          forceMarker: true,
        });
        currentBpm = reverseBpm;
        continue;
      }
      materializedActions.push({
        type: "bpm",
        beat: actionBeat,
        timeSec: currentSeconds,
        bpm: action.bpm,
        displayBpm: action.bpm,
        effectiveBpm: action.bpm,
      });
      currentBpm = action.bpm;
      continue;
    }
    const stopBeats = Number.isFinite(action.stopBeats) && action.stopBeats > 0 ? action.stopBeats : 0;
    const durationSec = action.stopLunaticBehavior === "warp"
      ? 0
      : (stopBeats > 0 ? (stopBeats * 60) / currentBpm : 0);
    materializedActions.push({
      type: "stop",
      beat: actionBeat,
      timeSec: currentSeconds,
      stopBeats,
      durationSec,
      stopResolution: action.stopResolution,
      stopLunaticBehavior: action.stopLunaticBehavior,
    });
    if (action.stopLunaticBehavior === "warp") {
      currentBeat += stopBeats;
      continue;
    }
    currentSeconds += durationSec;
  }

  if (reverseMeta && reverseBpm) {
    reverseMeta.endTimeSec = currentSeconds + ((reverseMeta.endBeat - currentBeat) * 60) / reverseBpm;
  }

  return {
    timingActions: materializedActions,
    reverseMeta,
  };
}

function buildBpmChangesFromTimingActionsForViewer(initialBpm, timingActions) {
  const changes = [];
  let currentBpm = Number.isFinite(initialBpm) && initialBpm > 0 ? initialBpm : null;
  let currentDisplayBpm = currentBpm;
  for (const action of timingActions ?? []) {
    if (action?.type !== "bpm" || !Number.isFinite(action?.beat) || !Number.isFinite(action?.timeSec) || !Number.isFinite(action?.bpm) || action.bpm <= 0) {
      continue;
    }
    const displayBpm = Number.isFinite(action?.displayBpm) && action.displayBpm !== 0
      ? action.displayBpm
      : action.bpm;
    if (action.bpm !== currentBpm || displayBpm !== currentDisplayBpm || action.forceMarker === true) {
      changes.push({
        beat: action.beat,
        timeSec: action.timeSec,
        bpm: displayBpm,
        effectiveBpm: action.bpm,
      });
    }
    currentBpm = action.bpm;
    currentDisplayBpm = displayBpm;
  }
  return changes;
}

function buildStopsFromTimingActionsForViewer(timingActions) {
  return (timingActions ?? [])
    .filter((action) => action?.type === "stop"
      && action?.stopLunaticBehavior !== "warp"
      && Number.isFinite(action?.beat)
      && Number.isFinite(action?.timeSec)
      && Number.isFinite(action?.durationSec)
      && action.durationSec > 0)
    .map((action) => ({
      beat: action.beat,
      timeSec: action.timeSec + action.durationSec,
      stopBeats: action.stopBeats,
      durationSec: action.durationSec,
    }));
}

function createBeatTimingIndex(score) {
  const initialBpm = Number.isFinite(score.initialBpm) && score.initialBpm > 0 ? score.initialBpm : null;
  if (!initialBpm) {
    return null;
  }

  const actions = createTimingActions(score);
  actions.sort(compareTimingAction);

  const stateBeats = new Array(actions.length);
  const stateSeconds = new Array(actions.length);
  const stateBpms = new Array(actions.length);
  const segments = [];
  const beatSegments = [];

  let currentBeat = 0;
  let currentSeconds = 0;
  let currentBpm = initialBpm;

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const actionBeat = Number.isFinite(action.beat) ? Math.max(action.beat, currentBeat) : currentBeat;
    let actionTimeSec = Number.isFinite(action.timeSec)
      ? Math.max(action.timeSec, currentSeconds)
      : currentSeconds + ((actionBeat - currentBeat) * 60) / currentBpm;

    if (actionBeat > currentBeat && actionTimeSec <= currentSeconds) {
      actionTimeSec = currentSeconds + ((actionBeat - currentBeat) * 60) / currentBpm;
    }

    if (actionBeat > currentBeat) {
      const nextSeconds = actionTimeSec;
      const segment = {
        type: "linear",
        startSec: currentSeconds,
        endSec: nextSeconds,
        startBeat: currentBeat,
        endBeat: actionBeat,
      };
      segments.push(segment);
      beatSegments.push(segment);
      currentBeat = actionBeat;
      currentSeconds = nextSeconds;
    } else {
      currentSeconds = actionTimeSec;
    }

    if (action.type === "bpm") {
      currentBpm = action.bpm;
    } else {
      const warpBeats = action.stopLunaticBehavior === "warp"
        && Number.isFinite(action.stopBeats)
        && action.stopBeats > 0
        ? action.stopBeats
        : 0;
      if (warpBeats > 0) {
        const segment = {
          type: "warp",
          startSec: currentSeconds,
          endSec: currentSeconds,
          startBeat: currentBeat,
          endBeat: currentBeat + warpBeats,
        };
        segments.push(segment);
        beatSegments.push(segment);
        currentBeat += warpBeats;
      } else {
        const stopDurationSec = Number.isFinite(action.durationSec) && action.durationSec > 0
          ? action.durationSec
          : ((action.stopBeats ?? 0) * 60) / currentBpm;
        if (stopDurationSec > 0) {
          segments.push({
            type: "stop",
            startSec: currentSeconds,
            endSec: currentSeconds + stopDurationSec,
            beat: currentBeat,
          });
          currentSeconds += stopDurationSec;
        }
      }
    }

    stateBeats[index] = currentBeat;
    stateSeconds[index] = currentSeconds;
    stateBpms[index] = currentBpm;
  }

  return {
    initialBpm,
    actions,
    segments,
    stateBeats,
    stateSeconds,
    stateBpms,
    tailBeat: currentBeat,
    tailSeconds: currentSeconds,
    tailBpm: currentBpm,
    beatToSeconds(beat) {
      const normalizedBeat = Number.isFinite(beat) ? Math.max(beat, 0) : 0;
      const segmentIndex = lowerBoundBeatSegmentsByEndBeat(beatSegments, normalizedBeat);
      if (segmentIndex < beatSegments.length) {
        const segment = beatSegments[segmentIndex];
        if (normalizedBeat >= segment.startBeat && normalizedBeat <= segment.endBeat) {
          if (segment.type === "warp") {
            return segment.startSec;
          }
          const beatSpan = segment.endBeat - segment.startBeat;
          if (beatSpan <= 0) {
            return segment.endSec;
          }
          return segment.startSec + ((normalizedBeat - segment.startBeat) * (segment.endSec - segment.startSec)) / beatSpan;
        }
      }
      return currentSeconds + ((normalizedBeat - currentBeat) * 60) / currentBpm;
    },
    secondsToBeat(seconds) {
      const normalizedSeconds = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
      const segmentIndex = upperBoundSegmentsByStartSec(segments, normalizedSeconds) - 1;
      if (segmentIndex >= 0) {
        const segment = segments[segmentIndex];
        if (normalizedSeconds <= segment.endSec) {
          if (segment.type === "stop") {
            return segment.beat;
          }
          if (segment.type === "warp") {
            return segment.endBeat;
          }
          const secSpan = segment.endSec - segment.startSec;
          if (secSpan <= 0) {
            return segment.endBeat;
          }
          return segment.startBeat + ((normalizedSeconds - segment.startSec) * (segment.endBeat - segment.startBeat)) / secSpan;
        }
      }
      return currentBeat + ((normalizedSeconds - currentSeconds) * currentBpm) / 60;
    },
  };
}

function createTimingActions(score) {
  const timingActions = createTimingActionsFromCanonicalScore(score);
  if (timingActions.length > 0) {
    return timingActions;
  }
  return createFallbackTimingActions(score);
}

function createGameTimelineTimingEvents(score, gameProfile = "game") {
  const actions = createTimingActions(score).slice().sort(compareTimingAction);
  const bpmChanges = [];
  const stops = [];
  const warps = [];
  const useWarpStops = gameProfile === "lunatic";
  let currentBpm = Number.isFinite(score?.initialBpm) && score.initialBpm > 0 ? score.initialBpm : null;
  let currentDisplayBpm = currentBpm;

  for (const action of actions) {
    if (action?.type === "bpm") {
      if (Number.isFinite(action.beat) && Number.isFinite(action.timeSec) && Number.isFinite(action.bpm) && action.bpm > 0) {
        const displayBpm = Number.isFinite(action?.displayBpm) && action.displayBpm !== 0
          ? action.displayBpm
          : action.bpm;
        if (action.bpm !== currentBpm || displayBpm !== currentDisplayBpm || action.forceMarker === true) {
          bpmChanges.push({
            beat: action.beat,
            timeSec: action.timeSec,
            bpm: displayBpm,
            effectiveBpm: action.bpm,
          });
        }
        currentBpm = action.bpm;
        currentDisplayBpm = displayBpm;
      }
      continue;
    }
    if (action?.type !== "stop") {
      continue;
    }
    if (!Number.isFinite(action.beat) || !Number.isFinite(action.timeSec)) {
      continue;
    }
    if (useWarpStops && action.stopLunaticBehavior === "warp") {
      const warpBeats = Number.isFinite(action.stopBeats) && action.stopBeats > 0
        ? action.stopBeats
        : LUNATIC_INVALID_STOP_WARP_BEATS;
      warps.push({
        beat: action.beat + warpBeats,
        timeSec: action.timeSec,
        warpBeats,
      });
      continue;
    }
    const durationSec = Number.isFinite(action.durationSec) && action.durationSec > 0
      ? action.durationSec
      : (Number.isFinite(action.stopBeats) && action.stopBeats > 0 && Number.isFinite(currentBpm) && currentBpm > 0
        ? (action.stopBeats * 60) / currentBpm
        : null);
    if (!(durationSec > 0)) {
      continue;
    }
    stops.push({
      beat: action.beat,
      timeSec: action.timeSec,
      stopBeats: action.stopBeats,
      durationSec,
    });
  }

  return { bpmChanges, stops, warps };
}

function resolveBpmSummary(score, bpmSummary = undefined) {
  const positiveBpms = collectPositiveBpms(score);
  const startBpm = resolvePositiveBpm(
    score?.initialBpm,
    positiveBpms[0],
    bpmSummary?.mainBpm,
  );
  return {
    startBpm,
    minBpm: resolvePositiveBpm(
      bpmSummary?.minBpm,
      positiveBpms.length > 0 ? Math.min(...positiveBpms) : startBpm,
      startBpm,
    ),
    maxBpm: resolvePositiveBpm(
      bpmSummary?.maxBpm,
      positiveBpms.length > 0 ? Math.max(...positiveBpms) : startBpm,
      startBpm,
    ),
    mainBpm: resolvePositiveBpm(bpmSummary?.mainBpm, startBpm),
  };
}

function collectPositiveBpms(score) {
  const positiveBpms = [];
  const pushPositiveBpm = (value) => {
    if (Number.isFinite(value) && value > 0) {
      positiveBpms.push(value);
    }
  };
  pushPositiveBpm(score?.initialBpm);
  for (const action of score?.timingActions ?? []) {
    if (action?.type === "bpm") {
      pushPositiveBpm(action?.effectiveBpm ?? action?.bpm);
    }
  }
  for (const bpmChange of score?.bpmChanges ?? []) {
    pushPositiveBpm(bpmChange?.effectiveBpm ?? bpmChange?.bpm);
  }
  return positiveBpms;
}

function createGameTimingStatePoints(gameTimeline, initialBpm) {
  const statePoints = [];
  let currentBpm = resolvePositiveBpm(initialBpm);
  let currentScrollRate = 1;
  const pushStatePoint = (beat, timeSec) => {
    const statePoint = {
      beat: Number.isFinite(beat) ? beat : 0,
      timeSec: Number.isFinite(timeSec) ? timeSec : 0,
      bpm: currentBpm,
      scrollRate: currentScrollRate,
    };
    if (
      statePoints.length > 0
      && Math.abs(statePoints[statePoints.length - 1].timeSec - statePoint.timeSec) < 0.000001
      && Math.abs(statePoints[statePoints.length - 1].beat - statePoint.beat) < 0.000001
    ) {
      statePoints[statePoints.length - 1] = statePoint;
      return;
    }
    statePoints.push(statePoint);
  };
  pushStatePoint(0, 0);
  for (const point of gameTimeline ?? []) {
    if (!(point?.bpmChanges?.length > 0) && !(point?.scrollChanges?.length > 0)) {
      continue;
    }
    const nextBpm = point?.bpmChanges?.length > 0
      ? getLastEffectiveBpmFromPoint(point.bpmChanges, currentBpm)
      : currentBpm;
    const nextScrollRate = point?.scrollChanges?.length > 0
      ? getLastEffectiveScrollRateFromPoint(point.scrollChanges, currentScrollRate)
      : currentScrollRate;
    if (
      Math.abs(nextBpm - currentBpm) < 0.000001
      && Math.abs(nextScrollRate - currentScrollRate) < 0.000001
    ) {
      continue;
    }
    currentBpm = nextBpm;
    currentScrollRate = nextScrollRate;
    pushStatePoint(point?.beat, point?.timeSec);
  }
  return statePoints;
}

function createTimingActionsFromCanonicalScore(score, { includeNegativeBpm = false } = {}) {
  return [...(score?.timingActions ?? [])]
    .filter((action) => Number.isFinite(action?.beat) && action.type === "bpm" && Number.isFinite(action?.bpm) && (action.bpm > 0 || (includeNegativeBpm && action.bpm < 0))
      || Number.isFinite(action?.beat) && action.type === "stop" && action?.stopResolution === "invalid"
      || Number.isFinite(action?.beat) && action.type === "stop" && Number.isFinite(action?.stopBeats) && action.stopBeats > 0)
    .map((action) => {
      if (action.type === "bpm") {
        return {
          type: "bpm",
          beat: action.beat,
          timeSec: action.timeSec,
          bpm: action.bpm,
          ...(Number.isFinite(action.displayBpm) ? { displayBpm: action.displayBpm } : {}),
          ...(Number.isFinite(action.effectiveBpm) ? { effectiveBpm: action.effectiveBpm } : {}),
          ...(action.forceMarker === true ? { forceMarker: true } : {}),
        };
      }
      return {
        type: "stop",
        beat: action.beat,
        timeSec: action.timeSec,
        stopBeats: action.stopBeats,
        durationSec: action.durationSec,
        stopResolution: action.stopResolution,
        stopLunaticBehavior: action.stopLunaticBehavior,
      };
    });
}

function createFallbackTimingActions(score) {
  const actions = [];

  for (const event of score?.bpmChanges ?? []) {
    if (Number.isFinite(event?.beat) && Number.isFinite(event?.bpm) && event.bpm > 0) {
      actions.push({
        type: "bpm",
        beat: event.beat,
        timeSec: event.timeSec,
        bpm: event.bpm,
      });
    }
  }

  for (const event of score?.stops ?? []) {
    if (!Number.isFinite(event?.beat) || !Number.isFinite(event?.stopBeats) || event.stopBeats <= 0) {
      continue;
    }
    const action = {
      type: "stop",
      beat: event.beat,
      stopBeats: event.stopBeats,
    };
    if (Number.isFinite(event?.durationSec) && event.durationSec > 0) {
      action.durationSec = event.durationSec;
      if (Number.isFinite(event?.timeSec)) {
        action.timeSec = event.timeSec - event.durationSec;
      }
    }
    actions.push(action);
  }

  return actions;
}

function normalizeLunaticReverseMeta(reverseMeta, gameTimeline) {
  if (!reverseMeta || !Array.isArray(gameTimeline) || gameTimeline.length === 0) {
    return null;
  }
  const normalizedStartBeat = finiteOrZero(reverseMeta.startBeat);
  const normalizedStartTimeSec = finiteOrZero(reverseMeta.startTimeSec);
  let firstFutureTimelineIndex = gameTimeline.length;

  for (let index = 0; index < gameTimeline.length; index += 1) {
    const point = gameTimeline[index];
    const pointBeat = finiteOrZero(point?.beat);
    const pointTimeSec = finiteOrZero(point?.timeSec);
    if (pointBeat > normalizedStartBeat || (Math.abs(pointBeat - normalizedStartBeat) < 0.000001 && pointTimeSec > normalizedStartTimeSec)) {
      firstFutureTimelineIndex = index;
      break;
    }
  }

  return {
    ...reverseMeta,
    startBeat: normalizedStartBeat,
    startTimeSec: normalizedStartTimeSec,
    startTrackPosition: normalizedStartBeat / 4,
    firstFutureTimelineIndex,
  };
}

function createGameScrollIndex(scrollChanges) {
  const actions = [...(scrollChanges ?? [])]
    .filter((event) => Number.isFinite(event?.beat) && Number.isFinite(event?.rate))
    .sort(compareTimedBeatLike);

  const stateBeats = new Array(actions.length);
  const stateDisplacements = new Array(actions.length);
  const stateRates = new Array(actions.length);

  let currentBeat = 0;
  let currentDisplacement = 0;
  let currentRate = 1;

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const actionBeat = Math.max(action.beat, currentBeat);
    if (actionBeat > currentBeat) {
      currentDisplacement += (actionBeat - currentBeat) * currentRate;
      currentBeat = actionBeat;
    }
    currentRate = action.rate;
    stateBeats[index] = currentBeat;
    stateDisplacements[index] = currentDisplacement;
    stateRates[index] = currentRate;
  }

  return {
    actions,
    stateBeats,
    stateDisplacements,
    stateRates,
    tailBeat: currentBeat,
    tailDisplacement: currentDisplacement,
    tailRate: currentRate,
    beatToDisplacement(beat) {
      const normalizedBeat = Number.isFinite(beat) ? Math.max(beat, 0) : 0;
      const actionIndex = upperBoundActionsByBeat(actions, normalizedBeat) - 1;
      if (actionIndex < 0) {
        return normalizedBeat;
      }
      return stateDisplacements[actionIndex] + (normalizedBeat - stateBeats[actionIndex]) * stateRates[actionIndex];
    },
    getScrollRateAtBeat(beat) {
      const normalizedBeat = Number.isFinite(beat) ? Math.max(beat, 0) : 0;
      const actionIndex = upperBoundActionsByBeat(actions, normalizedBeat) - 1;
      if (actionIndex < 0) {
        return 1;
      }
      return stateRates[actionIndex];
    },
  };
}

function createGameTimeline({ notes, barLines, bpmChanges, stops, warps, scrollChanges, gameScrollIndex }) {
  const pointMap = new Map();
  ensureGameTimelinePoint(pointMap, 0, 0, gameScrollIndex);

  for (const barLine of barLines ?? []) {
    const point = ensureGameTimelinePoint(pointMap, barLine?.beat, barLine?.timeSec, gameScrollIndex);
    if (point) {
      point.barLines.push(barLine);
    }
  }
  for (const bpmChange of bpmChanges ?? []) {
    const point = ensureGameTimelinePoint(pointMap, bpmChange?.beat, bpmChange?.timeSec, gameScrollIndex);
    if (point) {
      point.bpmChanges.push(bpmChange);
    }
  }
  for (const stop of stops ?? []) {
    const point = ensureGameTimelinePoint(pointMap, stop?.beat, stop?.timeSec, gameScrollIndex);
    if (point) {
      point.stops.push(stop);
    }
  }
  for (const scrollChange of scrollChanges ?? []) {
    const point = ensureGameTimelinePoint(pointMap, scrollChange?.beat, scrollChange?.timeSec, gameScrollIndex);
    if (point) {
      point.scrollChanges.push(scrollChange);
    }
  }
  for (const warp of warps ?? []) {
    const point = ensureGameTimelinePoint(pointMap, warp?.beat, warp?.timeSec, gameScrollIndex);
    if (point) {
      point.warps.push(warp);
    }
  }
  for (const note of notes ?? []) {
    const point = ensureGameTimelinePoint(pointMap, note?.beat, note?.timeSec, gameScrollIndex);
    if (point) {
      point.notes.push(note);
    }
    if (note?.kind === "long") {
      const longEndPoint = ensureGameTimelinePoint(pointMap, note?.endBeat, note?.endTimeSec, gameScrollIndex);
      if (longEndPoint) {
        longEndPoint.longEndNotes.push(note);
      }
    }
  }

  const points = [...pointMap.values()].sort(compareTimedBeatLike);
  const pointIndexByKey = new Map();
  let currentScrollRate = 1;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    point.index = index;
    point.stopDurationSec = point.stops.reduce((sum, stop) => {
      const durationSec = Number.isFinite(stop?.durationSec) && stop.durationSec > 0 ? stop.durationSec : 0;
      return sum + durationSec;
    }, 0);
    if (point.scrollChanges.length > 0) {
      const lastScrollChange = point.scrollChanges[point.scrollChanges.length - 1];
      currentScrollRate = Number.isFinite(lastScrollChange?.rate) ? lastScrollChange.rate : currentScrollRate;
    }
    point.outgoingScrollRate = currentScrollRate;
    pointIndexByKey.set(createGameTimelinePointKey(point.beat, point.timeSec), index);
  }

  for (const note of notes ?? []) {
    const startIndex = pointIndexByKey.get(createGameTimelinePointKey(note?.beat, note?.timeSec));
    if (Number.isInteger(startIndex)) {
      note.gameTimelineIndex = startIndex;
    }
    if (note?.kind === "long") {
      const endIndex = pointIndexByKey.get(createGameTimelinePointKey(note?.endBeat, note?.endTimeSec));
      if (Number.isInteger(endIndex)) {
        note.gameTimelineEndIndex = endIndex;
      }
    }
  }

  return points;
}

function ensureGameTimelinePoint(pointMap, beat, timeSec, gameScrollIndex) {
  if (!Number.isFinite(beat) || !Number.isFinite(timeSec)) {
    return null;
  }
  const key = createGameTimelinePointKey(beat, timeSec);
  let point = pointMap.get(key);
  if (point) {
    return point;
  }
  point = {
    beat,
    timeSec,
    trackPosition: gameScrollIndex ? gameScrollIndex.beatToDisplacement(beat) : beat,
    barLines: [],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    notes: [],
    longEndNotes: [],
    warps: [],
    stopDurationSec: 0,
    outgoingScrollRate: 1,
    index: -1,
  };
  pointMap.set(key, point);
  return point;
}

function createGameTimelinePointKey(beat, timeSec) {
  return `${Math.round((beat ?? 0) * 1000000)}:${Math.round((timeSec ?? 0) * 1000000)}`;
}

function createGamePointIndex(items) {
  return [...(items ?? [])]
    .filter((item) => Number.isFinite(item?.trackPosition))
    .sort(compareTrackEvent);
}

function createGameLongBodyStartIndex(notes) {
  return [...(notes ?? [])]
    .filter((note) => note?.kind === "long"
      && Number.isFinite(note?.trackPosition)
      && Number.isFinite(note?.endTrackPosition)
      && note.endTrackPosition > note.trackPosition)
    .sort(compareTrackEvent);
}

function createGameLongEndIndex(notes) {
  return [...(notes ?? [])]
    .filter((note) => note?.kind === "long" && Number.isFinite(note?.endTrackPosition))
    .sort(compareGameLongBodyEndTrack);
}

function annotateEventsWithGameTrackPosition(events, gameScrollIndex) {
  if (!gameScrollIndex) {
    return [...events];
  }
  return events.map((event) => ({
    ...event,
    ...(Number.isFinite(event?.beat) ? { trackPosition: gameScrollIndex.beatToDisplacement(event.beat) } : {}),
  }));
}

function annotateNotesWithGameTrackPosition(notes, gameScrollIndex) {
  if (!gameScrollIndex) {
    return [...notes];
  }
  return notes.map((note) => ({
    ...note,
    ...(Number.isFinite(note?.beat) ? { trackPosition: gameScrollIndex.beatToDisplacement(note.beat) } : {}),
    ...(Number.isFinite(note?.endBeat) ? { endTrackPosition: gameScrollIndex.beatToDisplacement(note.endBeat) } : {}),
  }));
}

function upperBoundByTime(items, timeSec) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (items[mid].timeSec <= timeSec) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function getTrackWindowIndices(items, startTrackPosition, endTrackPosition, getTrackPosition = getEventTrackPosition) {
  return {
    startIndex: lowerBoundByTrackPosition(items, startTrackPosition, getTrackPosition),
    endIndex: upperBoundByTrackPosition(items, endTrackPosition, getTrackPosition),
  };
}

export function getLongBodyTrackWindow(model, startTrackPosition, endTrackPosition) {
  const startItems = model?.gameLongBodiesByStartTrack ?? [];
  const endItems = model?.gameLongBodiesByEndTrack ?? [];
  const visibleStartCount = upperBoundByTrackPosition(startItems, endTrackPosition, getEventTrackPosition);
  const visibleEndStartIndex = lowerBoundByTrackPosition(endItems, startTrackPosition, getNoteEndTrackPosition);
  const remainingEndCount = endItems.length - visibleEndStartIndex;
  if (visibleStartCount <= remainingEndCount) {
    return {
      items: startItems,
      startIndex: 0,
      endIndex: visibleStartCount,
    };
  }
  return {
    items: endItems,
    startIndex: visibleEndStartIndex,
    endIndex: endItems.length,
  };
}

function upperBoundActionsByBeat(actions, beat) {
  let low = 0;
  let high = actions.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (actions[mid].beat <= beat) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function upperBoundSegmentsByStartSec(segments, seconds) {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (segments[mid].startSec <= seconds) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function lowerBoundBeatSegmentsByEndBeat(segments, beat) {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((segments[mid]?.endBeat ?? 0) < beat) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function lowerBoundByTrackPosition(items, trackPosition, getTrackPosition = getEventTrackPosition) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getTrackPosition(items[mid]) < trackPosition) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function upperBoundByTrackPosition(items, trackPosition, getTrackPosition = getEventTrackPosition) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getTrackPosition(items[mid]) <= trackPosition) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function compareNoteLike(left, right) {
  if (left.timeSec !== right.timeSec) {
    return left.timeSec - right.timeSec;
  }
  if (finiteOrZero(left.beat) !== finiteOrZero(right.beat)) {
    return finiteOrZero(left.beat) - finiteOrZero(right.beat);
  }
  return (left.lane ?? 0) - (right.lane ?? 0);
}

function compareComboEvent(left, right) {
  if (left.timeSec !== right.timeSec) {
    return left.timeSec - right.timeSec;
  }
  if (finiteOrZero(left.beat) !== finiteOrZero(right.beat)) {
    return finiteOrZero(left.beat) - finiteOrZero(right.beat);
  }
  const order = comboEventOrder(left.kind) - comboEventOrder(right.kind);
  if (order !== 0) {
    return order;
  }
  return left.lane - right.lane;
}

function compareBeatNoteLike(left, right) {
  if (finiteOrZero(left.beat) !== finiteOrZero(right.beat)) {
    return finiteOrZero(left.beat) - finiteOrZero(right.beat);
  }
  if ((left.timeSec ?? 0) !== (right.timeSec ?? 0)) {
    return (left.timeSec ?? 0) - (right.timeSec ?? 0);
  }
  return (left.lane ?? 0) - (right.lane ?? 0);
}

function compareLongNoteEndBeat(left, right) {
  if (finiteOrZero(left.endBeat ?? left.beat) !== finiteOrZero(right.endBeat ?? right.beat)) {
    return finiteOrZero(left.endBeat ?? left.beat) - finiteOrZero(right.endBeat ?? right.beat);
  }
  if (finiteOrZero(left.beat) !== finiteOrZero(right.beat)) {
    return finiteOrZero(left.beat) - finiteOrZero(right.beat);
  }
  return (left.timeSec ?? 0) - (right.timeSec ?? 0);
}

function compareTrackEvent(left, right) {
  if (finiteOrZero(left?.trackPosition) !== finiteOrZero(right?.trackPosition)) {
    return finiteOrZero(left?.trackPosition) - finiteOrZero(right?.trackPosition);
  }
  if (finiteOrZero(left?.timeSec) !== finiteOrZero(right?.timeSec)) {
    return finiteOrZero(left?.timeSec) - finiteOrZero(right?.timeSec);
  }
  if (finiteOrZero(left?.beat) !== finiteOrZero(right?.beat)) {
    return finiteOrZero(left?.beat) - finiteOrZero(right?.beat);
  }
  return (left?.lane ?? 0) - (right?.lane ?? 0);
}

function compareGameLongBodyEndTrack(left, right) {
  if (finiteOrZero(left?.endTrackPosition) !== finiteOrZero(right?.endTrackPosition)) {
    return finiteOrZero(left?.endTrackPosition) - finiteOrZero(right?.endTrackPosition);
  }
  return compareTrackEvent(left, right);
}

function compareTimedBeatLike(left, right) {
  if (Number.isFinite(left?.beat) && Number.isFinite(right?.beat) && left.beat !== right.beat) {
    return left.beat - right.beat;
  }
  return (left?.timeSec ?? 0) - (right?.timeSec ?? 0);
}

function compareTimingAction(left, right) {
  if (left.beat !== right.beat) {
    return left.beat - right.beat;
  }
  return ACTION_PRECEDENCE[left.type] - ACTION_PRECEDENCE[right.type];
}

function comboEventOrder(kind) {
  switch (kind) {
    case "normal":
      return 0;
    case "long-start":
      return 1;
    case "long-end":
      return 2;
    default:
      return 99;
  }
}

function createTimedLaneKey(input, timeSec, side = undefined) {
  if (typeof input === "object" && input !== null) {
    return createTimedLaneKey(input.lane, input.timeSec ?? input.endTimeSec, input.side);
  }
  return `${side ?? "-"}:${input}:${Math.round((timeSec ?? 0) * 1000000)}`;
}

function getEventTrackPosition(item) {
  return Number.isFinite(item?.trackPosition) ? item.trackPosition : 0;
}

function getNoteEndTrackPosition(note) {
  return Number.isFinite(note?.endTrackPosition) ? note.endTrackPosition : getEventTrackPosition(note);
}

export function getGameCurrentDurationForTimingState(statePoint, derivedMetrics) {
  const currentBpm = Number.isFinite(statePoint?.bpm) && statePoint.bpm > 0
    ? statePoint.bpm
    : 0;
  const currentScrollRate = Number.isFinite(statePoint?.scrollRate) ? statePoint.scrollRate : 1;
  const hispeed = derivedMetrics?.hispeed ?? 0;
  const laneCoverRatio = derivedMetrics?.laneCoverRatio ?? 0;
  if (!(currentBpm > 0) || !(currentScrollRate > 0) || !(hispeed > 0) || laneCoverRatio >= 1) {
    return 0;
  }
  const regionMs = (240000 / currentBpm / hispeed) / currentScrollRate;
  return Math.max(regionMs * (1 - laneCoverRatio), 0);
}

function getOrCreateGameTimingDerivedMetrics(model, normalizedConfig) {
  if (!model) {
    return createGameTimingDerivedMetrics(model, normalizedConfig);
  }
  const cacheKey = createGameTimingDerivedMetricsCacheKey(normalizedConfig);
  let metricsByConfig = gameTimingDerivedMetricsCacheByModel.get(model);
  if (!metricsByConfig) {
    metricsByConfig = new Map();
    gameTimingDerivedMetricsCacheByModel.set(model, metricsByConfig);
  }
  let derivedMetrics = metricsByConfig.get(cacheKey);
  if (!derivedMetrics) {
    derivedMetrics = createGameTimingDerivedMetrics(model, normalizedConfig);
    metricsByConfig.set(cacheKey, derivedMetrics);
  }
  return derivedMetrics;
}

function createGameTimingDerivedMetrics(model, normalizedConfig) {
  const hsFixBaseBpm = getGameHsFixBaseBpm(model, normalizedConfig.hsFixMode);
  return {
    normalizedConfig,
    hsFixBaseBpm,
    hispeed: getGameHispeed(
      hsFixBaseBpm,
      normalizedConfig.durationMs,
      normalizedConfig.laneCoverPermille,
    ),
    laneCoverRatio: getGameLaneCoverRatio(normalizedConfig.laneCoverPermille),
    greenNumberRange: undefined,
  };
}

function createGameTimingDerivedMetricsCacheKey(normalizedConfig) {
  return [
    normalizedConfig.durationMs,
    normalizedConfig.laneHeightPx,
    normalizedConfig.laneCoverPermille,
    normalizedConfig.laneCoverVisible ? 1 : 0,
    normalizedConfig.hsFixMode,
  ].join("|");
}

function computeGameGreenNumberRange(model, derivedMetrics) {
  const statePoints = model?.gameTimingStatePoints?.length > 0
    ? model.gameTimingStatePoints
    : [createFallbackGameTimingState(model)];
  let minGreenNumber = Number.POSITIVE_INFINITY;
  let maxGreenNumber = Number.NEGATIVE_INFINITY;
  for (const statePoint of statePoints) {
    const greenNumber = getGameCurrentGreenNumberForTimingState(statePoint, derivedMetrics);
    minGreenNumber = Math.min(minGreenNumber, greenNumber);
    maxGreenNumber = Math.max(maxGreenNumber, greenNumber);
  }
  if (!Number.isFinite(minGreenNumber) || !Number.isFinite(maxGreenNumber)) {
    return { maxGreenNumber: 0, minGreenNumber: 0 };
  }
  return {
    maxGreenNumber,
    minGreenNumber,
  };
}

function createFallbackGameTimingState(model) {
  return {
    beat: 0,
    timeSec: 0,
    bpm: resolvePositiveBpm(model?.bpmSummary?.startBpm),
    scrollRate: 1,
  };
}

function getGameCurrentGreenNumberForTimingState(statePoint, derivedMetrics) {
  return Math.round(getGameCurrentDurationForTimingState(statePoint, derivedMetrics) * GAME_GREEN_NUMBER_RATIO);
}

function getLastEffectiveBpmFromPoint(bpmChanges, fallbackBpm) {
  for (let index = bpmChanges.length - 1; index >= 0; index -= 1) {
    const nextBpm = bpmChanges[index]?.effectiveBpm ?? bpmChanges[index]?.bpm;
    if (Number.isFinite(nextBpm) && nextBpm > 0) {
      return nextBpm;
    }
  }
  return fallbackBpm;
}

function getLastEffectiveScrollRateFromPoint(scrollChanges, fallbackScrollRate) {
  for (let index = scrollChanges.length - 1; index >= 0; index -= 1) {
    const nextScrollRate = scrollChanges[index]?.rate;
    if (Number.isFinite(nextScrollRate)) {
      return nextScrollRate;
    }
  }
  return fallbackScrollRate;
}

function clampRoundedValue(value, minValue, maxValue, fallbackValue, precision = 1) {
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }
  const safePrecision = Number.isFinite(precision) && precision > 0 ? precision : 1;
  const roundedValue = Math.round(value / safePrecision) * safePrecision;
  const normalizedValue = clamp(roundedValue, minValue, maxValue);
  if (safePrecision >= 1) {
    return Math.round(normalizedValue);
  }
  const fractionDigits = Math.max(0, String(safePrecision).split(".")[1]?.length ?? 0);
  return Number(normalizedValue.toFixed(fractionDigits));
}

function resolvePositiveBpm(...values) {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return DEFAULT_GAME_HS_FIX_FALLBACK_BPM;
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}
