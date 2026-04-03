// ==UserScript==
// @name         BMS Info Extender
// @namespace    https://github.com/Neeted
// @version      2.2.0
// @description  LR2IR、MinIR、Mocha、STELLAVERSEで詳細メタデータ、ノーツ分布/BPM推移グラフ、譜面ビューアなどを表示する
// @author       ﾏﾝﾊｯﾀﾝｶﾞｯﾌｪ
// @match        http://www.dream-pro.info/~lavalse/LR2IR/search.cgi*
// @match        https://stellabms.xyz/*
// @match        https://www.gaftalk.com/minir/*
// @match        https://mocha-repository.info/song.php*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_getResourceText
// @grant        GM_setValue
// @connect      bms.howan.jp
// @connect      bms-info-extender.netlify.app
// @resource     googlefont https://fonts.googleapis.com/css2?family=Inconsolata&family=Noto+Sans+JP&display=swap
// @updateURL    https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js
// @downloadURL  https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js
// @run-at       document-start
// ==/UserScript==
// 2.2.0 操作や設定値の変更、Gameモードをよりbeatoraja寄りに、LR2風(負数STOPワープ、SCROLL無視)のLunaticモード追加
// 2.1.0 譜面 gzip の取得元を Netlify 優先 + R2 フォールバックへ変更
// 2.0.1 STELLAVERSE SPA遷移時、前回URLの拡張情報DOMが残っている場合にスキップするガードを追加
//       (正式提案→レベル変更のような遷移時に処理の漏れが発生していたものを修正しました)
// 2.0.0 譜面ビューアを導入、ギミック譜面を含め実用可能と判断 ※一部ギミック譜面は既知の対応不足あり
// 1.1.0 外部データ取得失敗時のフォールバック処理を追加(LR2IR、MochaでMD5や譜面ビューアへのリンクを表示)
// 1.0.5 誤字修正
// このファイルは script/build_preview_targets.mjs により生成されます。手編集しないでください。

(() => {
  // shared/preview-runtime/score-viewer-model.js
  var DEFAULT_VIEWER_PIXELS_PER_SECOND = 160;
  var DEFAULT_EDITOR_PIXELS_PER_BEAT = 64;
  var DEFAULT_VIEWER_MODE = "time";
  var DEFAULT_INVISIBLE_NOTE_VISIBILITY = "hide";
  var DEFAULT_JUDGE_LINE_POSITION_RATIO = 0.5;
  var DEFAULT_GAME_DURATION_MS = 500;
  var MIN_GAME_DURATION_MS = 1;
  var MAX_GAME_DURATION_MS = 5e3;
  var DEFAULT_GAME_LANE_HEIGHT_PERCENT = 0;
  var DEFAULT_GAME_LANE_COVER_PERMILLE = 0;
  var DEFAULT_GAME_LANE_COVER_VISIBLE = true;
  var DEFAULT_GAME_HS_FIX_MODE = "main";
  var DEFAULT_GAME_HS_FIX_FALLBACK_BPM = 150;
  var GAME_GREEN_NUMBER_RATIO = 0.6;
  var GAME_HS_FIX_MODES = Object.freeze(["start", "max", "main", "min"]);
  var LUNATIC_INVALID_STOP_WARP_BEATS = 1 / 48;
  var TIME_SELECTION_EPSILON_SEC = 5e-4;
  var BEAT_SELECTION_EPSILON = 1e-6;
  var ACTION_PRECEDENCE = {
    bpm: 1,
    stop: 2
  };
  var gameTimingDerivedMetricsCacheByModel = /* @__PURE__ */ new WeakMap();
  function normalizeViewerMode(value) {
    return value === "editor" || value === "game" || value === "lunatic" || value === "time" ? value : DEFAULT_VIEWER_MODE;
  }
  function resolveViewerModeForModel(model, viewerMode) {
    const normalizedMode = normalizeViewerMode(viewerMode);
    if (normalizedMode === "editor" && model?.supportsEditorMode) {
      return "editor";
    }
    if ((normalizedMode === "game" || normalizedMode === "lunatic") && model?.supportsGameMode) {
      return normalizedMode;
    }
    return DEFAULT_VIEWER_MODE;
  }
  function normalizeInvisibleNoteVisibility(value) {
    return value === "show" ? "show" : DEFAULT_INVISIBLE_NOTE_VISIBILITY;
  }
  function normalizeJudgeLinePositionRatio(value) {
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_JUDGE_LINE_POSITION_RATIO;
  }
  function getJudgeLineY(viewportHeight, judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO) {
    const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
    return normalizedViewportHeight * normalizeJudgeLinePositionRatio(judgeLinePositionRatio);
  }
  function normalizeGameDurationMs(value) {
    return clampRoundedValue(value, MIN_GAME_DURATION_MS, MAX_GAME_DURATION_MS, DEFAULT_GAME_DURATION_MS);
  }
  function normalizeGameLaneHeightPercent(value) {
    return clampRoundedValue(value, 0, 100, DEFAULT_GAME_LANE_HEIGHT_PERCENT, 0.1);
  }
  function normalizeGameLaneHeightPercentForSlider(value) {
    return clampRoundedValue(value, 0, 100, DEFAULT_GAME_LANE_HEIGHT_PERCENT, 1);
  }
  function normalizeGameLaneHeightPercentForWheel(value) {
    return normalizeGameLaneHeightPercent(value);
  }
  function normalizeGameLaneCoverPermille(value) {
    return clampRoundedValue(value, 0, 1e3, DEFAULT_GAME_LANE_COVER_PERMILLE);
  }
  function normalizeGameLaneCoverVisible(value) {
    if (value === false || value === "false" || value === 0 || value === "0") {
      return false;
    }
    return value === true || value === "true" || value === 1 || value === "1" || value === void 0 || value === null ? DEFAULT_GAME_LANE_COVER_VISIBLE : Boolean(value);
  }
  function normalizeGameHsFixMode(value) {
    return GAME_HS_FIX_MODES.includes(value) ? value : DEFAULT_GAME_HS_FIX_MODE;
  }
  function createDefaultGameTimingConfig() {
    return {
      durationMs: DEFAULT_GAME_DURATION_MS,
      laneHeightPercent: DEFAULT_GAME_LANE_HEIGHT_PERCENT,
      laneCoverPermille: DEFAULT_GAME_LANE_COVER_PERMILLE,
      laneCoverVisible: DEFAULT_GAME_LANE_COVER_VISIBLE,
      hsFixMode: DEFAULT_GAME_HS_FIX_MODE
    };
  }
  function normalizeGameTimingConfig(config = {}) {
    return {
      durationMs: normalizeGameDurationMs(config.durationMs),
      laneHeightPercent: normalizeGameLaneHeightPercent(config.laneHeightPercent),
      laneCoverPermille: normalizeGameLaneCoverPermille(config.laneCoverPermille),
      laneCoverVisible: normalizeGameLaneCoverVisible(config.laneCoverVisible),
      hsFixMode: normalizeGameHsFixMode(config.hsFixMode)
    };
  }
  function getGameLaneGeometry(viewportHeight, judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO, laneHeightPercent = DEFAULT_GAME_LANE_HEIGHT_PERCENT) {
    const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
    const normalizedLaneHeightPercent = normalizeGameLaneHeightPercent(laneHeightPercent);
    const laneBottomY = normalizedViewportHeight;
    const laneHeightPx = Math.max(
      Math.round(normalizedViewportHeight * (100 - normalizedLaneHeightPercent) / 100),
      0
    );
    const laneTopY = laneBottomY - laneHeightPx;
    const judgeLineY = laneTopY + laneHeightPx * normalizeJudgeLinePositionRatio(judgeLinePositionRatio);
    return {
      viewportHeight: normalizedViewportHeight,
      laneTopY,
      laneBottomY,
      laneHeightPx,
      judgeLineY,
      judgeDistancePx: Math.max(judgeLineY - laneTopY, 0)
    };
  }
  function getGameJudgeLineY(viewportHeight, judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO, laneHeightPercent = DEFAULT_GAME_LANE_HEIGHT_PERCENT) {
    return getGameLaneGeometry(viewportHeight, judgeLinePositionRatio, laneHeightPercent).judgeLineY;
  }
  function getGameJudgeDistancePx(viewportHeight, judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO, laneHeightPercent = DEFAULT_GAME_LANE_HEIGHT_PERCENT) {
    return getGameLaneGeometry(viewportHeight, judgeLinePositionRatio, laneHeightPercent).judgeDistancePx;
  }
  function getGameJudgeLinePositionRatioFromPointer(pointerOffsetY, viewportHeight, laneHeightPercent = DEFAULT_GAME_LANE_HEIGHT_PERCENT) {
    const geometry = getGameLaneGeometry(
      viewportHeight,
      DEFAULT_JUDGE_LINE_POSITION_RATIO,
      laneHeightPercent
    );
    if (!(geometry.laneHeightPx > 0)) {
      return DEFAULT_JUDGE_LINE_POSITION_RATIO;
    }
    return normalizeJudgeLinePositionRatio(
      clamp((pointerOffsetY - geometry.laneTopY) / geometry.laneHeightPx, 0, 1)
    );
  }
  function getGameLaneHeightPercentFromPointer(pointerOffsetY, viewportHeight, fallbackLaneHeightPercent = DEFAULT_GAME_LANE_HEIGHT_PERCENT) {
    const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
    if (!(normalizedViewportHeight > 0)) {
      return normalizeGameLaneHeightPercent(fallbackLaneHeightPercent);
    }
    return normalizeGameLaneHeightPercent(
      clamp(pointerOffsetY / normalizedViewportHeight, 0, 1) * 100
    );
  }
  function getGameLaneCoverPermilleFromPointer(pointerOffsetY, viewportHeight, judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO, laneHeightPercent = DEFAULT_GAME_LANE_HEIGHT_PERCENT, fallbackLaneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE) {
    const geometry = getGameLaneGeometry(
      viewportHeight,
      judgeLinePositionRatio,
      laneHeightPercent
    );
    if (!(geometry.judgeDistancePx > 0)) {
      return normalizeGameLaneCoverPermille(fallbackLaneCoverPermille);
    }
    return normalizeGameLaneCoverPermille(
      clamp((pointerOffsetY - geometry.laneTopY) / geometry.judgeDistancePx, 0, 1) * 1e3
    );
  }
  function createScoreViewerModel(score, { bpmSummary = void 0, gameProfile = "game" } = {}) {
    if (!score) {
      return null;
    }
    const normalizedGameProfile = normalizeGameProfile(gameProfile);
    const profiledScore = normalizedGameProfile === "lunatic" ? createLunaticProfileScore(score) : score;
    const rawAllNotes = profiledScore.notes.map((note) => ({ ...note })).sort(compareNoteLike);
    const rawBarLines = [...profiledScore.barLines].sort(compareTimedBeatLike);
    const rawBpmChanges = [...profiledScore.bpmChanges].sort(compareTimedBeatLike);
    const rawStops = [...profiledScore.stops].sort(compareTimedBeatLike);
    const rawScrollChanges = [...profiledScore.scrollChanges ?? []].sort(compareTimedBeatLike);
    const comboEvents = (profiledScore.comboEvents?.length > 0 ? profiledScore.comboEvents : createFallbackComboEvents(profiledScore.notes)).map((event) => ({ ...event })).sort(compareComboEvent).map((event, index) => ({
      ...event,
      combo: index + 1
    }));
    const longEndEventKeys = new Set(
      comboEvents.filter((event) => event.kind === "long-end").map(createTimedLaneKey)
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
      gameScrollIndex
    });
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
      gameScrollIndex,
      totalBeat,
      supportsEditorMode: Boolean(beatTimingIndex && Number.isFinite(totalBeat)),
      supportsGameMode: Boolean(beatTimingIndex && gameScrollIndex && Number.isFinite(totalBeat))
    };
  }
  function getScoreTotalDurationSec(score) {
    if (!score || typeof score !== "object") {
      return 0;
    }
    const totalDurationSec = Number.isFinite(score.totalDurationSec) ? score.totalDurationSec : null;
    const lastTimelineTimeSec = Number.isFinite(score.lastTimelineTimeSec) ? score.lastTimelineTimeSec : null;
    const lastPlayableTimeSec = Number.isFinite(score.lastPlayableTimeSec) ? score.lastPlayableTimeSec : 0;
    return Math.max(totalDurationSec ?? lastTimelineTimeSec ?? lastPlayableTimeSec, 0);
  }
  function getScoreTotalBeat(score) {
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
  function getClampedSelectedTimeSec(model, timeSec) {
    if (!model) {
      return 0;
    }
    const numericValue = Number.isFinite(timeSec) ? timeSec : 0;
    return clamp(numericValue, 0, getScoreTotalDurationSec(model.score));
  }
  function getClampedSelectedBeat(model, beat) {
    if (!model) {
      return 0;
    }
    const numericValue = Number.isFinite(beat) ? beat : 0;
    return clamp(numericValue, 0, model.totalBeat ?? 0);
  }
  function getBeatAtTimeSec(model, timeSec) {
    if (!model || !model.beatTimingIndex) {
      return 0;
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
    return getClampedSelectedBeat(model, model.beatTimingIndex.secondsToBeat(clampedTimeSec));
  }
  function getTimeSecForBeat(model, beat) {
    if (!model || !model.beatTimingIndex) {
      return 0;
    }
    const clampedBeat = getClampedSelectedBeat(model, beat);
    return clamp(model.beatTimingIndex.beatToSeconds(clampedBeat), 0, getScoreTotalDurationSec(model.score));
  }
  function getContentHeightPx(model, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return Math.max(1, viewportHeight);
    }
    return Math.max(
      Math.max(1, viewportHeight),
      Math.ceil(getScoreTotalDurationSec(model.score) * pixelsPerSecond + viewportHeight)
    );
  }
  function getEditorContentHeightPx(model, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    if (!model) {
      return Math.max(1, viewportHeight);
    }
    return Math.max(
      Math.max(1, viewportHeight),
      Math.ceil((model.totalBeat ?? 0) * pixelsPerBeat + viewportHeight)
    );
  }
  function getTimeSecForScrollTop(model, scrollTop, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return 0;
    }
    return getClampedSelectedTimeSec(model, scrollTop / pixelsPerSecond);
  }
  function getTimeSecForEditorScrollTop(model, scrollTop, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    if (!model) {
      return 0;
    }
    return getTimeSecForBeat(model, scrollTop / pixelsPerBeat);
  }
  function getScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return 0;
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
    const maxScrollTop = Math.max(0, getContentHeightPx(model, viewportHeight, pixelsPerSecond) - viewportHeight);
    return clamp(clampedTimeSec * pixelsPerSecond, 0, maxScrollTop);
  }
  function getEditorScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
    if (!model) {
      return 0;
    }
    const clampedBeat = getBeatAtTimeSec(model, timeSec);
    const maxScrollTop = Math.max(0, getEditorContentHeightPx(model, viewportHeight, pixelsPerBeat) - viewportHeight);
    return clamp(clampedBeat * pixelsPerBeat, 0, maxScrollTop);
  }
  function getVisibleTimeRange(model, selectedTimeSec, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND, judgeLineY = getJudgeLineY(viewportHeight)) {
    if (!model) {
      return { startTimeSec: 0, endTimeSec: 0 };
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
    const futureViewportSec = Math.max(judgeLineY, 0) / pixelsPerSecond;
    const pastViewportSec = Math.max(viewportHeight - judgeLineY, 0) / pixelsPerSecond;
    const overscanSec = Math.max(Math.max(futureViewportSec, pastViewportSec) * 0.35, 0.75);
    return {
      startTimeSec: Math.max(0, clampedTimeSec - pastViewportSec - overscanSec),
      endTimeSec: Math.min(getScoreTotalDurationSec(model.score), clampedTimeSec + futureViewportSec + overscanSec)
    };
  }
  function getEditorFrameStateForBeat(model, selectedBeat, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT, judgeLineY = getJudgeLineY(viewportHeight)) {
    if (!model) {
      return {
        selectedBeat: 0,
        startBeat: 0,
        endBeat: 0,
        viewportHeight: Math.max(viewportHeight, 0)
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
      viewportHeight
    };
  }
  function getEditorFrameState(model, selectedTimeSec, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT, judgeLineY = getJudgeLineY(viewportHeight)) {
    return getEditorFrameStateForBeat(
      model,
      getBeatAtTimeSec(model, selectedTimeSec),
      viewportHeight,
      pixelsPerBeat,
      judgeLineY
    );
  }
  function getGameTimingStateAtTimeSec(model, timeSec) {
    const statePoints = model?.gameTimingStatePoints ?? [];
    if (statePoints.length === 0) {
      return {
        bpm: resolvePositiveBpm(model?.bpmSummary?.startBpm),
        scrollRate: 1
      };
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
    const stateIndex = upperBoundByTime(statePoints, clampedTimeSec) - 1;
    if (stateIndex < 0) {
      return statePoints[0];
    }
    return statePoints[stateIndex];
  }
  function getGameHsFixBaseBpm(model, hsFixMode = DEFAULT_GAME_HS_FIX_MODE) {
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
  function getGameLaneCoverRatio(laneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE) {
    return normalizeGameLaneCoverPermille(laneCoverPermille) / 1e3;
  }
  function getGameHispeed(baseBpm, durationMs = DEFAULT_GAME_DURATION_MS, laneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE) {
    const resolvedBaseBpm = resolvePositiveBpm(baseBpm);
    const normalizedDurationMs = normalizeGameDurationMs(durationMs);
    const laneCoverRatio = getGameLaneCoverRatio(laneCoverPermille);
    if (!(resolvedBaseBpm > 0) || !(normalizedDurationMs > 0) || laneCoverRatio >= 1) {
      return 0;
    }
    return 24e4 / resolvedBaseBpm / normalizedDurationMs * (1 - laneCoverRatio);
  }
  function getGameTimingDerivedMetrics(model, gameTimingConfig = createDefaultGameTimingConfig(), { includeGreenNumberRange = false } = {}) {
    const normalizedConfig = normalizeGameTimingConfig(gameTimingConfig);
    const derivedMetrics = getOrCreateGameTimingDerivedMetrics(model, normalizedConfig);
    if (includeGreenNumberRange && derivedMetrics.greenNumberRange === void 0) {
      derivedMetrics.greenNumberRange = computeGameGreenNumberRange(model, derivedMetrics);
    }
    return derivedMetrics;
  }
  function getGameSettingGreenNumber(durationMs = DEFAULT_GAME_DURATION_MS) {
    return Math.floor(normalizeGameDurationMs(durationMs) * 3 / 5);
  }
  function getGameLaneCoverHeightPx(viewportHeight, judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO, laneHeightPercent = DEFAULT_GAME_LANE_HEIGHT_PERCENT, laneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE) {
    return getGameJudgeDistancePx(
      viewportHeight,
      judgeLinePositionRatio,
      laneHeightPercent
    ) * getGameLaneCoverRatio(laneCoverPermille);
  }
  function getGameLaneCoverBounds(viewportHeight, judgeLinePositionRatio = DEFAULT_JUDGE_LINE_POSITION_RATIO, laneHeightPercent = DEFAULT_GAME_LANE_HEIGHT_PERCENT, laneCoverPermille = DEFAULT_GAME_LANE_COVER_PERMILLE) {
    const laneGeometry = getGameLaneGeometry(
      viewportHeight,
      judgeLinePositionRatio,
      laneHeightPercent
    );
    const rawBottomY = Math.min(
      laneGeometry.laneTopY + getGameLaneCoverHeightPx(
        viewportHeight,
        judgeLinePositionRatio,
        laneHeightPercent,
        laneCoverPermille
      ),
      laneGeometry.judgeLineY
    );
    const bottomY = clamp(Math.round(rawBottomY), laneGeometry.laneTopY, laneGeometry.laneBottomY);
    return {
      topY: laneGeometry.laneTopY,
      bottomY,
      heightPx: Math.max(bottomY - laneGeometry.laneTopY, 0),
      rawBottomY
    };
  }
  function hasViewerSelectionChanged(model, viewerMode, previousTimeSec, nextTimeSec, previousBeat = void 0, nextBeat = void 0) {
    const resolvedMode = resolveViewerModeForModel(model, viewerMode);
    if (resolvedMode === "editor" && model?.supportsEditorMode) {
      const normalizedPreviousBeat = Number.isFinite(previousBeat) ? getClampedSelectedBeat(model, previousBeat) : getBeatAtTimeSec(model, previousTimeSec);
      const normalizedNextBeat = Number.isFinite(nextBeat) ? getClampedSelectedBeat(model, nextBeat) : getBeatAtTimeSec(model, nextTimeSec);
      return Math.abs(normalizedNextBeat - normalizedPreviousBeat) >= BEAT_SELECTION_EPSILON;
    }
    return Math.abs(
      getClampedSelectedTimeSec(model, nextTimeSec) - getClampedSelectedTimeSec(model, previousTimeSec)
    ) >= TIME_SELECTION_EPSILON_SEC;
  }
  function createEditorMeasureRanges(barLines, totalBeat) {
    const sortedBarLines = [...barLines ?? []].filter((barLine) => Number.isFinite(barLine?.beat)).sort(compareTimedBeatLike);
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
  function getViewerCursor(model, selectedTimeSec, viewerMode = DEFAULT_VIEWER_MODE, selectedBeatOverride = void 0) {
    if (!model) {
      return {
        timeSec: 0,
        beat: 0,
        measureIndex: 0,
        totalMeasureIndex: 0,
        comboCount: 0,
        totalCombo: 0
      };
    }
    const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
    const totalMeasureIndex = getTotalMeasureIndex(model);
    const resolvedMode = resolveViewerModeForModel(model, viewerMode);
    const selectedBeat = Number.isFinite(selectedBeatOverride) ? getClampedSelectedBeat(model, selectedBeatOverride) : getBeatAtTimeSec(model, clampedTimeSec);
    return {
      timeSec: clampedTimeSec,
      beat: resolvedMode === "time" ? 0 : selectedBeat,
      measureIndex: Math.min(getMeasureIndexAtTime(model, clampedTimeSec), totalMeasureIndex),
      totalMeasureIndex,
      comboCount: getComboCountAtTime(model, clampedTimeSec),
      totalCombo: model.totalCombo
    };
  }
  function getMeasureIndexAtTime(model, timeSec) {
    if (!model || model.barLines.length === 0) {
      return 0;
    }
    const index = upperBoundByTime(model.barLines, timeSec) - 1;
    return Math.max(0, index);
  }
  function getComboCountAtTime(model, timeSec) {
    if (!model || model.comboEvents.length === 0) {
      return 0;
    }
    return upperBoundByTime(model.comboEvents, timeSec);
  }
  function shouldDrawLongEndCap(model, note) {
    if (!model || note?.kind !== "long" || !Number.isFinite(note?.endTimeSec)) {
      return false;
    }
    return model.longEndEventKeys.has(createTimedLaneKey(note.lane, note.endTimeSec, note.side));
  }
  function getEditorScrollTopForBeat(model, beat, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
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
    return notes.filter((note) => note.kind === "normal" || note.kind === "long").map((note) => ({
      lane: note.lane,
      beat: Number.isFinite(note.beat) ? note.beat : 0,
      timeSec: note.timeSec,
      kind: note.kind === "long" ? "long-start" : "normal",
      ...note.side ? { side: note.side } : {}
    }));
  }
  function normalizeGameProfile(value) {
    return value === "lunatic" ? "lunatic" : "game";
  }
  function createLunaticProfileScore(score) {
    if (!score || typeof score !== "object") {
      return score;
    }
    const baseTimingActions = createTimingActionsFromCanonicalScore(score);
    const transformedTimingActions = materializeTimingActionsForViewer(
      score.initialBpm,
      baseTimingActions.filter((action) => action?.type === "bpm" || action?.type === "stop").map((action) => action.type === "bpm" ? {
        type: "bpm",
        beat: action.beat,
        bpm: action.bpm
      } : {
        type: "stop",
        beat: action.beat,
        stopBeats: action.stopLunaticBehavior === "warp" ? LUNATIC_INVALID_STOP_WARP_BEATS : action.stopBeats,
        stopResolution: action.stopResolution,
        stopLunaticBehavior: action.stopLunaticBehavior
      })
    );
    const timingSeed = {
      initialBpm: score.initialBpm,
      timingActions: transformedTimingActions,
      bpmChanges: [],
      stops: [],
      scrollChanges: []
    };
    const beatTimingIndex = createBeatTimingIndex(timingSeed);
    if (!beatTimingIndex) {
      return {
        ...score,
        scrollChanges: [],
        timingActions: transformedTimingActions
      };
    }
    const notes = (score.notes ?? []).map((note) => transformLunaticNote(note, beatTimingIndex));
    const comboEvents = (score.comboEvents ?? []).map((event) => transformLunaticTimedBeatEvent(event, beatTimingIndex));
    const barLines = (score.barLines ?? []).map((event) => transformLunaticTimedBeatEvent(event, beatTimingIndex));
    const bpmChanges = buildBpmChangesFromTimingActionsForViewer(score.initialBpm, transformedTimingActions);
    const stops = buildStopsFromTimingActionsForViewer(transformedTimingActions);
    const lastPlayableTimeSec = notes.reduce((maxTimeSec, note) => Math.max(
      maxTimeSec,
      finiteOrZero(note.endTimeSec),
      finiteOrZero(note.timeSec)
    ), 0);
    const lastTimelineTimeSec = Math.max(
      lastPlayableTimeSec,
      ...barLines.map((event) => finiteOrZero(event.timeSec)),
      ...bpmChanges.map((event) => finiteOrZero(event.timeSec)),
      ...stops.map((event) => finiteOrZero(event.timeSec))
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
      lastTimelineTimeSec
    };
  }
  function transformLunaticTimedBeatEvent(event, beatTimingIndex) {
    if (!Number.isFinite(event?.beat)) {
      return { ...event };
    }
    return {
      ...event,
      timeSec: beatTimingIndex.beatToSeconds(event.beat)
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
    return transformedNote;
  }
  function materializeTimingActionsForViewer(initialBpm, actions) {
    const resolvedInitialBpm = Number.isFinite(initialBpm) && initialBpm > 0 ? initialBpm : null;
    if (!resolvedInitialBpm) {
      return actions.map((action) => ({ ...action }));
    }
    const sortedActions = [...actions ?? []].filter((action) => Number.isFinite(action?.beat)).sort(compareTimingAction);
    const materializedActions = [];
    let currentBeat = 0;
    let currentSeconds = 0;
    let currentBpm = resolvedInitialBpm;
    for (const action of sortedActions) {
      const actionBeat = Math.max(action.beat, currentBeat);
      currentSeconds += (actionBeat - currentBeat) * 60 / currentBpm;
      currentBeat = actionBeat;
      if (action.type === "bpm") {
        materializedActions.push({
          type: "bpm",
          beat: actionBeat,
          timeSec: currentSeconds,
          bpm: action.bpm
        });
        currentBpm = action.bpm;
        continue;
      }
      const stopBeats = Number.isFinite(action.stopBeats) && action.stopBeats > 0 ? action.stopBeats : 0;
      const durationSec = action.stopLunaticBehavior === "warp" ? 0 : stopBeats > 0 ? stopBeats * 60 / currentBpm : 0;
      materializedActions.push({
        type: "stop",
        beat: actionBeat,
        timeSec: currentSeconds,
        stopBeats,
        durationSec,
        stopResolution: action.stopResolution,
        stopLunaticBehavior: action.stopLunaticBehavior
      });
      if (action.stopLunaticBehavior === "warp") {
        currentBeat += stopBeats;
        continue;
      }
      currentSeconds += durationSec;
    }
    return materializedActions;
  }
  function buildBpmChangesFromTimingActionsForViewer(initialBpm, timingActions) {
    const changes = [];
    let currentBpm = Number.isFinite(initialBpm) && initialBpm > 0 ? initialBpm : null;
    for (const action of timingActions ?? []) {
      if (action?.type !== "bpm" || !Number.isFinite(action?.beat) || !Number.isFinite(action?.timeSec) || !Number.isFinite(action?.bpm) || action.bpm <= 0) {
        continue;
      }
      if (action.bpm !== currentBpm) {
        changes.push({
          beat: action.beat,
          timeSec: action.timeSec,
          bpm: action.bpm
        });
      }
      currentBpm = action.bpm;
    }
    return changes;
  }
  function buildStopsFromTimingActionsForViewer(timingActions) {
    return (timingActions ?? []).filter((action) => action?.type === "stop" && action?.stopLunaticBehavior !== "warp" && Number.isFinite(action?.beat) && Number.isFinite(action?.timeSec) && Number.isFinite(action?.durationSec) && action.durationSec > 0).map((action) => ({
      beat: action.beat,
      timeSec: action.timeSec + action.durationSec,
      stopBeats: action.stopBeats,
      durationSec: action.durationSec
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
      let actionTimeSec = Number.isFinite(action.timeSec) ? Math.max(action.timeSec, currentSeconds) : currentSeconds + (actionBeat - currentBeat) * 60 / currentBpm;
      if (actionBeat > currentBeat && actionTimeSec <= currentSeconds) {
        actionTimeSec = currentSeconds + (actionBeat - currentBeat) * 60 / currentBpm;
      }
      if (actionBeat > currentBeat) {
        const nextSeconds = actionTimeSec;
        const segment = {
          type: "linear",
          startSec: currentSeconds,
          endSec: nextSeconds,
          startBeat: currentBeat,
          endBeat: actionBeat
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
        const warpBeats = action.stopLunaticBehavior === "warp" && Number.isFinite(action.stopBeats) && action.stopBeats > 0 ? action.stopBeats : 0;
        if (warpBeats > 0) {
          const segment = {
            type: "warp",
            startSec: currentSeconds,
            endSec: currentSeconds,
            startBeat: currentBeat,
            endBeat: currentBeat + warpBeats
          };
          segments.push(segment);
          beatSegments.push(segment);
          currentBeat += warpBeats;
        } else {
          const stopDurationSec = Number.isFinite(action.durationSec) && action.durationSec > 0 ? action.durationSec : (action.stopBeats ?? 0) * 60 / currentBpm;
          if (stopDurationSec > 0) {
            segments.push({
              type: "stop",
              startSec: currentSeconds,
              endSec: currentSeconds + stopDurationSec,
              beat: currentBeat
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
            return segment.startSec + (normalizedBeat - segment.startBeat) * (segment.endSec - segment.startSec) / beatSpan;
          }
        }
        return currentSeconds + (normalizedBeat - currentBeat) * 60 / currentBpm;
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
            return segment.startBeat + (normalizedSeconds - segment.startSec) * (segment.endBeat - segment.startBeat) / secSpan;
          }
        }
        return currentBeat + (normalizedSeconds - currentSeconds) * currentBpm / 60;
      }
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
    for (const action of actions) {
      if (action?.type === "bpm") {
        if (Number.isFinite(action.beat) && Number.isFinite(action.timeSec) && Number.isFinite(action.bpm) && action.bpm > 0) {
          if (action.bpm !== currentBpm) {
            bpmChanges.push({
              beat: action.beat,
              timeSec: action.timeSec,
              bpm: action.bpm
            });
          }
          currentBpm = action.bpm;
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
        const warpBeats = Number.isFinite(action.stopBeats) && action.stopBeats > 0 ? action.stopBeats : LUNATIC_INVALID_STOP_WARP_BEATS;
        warps.push({
          beat: action.beat + warpBeats,
          timeSec: action.timeSec,
          warpBeats
        });
        continue;
      }
      const durationSec = Number.isFinite(action.durationSec) && action.durationSec > 0 ? action.durationSec : Number.isFinite(action.stopBeats) && action.stopBeats > 0 && Number.isFinite(currentBpm) && currentBpm > 0 ? action.stopBeats * 60 / currentBpm : null;
      if (!(durationSec > 0)) {
        continue;
      }
      stops.push({
        beat: action.beat,
        timeSec: action.timeSec,
        stopBeats: action.stopBeats,
        durationSec
      });
    }
    return { bpmChanges, stops, warps };
  }
  function resolveBpmSummary(score, bpmSummary = void 0) {
    const positiveBpms = collectPositiveBpms(score);
    const startBpm = resolvePositiveBpm(
      score?.initialBpm,
      positiveBpms[0],
      bpmSummary?.mainBpm
    );
    return {
      startBpm,
      minBpm: resolvePositiveBpm(
        bpmSummary?.minBpm,
        positiveBpms.length > 0 ? Math.min(...positiveBpms) : startBpm,
        startBpm
      ),
      maxBpm: resolvePositiveBpm(
        bpmSummary?.maxBpm,
        positiveBpms.length > 0 ? Math.max(...positiveBpms) : startBpm,
        startBpm
      ),
      mainBpm: resolvePositiveBpm(bpmSummary?.mainBpm, startBpm)
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
        pushPositiveBpm(action?.bpm);
      }
    }
    for (const bpmChange of score?.bpmChanges ?? []) {
      pushPositiveBpm(bpmChange?.bpm);
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
        scrollRate: currentScrollRate
      };
      if (statePoints.length > 0 && Math.abs(statePoints[statePoints.length - 1].timeSec - statePoint.timeSec) < 1e-6 && Math.abs(statePoints[statePoints.length - 1].beat - statePoint.beat) < 1e-6) {
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
      const nextBpm = point?.bpmChanges?.length > 0 ? getLastEffectiveBpmFromPoint(point.bpmChanges, currentBpm) : currentBpm;
      const nextScrollRate = point?.scrollChanges?.length > 0 ? getLastEffectiveScrollRateFromPoint(point.scrollChanges, currentScrollRate) : currentScrollRate;
      if (Math.abs(nextBpm - currentBpm) < 1e-6 && Math.abs(nextScrollRate - currentScrollRate) < 1e-6) {
        continue;
      }
      currentBpm = nextBpm;
      currentScrollRate = nextScrollRate;
      pushStatePoint(point?.beat, point?.timeSec);
    }
    return statePoints;
  }
  function createTimingActionsFromCanonicalScore(score) {
    return [...score?.timingActions ?? []].filter((action) => Number.isFinite(action?.beat) && action.type === "bpm" && Number.isFinite(action?.bpm) && action.bpm > 0 || Number.isFinite(action?.beat) && action.type === "stop" && action?.stopResolution === "invalid" || Number.isFinite(action?.beat) && action.type === "stop" && Number.isFinite(action?.stopBeats) && action.stopBeats > 0).map((action) => {
      if (action.type === "bpm") {
        return {
          type: "bpm",
          beat: action.beat,
          timeSec: action.timeSec,
          bpm: action.bpm
        };
      }
      return {
        type: "stop",
        beat: action.beat,
        timeSec: action.timeSec,
        stopBeats: action.stopBeats,
        durationSec: action.durationSec,
        stopResolution: action.stopResolution,
        stopLunaticBehavior: action.stopLunaticBehavior
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
          bpm: event.bpm
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
        stopBeats: event.stopBeats
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
  function createGameScrollIndex(scrollChanges) {
    const actions = [...scrollChanges ?? []].filter((event) => Number.isFinite(event?.beat) && Number.isFinite(event?.rate)).sort(compareTimedBeatLike);
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
      }
    };
  }
  function createGameTimeline({ notes, barLines, bpmChanges, stops, warps, scrollChanges, gameScrollIndex }) {
    const pointMap = /* @__PURE__ */ new Map();
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
    const pointIndexByKey = /* @__PURE__ */ new Map();
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
      index: -1
    };
    pointMap.set(key, point);
    return point;
  }
  function createGameTimelinePointKey(beat, timeSec) {
    return `${Math.round((beat ?? 0) * 1e6)}:${Math.round((timeSec ?? 0) * 1e6)}`;
  }
  function createGamePointIndex(items) {
    return [...items ?? []].filter((item) => Number.isFinite(item?.trackPosition)).sort(compareTrackEvent);
  }
  function createGameLongBodyStartIndex(notes) {
    return [...notes ?? []].filter((note) => note?.kind === "long" && Number.isFinite(note?.trackPosition) && Number.isFinite(note?.endTrackPosition) && note.endTrackPosition > note.trackPosition).sort(compareTrackEvent);
  }
  function createGameLongEndIndex(notes) {
    return [...notes ?? []].filter((note) => note?.kind === "long" && Number.isFinite(note?.endTrackPosition)).sort(compareGameLongBodyEndTrack);
  }
  function annotateEventsWithGameTrackPosition(events, gameScrollIndex) {
    if (!gameScrollIndex) {
      return [...events];
    }
    return events.map((event) => ({
      ...event,
      ...Number.isFinite(event?.beat) ? { trackPosition: gameScrollIndex.beatToDisplacement(event.beat) } : {}
    }));
  }
  function annotateNotesWithGameTrackPosition(notes, gameScrollIndex) {
    if (!gameScrollIndex) {
      return [...notes];
    }
    return notes.map((note) => ({
      ...note,
      ...Number.isFinite(note?.beat) ? { trackPosition: gameScrollIndex.beatToDisplacement(note.beat) } : {},
      ...Number.isFinite(note?.endBeat) ? { endTrackPosition: gameScrollIndex.beatToDisplacement(note.endBeat) } : {}
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
  function createTimedLaneKey(input, timeSec, side = void 0) {
    if (typeof input === "object" && input !== null) {
      return createTimedLaneKey(input.lane, input.timeSec ?? input.endTimeSec, input.side);
    }
    return `${side ?? "-"}:${input}:${Math.round((timeSec ?? 0) * 1e6)}`;
  }
  function getGameCurrentDurationForTimingState(statePoint, derivedMetrics) {
    const currentBpm = Number.isFinite(statePoint?.bpm) && statePoint.bpm > 0 ? statePoint.bpm : 0;
    const currentScrollRate = Number.isFinite(statePoint?.scrollRate) ? statePoint.scrollRate : 1;
    const hispeed = derivedMetrics?.hispeed ?? 0;
    const laneCoverRatio = derivedMetrics?.laneCoverRatio ?? 0;
    if (!(currentBpm > 0) || !(currentScrollRate > 0) || !(hispeed > 0) || laneCoverRatio >= 1) {
      return 0;
    }
    const regionMs = 24e4 / currentBpm / hispeed / currentScrollRate;
    return Math.max(regionMs * (1 - laneCoverRatio), 0);
  }
  function getOrCreateGameTimingDerivedMetrics(model, normalizedConfig) {
    if (!model) {
      return createGameTimingDerivedMetrics(model, normalizedConfig);
    }
    const cacheKey = createGameTimingDerivedMetricsCacheKey(normalizedConfig);
    let metricsByConfig = gameTimingDerivedMetricsCacheByModel.get(model);
    if (!metricsByConfig) {
      metricsByConfig = /* @__PURE__ */ new Map();
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
        normalizedConfig.laneCoverPermille
      ),
      laneCoverRatio: getGameLaneCoverRatio(normalizedConfig.laneCoverPermille),
      greenNumberRange: void 0
    };
  }
  function createGameTimingDerivedMetricsCacheKey(normalizedConfig) {
    return [
      normalizedConfig.durationMs,
      normalizedConfig.laneHeightPercent,
      normalizedConfig.laneCoverPermille,
      normalizedConfig.laneCoverVisible ? 1 : 0,
      normalizedConfig.hsFixMode
    ].join("|");
  }
  function computeGameGreenNumberRange(model, derivedMetrics) {
    const statePoints = model?.gameTimingStatePoints?.length > 0 ? model.gameTimingStatePoints : [createFallbackGameTimingState(model)];
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
      minGreenNumber
    };
  }
  function createFallbackGameTimingState(model) {
    return {
      beat: 0,
      timeSec: 0,
      bpm: resolvePositiveBpm(model?.bpmSummary?.startBpm),
      scrollRate: 1
    };
  }
  function getGameCurrentGreenNumberForTimingState(statePoint, derivedMetrics) {
    return Math.round(getGameCurrentDurationForTimingState(statePoint, derivedMetrics) * GAME_GREEN_NUMBER_RATIO);
  }
  function getLastEffectiveBpmFromPoint(bpmChanges, fallbackBpm) {
    for (let index = bpmChanges.length - 1; index >= 0; index -= 1) {
      const nextBpm = bpmChanges[index]?.bpm;
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

  // shared/preview-runtime/score-viewer-renderer.js
  var VIEWER_LANE_SIDE_PADDING = 6;
  var DP_GUTTER_UNITS = 1.2;
  var NOTE_WIDTH = 15;
  var SCRATCH_WIDTH = 30;
  var SEPARATOR_WIDTH = 1;
  var BAR_LINE_HEIGHT = 1;
  var BACKGROUND_FILL = "#000000";
  var DP_GUTTER_FILL = "#808080";
  var SEPARATOR_COLOR = "#404040";
  var BAR_LINE = "#ffffff";
  var EDITOR_BEAT_GRID_LINE = "#808080";
  var EDITOR_SIXTEENTH_GRID_LINE = "#404040";
  var BPM_MARKER = "#00ff00";
  var STOP_MARKER = "#ff00ff";
  var SCROLL_MARKER = "#ff0";
  var MINE_COLOR = "#880000";
  var INVISIBLE_NOTE_COLOR = "#FFFF00";
  var NOTE_HEAD_HEIGHT = 4;
  var TEMPO_MARKER_HEIGHT = 1;
  var TEMPO_MARKER_WIDTH = 8;
  var TEMPO_LABEL_GAP = 8;
  var TEMPO_LABEL_MIN_GAP = 12;
  var TEMPO_LABEL_FONT = '12px "Inconsolata", "Noto Sans JP"';
  var MEASURE_LABEL_COLOR = "#FFFFFF";
  var JUDGE_LINE_SIDE_OVERHANG = 48;
  var BEAT_LANE_COLORS = /* @__PURE__ */ new Map([
    ["0", "#e04a4a"],
    ["1", "#bebebe"],
    ["2", "#5074fe"],
    ["3", "#bebebe"],
    ["4", "#5074fe"],
    ["5", "#bebebe"],
    ["6", "#5074fe"],
    ["7", "#bebebe"],
    ["8", "#bebebe"],
    ["9", "#5074fe"],
    ["10", "#bebebe"],
    ["11", "#5074fe"],
    ["12", "#bebebe"],
    ["13", "#5074fe"],
    ["14", "#bebebe"],
    ["15", "#e04a4a"],
    ["g0", "#e04a4a"],
    ["g1", "#bebebe"],
    ["g2", "#5074fe"],
    ["g3", "#bebebe"],
    ["g4", "#5074fe"],
    ["g5", "#bebebe"],
    ["g6", "#bebebe"],
    ["g7", "#5074fe"],
    ["g8", "#bebebe"],
    ["g9", "#5074fe"],
    ["g10", "#bebebe"],
    ["g11", "#e04a4a"]
  ]);
  var POPN_LANE_COLORS = /* @__PURE__ */ new Map([
    ["p0", "#c4c4c4"],
    ["p1", "#fff500"],
    ["p2", "#99ff67"],
    ["p3", "#30b9f9"],
    ["p4", "#ff6c6c"],
    ["p5", "#30b9f9"],
    ["p6", "#99ff67"],
    ["p7", "#fff500"],
    ["p8", "#c4c4c4"]
  ]);
  var DEFAULT_RENDERER_CONFIG = Object.freeze({
    noteWidth: NOTE_WIDTH,
    scratchWidth: SCRATCH_WIDTH,
    noteHeight: NOTE_HEAD_HEIGHT,
    barLineHeight: BAR_LINE_HEIGHT,
    markerHeight: TEMPO_MARKER_HEIGHT,
    separatorWidth: SEPARATOR_WIDTH
  });
  var currentRendererConfig = DEFAULT_RENDERER_CONFIG;
  function createScoreViewerRenderer(canvas) {
    const context = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let laneLayoutCache = {
      mode: null,
      laneCount: null,
      noteWidth: null,
      scratchWidth: null,
      separatorWidth: null,
      width: 0,
      layout: null
    };
    function resize(nextWidth, nextHeight) {
      width = Math.max(1, Math.floor(nextWidth));
      height = Math.max(1, Math.floor(nextHeight));
      dpr = typeof window === "undefined" ? 1 : Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      laneLayoutCache = {
        mode: null,
        laneCount: null,
        noteWidth: null,
        scratchWidth: null,
        separatorWidth: null,
        width: 0,
        layout: null
      };
    }
    function render(model, selectedTimeSec, {
      viewerMode = DEFAULT_VIEWER_MODE,
      pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND,
      pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
      editorFrameState = null,
      showInvisibleNotes = false,
      judgeLineY = getJudgeLineY(height, DEFAULT_JUDGE_LINE_POSITION_RATIO),
      gameTimingConfig = createDefaultGameTimingConfig(),
      rendererConfig = void 0
    } = {}) {
      return withRendererConfig(rendererConfig, () => {
        context.clearRect(0, 0, width, height);
        context.fillStyle = BACKGROUND_FILL;
        context.fillRect(0, 0, width, height);
        if (!model) {
          return createEmptyRenderResult();
        }
        const laneLayout = getCachedLaneLayout(model.score.mode, model.score.laneCount);
        const resolvedMode = resolveViewerModeForModel(model, viewerMode);
        if (resolvedMode === "time") {
          return renderTimeMode(model, laneLayout, selectedTimeSec, pixelsPerSecond, showInvisibleNotes, judgeLineY);
        }
        if (resolvedMode === "game" || resolvedMode === "lunatic") {
          return renderGameMode(model, laneLayout, selectedTimeSec, showInvisibleNotes, judgeLineY, gameTimingConfig);
        }
        return renderEditorMode(
          model,
          laneLayout,
          editorFrameState ?? getEditorFrameState(model, selectedTimeSec, height, pixelsPerBeat, judgeLineY),
          pixelsPerBeat,
          showInvisibleNotes,
          judgeLineY
        );
      });
    }
    return { resize, render };
    function renderTimeMode(model, laneLayout, selectedTimeSec, pixelsPerSecond, showInvisibleNotes, judgeLineY) {
      const { lanes } = laneLayout;
      const { startTimeSec, endTimeSec } = getVisibleTimeRange(
        model,
        selectedTimeSec,
        height,
        pixelsPerSecond,
        judgeLineY
      );
      drawDpGutter(context, laneLayout, height);
      drawLaneSeparators(context, lanes, height);
      drawBarLinesTimeMode(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY);
      drawMeasureLabelsTimeMode(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY);
      drawTempoMarkersTimeMode(
        context,
        model.bpmChanges,
        model.stops,
        model.warps ?? [],
        model.scrollChanges,
        lanes,
        selectedTimeSec,
        startTimeSec,
        endTimeSec,
        height,
        pixelsPerSecond,
        judgeLineY
      );
      drawLongBodiesTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY);
      drawNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY);
      if (showInvisibleNotes) {
        drawInvisibleNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY);
      }
      return {
        markers: [],
        laneBounds: getLaneBounds(laneLayout)
      };
    }
    function renderEditorMode(model, laneLayout, editorFrameState, pixelsPerBeat, showInvisibleNotes, judgeLineY) {
      const { lanes } = laneLayout;
      drawEditorSubGrid(context, model.measureRanges, lanes, editorFrameState, pixelsPerBeat, judgeLineY);
      drawDpGutter(context, laneLayout, height);
      drawLaneSeparators(context, lanes, height);
      drawBarLinesEditorMode(context, model.barLines, lanes, editorFrameState, pixelsPerBeat, judgeLineY);
      drawMeasureLabelsEditorMode(context, model.barLines, lanes, editorFrameState, pixelsPerBeat, judgeLineY);
      drawTempoMarkersEditorMode(
        context,
        model,
        lanes,
        editorFrameState,
        pixelsPerBeat,
        judgeLineY
      );
      drawLongBodiesEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat, judgeLineY);
      drawNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat, judgeLineY);
      if (showInvisibleNotes) {
        drawInvisibleNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat, judgeLineY);
      }
      return {
        markers: [],
        laneBounds: getLaneBounds(laneLayout)
      };
    }
    function renderGameMode(model, laneLayout, selectedTimeSec, showInvisibleNotes, judgeLineY, gameTimingConfig) {
      const { lanes } = laneLayout;
      const normalizedGameTimingConfig = normalizeGameTimingConfig(gameTimingConfig);
      const laneGeometry = getGameLaneGeometry(
        height,
        getJudgeLineRatioFromGeometry(height, judgeLineY, normalizedGameTimingConfig.laneHeightPercent),
        normalizedGameTimingConfig.laneHeightPercent
      );
      const projection = collectGameProjection(model, selectedTimeSec, height, {
        gameTimingConfig: normalizedGameTimingConfig,
        laneGeometry
      });
      drawDpGutter(context, laneLayout, height, laneGeometry.laneTopY, laneGeometry.laneBottomY);
      drawLaneSeparators(context, lanes, height, laneGeometry.laneTopY, laneGeometry.laneBottomY);
      clipToGameRenderWindow(context, projection, width, () => {
        drawBarLinesGameMode(context, lanes, projection);
        drawMeasureLabelsGameMode(context, model.barLines, lanes, projection);
        drawTempoMarkersGameMode(context, lanes, projection);
        drawLongBodiesGameMode(context, model, lanes, projection);
        drawNoteHeadsGameMode(context, model, lanes, projection);
        if (showInvisibleNotes) {
          drawInvisibleNoteHeadsGameMode(context, lanes, projection);
        }
      });
      drawLaneCoverGameMode(context, laneLayout, projection);
      return {
        markers: [],
        laneBounds: getLaneBounds(laneLayout)
      };
    }
    function getCachedLaneLayout(mode, laneCount) {
      if (laneLayoutCache.mode === mode && laneLayoutCache.laneCount === laneCount && laneLayoutCache.noteWidth === currentRendererConfig.noteWidth && laneLayoutCache.scratchWidth === currentRendererConfig.scratchWidth && laneLayoutCache.separatorWidth === currentRendererConfig.separatorWidth && laneLayoutCache.width === width && laneLayoutCache.layout) {
        return laneLayoutCache.layout;
      }
      const layout = createLaneLayout(mode, laneCount, width);
      laneLayoutCache = {
        mode,
        laneCount,
        noteWidth: currentRendererConfig.noteWidth,
        scratchWidth: currentRendererConfig.scratchWidth,
        separatorWidth: currentRendererConfig.separatorWidth,
        width,
        layout
      };
      return layout;
    }
  }
  function estimateViewerWidth(mode, laneCount, rendererConfig = void 0) {
    return withRendererConfig(rendererConfig, () => {
      const layout = getModeLayout(mode, laneCount);
      const gutterWidth = layout.splitAfter === null ? 0 : getDpGutterWidth();
      const contentWidth = getDisplayLaneAreaWidth(layout.display) + gutterWidth;
      return Math.ceil(contentWidth + JUDGE_LINE_SIDE_OVERHANG * 2);
    });
  }
  function withRendererConfig(rendererConfig, callback) {
    const previousRendererConfig = currentRendererConfig;
    currentRendererConfig = normalizeRendererConfig(rendererConfig);
    try {
      return callback();
    } finally {
      currentRendererConfig = previousRendererConfig;
    }
  }
  function normalizeRendererConfig(rendererConfig = {}) {
    return {
      noteWidth: normalizeRendererDimension(rendererConfig?.noteWidth, NOTE_WIDTH),
      scratchWidth: normalizeRendererDimension(rendererConfig?.scratchWidth, SCRATCH_WIDTH),
      noteHeight: normalizeRendererDimension(rendererConfig?.noteHeight, NOTE_HEAD_HEIGHT),
      barLineHeight: normalizeRendererDimension(rendererConfig?.barLineHeight, BAR_LINE_HEIGHT),
      markerHeight: normalizeRendererDimension(rendererConfig?.markerHeight, TEMPO_MARKER_HEIGHT),
      separatorWidth: normalizeRendererDimension(rendererConfig?.separatorWidth, SEPARATOR_WIDTH)
    };
  }
  function areRendererConfigsEqual(left, right) {
    const normalizedLeft = normalizeRendererConfig(left);
    const normalizedRight = normalizeRendererConfig(right);
    return normalizedLeft.noteWidth === normalizedRight.noteWidth && normalizedLeft.scratchWidth === normalizedRight.scratchWidth && normalizedLeft.noteHeight === normalizedRight.noteHeight && normalizedLeft.barLineHeight === normalizedRight.barLineHeight && normalizedLeft.markerHeight === normalizedRight.markerHeight && normalizedLeft.separatorWidth === normalizedRight.separatorWidth;
  }
  function normalizeRendererDimension(value, defaultValue) {
    if (!Number.isFinite(value)) {
      return defaultValue;
    }
    return Math.max(0, Math.floor(value));
  }
  function getNoteWidth() {
    return currentRendererConfig.noteWidth;
  }
  function getScratchWidth() {
    return currentRendererConfig.scratchWidth;
  }
  function getSeparatorWidth() {
    return currentRendererConfig.separatorWidth;
  }
  function getNoteHeadHeight() {
    return currentRendererConfig.noteHeight;
  }
  function getBarLineHeight() {
    return currentRendererConfig.barLineHeight;
  }
  function getTempoMarkerHeight() {
    return currentRendererConfig.markerHeight;
  }
  function getLaneNoteWidth(isScratch = false) {
    return isScratch ? getScratchWidth() : getNoteWidth();
  }
  function getLaneSlotWidth(isScratch = false) {
    return getLaneNoteWidth(isScratch) + getSeparatorWidth();
  }
  function getDisplayLaneAreaWidth(displaySlots) {
    return displaySlots.reduce(
      (totalWidth, slot) => totalWidth + getLaneSlotWidth(Boolean(slot?.isScratch)),
      getSeparatorWidth()
    );
  }
  function getDpGutterWidth() {
    return getNoteWidth() * DP_GUTTER_UNITS;
  }
  function getLaneContentLeftX(lane) {
    return lane.x + getSeparatorWidth();
  }
  function getLaneContentWidth(lane) {
    return Math.max(lane.width - getSeparatorWidth(), 0);
  }
  function getLaneRightEdgeWithSeparator(lane) {
    return lane.x + lane.width + getSeparatorWidth();
  }
  function getSeparatorStrokeCenterX(boundaryX) {
    return boundaryX + getSeparatorWidth() / 2;
  }
  function drawBarLinesTimeMode(context, barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    const leftX = leftLane.x;
    const rightX = getLaneRightEdgeWithSeparator(rightLane);
    context.save();
    context.strokeStyle = BAR_LINE;
    context.lineWidth = getBarLineHeight();
    for (const barLine of barLines) {
      if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
        continue;
      }
      const y = Math.round(timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY)) - context.lineWidth / 2;
      context.beginPath();
      context.moveTo(leftX, y);
      context.lineTo(rightX, y);
      context.stroke();
    }
    context.restore();
  }
  function drawMeasureLabelsTimeMode(context, barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY) {
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!leftLane) {
      return;
    }
    const candidates = [];
    for (const [index, barLine] of barLines.entries()) {
      if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
        continue;
      }
      candidates.push({
        label: formatMeasureLabel(index),
        x: leftLane.x - TEMPO_LABEL_GAP,
        y: timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY)
      });
    }
    drawMeasureLabels(context, candidates);
  }
  function drawTempoMarkersTimeMode(context, bpmChanges, stops, warps, scrollChanges, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    let lastBpmLabelY = Number.POSITIVE_INFINITY;
    let lastStopLabelY = Number.POSITIVE_INFINITY;
    let lastScrollLabelY = Number.POSITIVE_INFINITY;
    context.save();
    context.fillStyle = BPM_MARKER;
    for (const bpmChange of bpmChanges) {
      if (bpmChange.timeSec < startTimeSec || bpmChange.timeSec > endTimeSec) {
        continue;
      }
      const y = timeToViewportY(bpmChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
      const markerRect = getTempoMarkerRect(rightLane, "right");
      context.fillRect(markerRect.x, Math.round(y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
      if (shouldKeepTempoMarkerLabel(lastBpmLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "bpm",
          timeSec: bpmChange.timeSec,
          y,
          label: formatBpmMarkerLabel(bpmChange.bpm),
          side: "right",
          color: BPM_MARKER,
          x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP
        });
        lastBpmLabelY = y;
      }
    }
    context.fillStyle = STOP_MARKER;
    for (const stop of stops) {
      if (stop.timeSec < startTimeSec || stop.timeSec > endTimeSec) {
        continue;
      }
      const y = timeToViewportY(stop.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(markerRect.x, Math.round(y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
      if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "stop",
          timeSec: stop.timeSec,
          y,
          label: formatStopMarkerLabel(stop.durationSec),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastStopLabelY = y;
      }
    }
    for (const warp of warps) {
      if (warp.timeSec < startTimeSec || warp.timeSec > endTimeSec) {
        continue;
      }
      const y = timeToViewportY(warp.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(markerRect.x, Math.round(y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
      if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "warp",
          timeSec: warp.timeSec,
          y,
          label: formatWarpMarkerLabel(),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastStopLabelY = y;
      }
    }
    context.fillStyle = SCROLL_MARKER;
    for (const scrollChange of scrollChanges) {
      if (scrollChange.timeSec < startTimeSec || scrollChange.timeSec > endTimeSec) {
        continue;
      }
      const y = timeToViewportY(scrollChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(markerRect.x, Math.round(y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
      if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "scroll",
          timeSec: scrollChange.timeSec,
          y,
          label: formatScrollMarkerLabel(scrollChange.rate),
          side: "left",
          color: SCROLL_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastScrollLabelY = y;
      }
    }
    context.restore();
  }
  function drawLongBodiesTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY) {
    context.save();
    for (const note of model.notes) {
      if (note.kind !== "long" || !Number.isFinite(note.endTimeSec)) {
        continue;
      }
      if (note.endTimeSec < startTimeSec || note.timeSec > endTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const startY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
      const endY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
      const topY = Math.max(Math.min(startY, endY), -getNoteHeadHeight() - 24);
      const bottomY = Math.min(Math.max(startY, endY), viewportHeight + getNoteHeadHeight() + 24);
      const bodyHeight = Math.max(bottomY - topY, 2);
      context.fillStyle = dimColor(lane.note, 0.42);
      const contentWidth = getLaneContentWidth(lane);
      if (!(contentWidth > 0)) {
        continue;
      }
      context.fillRect(getLaneContentLeftX(lane), topY, contentWidth, bodyHeight);
    }
    context.restore();
  }
  function drawNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY) {
    context.save();
    for (const note of model.notes) {
      const noteEndTimeSec = note.endTimeSec ?? note.timeSec;
      if (noteEndTimeSec < startTimeSec || note.timeSec > endTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane || note.kind === "invisible") {
        continue;
      }
      const headY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
      drawRectNote(context, lane, headY, note.kind === "mine" ? MINE_COLOR : lane.note);
      if (note.kind === "long" && Number.isFinite(note.endTimeSec) && shouldDrawLongEndCap(model, note)) {
        const endHeadY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
        drawRectNote(context, lane, endHeadY, lane.note);
      }
    }
    context.restore();
  }
  function drawInvisibleNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY) {
    context.save();
    context.strokeStyle = INVISIBLE_NOTE_COLOR;
    context.lineWidth = 1;
    for (const note of model.invisibleNotes ?? []) {
      if (note.timeSec < startTimeSec || note.timeSec > endTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const headY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
      drawOutlinedRectNote(context, lane, headY, INVISIBLE_NOTE_COLOR);
    }
    context.restore();
  }
  function collectGameProjection(model, selectedTimeSec, viewportHeight, options = {}, legacyJudgeLineY = void 0) {
    const normalizedOptions = normalizeGameProjectionOptions(viewportHeight, options, legacyJudgeLineY);
    const normalizedGameTimingConfig = normalizedOptions.gameTimingConfig;
    const resolvedLaneGeometry = normalizedOptions.laneGeometry;
    const derivedMetrics = getGameTimingDerivedMetrics(
      model,
      normalizedGameTimingConfig,
      { includeGreenNumberRange: normalizedGameTimingConfig.laneCoverVisible }
    );
    const currentTimingState = getGameTimingStateAtTimeSec(model, selectedTimeSec);
    const laneCoverBounds = getGameLaneCoverBounds(
      viewportHeight,
      getJudgeLineRatioFromGeometry(
        viewportHeight,
        resolvedLaneGeometry.judgeLineY,
        normalizedGameTimingConfig.laneHeightPercent
      ),
      normalizedGameTimingConfig.laneHeightPercent,
      normalizedGameTimingConfig.laneCoverPermille
    );
    const currentGreenNumber = normalizedGameTimingConfig.laneCoverVisible ? Math.round(getGameCurrentDurationForTimingState(currentTimingState, derivedMetrics) * GAME_GREEN_NUMBER_RATIO) : null;
    const projection = {
      selectedTimeSec,
      selectedTrackPosition: getBeatAtTimeSec(model, selectedTimeSec) / 4,
      viewportHeight: Math.max(viewportHeight, 0),
      laneTopY: resolvedLaneGeometry.laneTopY,
      laneBottomY: resolvedLaneGeometry.laneBottomY,
      renderTopY: resolvedLaneGeometry.laneTopY,
      renderBottomY: resolvedLaneGeometry.laneBottomY,
      judgeLineY: resolvedLaneGeometry.judgeLineY,
      judgeDistancePx: resolvedLaneGeometry.judgeDistancePx,
      laneCoverVisible: normalizedGameTimingConfig.laneCoverVisible,
      laneCoverTopY: laneCoverBounds.topY,
      laneCoverBottomY: laneCoverBounds.bottomY,
      laneCoverHeightPx: laneCoverBounds.heightPx,
      currentGreenNumber,
      greenNumberRange: normalizedGameTimingConfig.laneCoverVisible ? derivedMetrics.greenNumberRange : null,
      hsFixBaseBpm: derivedMetrics.hsFixBaseBpm,
      hispeed: derivedMetrics.hispeed,
      gameTimingConfig: normalizedGameTimingConfig,
      scanMargin: getNoteHeadHeight() + 24,
      points: [],
      pointYByIndex: /* @__PURE__ */ new Map(),
      exitPoint: null
    };
    if (!model?.gameTimeline?.length) {
      return projection;
    }
    const timeline = model.gameTimeline;
    const startIndex = lowerBoundGameTimelineByTime(timeline, selectedTimeSec);
    let y = projection.judgeLineY;
    const pixelsPerSection = projection.judgeDistancePx * projection.hispeed;
    for (let index = startIndex; index < timeline.length; index += 1) {
      const point = timeline[index];
      if (index > 0) {
        y -= getGameProjectionDeltaY(
          timeline[index - 1],
          point,
          selectedTimeSec,
          pixelsPerSection
        );
      } else {
        y -= getInitialGameProjectionDeltaY(point, selectedTimeSec, pixelsPerSection);
      }
      projection.pointYByIndex.set(index, y);
      if (isGameProjectionPastUpperBound(y, projection.renderTopY, projection.scanMargin)) {
        projection.exitPoint = { index, point, y };
        break;
      }
      if (!isViewportYVisible(y, projection.renderTopY, projection.renderBottomY, projection.scanMargin)) {
        continue;
      }
      projection.points.push({ index, point, y });
    }
    return projection;
  }
  function getInitialGameProjectionDeltaY(point, selectedTimeSec, pixelsPerSection) {
    const pointTimeSec = finiteOrZero2(point?.timeSec);
    if (!(pointTimeSec > 0)) {
      return 0;
    }
    const remainingRatio = clamp2(
      (pointTimeSec - selectedTimeSec) / pointTimeSec,
      0,
      1
    );
    return finiteOrZero2(point?.beat) / 4 * remainingRatio * pixelsPerSection;
  }
  function getGameProjectionDeltaY(previousPoint, point, selectedTimeSec, pixelsPerSection) {
    const deltaSection = (finiteOrZero2(point?.beat) - finiteOrZero2(previousPoint?.beat)) / 4;
    if (Math.abs(deltaSection) < 1e-9) {
      return 0;
    }
    const scrollRate = getGameProjectionScrollRate(previousPoint);
    if (finiteOrZero2(previousPoint?.timeSec) + finiteOrZero2(previousPoint?.stopDurationSec) > selectedTimeSec) {
      return deltaSection * scrollRate * pixelsPerSection;
    }
    const traversableDurationSec = finiteOrZero2(point?.timeSec) - finiteOrZero2(previousPoint?.timeSec) - finiteOrZero2(previousPoint?.stopDurationSec);
    if (!(traversableDurationSec > 0)) {
      return selectedTimeSec < finiteOrZero2(point?.timeSec) ? deltaSection * scrollRate * pixelsPerSection : 0;
    }
    const remainingRatio = clamp2(
      (finiteOrZero2(point?.timeSec) - selectedTimeSec) / traversableDurationSec,
      0,
      1
    );
    return deltaSection * scrollRate * remainingRatio * pixelsPerSection;
  }
  function isGameProjectionPastUpperBound(y, laneTopY, margin) {
    return y < laneTopY - Math.max(margin, 0);
  }
  function getGameProjectionScrollRate(point) {
    return Number.isFinite(point?.outgoingScrollRate) ? point.outgoingScrollRate : 1;
  }
  function drawBarLinesGameMode(context, lanes, projection) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    const leftX = leftLane.x;
    const rightX = getLaneRightEdgeWithSeparator(rightLane);
    context.save();
    context.strokeStyle = BAR_LINE;
    context.lineWidth = getBarLineHeight();
    for (const projectedPoint of projection.points) {
      if (!isGameProjectionYWithinRenderBounds(projectedPoint.y, projection)) {
        continue;
      }
      if (projectedPoint.point.barLines.length === 0) {
        continue;
      }
      for (const _barLine of projectedPoint.point.barLines) {
        context.beginPath();
        context.moveTo(leftX, Math.round(projectedPoint.y) - context.lineWidth / 2);
        context.lineTo(rightX, Math.round(projectedPoint.y) - context.lineWidth / 2);
        context.stroke();
      }
    }
    context.restore();
  }
  function drawMeasureLabelsGameMode(context, barLines, lanes, projection) {
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!leftLane) {
      return;
    }
    const barLineIndexByReference = new Map(barLines.map((barLine, index) => [barLine, index]));
    const candidates = [];
    for (const projectedPoint of projection.points) {
      if (!isGameProjectionYWithinRenderBounds(projectedPoint.y, projection)) {
        continue;
      }
      for (const barLine of projectedPoint.point.barLines) {
        const index = barLineIndexByReference.get(barLine);
        if (!Number.isInteger(index)) {
          continue;
        }
        candidates.push({
          label: formatMeasureLabel(index),
          x: leftLane.x - TEMPO_LABEL_GAP,
          y: projectedPoint.y
        });
      }
    }
    drawMeasureLabels(context, candidates);
  }
  function drawLongBodiesGameMode(context, model, lanes, projection) {
    context.save();
    for (const note of model.notes) {
      if (note.kind !== "long" || !Number.isFinite(note.endTimeSec) || note.endTimeSec <= projection.selectedTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const startY = getProjectedGameLongBodyStartY(note, projection);
      const endY = getProjectedGameLongBodyEndY(note, projection);
      if (!Number.isFinite(startY) || !Number.isFinite(endY)) {
        continue;
      }
      if (!(endY < startY - 1e-6)) {
        continue;
      }
      const topY = clamp2(Math.min(startY, endY), projection.renderTopY, projection.renderBottomY);
      const bottomY = clamp2(Math.max(startY, endY), projection.renderTopY, projection.renderBottomY);
      if (bottomY <= topY) {
        continue;
      }
      context.fillStyle = dimColor(lane.note, 0.42);
      const contentWidth = getLaneContentWidth(lane);
      if (!(contentWidth > 0)) {
        continue;
      }
      context.fillRect(getLaneContentLeftX(lane), topY, contentWidth, Math.max(bottomY - topY, 2));
    }
    context.restore();
  }
  function drawNoteHeadsGameMode(context, model, lanes, projection) {
    context.save();
    for (const projectedPoint of projection.points) {
      if (!isGameProjectionYWithinRenderBounds(projectedPoint.y, projection)) {
        continue;
      }
      for (const note of projectedPoint.point.notes) {
        const lane = lanes[note.lane];
        if (!lane || note.kind === "invisible") {
          continue;
        }
        drawRectNote(context, lane, projectedPoint.y, note.kind === "mine" ? MINE_COLOR : lane.note);
      }
      for (const note of projectedPoint.point.longEndNotes) {
        const lane = lanes[note.lane];
        if (!lane || !shouldDrawLongEndCap(model, note)) {
          continue;
        }
        drawRectNote(context, lane, projectedPoint.y, lane.note);
      }
    }
    context.restore();
  }
  function drawInvisibleNoteHeadsGameMode(context, lanes, projection) {
    context.save();
    context.strokeStyle = INVISIBLE_NOTE_COLOR;
    context.lineWidth = 1;
    for (const projectedPoint of projection.points) {
      if (!isGameProjectionYWithinRenderBounds(projectedPoint.y, projection)) {
        continue;
      }
      for (const note of projectedPoint.point.notes) {
        if (note.kind !== "invisible") {
          continue;
        }
        const lane = lanes[note.lane];
        if (!lane) {
          continue;
        }
        drawOutlinedRectNote(context, lane, projectedPoint.y, INVISIBLE_NOTE_COLOR);
      }
    }
    context.restore();
  }
  function drawTempoMarkersGameMode(context, lanes, projection) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    const bpmCandidates = [];
    const stopCandidates = [];
    const scrollCandidates = [];
    context.save();
    for (const projectedPoint of projection.points) {
      if (!isGameProjectionYWithinRenderBounds(projectedPoint.y, projection)) {
        continue;
      }
      context.fillStyle = BPM_MARKER;
      for (const bpmChange of projectedPoint.point.bpmChanges) {
        const markerRect = getTempoMarkerRect(rightLane, "right");
        context.fillRect(markerRect.x, Math.round(projectedPoint.y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
        bpmCandidates.push({
          type: "bpm",
          timeSec: bpmChange.timeSec,
          y: projectedPoint.y,
          label: formatBpmMarkerLabel(bpmChange.bpm),
          side: "right",
          color: BPM_MARKER,
          x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP
        });
      }
      context.fillStyle = STOP_MARKER;
      for (const stop of projectedPoint.point.stops) {
        const markerRect = getTempoMarkerRect(leftLane, "left");
        context.fillRect(markerRect.x, Math.round(projectedPoint.y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
        stopCandidates.push({
          type: "stop",
          timeSec: stop.timeSec,
          y: projectedPoint.y,
          label: formatStopMarkerLabel(stop.durationSec),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
      }
      for (const warp of projectedPoint.point.warps) {
        const markerRect = getTempoMarkerRect(leftLane, "left");
        context.fillRect(markerRect.x, Math.round(projectedPoint.y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
        stopCandidates.push({
          type: "warp",
          timeSec: warp.timeSec,
          y: projectedPoint.y,
          label: formatWarpMarkerLabel(),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
      }
      context.fillStyle = SCROLL_MARKER;
      for (const scrollChange of projectedPoint.point.scrollChanges) {
        const markerRect = getTempoMarkerRect(leftLane, "left");
        context.fillRect(markerRect.x, Math.round(projectedPoint.y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
        scrollCandidates.push({
          type: "scroll",
          timeSec: scrollChange.timeSec,
          y: projectedPoint.y,
          label: formatScrollMarkerLabel(scrollChange.rate),
          side: "left",
          color: SCROLL_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
      }
    }
    context.restore();
    drawSpacedTempoMarkerLabels(context, bpmCandidates);
    drawSpacedTempoMarkerLabels(context, stopCandidates);
    drawSpacedTempoMarkerLabels(context, scrollCandidates);
  }
  function getProjectedGameLongBodyStartY(note, projection) {
    const projectedStartY = projection.pointYByIndex.get(note.gameTimelineIndex);
    if (Number.isFinite(projectedStartY)) {
      return projectedStartY;
    }
    if (note.timeSec < projection.selectedTimeSec && note.endTimeSec > projection.selectedTimeSec) {
      return projection.judgeLineY;
    }
    return null;
  }
  function getProjectedGameLongBodyEndY(note, projection) {
    const projectedEndY = projection.pointYByIndex.get(note.gameTimelineEndIndex);
    if (Number.isFinite(projectedEndY)) {
      return projectedEndY;
    }
    if (projection.exitPoint && Number.isInteger(note.gameTimelineEndIndex) && note.gameTimelineEndIndex >= projection.exitPoint.index) {
      return clamp2(projection.exitPoint.y, projection.renderTopY, projection.renderBottomY);
    }
    return null;
  }
  function clipToGameRenderWindow(context, projection, viewportWidth, render) {
    const clipHeight = Math.max(projection.renderBottomY - projection.renderTopY, 0);
    if (!(clipHeight > 0)) {
      return;
    }
    context.save();
    context.beginPath();
    context.rect(0, projection.renderTopY, Math.max(viewportWidth, 0), clipHeight);
    context.clip();
    render();
    context.restore();
  }
  function isGameProjectionYWithinRenderBounds(y, projection) {
    return y >= projection.renderTopY && y <= projection.renderBottomY;
  }
  function drawLaneCoverGameMode(context, laneLayout, projection) {
    if (!projection.laneCoverVisible || !(projection.laneCoverHeightPx > 0)) {
      return;
    }
    const laneBounds = getLaneBounds(laneLayout);
    const coverLeftX = laneBounds.leftX;
    const coverWidth = Math.max(laneBounds.rightX - laneBounds.leftX + getSeparatorWidth(), 0);
    if (!(coverWidth > 0)) {
      return;
    }
    const coverTopY = projection.laneCoverTopY;
    const coverBottomY = projection.laneCoverBottomY;
    const coverHeight = Math.max(projection.laneCoverHeightPx, 0);
    if (!(coverHeight > 0)) {
      return;
    }
    context.save();
    context.fillStyle = "#2A2A2A";
    context.fillRect(coverLeftX, coverTopY, coverWidth, coverHeight);
    const currentGreenTextY = Math.max(coverTopY + 12, coverBottomY - 10);
    const rangeTextY = Math.max(coverTopY + 12, currentGreenTextY - 14);
    context.font = TEMPO_LABEL_FONT;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#FFFFFF";
    context.fillText(
      `${projection.greenNumberRange.maxGreenNumber} ～ ${projection.greenNumberRange.minGreenNumber}`,
      coverLeftX + coverWidth / 2,
      rangeTextY
    );
    context.fillStyle = "#00FF00";
    context.fillText(
      String(projection.currentGreenNumber),
      coverLeftX + coverWidth / 2,
      currentGreenTextY
    );
    context.restore();
  }
  function drawEditorSubGrid(context, measureRanges, lanes, editorFrameState, pixelsPerBeat, judgeLineY) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane || !Array.isArray(measureRanges) || measureRanges.length === 0) {
      return;
    }
    const leftX = leftLane.x;
    const rightX = getLaneRightEdgeWithSeparator(rightLane);
    const visibleGridLines = collectVisibleEditorGridLines(
      measureRanges,
      editorFrameState.startBeat,
      editorFrameState.endBeat
    );
    if (visibleGridLines.sixteenthBeats.length === 0 && visibleGridLines.beatBeats.length === 0) {
      return;
    }
    context.save();
    context.lineWidth = getBarLineHeight();
    context.strokeStyle = EDITOR_SIXTEENTH_GRID_LINE;
    for (const beat of visibleGridLines.sixteenthBeats) {
      const y = Math.round(beatToViewportY(beat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY)) - context.lineWidth / 2;
      context.beginPath();
      context.moveTo(leftX, y);
      context.lineTo(rightX, y);
      context.stroke();
    }
    context.strokeStyle = EDITOR_BEAT_GRID_LINE;
    for (const beat of visibleGridLines.beatBeats) {
      const y = Math.round(beatToViewportY(beat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY)) - context.lineWidth / 2;
      context.beginPath();
      context.moveTo(leftX, y);
      context.lineTo(rightX, y);
      context.stroke();
    }
    context.restore();
  }
  function drawBarLinesEditorMode(context, barLines, lanes, editorFrameState, pixelsPerBeat, judgeLineY) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    const leftX = leftLane.x;
    const rightX = getLaneRightEdgeWithSeparator(rightLane);
    const visibleWindow = getBeatWindowIndices(barLines, editorFrameState.startBeat, editorFrameState.endBeat);
    context.save();
    context.strokeStyle = BAR_LINE;
    context.lineWidth = getBarLineHeight();
    for (let index = visibleWindow.startIndex; index < visibleWindow.endIndex; index += 1) {
      const barLine = barLines[index];
      const y = Math.round(beatToViewportY(barLine.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY)) - context.lineWidth / 2;
      context.beginPath();
      context.moveTo(leftX, y);
      context.lineTo(rightX, y);
      context.stroke();
    }
    context.restore();
  }
  function drawMeasureLabelsEditorMode(context, barLines, lanes, editorFrameState, pixelsPerBeat, judgeLineY) {
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!leftLane) {
      return;
    }
    const visibleWindow = getBeatWindowIndices(barLines, editorFrameState.startBeat, editorFrameState.endBeat);
    const candidates = [];
    for (let index = visibleWindow.startIndex; index < visibleWindow.endIndex; index += 1) {
      const barLine = barLines[index];
      candidates.push({
        label: formatMeasureLabel(index),
        x: leftLane.x - TEMPO_LABEL_GAP,
        y: beatToViewportY(barLine.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY)
      });
    }
    drawMeasureLabels(context, candidates);
  }
  function drawTempoMarkersEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat, judgeLineY) {
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return;
    }
    let lastBpmLabelY = Number.POSITIVE_INFINITY;
    let lastStopLabelY = Number.POSITIVE_INFINITY;
    let lastScrollLabelY = Number.POSITIVE_INFINITY;
    const bpmWindow = getBeatWindowIndices(model.bpmChanges, editorFrameState.startBeat, editorFrameState.endBeat);
    const stopWindow = getBeatWindowIndices(model.stops, editorFrameState.startBeat, editorFrameState.endBeat);
    const warpWindow = getBeatWindowIndices(model.warps ?? [], editorFrameState.startBeat, editorFrameState.endBeat);
    const scrollWindow = getBeatWindowIndices(model.scrollChanges, editorFrameState.startBeat, editorFrameState.endBeat);
    context.save();
    context.fillStyle = BPM_MARKER;
    for (let index = bpmWindow.startIndex; index < bpmWindow.endIndex; index += 1) {
      const bpmChange = model.bpmChanges[index];
      const y = beatToViewportY(bpmChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      const markerRect = getTempoMarkerRect(rightLane, "right");
      context.fillRect(
        markerRect.x,
        Math.round(y - getTempoMarkerHeight()),
        markerRect.width,
        getTempoMarkerHeight()
      );
      if (shouldKeepTempoMarkerLabel(lastBpmLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "bpm",
          timeSec: bpmChange.timeSec,
          y,
          label: formatBpmMarkerLabel(bpmChange.bpm),
          side: "right",
          color: BPM_MARKER,
          x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP
        });
        lastBpmLabelY = y;
      }
    }
    context.fillStyle = STOP_MARKER;
    for (let index = stopWindow.startIndex; index < stopWindow.endIndex; index += 1) {
      const stop = model.stops[index];
      const y = beatToViewportY(stop.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(
        markerRect.x,
        Math.round(y - getTempoMarkerHeight()),
        markerRect.width,
        getTempoMarkerHeight()
      );
      if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "stop",
          timeSec: stop.timeSec,
          y,
          label: formatStopMarkerLabel(stop.durationSec),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastStopLabelY = y;
      }
    }
    for (let index = warpWindow.startIndex; index < warpWindow.endIndex; index += 1) {
      const warp = model.warps[index];
      const y = beatToViewportY(warp.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(
        markerRect.x,
        Math.round(y - getTempoMarkerHeight()),
        markerRect.width,
        getTempoMarkerHeight()
      );
      if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "warp",
          timeSec: warp.timeSec,
          y,
          label: formatWarpMarkerLabel(),
          side: "left",
          color: STOP_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastStopLabelY = y;
      }
    }
    context.fillStyle = SCROLL_MARKER;
    for (let index = scrollWindow.startIndex; index < scrollWindow.endIndex; index += 1) {
      const scrollChange = model.scrollChanges[index];
      const y = beatToViewportY(scrollChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(
        markerRect.x,
        Math.round(y - getTempoMarkerHeight()),
        markerRect.width,
        getTempoMarkerHeight()
      );
      if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
        drawTempoMarkerLabel(context, {
          type: "scroll",
          timeSec: scrollChange.timeSec,
          y,
          label: formatScrollMarkerLabel(scrollChange.rate),
          side: "left",
          color: SCROLL_MARKER,
          x: leftLane.x - TEMPO_LABEL_GAP
        });
        lastScrollLabelY = y;
      }
    }
    context.restore();
  }
  function shouldKeepTempoMarkerLabel(lastAcceptedY, nextY) {
    return !Number.isFinite(lastAcceptedY) || Math.abs(nextY - lastAcceptedY) >= TEMPO_LABEL_MIN_GAP;
  }
  function getTempoMarkerRect(lane, side) {
    const width = TEMPO_MARKER_WIDTH;
    if (side === "left") {
      return {
        x: lane.x + getSeparatorWidth() - width,
        width
      };
    }
    return {
      x: lane.x + lane.width,
      width
    };
  }
  function drawLongBodiesEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat, judgeLineY) {
    context.save();
    const candidateWindow = getLongBodyWindow(model, editorFrameState.startBeat, editorFrameState.endBeat);
    for (let index = candidateWindow.startIndex; index < candidateWindow.endIndex; index += 1) {
      const note = candidateWindow.items[index];
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const noteStartBeat = note.beat ?? 0;
      const noteEndBeat = getNoteEndBeat(note);
      if (noteEndBeat < editorFrameState.startBeat || noteStartBeat > editorFrameState.endBeat) {
        continue;
      }
      const startY = beatToViewportY(noteStartBeat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      const endY = beatToViewportY(noteEndBeat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      const topY = Math.max(Math.min(startY, endY), -getNoteHeadHeight() - 24);
      const bottomY = Math.min(Math.max(startY, endY), editorFrameState.viewportHeight + getNoteHeadHeight() + 24);
      const bodyHeight = Math.max(bottomY - topY, 2);
      context.fillStyle = dimColor(lane.note, 0.42);
      const contentWidth = getLaneContentWidth(lane);
      if (!(contentWidth > 0)) {
        continue;
      }
      context.fillRect(getLaneContentLeftX(lane), topY, contentWidth, bodyHeight);
    }
    context.restore();
  }
  function drawNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat, judgeLineY) {
    context.save();
    const noteWindow = getBeatWindowIndices(model.notesByBeat, editorFrameState.startBeat, editorFrameState.endBeat);
    for (let index = noteWindow.startIndex; index < noteWindow.endIndex; index += 1) {
      const note = model.notesByBeat[index];
      const lane = lanes[note.lane];
      if (!lane || note.kind === "invisible") {
        continue;
      }
      const headY = beatToViewportY(note.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      drawRectNote(context, lane, headY, note.kind === "mine" ? MINE_COLOR : lane.note);
    }
    const longEndWindow = getBeatWindowIndices(model.longNotesByEndBeat, editorFrameState.startBeat, editorFrameState.endBeat, getNoteEndBeat);
    for (let index = longEndWindow.startIndex; index < longEndWindow.endIndex; index += 1) {
      const note = model.longNotesByEndBeat[index];
      const lane = lanes[note.lane];
      if (!lane || !shouldDrawLongEndCap(model, note)) {
        continue;
      }
      const endHeadY = beatToViewportY(getNoteEndBeat(note), editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      drawRectNote(context, lane, endHeadY, lane.note);
    }
    context.restore();
  }
  function drawInvisibleNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat, judgeLineY) {
    context.save();
    context.strokeStyle = INVISIBLE_NOTE_COLOR;
    context.lineWidth = 1;
    const noteWindow = getBeatWindowIndices(model.invisibleNotesByBeat ?? [], editorFrameState.startBeat, editorFrameState.endBeat);
    for (let index = noteWindow.startIndex; index < noteWindow.endIndex; index += 1) {
      const note = model.invisibleNotesByBeat[index];
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const headY = beatToViewportY(note.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
      drawOutlinedRectNote(context, lane, headY, INVISIBLE_NOTE_COLOR);
    }
    context.restore();
  }
  function drawRectNote(context, lane, y, color) {
    const contentWidth = getLaneContentWidth(lane);
    if (!(contentWidth > 0)) {
      return;
    }
    context.fillStyle = color;
    context.fillRect(getLaneContentLeftX(lane), Math.round(y - getNoteHeadHeight()), contentWidth, getNoteHeadHeight());
  }
  function drawOutlinedRectNote(context, lane, y, color) {
    const contentWidth = getLaneContentWidth(lane);
    if (!(contentWidth > 0)) {
      return;
    }
    const topY = Math.round(y - getNoteHeadHeight());
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(
      getLaneContentLeftX(lane) + 0.5,
      topY + 0.5,
      Math.max(contentWidth - 1, 0),
      Math.max(getNoteHeadHeight() - 1, 1)
    );
  }
  function drawSpacedTempoMarkerLabels(context, candidates) {
    let lastAcceptedY = Number.POSITIVE_INFINITY;
    for (const candidate of [...candidates].sort((left, right) => left.y - right.y)) {
      if (!shouldKeepTempoMarkerLabel(lastAcceptedY, candidate.y)) {
        continue;
      }
      drawTempoMarkerLabel(context, candidate);
      lastAcceptedY = candidate.y;
    }
  }
  function drawMeasureLabels(context, candidates) {
    let lastAcceptedY = Number.POSITIVE_INFINITY;
    context.save();
    context.font = TEMPO_LABEL_FONT;
    context.fillStyle = MEASURE_LABEL_COLOR;
    context.textBaseline = "bottom";
    context.textAlign = "right";
    for (const candidate of [...candidates].sort((left, right) => left.y - right.y)) {
      if (!shouldKeepTempoMarkerLabel(lastAcceptedY, candidate.y)) {
        continue;
      }
      context.fillText(candidate.label, candidate.x, candidate.y);
      lastAcceptedY = candidate.y;
    }
    context.restore();
  }
  function drawTempoMarkerLabel(context, marker) {
    context.save();
    context.font = TEMPO_LABEL_FONT;
    context.fillStyle = marker.color;
    context.textBaseline = "middle";
    context.textAlign = marker.side === "left" ? "right" : "left";
    context.fillText(marker.label, marker.x, marker.y);
    context.restore();
  }
  function drawLaneSeparators(context, lanes, viewportHeight, topY = 0, bottomY = viewportHeight) {
    if (lanes.length === 0) {
      return;
    }
    const separatorWidth = getSeparatorWidth();
    if (!(separatorWidth > 0)) {
      return;
    }
    context.save();
    context.strokeStyle = SEPARATOR_COLOR;
    context.lineWidth = separatorWidth;
    const startY = Math.max(Number.isFinite(topY) ? topY : 0, 0);
    const endY = Math.min(Number.isFinite(bottomY) ? bottomY : viewportHeight, viewportHeight);
    if (endY <= startY) {
      context.restore();
      return;
    }
    const uniqueBoundaries = /* @__PURE__ */ new Set();
    uniqueBoundaries.add(Math.round(lanes[0].x));
    for (const lane of lanes) {
      uniqueBoundaries.add(Math.round(lane.x));
      uniqueBoundaries.add(Math.round(lane.x + lane.width));
    }
    for (const x of [...uniqueBoundaries].sort((left, right) => left - right)) {
      context.beginPath();
      const strokeCenterX = getSeparatorStrokeCenterX(x);
      context.moveTo(strokeCenterX, startY);
      context.lineTo(strokeCenterX, endY);
      context.stroke();
    }
    context.restore();
  }
  function getLaneBounds(laneLayout) {
    const lanes = laneLayout?.lanes ?? [];
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!leftLane || !rightLane) {
      return {
        leftX: 0,
        rightX: 0
      };
    }
    return {
      leftX: leftLane.x,
      rightX: rightLane.x + rightLane.width
    };
  }
  function drawDpGutter(context, laneLayout, viewportHeight, topY = 0, bottomY = viewportHeight) {
    const gutterRect = laneLayout?.gutterRect;
    if (!gutterRect || !(gutterRect.width > 0)) {
      return;
    }
    const startY = Math.max(Number.isFinite(topY) ? topY : 0, 0);
    const endY = Math.min(Number.isFinite(bottomY) ? bottomY : viewportHeight, viewportHeight);
    if (endY <= startY) {
      return;
    }
    context.save();
    context.fillStyle = DP_GUTTER_FILL;
    context.fillRect(gutterRect.x, startY, gutterRect.width, endY - startY);
    context.restore();
  }
  function getVisualLaneEdges(lanes) {
    const visibleLanes = lanes.filter(Boolean);
    if (visibleLanes.length === 0) {
      return { leftLane: null, rightLane: null };
    }
    let leftLane = visibleLanes[0];
    let rightLane = visibleLanes[0];
    for (const lane of visibleLanes) {
      if (lane.x < leftLane.x) {
        leftLane = lane;
      }
      if (lane.x + lane.width > rightLane.x + rightLane.width) {
        rightLane = lane;
      }
    }
    return { leftLane, rightLane };
  }
  function createEmptyRenderResult() {
    return {
      markers: [],
      laneBounds: {
        leftX: 0,
        rightX: 0
      }
    };
  }
  function createLaneLayout(mode, laneCount, viewportWidth) {
    const layout = getModeLayout(mode, laneCount);
    const gutterWidth = layout.splitAfter === null ? 0 : getDpGutterWidth();
    const contentWidth = getDisplayLaneAreaWidth(layout.display) + gutterWidth;
    const startX = Math.max(VIEWER_LANE_SIDE_PADDING, Math.floor((viewportWidth - contentWidth) / 2));
    const lanes = new Array(Math.max(1, laneCount));
    let gutterRect = null;
    let cursorX = startX;
    for (let slotIndex = 0; slotIndex < layout.display.length; slotIndex += 1) {
      if (layout.splitAfter !== null && slotIndex === layout.splitAfter) {
        gutterRect = {
          x: cursorX,
          width: gutterWidth
        };
        cursorX += gutterWidth;
      }
      const slot = layout.display[slotIndex];
      const slotWidth = getLaneSlotWidth(slot.isScratch);
      lanes[slot.actualLane] = {
        lane: slot.actualLane,
        x: cursorX,
        width: slotWidth,
        note: slot.note
      };
      cursorX += slotWidth;
    }
    return {
      lanes,
      gutterRect
    };
  }
  function getModeLayout(mode, laneCount) {
    switch (mode) {
      case "5k":
        return createDisplayLayout([0, 1, 2, 3, 4, 5], null, (slotIndex) => getBeatNoteColor(`g${slotIndex}`), (slotIndex) => `g${slotIndex}`);
      case "7k":
        return createDisplayLayout([0, 1, 2, 3, 4, 5, 6, 7], null, (slotIndex) => getBeatNoteColor(String(slotIndex)), (slotIndex) => String(slotIndex));
      case "10k":
        return createDisplayLayout(
          [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 6],
          6,
          (slotIndex) => getBeatNoteColor(`g${slotIndex}`),
          (slotIndex) => `g${slotIndex}`
        );
      case "14k":
        return createDisplayLayout(
          [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8],
          8,
          (slotIndex) => getBeatNoteColor(String(slotIndex)),
          (slotIndex) => String(slotIndex)
        );
      case "popn-5k":
        return createDisplayLayout([0, 1, 2, 3, 4], null, (slotIndex) => getPopnNoteColor(slotIndex), (slotIndex) => `p${slotIndex}`);
      case "popn-9k":
      case "9k":
        return createDisplayLayout(
          Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
          null,
          (slotIndex) => getPopnNoteColor(slotIndex),
          (slotIndex) => `p${slotIndex}`
        );
      default:
        return createDisplayLayout(
          Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
          null,
          () => "#bebebe",
          (_slotIndex, actualLane) => String(actualLane)
        );
    }
  }
  function createDisplayLayout(displayOrder, splitAfter, getColor, getLaneKey = (_slotIndex, actualLane) => String(actualLane)) {
    return {
      splitAfter,
      display: displayOrder.map((actualLane, slotIndex) => ({
        actualLane,
        laneKey: getLaneKey(slotIndex, actualLane),
        isScratch: isScratchLaneKey(getLaneKey(slotIndex, actualLane)),
        note: getColor(slotIndex)
      }))
    };
  }
  function isScratchLaneKey(laneKey) {
    return laneKey === "0" || laneKey === "15" || laneKey === "g0" || laneKey === "g11";
  }
  function getBeatNoteColor(key) {
    return BEAT_LANE_COLORS.get(key) ?? "#bebebe";
  }
  function getPopnNoteColor(slotIndex) {
    return POPN_LANE_COLORS.get(`p${slotIndex}`) ?? "#c4c4c4";
  }
  function timeToViewportY(eventTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY = getJudgeLineY(viewportHeight)) {
    return judgeLineY - (eventTimeSec - selectedTimeSec) * pixelsPerSecond;
  }
  function beatToViewportY(eventBeat, selectedBeat, viewportHeight, pixelsPerBeat, judgeLineY = getJudgeLineY(viewportHeight)) {
    return judgeLineY - (eventBeat - selectedBeat) * pixelsPerBeat;
  }
  function getJudgeLineRatioFromGeometry(viewportHeight, judgeLineY, laneHeightPercent) {
    const laneGeometry = getGameLaneGeometry(
      viewportHeight,
      DEFAULT_JUDGE_LINE_POSITION_RATIO,
      laneHeightPercent
    );
    if (!(laneGeometry.laneHeightPx > 0)) {
      return DEFAULT_JUDGE_LINE_POSITION_RATIO;
    }
    return clamp2(
      (judgeLineY - laneGeometry.laneTopY) / laneGeometry.laneHeightPx,
      0,
      1
    );
  }
  function normalizeGameProjectionOptions(viewportHeight, options, legacyJudgeLineY) {
    const isLegacySignature = Number.isFinite(options);
    const normalizedGameTimingConfig = normalizeGameTimingConfig(
      !isLegacySignature && options?.gameTimingConfig ? options.gameTimingConfig : createDefaultGameTimingConfig()
    );
    if (!isLegacySignature && options?.laneGeometry) {
      return {
        gameTimingConfig: normalizedGameTimingConfig,
        laneGeometry: options.laneGeometry
      };
    }
    const judgeLineY = Number.isFinite(legacyJudgeLineY) ? legacyJudgeLineY : getGameJudgeLineY(
      viewportHeight,
      DEFAULT_JUDGE_LINE_POSITION_RATIO,
      normalizedGameTimingConfig.laneHeightPercent
    );
    return {
      gameTimingConfig: normalizedGameTimingConfig,
      laneGeometry: getGameLaneGeometry(
        viewportHeight,
        getJudgeLineRatioFromGeometry(viewportHeight, judgeLineY, normalizedGameTimingConfig.laneHeightPercent),
        normalizedGameTimingConfig.laneHeightPercent
      )
    };
  }
  function isViewportYVisible(y, viewportTopY, viewportBottomY, margin = getNoteHeadHeight() + 24) {
    return y >= viewportTopY - margin && y <= viewportBottomY + margin;
  }
  function formatBpmMarkerLabel(bpm) {
    return trimDecimal(Number(bpm).toFixed(2));
  }
  function formatStopMarkerLabel(durationSec) {
    return `${trimDecimal(Number(durationSec).toFixed(3))}s`;
  }
  function formatWarpMarkerLabel() {
    return "WARP";
  }
  function formatScrollMarkerLabel(rate) {
    return trimDecimal(Number(rate).toFixed(3));
  }
  function trimDecimal(value) {
    return String(value).replace(/\.?0+$/, "");
  }
  function formatMeasureLabel(index) {
    return `#${String(Math.max(0, index)).padStart(3, "0")}`;
  }
  function collectVisibleEditorGridLines(measureRanges, startBeat, endBeat) {
    const beatBeats = [];
    const sixteenthBeats = [];
    const visibleMeasures = getVisibleMeasureRanges(measureRanges, startBeat, endBeat);
    for (const measure of visibleMeasures) {
      const measureLength = measure.endBeat - measure.startBeat;
      if (!(measureLength > 0)) {
        continue;
      }
      for (let subdivision = 1; ; subdivision += 1) {
        const beat = measure.startBeat + subdivision * 0.25;
        if (!(beat < measure.endBeat - 1e-9)) {
          break;
        }
        if (beat < startBeat || beat > endBeat) {
          continue;
        }
        if (subdivision % 4 === 0) {
          beatBeats.push(beat);
        } else {
          sixteenthBeats.push(beat);
        }
      }
    }
    return { beatBeats, sixteenthBeats };
  }
  function getBeatWindowIndices(items, startBeat, endBeat, getBeat = getEventBeat) {
    return {
      startIndex: lowerBoundByBeat(items, startBeat, getBeat),
      endIndex: upperBoundByBeat(items, endBeat, getBeat)
    };
  }
  function getLongBodyWindow(model, startBeat, endBeat) {
    const visibleStartCount = upperBoundByBeat(model.longNotesByBeat, endBeat, getEventBeat);
    const visibleEndStartIndex = lowerBoundByBeat(model.longNotesByEndBeat, startBeat, getNoteEndBeat);
    const remainingEndCount = model.longNotesByEndBeat.length - visibleEndStartIndex;
    if (visibleStartCount <= remainingEndCount) {
      return {
        items: model.longNotesByBeat,
        startIndex: 0,
        endIndex: visibleStartCount
      };
    }
    return {
      items: model.longNotesByEndBeat,
      startIndex: visibleEndStartIndex,
      endIndex: model.longNotesByEndBeat.length
    };
  }
  function getVisibleMeasureRanges(measureRanges, startBeat, endBeat) {
    const startIndex = lowerBoundMeasureRangesByEndBeat(measureRanges, startBeat);
    const visibleRanges = [];
    for (let index = startIndex; index < measureRanges.length; index += 1) {
      const measureRange = measureRanges[index];
      if (measureRange.startBeat > endBeat) {
        break;
      }
      if (measureRange.endBeat > startBeat) {
        visibleRanges.push(measureRange);
      }
    }
    return visibleRanges;
  }
  function lowerBoundGameTimelineByTime(points, timeSec) {
    let low = 0;
    let high = points.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((points[mid]?.timeSec ?? 0) < timeSec) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function lowerBoundByBeat(items, beat, getBeat = getEventBeat) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (getBeat(items[mid]) < beat) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function lowerBoundMeasureRangesByEndBeat(measureRanges, beat) {
    let low = 0;
    let high = measureRanges.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((measureRanges[mid]?.endBeat ?? 0) <= beat) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function upperBoundByBeat(items, beat, getBeat = getEventBeat) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (getBeat(items[mid]) <= beat) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  function getEventBeat(item) {
    return Number.isFinite(item?.beat) ? item.beat : 0;
  }
  function getNoteEndBeat(note) {
    return Number.isFinite(note?.endBeat) ? note.endBeat : getEventBeat(note);
  }
  function dimColor(color, factor) {
    if (!color.startsWith("#")) {
      return color;
    }
    const [red, green, blue] = hexToRgb(color);
    return `rgb(${Math.round(red * factor)}, ${Math.round(green * factor)}, ${Math.round(blue * factor)})`;
  }
  function finiteOrZero2(value) {
    return Number.isFinite(value) ? value : 0;
  }
  function clamp2(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }
  function hexToRgb(color) {
    const normalized = color.replace("#", "");
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return [red, green, blue];
  }

  // shared/preview-runtime/score-viewer-controller.js
  var DEFAULT_WHEEL_LINE_HEIGHT_PX = 16;
  var MIN_SPACING_SCALE = 0.5;
  var MAX_SPACING_SCALE = 8;
  var SPACING_STEP = 0.05;
  var SPACING_WHEEL_STEP = 0.01;
  var DEFAULT_SPACING_SCALE = 1;
  var GAME_DURATION_SLIDER_STEP = 10;
  var GAME_DURATION_WHEEL_STEP = 1;
  var GAME_LANE_HEIGHT_SLIDER_STEP = 1;
  var GAME_LANE_HEIGHT_WHEEL_STEP = 0.1;
  var GAME_LANE_COVER_SLIDER_STEP = 10;
  var GAME_LANE_COVER_WHEEL_STEP = 1;
  var GAME_PLAYBACK_SCROLL_SYNC_VIEWPORT_RATIO = 0.4;
  var GAME_PLAYBACK_SCROLL_SYNC_MIN_PX = 120;
  var JUDGE_LINE_DRAG_HIT_MARGIN_PX = 10;
  var GAME_GREEN_DISPLAY_COLOR = "#00FF00";
  function createScoreViewerController({
    root,
    onTimeChange = () => {
    },
    onPlaybackToggle = () => {
    },
    onViewerModeChange = () => {
    },
    onInvisibleNoteVisibilityChange = () => {
    },
    onJudgeLinePositionChange = () => {
    },
    onSpacingScaleChange = () => {
    },
    onGameTimingConfigChange = () => {
    },
    onRendererConfigChange = () => {
    }
  }) {
    const scrollHost = document.createElement("div");
    scrollHost.className = "score-viewer-scroll-host";
    const spacer = document.createElement("div");
    spacer.className = "score-viewer-spacer";
    scrollHost.appendChild(spacer);
    const canvas = document.createElement("canvas");
    canvas.className = "score-viewer-canvas";
    const bottomBar = document.createElement("div");
    bottomBar.className = "score-viewer-bottom-bar";
    const statusPanel = document.createElement("div");
    statusPanel.className = "score-viewer-status-panel";
    const playbackRow = document.createElement("div");
    playbackRow.className = "score-viewer-status-row is-time";
    const playbackButton = document.createElement("button");
    playbackButton.className = "score-viewer-playback-button bmsie-ui-button";
    playbackButton.type = "button";
    playbackButton.setAttribute("aria-label", "Play score viewer");
    playbackButton.textContent = "▶";
    const playbackTime = document.createElement("span");
    playbackTime.className = "score-viewer-playback-time";
    const detailSettingsToggle = document.createElement("button");
    detailSettingsToggle.className = "score-viewer-detail-settings-toggle bmsie-ui-button";
    detailSettingsToggle.type = "button";
    detailSettingsToggle.setAttribute("aria-label", "Open viewer detail settings");
    detailSettingsToggle.textContent = "⚙";
    playbackRow.append(playbackButton, playbackTime);
    const measureRow = document.createElement("div");
    measureRow.className = "score-viewer-status-row score-viewer-status-metric";
    const comboRow = document.createElement("div");
    comboRow.className = "score-viewer-status-row score-viewer-status-metric";
    const metricsRow = document.createElement("div");
    metricsRow.className = "score-viewer-metrics-row";
    metricsRow.append(measureRow, comboRow);
    const spacingRow = document.createElement("div");
    spacingRow.className = "score-viewer-status-row score-viewer-spacing-row";
    const spacingTitle = document.createElement("span");
    spacingTitle.className = "score-viewer-spacing-title";
    spacingTitle.textContent = "Spacing";
    const spacingValue = document.createElement("span");
    spacingValue.className = "score-viewer-spacing-value";
    const spacingValuePrimary = document.createElement("span");
    spacingValuePrimary.className = "score-viewer-spacing-value-primary";
    const spacingValueSecondary = document.createElement("span");
    spacingValueSecondary.className = "score-viewer-spacing-value-secondary";
    spacingValue.append(spacingValuePrimary, spacingValueSecondary);
    spacingRow.append(spacingTitle, spacingValue);
    const spacingInput = document.createElement("input");
    spacingInput.className = "score-viewer-spacing-input bmsie-ui-range";
    spacingInput.type = "range";
    spacingInput.min = String(MIN_SPACING_SCALE);
    spacingInput.max = String(MAX_SPACING_SCALE);
    spacingInput.step = String(SPACING_STEP);
    spacingInput.value = String(DEFAULT_SPACING_SCALE);
    const settingsPanel = document.createElement("div");
    settingsPanel.className = "score-viewer-settings-panel";
    const spacingSection = document.createElement("div");
    spacingSection.className = "score-viewer-settings-group score-viewer-spacing-section";
    const gameSettingsSection = document.createElement("div");
    gameSettingsSection.className = "score-viewer-settings-group score-viewer-game-settings-section";
    const modeSection = document.createElement("div");
    modeSection.className = "score-viewer-settings-group score-viewer-mode-section";
    const laneHeightRow = createSettingRow("Height", "score-viewer-lane-height-row");
    laneHeightRow.row.classList.add("score-viewer-game-setting");
    const laneHeightInput = document.createElement("input");
    laneHeightInput.className = "score-viewer-spacing-input score-viewer-lane-height-input bmsie-ui-range";
    laneHeightInput.type = "range";
    laneHeightInput.min = "0";
    laneHeightInput.max = "100";
    laneHeightInput.step = String(GAME_LANE_HEIGHT_SLIDER_STEP);
    laneHeightInput.value = String(DEFAULT_GAME_LANE_HEIGHT_PERCENT);
    laneHeightInput.classList.add("score-viewer-game-setting");
    const laneCoverRow = createSettingRow("Cover", "score-viewer-lane-cover-row");
    laneCoverRow.row.classList.add("score-viewer-game-setting");
    const laneCoverInput = document.createElement("input");
    laneCoverInput.className = "score-viewer-spacing-input score-viewer-lane-cover-input bmsie-ui-range";
    laneCoverInput.type = "range";
    laneCoverInput.min = "0";
    laneCoverInput.max = "1000";
    laneCoverInput.step = String(GAME_LANE_COVER_SLIDER_STEP);
    laneCoverInput.value = String(DEFAULT_GAME_LANE_COVER_PERMILLE);
    laneCoverInput.classList.add("score-viewer-game-setting");
    const laneCoverVisibleRow = document.createElement("label");
    laneCoverVisibleRow.className = "score-viewer-status-row score-viewer-checkbox-row score-viewer-lane-cover-visible-row";
    laneCoverVisibleRow.classList.add("score-viewer-game-setting");
    const laneCoverVisibleLabel = document.createElement("span");
    laneCoverVisibleLabel.className = "score-viewer-mode-title";
    laneCoverVisibleLabel.textContent = "Cover Visible";
    const laneCoverVisibleControl = document.createElement("input");
    laneCoverVisibleControl.className = "score-viewer-checkbox-input bmsie-ui-checkbox";
    laneCoverVisibleControl.type = "checkbox";
    laneCoverVisibleControl.checked = DEFAULT_GAME_LANE_COVER_VISIBLE;
    laneCoverVisibleRow.append(laneCoverVisibleLabel, laneCoverVisibleControl);
    const hsFixRow = document.createElement("div");
    hsFixRow.className = "score-viewer-status-row score-viewer-mode-row score-viewer-hs-fix-row";
    hsFixRow.classList.add("score-viewer-game-setting");
    const hsFixTitle = document.createElement("span");
    hsFixTitle.className = "score-viewer-mode-title";
    hsFixTitle.textContent = "HS-FIX";
    const hsFixSelect = document.createElement("select");
    hsFixSelect.className = "score-viewer-mode-select score-viewer-hs-fix-select bmsie-ui-select";
    hsFixSelect.append(
      createModeOption("start", "START BPM"),
      createModeOption("max", "MAX BPM"),
      createModeOption("main", "MAIN BPM"),
      createModeOption("min", "MIN BPM")
    );
    hsFixSelect.value = DEFAULT_GAME_HS_FIX_MODE;
    hsFixRow.append(hsFixTitle, hsFixSelect);
    const modeRow = document.createElement("div");
    modeRow.className = "score-viewer-mode-row";
    const modeControls = document.createElement("div");
    modeControls.className = "score-viewer-mode-controls";
    const modeCell = document.createElement("div");
    modeCell.className = "score-viewer-mode-cell";
    const modeTitle = document.createElement("span");
    modeTitle.className = "score-viewer-mode-title";
    modeTitle.textContent = "Mode";
    const modeSelect = document.createElement("select");
    modeSelect.className = "score-viewer-mode-select bmsie-ui-select";
    modeSelect.append(
      createModeOption("time", "Time"),
      createModeOption("editor", "Editor"),
      createModeOption("game", "Game"),
      createModeOption("lunatic", "Lunatic")
    );
    modeCell.append(modeTitle, modeSelect);
    const invisibleNotesCell = document.createElement("div");
    invisibleNotesCell.className = "score-viewer-mode-cell";
    const invisibleNoteVisibilityTitle = document.createElement("span");
    invisibleNoteVisibilityTitle.className = "score-viewer-mode-title";
    invisibleNoteVisibilityTitle.textContent = "Invisible Notes";
    const invisibleNoteVisibilitySelect = document.createElement("select");
    invisibleNoteVisibilitySelect.className = "score-viewer-mode-select score-viewer-invisible-note-select bmsie-ui-select";
    invisibleNoteVisibilitySelect.append(
      createModeOption("hide", "Hide"),
      createModeOption("show", "Show")
    );
    invisibleNotesCell.append(invisibleNoteVisibilityTitle, invisibleNoteVisibilitySelect);
    modeControls.append(modeCell, invisibleNotesCell);
    modeRow.append(modeControls);
    spacingSection.append(
      spacingRow,
      spacingInput
    );
    gameSettingsSection.append(
      laneHeightRow.row,
      laneHeightInput,
      laneCoverRow.row,
      laneCoverInput,
      laneCoverVisibleRow,
      hsFixRow
    );
    modeSection.append(
      modeRow
    );
    settingsPanel.append(spacingSection, gameSettingsSection, modeSection);
    statusPanel.append(playbackRow, detailSettingsToggle, metricsRow, settingsPanel);
    bottomBar.append(statusPanel);
    const judgeLine = document.createElement("div");
    judgeLine.className = "score-viewer-judge-line";
    const laneHeightHandle = document.createElement("div");
    laneHeightHandle.className = "score-viewer-drag-line score-viewer-lane-height-handle";
    const laneCoverHandle = document.createElement("div");
    laneCoverHandle.className = "score-viewer-drag-line score-viewer-lane-cover-handle";
    root.replaceChildren(scrollHost, canvas, bottomBar, laneHeightHandle, laneCoverHandle, judgeLine);
    const renderer = createScoreViewerRenderer(canvas);
    const state = {
      model: null,
      selectedTimeSec: 0,
      selectedBeat: 0,
      isPinned: false,
      isOpen: false,
      isPlaying: false,
      spacingScaleByMode: createDefaultSpacingScaleByMode(),
      gameTimingConfig: createDefaultGameTimingConfig(),
      rendererConfig: DEFAULT_RENDERER_CONFIG,
      viewerMode: DEFAULT_VIEWER_MODE,
      invisibleNoteVisibility: DEFAULT_INVISIBLE_NOTE_VISIBILITY,
      judgeLinePositionRatio: DEFAULT_JUDGE_LINE_POSITION_RATIO,
      hoveredDragHandle: null
    };
    const uiState = {
      canvasHidden: null,
      bottomBarHidden: null,
      judgeLineHidden: null,
      laneHeightHandleHidden: null,
      laneCoverHandleHidden: null,
      judgeLineRatioCss: null,
      judgeLineTopCss: null,
      laneHeightHandleTopCss: null,
      laneCoverHandleTopCss: null,
      rootDragHandleHoveredClass: null,
      rootDragHandleDraggingClass: null,
      scrollHostDragHandleHoveredClass: null,
      scrollHostDragHandleDraggingClass: null,
      judgeLineDraggableClass: null,
      judgeLineDraggingClass: null,
      laneHeightHandleDraggableClass: null,
      laneHeightHandleDraggingClass: null,
      laneCoverHandleDraggableClass: null,
      laneCoverHandleDraggingClass: null,
      playbackButtonDisabled: null,
      playbackButtonText: null,
      playbackButtonLabel: null,
      playbackTime: null,
      measureText: null,
      comboText: null,
      spacingPrimaryText: null,
      spacingSecondaryText: null,
      spacingSecondaryDisplay: null,
      spacingSecondaryColor: null,
      spacingInputValue: null,
      spacingInputMin: null,
      spacingInputMax: null,
      spacingInputStep: null,
      laneHeightText: null,
      laneHeightInputValue: null,
      laneCoverText: null,
      laneCoverInputValue: null,
      laneCoverVisibleChecked: null,
      hsFixValue: null,
      modeSelectValue: null,
      modeSelectDisabled: null,
      invisibleNoteVisibilityValue: null,
      invisibleNoteVisibilityDisabled: null,
      gameSettingsHidden: null
    };
    let ignoreScrollUntilNextFrame = false;
    let resizeObserver = null;
    let dragState = null;
    let editorFrameStateCache = null;
    scrollHost.addEventListener("scroll", () => {
      syncTimeFromScrollPosition();
    });
    scrollHost.addEventListener("wheel", (event) => {
      if (!state.model || !state.isOpen || !isScrollInteractive()) {
        return;
      }
      scrollHost.scrollTop += normalizeWheelDeltaY(event.deltaY, event.deltaMode, scrollHost.clientHeight);
      syncTimeFromScrollPosition({ force: true });
      event.preventDefault();
    }, { passive: false });
    scrollHost.addEventListener("pointerdown", (event) => {
      const dragIntent = resolvePointerDragIntent({
        canDragJudgeLine: canDragJudgeLine(event),
        canDragLaneHeight: canDragGameTimingHandle(event),
        canDragLaneCover: canDragGameTimingHandle(event),
        canDragScroll: canDragScroll(event),
        isJudgeLineHit: isPointerNearJudgeLine(event),
        isLaneHeightHit: isPointerNearLaneHeightHandle(event),
        isLaneCoverHit: isPointerNearLaneCoverHandle(event)
      });
      if (!dragIntent) {
        return;
      }
      if (isActiveDragHandleType(dragIntent)) {
        dragState = {
          type: dragIntent,
          pointerId: event.pointerId
        };
        updateDragHandleFromPointer(dragIntent, event, { notify: true });
      } else {
        dragState = {
          type: "scroll",
          pointerId: event.pointerId,
          startY: event.clientY,
          startScrollTop: scrollHost.scrollTop
        };
        scrollHost.classList.add("is-dragging");
      }
      if (typeof scrollHost.setPointerCapture === "function") {
        scrollHost.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    });
    scrollHost.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        updateHoveredDragHandle(event);
        return;
      }
      if (isActiveDragHandleType(dragState.type)) {
        updateDragHandleFromPointer(dragState.type, event, { notify: true });
      } else {
        const deltaY = event.clientY - dragState.startY;
        scrollHost.scrollTop = dragState.startScrollTop + deltaY;
        syncTimeFromScrollPosition({ force: true });
      }
      event.preventDefault();
    });
    scrollHost.addEventListener("pointerleave", () => {
      if (isActiveDragHandleType(dragState?.type)) {
        return;
      }
      setHoveredDragHandle(null);
    });
    statusPanel.addEventListener("mouseleave", () => {
      blurFocusedStatusPanelControl();
    });
    scrollHost.addEventListener("pointerup", handlePointerRelease);
    scrollHost.addEventListener("pointercancel", handlePointerRelease);
    scrollHost.addEventListener("lostpointercapture", handlePointerRelease);
    spacingInput.addEventListener("input", () => {
      const resolvedViewerMode = getResolvedViewerMode2();
      if (isGameViewerMode(resolvedViewerMode)) {
        updateGameTimingConfig({
          durationMs: normalizeGameDurationMs(Number.parseFloat(spacingInput.value))
        }, { notify: true });
        return;
      }
      updateSpacingScaleForMode(
        resolvedViewerMode,
        normalizeSliderSpacingScale(Number.parseFloat(spacingInput.value)),
        { notify: true }
      );
    });
    spacingInput.addEventListener("wheel", (event) => {
      if (!state.isOpen || !state.model) {
        return;
      }
      const resolvedViewerMode = getResolvedViewerMode2();
      const delta = event.deltaY < 0 ? isGameViewerMode(resolvedViewerMode) ? GAME_DURATION_WHEEL_STEP : SPACING_WHEEL_STEP : event.deltaY > 0 ? isGameViewerMode(resolvedViewerMode) ? -GAME_DURATION_WHEEL_STEP : -SPACING_WHEEL_STEP : 0;
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (isGameViewerMode(resolvedViewerMode)) {
        updateGameTimingConfig({
          durationMs: normalizeGameDurationMs(state.gameTimingConfig.durationMs + delta)
        }, { notify: true });
        return;
      }
      updateSpacingScaleForMode(
        resolvedViewerMode,
        roundSpacingScaleToHundredths(getSpacingScaleForMode(resolvedViewerMode) + delta),
        { notify: true }
      );
    }, { passive: false });
    laneHeightInput.addEventListener("input", () => {
      updateGameTimingConfig({
        laneHeightPercent: normalizeGameLaneHeightPercentForSlider(Number.parseFloat(laneHeightInput.value))
      }, { notify: true });
    });
    laneHeightInput.addEventListener("wheel", (event) => {
      if (!state.isOpen || !state.model || !isGameViewerMode(getResolvedViewerMode2())) {
        return;
      }
      const delta = event.deltaY < 0 ? GAME_LANE_HEIGHT_WHEEL_STEP : event.deltaY > 0 ? -GAME_LANE_HEIGHT_WHEEL_STEP : 0;
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      updateGameTimingConfig({
        laneHeightPercent: normalizeGameLaneHeightPercentForWheel(state.gameTimingConfig.laneHeightPercent + delta)
      }, { notify: true });
    }, { passive: false });
    laneCoverInput.addEventListener("input", () => {
      updateGameTimingConfig({
        laneCoverPermille: normalizeGameLaneCoverPermille(Number.parseFloat(laneCoverInput.value))
      }, { notify: true });
    });
    laneCoverInput.addEventListener("wheel", (event) => {
      if (!state.isOpen || !state.model || !isGameViewerMode(getResolvedViewerMode2())) {
        return;
      }
      const delta = event.deltaY < 0 ? GAME_LANE_COVER_WHEEL_STEP : event.deltaY > 0 ? -GAME_LANE_COVER_WHEEL_STEP : 0;
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      updateGameTimingConfig({
        laneCoverPermille: normalizeGameLaneCoverPermille(state.gameTimingConfig.laneCoverPermille + delta)
      }, { notify: true });
    }, { passive: false });
    laneCoverVisibleControl.addEventListener("change", () => {
      updateGameTimingConfig({
        laneCoverVisible: normalizeGameLaneCoverVisible(laneCoverVisibleControl.checked)
      }, { notify: true });
    });
    hsFixSelect.addEventListener("change", () => {
      updateGameTimingConfig({
        hsFixMode: normalizeGameHsFixMode(hsFixSelect.value)
      }, { notify: true });
    });
    modeSelect.addEventListener("change", () => {
      const nextMode = normalizeViewerMode(modeSelect.value);
      if ((nextMode === "game" || nextMode === "lunatic") && !state.model?.supportsGameMode) {
        modeSelect.value = getResolvedViewerMode2();
        return;
      }
      if (nextMode === "editor" && !state.model?.supportsEditorMode) {
        modeSelect.value = getResolvedViewerMode2();
        return;
      }
      if (nextMode === state.viewerMode) {
        return;
      }
      state.viewerMode = nextMode;
      onViewerModeChange(state.viewerMode);
      refreshLayout();
    });
    invisibleNoteVisibilitySelect.addEventListener("change", () => {
      const nextVisibility = normalizeInvisibleNoteVisibility(invisibleNoteVisibilitySelect.value);
      if (nextVisibility === state.invisibleNoteVisibility) {
        return;
      }
      state.invisibleNoteVisibility = nextVisibility;
      onInvisibleNoteVisibilityChange(state.invisibleNoteVisibility);
      renderScene({ updateChrome: true });
    });
    playbackButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePlayback();
    });
    scrollHost.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (dragState) {
        return;
      }
      togglePlayback();
    });
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        refreshLayout();
      });
      resizeObserver.observe(root);
    } else {
      window.addEventListener("resize", refreshLayout);
    }
    function setModel(model) {
      if (state.model === model) {
        return;
      }
      state.model = model;
      state.selectedTimeSec = getClampedSelectedTimeSec(state.model, state.selectedTimeSec);
      state.selectedBeat = getBeatAtTimeSec(state.model, state.selectedTimeSec);
      editorFrameStateCache = null;
      updateRootWidth();
      refreshLayout();
    }
    function setSelectedTimeSec(timeSec, { beatHint } = {}) {
      const clampedTimeSec = getClampedSelectedTimeSec(state.model, timeSec);
      const resolvedViewerMode = getResolvedViewerMode2();
      const nextBeat = resolvedViewerMode === "editor" ? resolveSelectedBeat2(clampedTimeSec, beatHint) : getBeatAtTimeSec(state.model, clampedTimeSec);
      if (!hasViewerSelectionChanged(
        state.model,
        resolvedViewerMode,
        state.selectedTimeSec,
        clampedTimeSec,
        state.selectedBeat,
        nextBeat
      ) && state.model) {
        syncScrollPosition();
        renderScene();
        return;
      }
      state.selectedTimeSec = clampedTimeSec;
      state.selectedBeat = nextBeat;
      editorFrameStateCache = null;
      syncScrollPosition();
      renderScene();
    }
    function setPinned(nextPinned) {
      const normalizedPinned = Boolean(nextPinned);
      if (state.isPinned === normalizedPinned) {
        return;
      }
      state.isPinned = normalizedPinned;
      updateScrollInteractivity();
      renderScene();
    }
    function setOpen(nextOpen) {
      const normalizedOpen = Boolean(nextOpen);
      if (state.isOpen === normalizedOpen) {
        return;
      }
      state.isOpen = normalizedOpen;
      if (!state.isOpen) {
        clearDragState();
        setHoveredDragHandle(null, { render: false });
      }
      root.classList.toggle("is-visible", state.isOpen && Boolean(state.model));
      syncScrollPosition();
      renderScene({ updateChrome: true });
    }
    function setPlaybackState(nextPlaying) {
      const normalizedPlaying = Boolean(nextPlaying);
      if (state.isPlaying === normalizedPlaying) {
        return;
      }
      state.isPlaying = normalizedPlaying;
      updateScrollInteractivity();
      if (!state.isPlaying) {
        syncScrollPosition();
      }
      renderScene();
    }
    function setViewerMode(nextViewerMode) {
      const normalizedMode = normalizeViewerMode(nextViewerMode);
      if (state.viewerMode === normalizedMode) {
        return;
      }
      state.viewerMode = normalizedMode;
      state.selectedBeat = getBeatAtTimeSec(state.model, state.selectedTimeSec);
      editorFrameStateCache = null;
      refreshLayout();
    }
    function setInvisibleNoteVisibility(nextVisibility) {
      const normalizedVisibility = normalizeInvisibleNoteVisibility(nextVisibility);
      if (state.invisibleNoteVisibility === normalizedVisibility) {
        return;
      }
      state.invisibleNoteVisibility = normalizedVisibility;
      renderScene({ updateChrome: true });
    }
    function setJudgeLinePositionRatio(nextRatio) {
      const normalizedRatio = normalizeJudgeLinePositionRatio(nextRatio);
      if (Math.abs(state.judgeLinePositionRatio - normalizedRatio) < 1e-6) {
        return;
      }
      state.judgeLinePositionRatio = normalizedRatio;
      editorFrameStateCache = null;
      syncScrollPosition();
      renderScene({ updateChrome: true });
    }
    function setSpacingScaleByMode(nextSpacingScaleByMode = {}) {
      const normalizedSpacingScaleByMode = {
        time: clampScale(nextSpacingScaleByMode.time),
        editor: clampScale(nextSpacingScaleByMode.editor),
        game: clampScale(nextSpacingScaleByMode.game)
      };
      if (areSpacingScaleMapsEqual(state.spacingScaleByMode, normalizedSpacingScaleByMode)) {
        return;
      }
      state.spacingScaleByMode = normalizedSpacingScaleByMode;
      editorFrameStateCache = null;
      refreshLayout();
    }
    function setGameTimingConfig(nextGameTimingConfig = {}) {
      const normalizedGameTimingConfig = normalizeGameTimingConfig({
        ...state.gameTimingConfig,
        ...nextGameTimingConfig
      });
      if (areGameTimingConfigsEqual(state.gameTimingConfig, normalizedGameTimingConfig)) {
        return;
      }
      state.gameTimingConfig = normalizedGameTimingConfig;
      refreshLayout();
    }
    function setRendererConfig(nextRendererConfig = {}) {
      const normalizedRendererConfig = normalizeRendererConfig({
        ...state.rendererConfig,
        ...nextRendererConfig
      });
      if (areRendererConfigsEqual(state.rendererConfig, normalizedRendererConfig)) {
        return;
      }
      state.rendererConfig = normalizedRendererConfig;
      refreshLayout();
    }
    function setEmptyState(_title, _message) {
    }
    function togglePlayback() {
      if (!state.model || !state.isOpen) {
        return;
      }
      onPlaybackToggle(!state.isPlaying);
    }
    function syncScrollPosition() {
      if (!state.model) {
        scrollHost.scrollTop = 0;
        return;
      }
      const viewportHeight = root.clientHeight || 0;
      const resolvedViewerMode = getResolvedViewerMode2();
      const desiredScrollTop = resolvedViewerMode === "editor" ? getEditorScrollTopForBeat(
        state.model,
        state.selectedBeat,
        viewportHeight,
        getPixelsPerBeat()
      ) : getScrollTopForResolvedMode(
        state.model,
        state.selectedTimeSec,
        viewportHeight
      );
      if (!shouldSyncPlaybackScrollPosition({
        viewerMode: resolvedViewerMode,
        isPlaying: state.isPlaying,
        currentScrollTop: scrollHost.scrollTop,
        desiredScrollTop,
        viewportHeight
      })) {
        return;
      }
      ignoreScrollUntilNextFrame = true;
      scrollHost.scrollTop = desiredScrollTop;
      requestAnimationFrame(() => {
        ignoreScrollUntilNextFrame = false;
      });
    }
    function syncTimeFromScrollPosition({ force = false } = {}) {
      if (!state.model || !state.isOpen || !isScrollInteractive()) {
        return;
      }
      if (!force && ignoreScrollUntilNextFrame) {
        return;
      }
      const resolvedViewerMode = getResolvedViewerMode2();
      if (resolvedViewerMode === "editor") {
        const nextBeat = getClampedSelectedBeat(state.model, scrollHost.scrollTop / getPixelsPerBeat());
        if (!hasViewerSelectionChanged(
          state.model,
          resolvedViewerMode,
          state.selectedTimeSec,
          state.selectedTimeSec,
          state.selectedBeat,
          nextBeat
        )) {
          return;
        }
        state.selectedBeat = nextBeat;
        state.selectedTimeSec = getTimeSecForBeat(state.model, nextBeat);
        editorFrameStateCache = null;
        renderScene();
        onTimeChange({
          timeSec: state.selectedTimeSec,
          beat: nextBeat,
          viewerMode: resolvedViewerMode,
          source: "scroll"
        });
        return;
      }
      const nextTimeSec = getTimeSecForResolvedMode(state.model, scrollHost.scrollTop);
      if (!hasViewerSelectionChanged(state.model, resolvedViewerMode, state.selectedTimeSec, nextTimeSec)) {
        return;
      }
      state.selectedTimeSec = nextTimeSec;
      state.selectedBeat = getBeatAtTimeSec(state.model, nextTimeSec);
      editorFrameStateCache = null;
      renderScene();
      onTimeChange({
        timeSec: nextTimeSec,
        beat: state.selectedBeat,
        viewerMode: resolvedViewerMode,
        source: "scroll"
      });
    }
    function refreshLayout() {
      updateRootWidth();
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(260, root.clientHeight);
      renderer.resize(width, height);
      spacer.style.height = `${getContentHeightForResolvedMode(state.model, height)}px`;
      syncScrollPosition();
      renderScene({ updateChrome: true });
    }
    function renderScene({ updateChrome = false } = {}) {
      const showScene = Boolean(state.model && state.isOpen);
      const resolvedViewerMode = getResolvedViewerMode2();
      const viewportHeight = root.clientHeight || 0;
      const currentJudgeLineY = getCurrentJudgeLineY(viewportHeight);
      const editorFrameState = showScene && resolvedViewerMode === "editor" ? getEditorFrameStateForCurrentView(viewportHeight, currentJudgeLineY) : null;
      const cursor = getViewerCursor(
        state.model,
        state.selectedTimeSec,
        resolvedViewerMode,
        state.selectedBeat
      );
      if (updateChrome) {
        renderSceneChrome({
          showScene,
          resolvedViewerMode,
          viewportHeight,
          currentJudgeLineY
        });
      }
      renderSceneFrame({
        showScene,
        resolvedViewerMode,
        cursor,
        editorFrameState,
        currentJudgeLineY
      });
    }
    function renderSceneChrome({
      showScene,
      resolvedViewerMode,
      viewportHeight,
      currentJudgeLineY
    }) {
      const isGameMode = isGameViewerMode(resolvedViewerMode);
      const currentGameLaneGeometry = isGameMode ? getCurrentGameLaneGeometry(viewportHeight) : null;
      const spacingDisplay = formatSpacingDisplay({
        mode: resolvedViewerMode,
        spacingScale: getSpacingScaleForMode(resolvedViewerMode),
        durationMs: state.gameTimingConfig.durationMs
      });
      const spacingSliderConfig = isGameMode ? {
        min: String(1),
        max: String(5e3),
        step: String(GAME_DURATION_SLIDER_STEP),
        value: String(state.gameTimingConfig.durationMs)
      } : {
        min: String(MIN_SPACING_SCALE),
        max: String(MAX_SPACING_SCALE),
        step: String(SPACING_STEP),
        value: getSpacingScaleForMode(resolvedViewerMode).toFixed(2)
      };
      setHiddenIfChanged(canvas, !showScene, "canvasHidden");
      setHiddenIfChanged(bottomBar, !showScene, "bottomBarHidden");
      setHiddenIfChanged(judgeLine, !showScene, "judgeLineHidden");
      setHiddenIfChanged(laneHeightHandle, !showScene || !isGameMode, "laneHeightHandleHidden");
      setHiddenIfChanged(
        laneCoverHandle,
        !showScene || !isGameMode || !state.gameTimingConfig.laneCoverVisible,
        "laneCoverHandleHidden"
      );
      setStylePropertyIfChanged(root, "--score-viewer-judge-line-ratio", String(state.judgeLinePositionRatio), "judgeLineRatioCss");
      setStylePropertyIfChanged(root, "--score-viewer-judge-line-top", `${currentJudgeLineY}px`, "judgeLineTopCss");
      if (isGameMode && currentGameLaneGeometry) {
        const laneCoverBounds = getGameLaneCoverBounds(
          viewportHeight,
          state.judgeLinePositionRatio,
          state.gameTimingConfig.laneHeightPercent,
          state.gameTimingConfig.laneCoverPermille
        );
        setStyleValueIfChanged(laneHeightHandle, "top", `${currentGameLaneGeometry.laneTopY}px`, "laneHeightHandleTopCss");
        setStyleValueIfChanged(
          laneCoverHandle,
          "top",
          `${laneCoverBounds.bottomY}px`,
          "laneCoverHandleTopCss"
        );
      }
      setHiddenIfChanged(gameSettingsSection, !isGameMode, "gameSettingsHidden");
      setDisabledIfChanged(playbackButton, !state.model, "playbackButtonDisabled");
      setTextIfChanged(spacingValuePrimary, spacingDisplay.primaryText, "spacingPrimaryText");
      setTextIfChanged(spacingValueSecondary, spacingDisplay.secondaryText, "spacingSecondaryText");
      setStyleValueIfChanged(
        spacingValueSecondary,
        "display",
        spacingDisplay.secondaryText === "" ? "none" : "inline",
        "spacingSecondaryDisplay"
      );
      setStyleValueIfChanged(
        spacingValueSecondary,
        "color",
        spacingDisplay.secondaryColor,
        "spacingSecondaryColor"
      );
      setAttributeIfChanged(spacingInput, "min", spacingSliderConfig.min, "spacingInputMin");
      setAttributeIfChanged(spacingInput, "max", spacingSliderConfig.max, "spacingInputMax");
      setAttributeIfChanged(spacingInput, "step", spacingSliderConfig.step, "spacingInputStep");
      setValueIfChanged(spacingInput, spacingSliderConfig.value, "spacingInputValue");
      if (isGameMode && currentGameLaneGeometry) {
        setTextIfChanged(
          laneHeightRow.value,
          formatLaneHeightDisplay(
            state.gameTimingConfig.laneHeightPercent,
            currentGameLaneGeometry.viewportHeight,
            currentGameLaneGeometry.judgeDistancePx
          ),
          "laneHeightText"
        );
        setValueIfChanged(laneHeightInput, String(state.gameTimingConfig.laneHeightPercent), "laneHeightInputValue");
        setTextIfChanged(
          laneCoverRow.value,
          formatLaneCoverDisplay(state.gameTimingConfig.laneCoverPermille),
          "laneCoverText"
        );
        setValueIfChanged(laneCoverInput, String(state.gameTimingConfig.laneCoverPermille), "laneCoverInputValue");
        setCheckedIfChanged(laneCoverVisibleControl, state.gameTimingConfig.laneCoverVisible, "laneCoverVisibleChecked");
        setValueIfChanged(hsFixSelect, state.gameTimingConfig.hsFixMode, "hsFixValue");
      }
      setValueIfChanged(modeSelect, resolvedViewerMode, "modeSelectValue");
      setDisabledIfChanged(modeSelect, !state.model, "modeSelectDisabled");
      setValueIfChanged(invisibleNoteVisibilitySelect, state.invisibleNoteVisibility, "invisibleNoteVisibilityValue");
      setDisabledIfChanged(invisibleNoteVisibilitySelect, !state.model, "invisibleNoteVisibilityDisabled");
    }
    function renderSceneFrame({
      showScene,
      resolvedViewerMode,
      cursor,
      editorFrameState,
      currentJudgeLineY
    }) {
      toggleClassIfChanged(
        root,
        "is-drag-handle-hovered",
        showScene && isActiveDragHandleType(state.hoveredDragHandle),
        "rootDragHandleHoveredClass"
      );
      toggleClassIfChanged(
        root,
        "is-drag-handle-dragging",
        isActiveDragHandleType(dragState?.type),
        "rootDragHandleDraggingClass"
      );
      toggleClassIfChanged(
        scrollHost,
        "is-drag-handle-hovered",
        showScene && isActiveDragHandleType(state.hoveredDragHandle),
        "scrollHostDragHandleHoveredClass"
      );
      toggleClassIfChanged(
        scrollHost,
        "is-drag-handle-dragging",
        isActiveDragHandleType(dragState?.type),
        "scrollHostDragHandleDraggingClass"
      );
      toggleClassIfChanged(
        judgeLine,
        "is-draggable",
        showScene && state.hoveredDragHandle === "judge-line",
        "judgeLineDraggableClass"
      );
      toggleClassIfChanged(
        judgeLine,
        "is-dragging",
        dragState?.type === "judge-line",
        "judgeLineDraggingClass"
      );
      toggleClassIfChanged(
        laneHeightHandle,
        "is-draggable",
        showScene && state.hoveredDragHandle === "lane-height",
        "laneHeightHandleDraggableClass"
      );
      toggleClassIfChanged(
        laneHeightHandle,
        "is-dragging",
        dragState?.type === "lane-height",
        "laneHeightHandleDraggingClass"
      );
      toggleClassIfChanged(
        laneCoverHandle,
        "is-draggable",
        showScene && state.hoveredDragHandle === "lane-cover",
        "laneCoverHandleDraggableClass"
      );
      toggleClassIfChanged(
        laneCoverHandle,
        "is-dragging",
        dragState?.type === "lane-cover",
        "laneCoverHandleDraggingClass"
      );
      setTextIfChanged(playbackButton, state.isPlaying ? "❚❚" : "▶", "playbackButtonText");
      setAttributeIfChanged(
        playbackButton,
        "aria-label",
        state.isPlaying ? "Pause score viewer" : "Play score viewer",
        "playbackButtonLabel"
      );
      setTextIfChanged(playbackTime, `${formatPlaybackTime(cursor.timeSec)} s`, "playbackTime");
      setTextIfChanged(
        measureRow,
        `BAR: ${formatMeasureCounter(cursor.measureIndex, cursor.totalMeasureIndex)}`,
        "measureText"
      );
      setTextIfChanged(comboRow, `CB: ${cursor.comboCount}/${cursor.totalCombo}`, "comboText");
      renderer.render(showScene ? state.model : null, cursor.timeSec, {
        viewerMode: resolvedViewerMode,
        pixelsPerSecond: getPixelsPerSecond(),
        pixelsPerBeat: getPixelsPerBeat(),
        editorFrameState,
        showInvisibleNotes: state.invisibleNoteVisibility === "show",
        judgeLineY: currentJudgeLineY,
        gameTimingConfig: state.gameTimingConfig,
        rendererConfig: state.rendererConfig
      });
    }
    function destroy() {
      clearDragState();
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", refreshLayout);
      }
    }
    setPinned(false);
    const initialSpacingDisplay = formatSpacingDisplay({
      mode: DEFAULT_VIEWER_MODE,
      spacingScale: DEFAULT_SPACING_SCALE
    });
    spacingValuePrimary.textContent = initialSpacingDisplay.primaryText;
    spacingValueSecondary.textContent = initialSpacingDisplay.secondaryText;
    spacingValueSecondary.style.display = initialSpacingDisplay.secondaryText === "" ? "none" : "inline";
    spacingValueSecondary.style.color = initialSpacingDisplay.secondaryColor;
    modeSelect.value = DEFAULT_VIEWER_MODE;
    invisibleNoteVisibilitySelect.value = DEFAULT_INVISIBLE_NOTE_VISIBILITY;
    refreshLayout();
    return {
      setModel,
      setSelectedTimeSec,
      setPinned,
      setOpen,
      setPlaybackState,
      setViewerMode,
      setInvisibleNoteVisibility,
      setJudgeLinePositionRatio,
      setSpacingScaleByMode,
      setGameTimingConfig,
      setRendererConfig,
      setEmptyState,
      refreshLayout,
      destroy
    };
    function handlePointerRelease(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      clearDragState();
      renderScene();
    }
    function clearDragState() {
      if (dragState && typeof scrollHost.releasePointerCapture === "function") {
        try {
          if (scrollHost.hasPointerCapture?.(dragState.pointerId)) {
            scrollHost.releasePointerCapture(dragState.pointerId);
          }
        } catch {
        }
      }
      dragState = null;
      scrollHost.classList.remove("is-dragging");
      scrollHost.classList.remove("is-drag-handle-dragging");
      judgeLine.classList.remove("is-dragging");
      laneHeightHandle.classList.remove("is-dragging");
      laneCoverHandle.classList.remove("is-dragging");
    }
    function canDragScroll(event) {
      return Boolean(
        state.model && state.isOpen && isScrollInteractive() && isPrimaryPointer(event)
      );
    }
    function canDragJudgeLine(event) {
      return Boolean(
        state.model && state.isOpen && isPrimaryPointer(event)
      );
    }
    function canDragGameTimingHandle(event) {
      return Boolean(
        state.model && state.isOpen && isGameViewerMode(getResolvedViewerMode2()) && isPrimaryPointer(event)
      );
    }
    function isScrollInteractive() {
      return state.isPinned || state.isPlaying;
    }
    function updateRootWidth() {
      if (!state.model) {
        root.style.removeProperty("--score-viewer-width");
        return;
      }
      root.style.setProperty(
        "--score-viewer-width",
        `${estimateViewerWidth(state.model.score.mode, state.model.score.laneCount, state.rendererConfig)}px`
      );
    }
    function updateScrollInteractivity() {
      const interactive = isScrollInteractive();
      scrollHost.classList.toggle("is-scrollable", interactive);
      scrollHost.style.overflowY = interactive ? "auto" : "hidden";
      if (!interactive) {
        clearDragState();
      }
    }
    function getResolvedViewerMode2() {
      return resolveViewerModeForModel(state.model, state.viewerMode);
    }
    function getPixelsPerSecond() {
      return DEFAULT_VIEWER_PIXELS_PER_SECOND * getSpacingScaleForMode("time");
    }
    function getPixelsPerBeat() {
      return DEFAULT_EDITOR_PIXELS_PER_BEAT * getSpacingScaleForMode("editor");
    }
    function getCurrentJudgeLineY(viewportHeight = root.clientHeight || 0) {
      if (isGameViewerMode(getResolvedViewerMode2())) {
        return getGameJudgeLineY(
          viewportHeight,
          state.judgeLinePositionRatio,
          state.gameTimingConfig.laneHeightPercent
        );
      }
      return getJudgeLineY(viewportHeight, state.judgeLinePositionRatio);
    }
    function getCurrentGameLaneGeometry(viewportHeight = root.clientHeight || 0) {
      return getGameLaneGeometry(
        viewportHeight,
        state.judgeLinePositionRatio,
        state.gameTimingConfig.laneHeightPercent
      );
    }
    function getEditorFrameStateForCurrentView(viewportHeight = root.clientHeight || 0, judgeLineY = getCurrentJudgeLineY(viewportHeight)) {
      if (!state.model || getResolvedViewerMode2() !== "editor") {
        editorFrameStateCache = null;
        return null;
      }
      const pixelsPerBeat = getPixelsPerBeat();
      if (editorFrameStateCache && editorFrameStateCache.model === state.model && Math.abs(editorFrameStateCache.selectedBeat - state.selectedBeat) < 1e-6 && editorFrameStateCache.viewportHeight === viewportHeight && Math.abs(editorFrameStateCache.pixelsPerBeat - pixelsPerBeat) < 5e-4 && Math.abs(editorFrameStateCache.judgeLineY - judgeLineY) < 5e-4) {
        return editorFrameStateCache.frameState;
      }
      const frameState = getEditorFrameStateForBeat(
        state.model,
        state.selectedBeat,
        viewportHeight,
        pixelsPerBeat,
        judgeLineY
      );
      editorFrameStateCache = {
        model: state.model,
        selectedBeat: state.selectedBeat,
        viewportHeight,
        pixelsPerBeat,
        judgeLineY,
        frameState
      };
      return frameState;
    }
    function getContentHeightForResolvedMode(model, viewportHeight) {
      if (getResolvedViewerMode2() === "editor") {
        return getEditorContentHeightPx(model, viewportHeight, getPixelsPerBeat());
      }
      return getContentHeightPx(model, viewportHeight, getPixelsPerSecond());
    }
    function getScrollTopForResolvedMode(model, selectedTimeSec, viewportHeight) {
      if (getResolvedViewerMode2() === "editor") {
        return getEditorScrollTopForTimeSec(model, selectedTimeSec, viewportHeight, getPixelsPerBeat());
      }
      return getScrollTopForTimeSec(model, selectedTimeSec, viewportHeight, getPixelsPerSecond());
    }
    function getTimeSecForResolvedMode(model, scrollTop) {
      if (getResolvedViewerMode2() === "editor") {
        return getTimeSecForEditorScrollTop(model, scrollTop, getPixelsPerBeat());
      }
      return getTimeSecForScrollTop(model, scrollTop, getPixelsPerSecond());
    }
    function resolveSelectedBeat2(timeSec, beatHint = void 0) {
      if (!state.model || getResolvedViewerMode2() !== "editor") {
        return 0;
      }
      if (Number.isFinite(beatHint)) {
        return getClampedSelectedBeat(state.model, beatHint);
      }
      return getBeatAtTimeSec(state.model, timeSec);
    }
    function setTextIfChanged(element, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.textContent = nextValue;
    }
    function setValueIfChanged(element, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.value = nextValue;
    }
    function setDisabledIfChanged(element, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.disabled = nextValue;
    }
    function setAttributeIfChanged(element, attributeName, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.setAttribute(attributeName, nextValue);
    }
    function setStylePropertyIfChanged(element, propertyName, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.style.setProperty(propertyName, nextValue);
    }
    function setStyleValueIfChanged(element, styleName, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.style[styleName] = nextValue;
    }
    function setCheckedIfChanged(element, nextValue, key) {
      if (uiState[key] === nextValue) {
        return;
      }
      uiState[key] = nextValue;
      element.checked = Boolean(nextValue);
    }
    function setHiddenIfChanged(element, nextValue, key = null) {
      if (!element) {
        return;
      }
      if (key && uiState[key] === nextValue) {
        return;
      }
      element.hidden = Boolean(nextValue);
      element.style.display = nextValue ? "none" : "";
      if (key) {
        uiState[key] = Boolean(nextValue);
      }
    }
    function toggleClassIfChanged(element, className, nextValue, key) {
      const normalizedValue = Boolean(nextValue);
      if (uiState[key] === normalizedValue) {
        return;
      }
      uiState[key] = normalizedValue;
      element.classList.toggle(className, normalizedValue);
    }
    function setHoveredDragHandle(nextHandle, { render = true } = {}) {
      const normalizedHandle = isActiveDragHandleType(nextHandle) ? nextHandle : null;
      if (state.hoveredDragHandle === normalizedHandle) {
        return;
      }
      state.hoveredDragHandle = normalizedHandle;
      if (render) {
        renderScene();
      }
    }
    function updateHoveredDragHandle(event) {
      if (!state.model || !state.isOpen) {
        if (state.hoveredDragHandle) {
          setHoveredDragHandle(null);
        }
        return;
      }
      const hoveredHandle = resolvePointerDragIntent({
        canDragJudgeLine: canDragJudgeLine(event),
        canDragLaneHeight: canDragGameTimingHandle(event),
        canDragLaneCover: canDragGameTimingHandle(event),
        canDragScroll: false,
        isJudgeLineHit: isPointerNearJudgeLine(event),
        isLaneHeightHit: isPointerNearLaneHeightHandle(event),
        isLaneCoverHit: isPointerNearLaneCoverHandle(event)
      });
      const nextHandle = isActiveDragHandleType(hoveredHandle) ? hoveredHandle : null;
      if (nextHandle !== state.hoveredDragHandle) {
        setHoveredDragHandle(nextHandle);
      }
    }
    function isPointerNearJudgeLine(event) {
      const rootRect = root.getBoundingClientRect();
      return isJudgeLineHit({
        pointerClientY: event.clientY,
        rootTop: rootRect.top,
        judgeLineY: getCurrentJudgeLineY(rootRect.height)
      });
    }
    function isPointerNearLaneHeightHandle(event) {
      if (!isGameViewerMode(getResolvedViewerMode2())) {
        return false;
      }
      const rootRect = root.getBoundingClientRect();
      return isJudgeLineHit({
        pointerClientY: event.clientY,
        rootTop: rootRect.top,
        judgeLineY: getCurrentGameLaneGeometry(rootRect.height).laneTopY
      });
    }
    function isPointerNearLaneCoverHandle(event) {
      if (!isGameViewerMode(getResolvedViewerMode2()) || !state.gameTimingConfig.laneCoverVisible) {
        return false;
      }
      const rootRect = root.getBoundingClientRect();
      const laneCoverBounds = getGameLaneCoverBounds(
        rootRect.height,
        state.judgeLinePositionRatio,
        state.gameTimingConfig.laneHeightPercent,
        state.gameTimingConfig.laneCoverPermille
      );
      return isJudgeLineHit({
        pointerClientY: event.clientY,
        rootTop: rootRect.top,
        judgeLineY: laneCoverBounds.bottomY
      });
    }
    function updateDragHandleFromPointer(handleType, event, { notify = false } = {}) {
      if (handleType === "judge-line") {
        updateJudgeLinePositionFromPointer(event, { notify });
        return;
      }
      if (handleType === "lane-height") {
        updateLaneHeightFromPointer(event, { notify });
        return;
      }
      if (handleType === "lane-cover") {
        updateLaneCoverFromPointer(event, { notify });
      }
    }
    function updateJudgeLinePositionFromPointer(event, { notify = false } = {}) {
      const rootRect = root.getBoundingClientRect();
      const pointerOffsetY = event.clientY - rootRect.top;
      const nextRatio = isGameViewerMode(getResolvedViewerMode2()) ? getGameJudgeLinePositionRatioFromPointer(
        pointerOffsetY,
        rootRect.height,
        state.gameTimingConfig.laneHeightPercent
      ) : getJudgeLinePositionRatioFromPointer({
        pointerClientY: event.clientY,
        rootTop: rootRect.top,
        rootHeight: rootRect.height
      });
      if (Math.abs(state.judgeLinePositionRatio - nextRatio) < 1e-6) {
        setHoveredDragHandle("judge-line");
        return;
      }
      state.judgeLinePositionRatio = nextRatio;
      editorFrameStateCache = null;
      setHoveredDragHandle("judge-line", { render: false });
      syncScrollPosition();
      renderScene({ updateChrome: true });
      if (notify) {
        onJudgeLinePositionChange(state.judgeLinePositionRatio);
      }
    }
    function updateLaneHeightFromPointer(event, { notify = false } = {}) {
      const rootRect = root.getBoundingClientRect();
      const nextLaneHeightPercent = getGameLaneHeightPercentFromPointer(
        event.clientY - rootRect.top,
        rootRect.height,
        state.gameTimingConfig.laneHeightPercent
      );
      setHoveredDragHandle("lane-height", { render: false });
      updateGameTimingConfig({ laneHeightPercent: nextLaneHeightPercent }, { notify });
    }
    function updateLaneCoverFromPointer(event, { notify = false } = {}) {
      const rootRect = root.getBoundingClientRect();
      const nextLaneCoverPermille = getGameLaneCoverPermilleFromPointer(
        event.clientY - rootRect.top,
        rootRect.height,
        state.judgeLinePositionRatio,
        state.gameTimingConfig.laneHeightPercent,
        state.gameTimingConfig.laneCoverPermille
      );
      setHoveredDragHandle("lane-cover", { render: false });
      updateGameTimingConfig({ laneCoverPermille: nextLaneCoverPermille }, { notify });
    }
    function getSpacingScaleForMode(mode) {
      return state.spacingScaleByMode[normalizeSpacingMode(mode)] ?? DEFAULT_SPACING_SCALE;
    }
    function updateSpacingScaleForMode(mode, nextScale, { notify = false } = {}) {
      const normalizedMode = normalizeSpacingMode(mode);
      const normalizedScale = clampScale(nextScale);
      if (Math.abs(getSpacingScaleForMode(normalizedMode) - normalizedScale) < 5e-4) {
        return;
      }
      state.spacingScaleByMode = {
        ...state.spacingScaleByMode,
        [normalizedMode]: normalizedScale
      };
      editorFrameStateCache = null;
      refreshLayout();
      if (notify) {
        onSpacingScaleChange(normalizedMode, normalizedScale);
      }
    }
    function updateGameTimingConfig(nextPartialConfig = {}, { notify = false } = {}) {
      const normalizedGameTimingConfig = normalizeGameTimingConfig({
        ...state.gameTimingConfig,
        ...nextPartialConfig
      });
      if (areGameTimingConfigsEqual(state.gameTimingConfig, normalizedGameTimingConfig)) {
        return;
      }
      state.gameTimingConfig = normalizedGameTimingConfig;
      refreshLayout();
      if (notify) {
        onGameTimingConfigChange(state.gameTimingConfig);
      }
    }
    function blurFocusedStatusPanelControl() {
      const activeElement = getDeepActiveElement(
        typeof root.getRootNode === "function" ? root.getRootNode() : root.ownerDocument
      ) ?? getDeepActiveElement(root.ownerDocument);
      if (!activeElement || typeof activeElement.blur !== "function") {
        return;
      }
      if (!isDescendantOf(activeElement, statusPanel)) {
        return;
      }
      activeElement.blur();
    }
  }
  function createModeOption(value, label, disabled = false) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.disabled = disabled;
    return option;
  }
  function createSettingRow(title, className) {
    const row = document.createElement("div");
    row.className = `score-viewer-status-row score-viewer-spacing-row ${className}`;
    const titleElement = document.createElement("span");
    titleElement.className = "score-viewer-spacing-title";
    titleElement.textContent = title;
    const valueElement = document.createElement("span");
    valueElement.className = "score-viewer-spacing-value";
    row.append(titleElement, valueElement);
    return { row, title: titleElement, value: valueElement };
  }
  function getDeepActiveElement(rootNode) {
    let activeElement = rootNode?.activeElement ?? null;
    while (activeElement?.shadowRoot?.activeElement) {
      activeElement = activeElement.shadowRoot.activeElement;
    }
    return activeElement;
  }
  function normalizeWheelDeltaY(deltaY, deltaMode, viewportHeight, lineHeightPx = DEFAULT_WHEEL_LINE_HEIGHT_PX) {
    switch (deltaMode) {
      case 1:
        return deltaY * lineHeightPx;
      case 2:
        return deltaY * Math.max(viewportHeight, 1);
      default:
        return deltaY;
    }
  }
  function shouldSyncPlaybackScrollPosition({
    viewerMode,
    isPlaying,
    currentScrollTop,
    desiredScrollTop,
    viewportHeight
  }) {
    if (!isGameViewerMode(viewerMode) || !isPlaying) {
      return true;
    }
    const threshold = Math.max(
      Math.round(Math.max(viewportHeight, 0) * GAME_PLAYBACK_SCROLL_SYNC_VIEWPORT_RATIO),
      GAME_PLAYBACK_SCROLL_SYNC_MIN_PX
    );
    return Math.abs((desiredScrollTop ?? 0) - (currentScrollTop ?? 0)) >= threshold;
  }
  function isJudgeLineHit({
    pointerClientY,
    rootTop,
    judgeLineY,
    hitMarginPx = JUDGE_LINE_DRAG_HIT_MARGIN_PX
  }) {
    const pointerOffsetY = Number.isFinite(pointerClientY) && Number.isFinite(rootTop) ? pointerClientY - rootTop : Number.NaN;
    return Number.isFinite(pointerOffsetY) && Number.isFinite(judgeLineY) && Math.abs(pointerOffsetY - judgeLineY) <= Math.max(hitMarginPx, 0);
  }
  function getJudgeLinePositionRatioFromPointer({
    pointerClientY,
    rootTop,
    rootHeight
  }) {
    if (!Number.isFinite(rootHeight) || rootHeight <= 0) {
      return DEFAULT_JUDGE_LINE_POSITION_RATIO;
    }
    return normalizeJudgeLinePositionRatio(clamp3(
      (pointerClientY - rootTop) / rootHeight,
      0,
      1
    ));
  }
  function resolvePointerDragIntent({
    canDragJudgeLine,
    canDragLaneHeight,
    canDragLaneCover,
    canDragScroll,
    isJudgeLineHit: isJudgeLineHit2,
    isLaneHeightHit,
    isLaneCoverHit
  }) {
    if (canDragJudgeLine && isJudgeLineHit2) {
      return "judge-line";
    }
    if (canDragLaneHeight && isLaneHeightHit) {
      return "lane-height";
    }
    if (canDragLaneCover && isLaneCoverHit) {
      return "lane-cover";
    }
    if (canDragScroll) {
      return "scroll";
    }
    return null;
  }
  function isActiveDragHandleType(value) {
    return value === "judge-line" || value === "lane-height" || value === "lane-cover";
  }
  function clampScale(value) {
    if (!Number.isFinite(value)) {
      return DEFAULT_SPACING_SCALE;
    }
    return Math.min(Math.max(value, MIN_SPACING_SCALE), MAX_SPACING_SCALE);
  }
  function createDefaultSpacingScaleByMode() {
    return {
      time: DEFAULT_SPACING_SCALE,
      editor: DEFAULT_SPACING_SCALE,
      game: DEFAULT_SPACING_SCALE
    };
  }
  function isGameViewerMode(mode) {
    return mode === "game" || mode === "lunatic";
  }
  function normalizeSpacingMode(mode) {
    return mode === "editor" ? "editor" : isGameViewerMode(mode) ? "game" : "time";
  }
  function normalizeSliderSpacingScale(value) {
    return roundSpacingScaleToStep(clampScale(value), SPACING_STEP);
  }
  function roundSpacingScaleToHundredths(value) {
    return roundSpacingScaleToStep(clampScale(value), SPACING_WHEEL_STEP);
  }
  function roundSpacingScaleToStep(value, step) {
    if (!Number.isFinite(value)) {
      return DEFAULT_SPACING_SCALE;
    }
    const baseValue = Math.round(value / step) * step;
    return Number(clampScale(baseValue).toFixed(2));
  }
  function areSpacingScaleMapsEqual(left, right) {
    return Math.abs((left?.time ?? DEFAULT_SPACING_SCALE) - (right?.time ?? DEFAULT_SPACING_SCALE)) < 5e-4 && Math.abs((left?.editor ?? DEFAULT_SPACING_SCALE) - (right?.editor ?? DEFAULT_SPACING_SCALE)) < 5e-4 && Math.abs((left?.game ?? DEFAULT_SPACING_SCALE) - (right?.game ?? DEFAULT_SPACING_SCALE)) < 5e-4;
  }
  function areGameTimingConfigsEqual(left, right) {
    return Math.abs((left?.durationMs ?? DEFAULT_GAME_DURATION_MS) - (right?.durationMs ?? DEFAULT_GAME_DURATION_MS)) < 1e-6 && Math.abs((left?.laneHeightPercent ?? DEFAULT_GAME_LANE_HEIGHT_PERCENT) - (right?.laneHeightPercent ?? DEFAULT_GAME_LANE_HEIGHT_PERCENT)) < 1e-6 && Math.abs((left?.laneCoverPermille ?? DEFAULT_GAME_LANE_COVER_PERMILLE) - (right?.laneCoverPermille ?? DEFAULT_GAME_LANE_COVER_PERMILLE)) < 1e-6 && (left?.laneCoverVisible ?? DEFAULT_GAME_LANE_COVER_VISIBLE) === (right?.laneCoverVisible ?? DEFAULT_GAME_LANE_COVER_VISIBLE) && (left?.hsFixMode ?? DEFAULT_GAME_HS_FIX_MODE) === (right?.hsFixMode ?? DEFAULT_GAME_HS_FIX_MODE);
  }
  function isPrimaryPointer(event) {
    return event.button === 0 || event.button === -1 || event.button === void 0 || event.pointerType === "touch" || event.pointerType === "pen";
  }
  function clamp3(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }
  function formatSpacingScaleDisplay(mode, value) {
    const normalizedMode = normalizeSpacingMode(mode);
    const normalizedScale = clampScale(value);
    if (normalizedMode === "time") {
      return `${normalizedScale.toFixed(2)}x(${Math.round(DEFAULT_VIEWER_PIXELS_PER_SECOND * normalizedScale)}px/s)`;
    }
    if (normalizedMode === "editor") {
      return `${normalizedScale.toFixed(2)}x(${Math.round(DEFAULT_EDITOR_PIXELS_PER_BEAT * normalizedScale)}px/beat)`;
    }
    return `${normalizedScale.toFixed(2)}x`;
  }
  function formatSpacingDisplay({
    mode,
    spacingScale = DEFAULT_SPACING_SCALE,
    durationMs = DEFAULT_GAME_DURATION_MS
  } = {}) {
    const normalizedMode = normalizeSpacingMode(mode);
    if (normalizedMode === "game") {
      const gameDurationDisplay = formatGameDurationDisplay(durationMs);
      return {
        primaryText: gameDurationDisplay.primaryText,
        secondaryText: gameDurationDisplay.secondaryText,
        secondaryColor: GAME_GREEN_DISPLAY_COLOR
      };
    }
    return {
      primaryText: formatSpacingScaleDisplay(normalizedMode, spacingScale),
      secondaryText: "",
      secondaryColor: ""
    };
  }
  function formatGameDurationDisplay(durationMs) {
    const normalizedDurationMs = normalizeGameDurationMs(durationMs);
    return {
      primaryText: `${normalizedDurationMs}ms`,
      secondaryText: `(${getGameSettingGreenNumber(normalizedDurationMs)})`
    };
  }
  function formatLaneHeightDisplay(laneHeightPercent, viewportHeight, judgeDistancePx) {
    const normalizedLaneHeightPercent = normalizeGameLaneHeightPercent(laneHeightPercent);
    const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
    const normalizedJudgeDistancePx = Math.max(Number.isFinite(judgeDistancePx) ? judgeDistancePx : 0, 0);
    return `${normalizedLaneHeightPercent.toFixed(1)}%(${Math.round(normalizedViewportHeight)}px ${Math.round(normalizedJudgeDistancePx)}px)`;
  }
  function formatLaneCoverDisplay(laneCoverPermille) {
    const normalizedLaneCoverPermille = normalizeGameLaneCoverPermille(laneCoverPermille);
    return `${normalizedLaneCoverPermille}(${(normalizedLaneCoverPermille / 10).toFixed(1)}%)`;
  }
  function formatPlaybackTime(timeSec) {
    const safeTimeSec = Number.isFinite(timeSec) ? Math.max(timeSec, 0) : 0;
    const [secondsPart, fractionPart] = safeTimeSec.toFixed(3).split(".");
    return `${secondsPart.padStart(2, "0")}.${fractionPart}`;
  }
  function formatMeasureCounter(currentMeasureIndex, totalMeasureIndex) {
    const safeTotalMeasureIndex = Math.max(0, Math.floor(Number.isFinite(totalMeasureIndex) ? totalMeasureIndex : 0));
    const safeCurrentMeasureIndex = Math.min(
      Math.max(0, Math.floor(Number.isFinite(currentMeasureIndex) ? currentMeasureIndex : 0)),
      safeTotalMeasureIndex
    );
    const digits = Math.max(3, String(safeTotalMeasureIndex).length);
    return `${String(safeCurrentMeasureIndex).padStart(digits, "0")}/${String(safeTotalMeasureIndex).padStart(digits, "0")}`;
  }
  function isDescendantOf(element, ancestor) {
    let currentNode = element;
    while (currentNode) {
      if (currentNode === ancestor) {
        return true;
      }
      currentNode = currentNode.parentNode ?? null;
    }
    return false;
  }

  // shared/preview-runtime/bms-info-data.js
  var BMSDATA_COLUMNS = [
    "md5",
    "sha256",
    "maxbpm",
    "minbpm",
    "length",
    "mode",
    "judge",
    "feature",
    "notes",
    "n",
    "ln",
    "s",
    "ls",
    "total",
    "density",
    "peakdensity",
    "enddensity",
    "mainbpm",
    "distribution",
    "speedchange",
    "lanenotes",
    "tables",
    "stella",
    "bmsid"
  ];
  var BMS_FEATURE_NAMES = [
    "LN(#LNMODE undef)",
    "MINE",
    "RANDOM",
    "LN",
    "CN",
    "HCN",
    "STOP",
    "SCROLL"
  ];
  var DISTRIBUTION_NOTE_COLORS = [
    "#44FF44",
    "#228822",
    "#FF4444",
    "#4444FF",
    "#222288",
    "#CCCCCC",
    "#880000"
  ];
  var DISTRIBUTION_NOTE_NAMES = [
    "LNSCR",
    "LNSCR HOLD",
    "SCR",
    "LN",
    "LN HOLD",
    "NORMAL",
    "MINE"
  ];
  async function fetchBmsInfoRecordByLookupKey(lookupKey) {
    const response = await fetch(`https://bms.howan.jp/${lookupKey}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch BMS data: HTTP ${response.status}`);
    }
    const text = await response.text();
    const values = text.split("");
    if (values.length !== BMSDATA_COLUMNS.length) {
      throw new Error(`BMS data column count mismatch: expected ${BMSDATA_COLUMNS.length}, got ${values.length}`);
    }
    const rawRecord = {};
    for (let index = 0; index < BMSDATA_COLUMNS.length; index += 1) {
      rawRecord[BMSDATA_COLUMNS[index]] = values[index];
    }
    return normalizeBmsInfoRecord(rawRecord);
  }
  function normalizeBmsInfoRecord(rawRecord) {
    const mode = Number(rawRecord.mode);
    const notes = Number(rawRecord.notes);
    const n = Number(rawRecord.n);
    const ln = Number(rawRecord.ln);
    const s = Number(rawRecord.s);
    const ls = Number(rawRecord.ls);
    const total = Number(rawRecord.total);
    const feature = Number(rawRecord.feature);
    const lengthMs = Number(rawRecord.length);
    return {
      md5: rawRecord.md5,
      sha256: rawRecord.sha256,
      maxbpm: Number(rawRecord.maxbpm),
      minbpm: Number(rawRecord.minbpm),
      mainbpm: Number(rawRecord.mainbpm),
      lengthMs,
      durationSec: lengthMs / 1e3,
      mode,
      judge: Number(rawRecord.judge),
      feature,
      featureNames: BMS_FEATURE_NAMES.filter((name, index) => (feature & 1 << index) !== 0),
      notes,
      n,
      ln,
      s,
      ls,
      total,
      density: Number(rawRecord.density),
      peakdensity: Number(rawRecord.peakdensity),
      enddensity: Number(rawRecord.enddensity),
      distribution: rawRecord.distribution,
      distributionSegments: parseDistributionSegments(rawRecord.distribution),
      speedchange: rawRecord.speedchange,
      speedChangePoints: parseSpeedChange(rawRecord.speedchange),
      lanenotesArr: parseLaneNotes(mode, rawRecord.lanenotes),
      tables: parseTables(rawRecord.tables),
      bmsid: Number(rawRecord.bmsid),
      stella: Number(rawRecord.stella),
      notesStr: `${notes} (N:${n}, LN:${ln}, SCR:${s}, LNSCR:${ls})`,
      totalStr: `${total % 1 === 0 ? Math.round(total) : total} (${notes > 0 ? (total / notes).toFixed(3) : "0.000"} T/N)`,
      durationStr: `${(lengthMs / 1e3).toFixed(2)} s`
    };
  }
  function parseTables(tablesRaw) {
    try {
      return JSON.parse(tablesRaw);
    } catch {
      return [];
    }
  }
  function parseLaneNotes(mode, lanenotes) {
    const tokens = String(lanenotes ?? "").split(",").map((token) => Number(token));
    let laneCount = mode;
    if (mode === 7) {
      laneCount = 8;
    } else if (mode === 14) {
      laneCount = 16;
    } else if (mode === 5) {
      laneCount = 6;
    } else if (mode === 10) {
      laneCount = 12;
    }
    const lanenotesArr = [];
    for (let index = 0; index < laneCount; index += 1) {
      const baseIndex = index * 3;
      const normal = tokens[baseIndex] ?? 0;
      const long = tokens[baseIndex + 1] ?? 0;
      const mine = tokens[baseIndex + 2] ?? 0;
      lanenotesArr.push([normal, long, mine, normal + long]);
    }
    if (mode === 7 || mode === 14) {
      const move = lanenotesArr.splice(7, 1)[0];
      if (move) {
        lanenotesArr.unshift(move);
      }
    } else if (mode === 5 || mode === 10) {
      const move = lanenotesArr.splice(5, 1)[0];
      if (move) {
        lanenotesArr.unshift(move);
      }
    }
    return lanenotesArr;
  }
  function parseDistributionSegments(distribution) {
    const noteTypes = 7;
    const data = String(distribution ?? "").startsWith("#") ? String(distribution).slice(1) : String(distribution ?? "");
    const segments = [];
    for (let index = 0; index < data.length; index += 14) {
      const chunk = data.slice(index, index + 14);
      if (chunk.length !== 14) {
        continue;
      }
      const noteCounts = [];
      for (let typeIndex = 0; typeIndex < noteTypes; typeIndex += 1) {
        const base36 = chunk.slice(typeIndex * 2, typeIndex * 2 + 2);
        noteCounts.push(Number.parseInt(base36, 36) || 0);
      }
      segments.push(noteCounts);
    }
    return segments;
  }
  function parseSpeedChange(raw) {
    const numbers = String(raw ?? "").split(",").map((token) => Number(token)).filter((value) => Number.isFinite(value));
    const result = [];
    for (let index = 0; index < numbers.length; index += 2) {
      result.push([numbers[index], numbers[index + 1]]);
    }
    return result;
  }
  function getLaneChipKey(mode, laneIndex) {
    if (mode === 5 || mode === 10) {
      return `g${laneIndex}`;
    }
    if (mode === 9) {
      return `p${laneIndex}`;
    }
    return String(laneIndex);
  }

  // shared/preview-runtime/bms-info-graph.js
  var RECT_WIDTH = 4;
  var RECT_HEIGHT = 2;
  var SPACING = 1;
  var MIN_RATIO = 1 / 8;
  var MAX_RATIO = 8;
  var MIN_LOG = Math.log10(MIN_RATIO);
  var MAX_LOG = Math.log10(MAX_RATIO);
  var GRAPH_SCROLL_FOLLOW_MIN_MARGIN_PX = 48;
  var GRAPH_SCROLL_FOLLOW_MAX_MARGIN_PX = 160;
  var GRAPH_SELECTED_LINE_DRAG_HIT_PX = 10;
  var GRAPH_SELECTED_LINE_DRAG_CURSOR = "ew-resize";
  var DEFAULT_GRAPH_INTERACTION_MODE = "hover";
  function createBmsInfoGraph({
    scrollHost,
    canvas,
    tooltip,
    pinInput,
    interactionMode = DEFAULT_GRAPH_INTERACTION_MODE,
    onHoverTime = () => {
    },
    onHoverLeave = () => {
    },
    onSelectTime = () => {
    },
    onPinChange = () => {
    }
  }) {
    const context = canvas.getContext("2d");
    const staticCanvas = createLayerCanvas(canvas);
    const staticContext = staticCanvas.getContext("2d");
    const state = {
      record: null,
      selectedTimeSec: 0,
      isPinned: false,
      isPlaying: false,
      interactionMode: normalizeGraphInteractionMode(interactionMode),
      dragPointerId: null,
      stickyDragActive: false
    };
    canvas.addEventListener("mousemove", (event) => {
      if (!state.record) {
        hideTooltip(tooltip);
        updateCanvasCursor();
        return;
      }
      const timeSec = getHoverTimeSec(event, canvas);
      if (state.stickyDragActive) {
        updateSelectionFromPointer(event);
        updateCanvasCursor(event, { forceDragging: true });
        return;
      }
      if (timeSec < 0 || timeSec > state.record.distributionSegments.length) {
        hideTooltip(tooltip);
        updateCanvasCursor(event);
        return;
      }
      renderTooltip(tooltip, event, state.record, timeSec);
      onHoverTime(timeSec);
      if (shouldFollowHoverSelection(state)) {
        onSelectTime(getClampedHoverTimeSec(event, canvas, state.record));
      }
      updateCanvasCursor(event);
    });
    canvas.addEventListener("mouseleave", () => {
      if (state.dragPointerId !== null) {
        return;
      }
      deactivateStickyDrag();
      hideTooltip(tooltip);
      updateCanvasCursor();
      onHoverLeave();
    });
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!state.record) {
        return;
      }
      if (state.stickyDragActive) {
        deactivateStickyDrag(event);
        return;
      }
      state.stickyDragActive = true;
      updateSelectionFromPointer(event);
      updateCanvasCursor(event, { forceDragging: true });
    });
    canvas.addEventListener("click", (event) => {
      if (!state.record) {
        return;
      }
      if (!allowsDirectSelectionInput(state)) {
        return;
      }
      const timeSec = getHoverTimeSec(event, canvas);
      if (timeSec < 0) {
        return;
      }
      onSelectTime(timeSec);
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (!state.record || !allowsDirectSelectionInput(state) || !isPrimaryPointer2(event) || !isPointerNearSelectedLine(event, canvas, state.selectedTimeSec)) {
        return;
      }
      state.dragPointerId = event.pointerId ?? 0;
      if (typeof canvas.setPointerCapture === "function" && event.pointerId !== void 0) {
        canvas.setPointerCapture(event.pointerId);
      }
      updateSelectionFromPointer(event);
      updateCanvasCursor(event, { forceDragging: true });
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (state.dragPointerId === null || event.pointerId !== state.dragPointerId) {
        return;
      }
      updateSelectionFromPointer(event);
      updateCanvasCursor(event, { forceDragging: true });
      event.preventDefault();
    });
    canvas.addEventListener("pointerup", (event) => {
      releaseDragPointer(event);
    });
    canvas.addEventListener("pointercancel", (event) => {
      releaseDragPointer(event);
    });
    pinInput.addEventListener("change", () => {
      onPinChange(pinInput.checked);
    });
    function setRecord(record) {
      state.record = record;
      pinInput.disabled = !record;
      renderStaticScene();
      renderDynamicScene();
    }
    function setSelectedTimeSec(timeSec) {
      state.selectedTimeSec = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0;
      renderDynamicScene();
      syncScrollToSelected();
    }
    function setPinned(nextPinned) {
      state.isPinned = Boolean(nextPinned);
      pinInput.checked = state.isPinned;
      pinInput.disabled = !state.record;
    }
    function setPlaybackState(nextPlaying) {
      state.isPlaying = Boolean(nextPlaying);
    }
    function setInteractionMode(nextInteractionMode) {
      state.interactionMode = normalizeGraphInteractionMode(nextInteractionMode);
    }
    function updateSelectionFromPointer(event) {
      const timeSec = getClampedHoverTimeSec(event, canvas, state.record);
      renderTooltip(tooltip, event, state.record, timeSec);
      onSelectTime(timeSec);
    }
    function releaseDragPointer(event) {
      if (state.dragPointerId === null || event.pointerId !== state.dragPointerId) {
        return;
      }
      if (typeof canvas.releasePointerCapture === "function" && event.pointerId !== void 0) {
        try {
          if (typeof canvas.hasPointerCapture !== "function" || canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
          }
        } catch {
        }
      }
      state.dragPointerId = null;
      updateCanvasCursor(event);
    }
    function deactivateStickyDrag(event = null) {
      if (!state.stickyDragActive) {
        return;
      }
      state.stickyDragActive = false;
      updateCanvasCursor(event);
    }
    function updateCanvasCursor(event = null, { forceDragging = false } = {}) {
      if (!canvas?.style) {
        return;
      }
      const showDragCursor = state.stickyDragActive || forceDragging || event && state.record && isPointerNearSelectedLine(event, canvas, state.selectedTimeSec);
      canvas.style.cursor = showDragCursor ? GRAPH_SELECTED_LINE_DRAG_CURSOR : "";
    }
    function renderStaticScene() {
      const record = state.record;
      if (!record) {
        staticCanvas.width = 640;
        staticCanvas.height = 180;
        staticContext.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
        staticContext.fillStyle = "#000000";
        staticContext.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
        return;
      }
      const segments = record.distributionSegments;
      const timeLength = Math.max(segments.length, 1);
      const maxNotesPerSecond = Math.max(40, Math.min(record.peakdensity || 0, 100));
      const canvasWidth = timeLength * (RECT_WIDTH + SPACING);
      const canvasHeight = maxNotesPerSecond * (RECT_HEIGHT + SPACING) - SPACING;
      staticCanvas.width = canvasWidth;
      staticCanvas.height = canvasHeight;
      staticContext.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
      staticContext.fillStyle = "#000000";
      staticContext.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
      drawHorizontalGrid(staticContext, canvasWidth, canvasHeight, maxNotesPerSecond);
      drawVerticalGrid(staticContext, canvasWidth, canvasHeight, timeLength);
      drawDistributionBars(staticContext, segments, canvasHeight, maxNotesPerSecond);
      drawSpeedChangeLines(staticContext, record, canvasWidth, canvasHeight, timeLength);
    }
    function renderDynamicScene() {
      const targetWidth = Math.max(staticCanvas.width || 640, 1);
      const targetHeight = Math.max(staticCanvas.height || 180, 1);
      if (canvas.width !== targetWidth) {
        canvas.width = targetWidth;
      }
      if (canvas.height !== targetHeight) {
        canvas.height = targetHeight;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(staticCanvas, 0, 0);
      drawSelectedTimeLine(context, timeToX(state.selectedTimeSec), canvas.height);
    }
    function syncScrollToSelected() {
      if (!state.record || !scrollHost) {
        return;
      }
      const x = timeToX(state.selectedTimeSec);
      const desired = getGraphFollowScrollLeft({
        targetX: x,
        currentScrollLeft: scrollHost.scrollLeft,
        clientWidth: scrollHost.clientWidth,
        scrollWidth: scrollHost.scrollWidth
      });
      if (Math.abs(scrollHost.scrollLeft - desired) > 1) {
        scrollHost.scrollLeft = desired;
      }
    }
    renderStaticScene();
    renderDynamicScene();
    return {
      setRecord,
      setSelectedTimeSec,
      setPinned,
      setPlaybackState,
      setInteractionMode,
      render() {
        renderStaticScene();
        renderDynamicScene();
      },
      destroy() {
      }
    };
  }
  function normalizeGraphInteractionMode(value) {
    return value === "drag" ? "drag" : DEFAULT_GRAPH_INTERACTION_MODE;
  }
  function shouldFollowHoverSelection(state) {
    return state.interactionMode === "hover" && !state.isPlaying;
  }
  function allowsDirectSelectionInput(state) {
    return state.interactionMode === "drag" || state.isPlaying;
  }
  function createLayerCanvas(referenceCanvas) {
    if (typeof referenceCanvas?.ownerDocument?.createElement === "function") {
      return referenceCanvas.ownerDocument.createElement("canvas");
    }
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      return document.createElement("canvas");
    }
    throw new Error("Canvas layer creation requires a document.");
  }
  function drawHorizontalGrid(context, canvasWidth, canvasHeight, maxNotesPerSecond) {
    context.strokeStyle = "#202080";
    context.lineWidth = 1;
    for (let count = 5; count < maxNotesPerSecond; count += 5) {
      const y = canvasHeight - (count * (RECT_HEIGHT + SPACING) - 0.5);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvasWidth, y);
      context.stroke();
    }
  }
  function drawVerticalGrid(context, canvasWidth, canvasHeight, timeLength) {
    context.strokeStyle = "#777777";
    context.lineWidth = 1;
    for (let second = 10; second < timeLength; second += 10) {
      const x = second * (RECT_WIDTH + SPACING) - 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvasHeight);
      context.stroke();
    }
  }
  function drawDistributionBars(context, segments, canvasHeight, maxNotesPerSecond) {
    segments.forEach((counts, timeIndex) => {
      let yOffset = 0;
      for (let typeIndex = 0; typeIndex < DISTRIBUTION_NOTE_COLORS.length; typeIndex += 1) {
        const count = counts[typeIndex];
        const color = DISTRIBUTION_NOTE_COLORS[typeIndex];
        for (let index = 0; index < count; index += 1) {
          const x = timeIndex * (RECT_WIDTH + SPACING);
          const y = canvasHeight - ((yOffset + 1) * RECT_HEIGHT + yOffset * SPACING);
          if (y < 0 || yOffset >= maxNotesPerSecond) {
            break;
          }
          context.fillStyle = color;
          context.fillRect(x, y, RECT_WIDTH, RECT_HEIGHT);
          yOffset += 1;
        }
      }
    });
  }
  function drawSpeedChangeLines(context, record, canvasWidth, canvasHeight, timeLength) {
    const points = record.speedChangePoints;
    const paintedVerticalRowsByRegion = /* @__PURE__ */ new Map();
    for (let index = 0; index < points.length; index += 1) {
      const [bpm, time] = points[index];
      const x1 = timeToX(time / 1e3);
      const y1 = logScaleY(bpm, record.mainbpm, canvasHeight) - 1;
      const next = points[index + 1];
      const x2 = next ? timeToX(next[1] / 1e3) : canvasWidth;
      let color = "#ffff00";
      if (bpm <= 0) {
        color = "#ff00ff";
      } else if (bpm === record.mainbpm) {
        color = "#00ff00";
      } else if (bpm === record.minbpm) {
        color = "#0000ff";
      } else if (bpm === record.maxbpm) {
        color = "#ff0000";
      }
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x1 - 1, y1);
      context.lineTo(x2 + 1, y1);
      context.stroke();
      if (next) {
        const y2 = logScaleY(next[0], record.mainbpm, canvasHeight) - 1;
        if (Math.abs(y2 - y1) >= 1) {
          const coveredColumns = getStrokeCoveredColumns(x2, context.lineWidth);
          const strokeStartY = y2 < y1 ? y2 + 1 : y1 + 1;
          const strokeEndY = y2 < y1 ? y1 - 1 : y2 - 1;
          const strokeRegionKey = getVerticalStrokeRegionKey(coveredColumns);
          const paintedRows = paintedVerticalRowsByRegion.get(strokeRegionKey) ?? /* @__PURE__ */ new Set();
          const unpaintedRanges = getUnpaintedVerticalStrokeRanges(strokeStartY, strokeEndY, paintedRows);
          if (unpaintedRanges.length === 0) {
            continue;
          }
          context.strokeStyle = "rgba(127, 127, 127, 0.5)";
          for (const [segmentStartY, segmentEndY] of unpaintedRanges) {
            context.beginPath();
            context.moveTo(x2, segmentStartY);
            context.lineTo(x2, segmentEndY);
            context.stroke();
            markVerticalStrokeRowsAsPainted(segmentStartY, segmentEndY, paintedRows);
          }
          paintedVerticalRowsByRegion.set(strokeRegionKey, paintedRows);
        }
      }
    }
  }
  function getStrokeCoveredColumns(centerX, lineWidth) {
    const safeCenterX = Number.isFinite(centerX) ? centerX : 0;
    const safeLineWidth = Number.isFinite(lineWidth) && lineWidth > 0 ? lineWidth : 1;
    const startColumn = Math.floor(safeCenterX - safeLineWidth / 2);
    const endColumn = Math.ceil(safeCenterX + safeLineWidth / 2) - 1;
    const columns = [];
    for (let column = startColumn; column <= endColumn; column += 1) {
      columns.push(column);
    }
    return columns;
  }
  function getVerticalStrokeRegionKey(columns) {
    return columns.join(",");
  }
  function getUnpaintedVerticalStrokeRanges(startY, endY, paintedRows) {
    const coveredRows = getStrokeCoveredRows(startY, endY);
    const ranges = [];
    let rangeStart = null;
    let rangeEnd = null;
    for (const row of coveredRows) {
      if (paintedRows.has(row)) {
        if (rangeStart !== null) {
          ranges.push([rangeStart, rangeEnd]);
          rangeStart = null;
          rangeEnd = null;
        }
        continue;
      }
      if (rangeStart === null) {
        rangeStart = row;
      }
      rangeEnd = row;
    }
    if (rangeStart !== null) {
      ranges.push([rangeStart, rangeEnd]);
    }
    return ranges;
  }
  function getStrokeCoveredRows(startY, endY) {
    const lowerBound = Math.floor(Math.min(startY, endY));
    const upperBound = Math.ceil(Math.max(startY, endY));
    const rows = [];
    for (let row = lowerBound; row <= upperBound; row += 1) {
      rows.push(row);
    }
    return rows;
  }
  function markVerticalStrokeRowsAsPainted(startY, endY, paintedRows) {
    for (const row of getStrokeCoveredRows(startY, endY)) {
      paintedRows.add(row);
    }
  }
  function drawSelectedTimeLine(context, x, canvasHeight) {
    context.save();
    context.strokeStyle = "#ff2c2c";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvasHeight);
    context.stroke();
    context.restore();
  }
  function renderTooltip(tooltip, event, record, timeSec) {
    const timeIndex = Math.floor(timeSec);
    const counts = record.distributionSegments[timeIndex] ?? Array.from({ length: 7 }, () => 0);
    let bpmDisplay = 0;
    for (let index = record.speedChangePoints.length - 1; index >= 0; index -= 1) {
      if (timeSec * 1e3 >= record.speedChangePoints[index][1]) {
        bpmDisplay = record.speedChangePoints[index][0];
        break;
      }
    }
    let html = `${timeSec.toFixed(1)} sec<br>`;
    html += `BPM: ${bpmDisplay}<br>`;
    html += `Notes: ${counts.reduce((total, count) => total + count, 0)}<br>`;
    counts.forEach((count, index) => {
      if (count > 0) {
        html += `<span style="color: ${DISTRIBUTION_NOTE_COLORS[index]}; background-color: transparent;">■</span> ${count} - ${DISTRIBUTION_NOTE_NAMES[index]}<br>`;
      }
    });
    tooltip.innerHTML = html;
    tooltip.style.left = `${event.clientX + 10}px`;
    tooltip.style.top = `${event.clientY + 10}px`;
    tooltip.style.display = "block";
  }
  function hideTooltip(tooltip) {
    tooltip.style.display = "none";
  }
  function getHoverTimeSec(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    return mouseX / (RECT_WIDTH + SPACING);
  }
  function getClampedHoverTimeSec(event, canvas, record) {
    const maxTimeSec = Math.max(record?.distributionSegments?.length ?? 0, 0);
    return clamp4(getHoverTimeSec(event, canvas), 0, maxTimeSec);
  }
  function isPointerNearSelectedLine(event, canvas, selectedTimeSec) {
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const selectedLineX = timeToX(selectedTimeSec);
    return Math.abs(pointerX - selectedLineX) <= GRAPH_SELECTED_LINE_DRAG_HIT_PX;
  }
  function isPrimaryPointer2(event) {
    return event.button === 0 || event.pointerType === "touch" || event.pointerType === "pen";
  }
  function logScaleY(bpm, mainBpm, canvasHeight) {
    const ratio = Math.min(Math.max(bpm / mainBpm, MIN_RATIO), MAX_RATIO);
    const logValue = Math.log10(ratio);
    const t = (logValue - MIN_LOG) / (MAX_LOG - MIN_LOG);
    return canvasHeight - Math.round(t * (canvasHeight - 2));
  }
  function timeToX(timeSec) {
    return Math.round(timeSec * (RECT_WIDTH + SPACING)) + 1;
  }
  function getGraphFollowScrollLeft({
    targetX,
    currentScrollLeft,
    clientWidth,
    scrollWidth
  }) {
    const safeClientWidth = Math.max(clientWidth ?? 0, 1);
    const maxScrollLeft = Math.max(0, (scrollWidth ?? 0) - safeClientWidth);
    const marginPx = clamp4(safeClientWidth * 0.2, GRAPH_SCROLL_FOLLOW_MIN_MARGIN_PX, GRAPH_SCROLL_FOLLOW_MAX_MARGIN_PX);
    const leftBound = (currentScrollLeft ?? 0) + marginPx;
    const rightBound = (currentScrollLeft ?? 0) + safeClientWidth - marginPx;
    if (targetX >= leftBound && targetX <= rightBound) {
      return clamp4(currentScrollLeft ?? 0, 0, maxScrollLeft);
    }
    return clamp4(targetX - safeClientWidth / 2, 0, maxScrollLeft);
  }
  function clamp4(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }

  // shared/preview-runtime/index.js
  var BMSDATA_STYLE_ID = "bms-info-extender-style";
  var BMSSEARCH_PATTERN_API_BASE_URL = "https://api.bmssearch.net/v1/patterns/sha256";
  var BMSSEARCH_PATTERN_PAGE_BASE_URL = "https://bmssearch.net/patterns";
  var SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS = 250;
  var VIEWER_MODE_STORAGE_KEY = "bms-info-extender.viewerMode";
  var INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY = "bms-info-extender.invisibleNoteVisibility";
  var JUDGE_LINE_POSITION_RATIO_STORAGE_KEY = "bms-info-extender.judgeLinePositionRatio";
  var SPACING_SCALE_STORAGE_KEYS = Object.freeze({
    time: "bms-info-extender.spacingScale.time",
    editor: "bms-info-extender.spacingScale.editor",
    game: "bms-info-extender.spacingScale.game"
  });
  var GAME_DURATION_MS_STORAGE_KEY = "bms-info-extender.game.durationMs";
  var GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY = "bms-info-extender.game.laneHeightPercent";
  var GAME_LANE_COVER_PERMILLE_STORAGE_KEY = "bms-info-extender.game.laneCoverPermille";
  var GAME_LANE_COVER_VISIBLE_STORAGE_KEY = "bms-info-extender.game.laneCoverVisible";
  var GAME_HS_FIX_MODE_STORAGE_KEY = "bms-info-extender.game.hsFixMode";
  var GRAPH_INTERACTION_MODE_STORAGE_KEY = "bms-info-extender.graphInteractionMode";
  var VIEWER_NOTE_WIDTH_STORAGE_KEY = "bms-info-extender.viewer.noteWidth";
  var VIEWER_SCRATCH_WIDTH_STORAGE_KEY = "bms-info-extender.viewer.scratchWidth";
  var VIEWER_NOTE_HEIGHT_STORAGE_KEY = "bms-info-extender.viewer.noteHeight";
  var VIEWER_BAR_LINE_HEIGHT_STORAGE_KEY = "bms-info-extender.viewer.barLineHeight";
  var VIEWER_MARKER_HEIGHT_STORAGE_KEY = "bms-info-extender.viewer.markerHeight";
  var VIEWER_SEPARATOR_WIDTH_STORAGE_KEY = "bms-info-extender.viewer.separatorWidth";
  var DEFAULT_SPACING_SCALE2 = 1;
  var SCORE_VIEWER_JUDGE_LINE_HEIGHT_PX = 2;
  var PREVIEW_RENDER_DIRTY = {
    record: 1 << 0,
    selection: 1 << 1,
    viewerModel: 1 << 2,
    playback: 1 << 3,
    pin: 1 << 4,
    viewerMode: 1 << 5,
    invisible: 1 << 6,
    judgeLinePosition: 1 << 7,
    spacing: 1 << 8,
    gameTimingConfig: 1 << 9,
    viewerOpen: 1 << 10,
    graphInteractionMode: 1 << 11,
    graphSettings: 1 << 12,
    rendererConfig: 1 << 13,
    viewerDetailSettings: 1 << 14
  };
  var PREVIEW_RENDER_ALL = Object.values(PREVIEW_RENDER_DIRTY).reduce((mask, flag) => mask | flag, 0);
  var bmsSearchPatternAvailabilityCache = /* @__PURE__ */ new Map();
  function createPreviewPreferenceStorage({ read = () => null, write = () => {
  } } = {}) {
    return {
      getPersistedViewerMode() {
        try {
          return read(VIEWER_MODE_STORAGE_KEY, DEFAULT_VIEWER_MODE);
        } catch (_error) {
          return DEFAULT_VIEWER_MODE;
        }
      },
      setPersistedViewerMode(nextViewerMode) {
        try {
          write(VIEWER_MODE_STORAGE_KEY, nextViewerMode);
        } catch (_error) {
        }
      },
      getPersistedInvisibleNoteVisibility() {
        try {
          return read(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, DEFAULT_INVISIBLE_NOTE_VISIBILITY);
        } catch (_error) {
          return DEFAULT_INVISIBLE_NOTE_VISIBILITY;
        }
      },
      setPersistedInvisibleNoteVisibility(nextVisibility) {
        try {
          write(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, nextVisibility);
        } catch (_error) {
        }
      },
      getPersistedJudgeLinePositionRatio() {
        try {
          const persistedValue = read(
            JUDGE_LINE_POSITION_RATIO_STORAGE_KEY,
            DEFAULT_JUDGE_LINE_POSITION_RATIO
          );
          if (persistedValue === null || persistedValue === void 0 || persistedValue === "") {
            return DEFAULT_JUDGE_LINE_POSITION_RATIO;
          }
          return normalizeJudgeLinePositionRatio(Number(persistedValue));
        } catch (_error) {
          return DEFAULT_JUDGE_LINE_POSITION_RATIO;
        }
      },
      setPersistedJudgeLinePositionRatio(nextRatio) {
        try {
          write(JUDGE_LINE_POSITION_RATIO_STORAGE_KEY, normalizeJudgeLinePositionRatio(nextRatio));
        } catch (_error) {
        }
      },
      getPersistedSpacingScale(mode) {
        try {
          return normalizeSpacingScale(
            Number(read(getSpacingScaleStorageKey(mode), DEFAULT_SPACING_SCALE2))
          );
        } catch (_error) {
          return DEFAULT_SPACING_SCALE2;
        }
      },
      setPersistedSpacingScale(mode, value) {
        try {
          write(getSpacingScaleStorageKey(mode), normalizeSpacingScale(value));
        } catch (_error) {
        }
      },
      getPersistedGameDurationMs() {
        try {
          return normalizeGameDurationMs(Number(read(GAME_DURATION_MS_STORAGE_KEY, DEFAULT_GAME_DURATION_MS)));
        } catch (_error) {
          return DEFAULT_GAME_DURATION_MS;
        }
      },
      setPersistedGameDurationMs(value) {
        try {
          write(GAME_DURATION_MS_STORAGE_KEY, normalizeGameDurationMs(value));
        } catch (_error) {
        }
      },
      getPersistedGameLaneHeightPercent() {
        try {
          return normalizeGameLaneHeightPercent(
            Number(read(GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY, DEFAULT_GAME_LANE_HEIGHT_PERCENT))
          );
        } catch (_error) {
          return DEFAULT_GAME_LANE_HEIGHT_PERCENT;
        }
      },
      setPersistedGameLaneHeightPercent(value) {
        try {
          write(GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY, normalizeGameLaneHeightPercent(value));
        } catch (_error) {
        }
      },
      getPersistedGameLaneCoverPermille() {
        try {
          return normalizeGameLaneCoverPermille(
            Number(read(GAME_LANE_COVER_PERMILLE_STORAGE_KEY, DEFAULT_GAME_LANE_COVER_PERMILLE))
          );
        } catch (_error) {
          return DEFAULT_GAME_LANE_COVER_PERMILLE;
        }
      },
      setPersistedGameLaneCoverPermille(value) {
        try {
          write(GAME_LANE_COVER_PERMILLE_STORAGE_KEY, normalizeGameLaneCoverPermille(value));
        } catch (_error) {
        }
      },
      getPersistedGameLaneCoverVisible() {
        try {
          return normalizeGameLaneCoverVisible(
            read(GAME_LANE_COVER_VISIBLE_STORAGE_KEY, DEFAULT_GAME_LANE_COVER_VISIBLE)
          );
        } catch (_error) {
          return DEFAULT_GAME_LANE_COVER_VISIBLE;
        }
      },
      setPersistedGameLaneCoverVisible(value) {
        try {
          write(GAME_LANE_COVER_VISIBLE_STORAGE_KEY, normalizeGameLaneCoverVisible(value));
        } catch (_error) {
        }
      },
      getPersistedGameHsFixMode() {
        try {
          return normalizeGameHsFixMode(read(GAME_HS_FIX_MODE_STORAGE_KEY, DEFAULT_GAME_HS_FIX_MODE));
        } catch (_error) {
          return DEFAULT_GAME_HS_FIX_MODE;
        }
      },
      setPersistedGameHsFixMode(value) {
        try {
          write(GAME_HS_FIX_MODE_STORAGE_KEY, normalizeGameHsFixMode(value));
        } catch (_error) {
        }
      },
      getPersistedGraphInteractionMode() {
        try {
          return normalizeGraphInteractionMode(
            read(GRAPH_INTERACTION_MODE_STORAGE_KEY, DEFAULT_GRAPH_INTERACTION_MODE)
          );
        } catch (_error) {
          return DEFAULT_GRAPH_INTERACTION_MODE;
        }
      },
      setPersistedGraphInteractionMode(value) {
        try {
          write(
            GRAPH_INTERACTION_MODE_STORAGE_KEY,
            normalizeGraphInteractionMode(value)
          );
        } catch (_error) {
        }
      },
      getPersistedViewerNoteWidth() {
        try {
          return normalizeRendererConfig({
            noteWidth: read(VIEWER_NOTE_WIDTH_STORAGE_KEY, DEFAULT_RENDERER_CONFIG.noteWidth)
          }).noteWidth;
        } catch (_error) {
          return DEFAULT_RENDERER_CONFIG.noteWidth;
        }
      },
      setPersistedViewerNoteWidth(value) {
        try {
          write(VIEWER_NOTE_WIDTH_STORAGE_KEY, normalizeRendererConfig({ noteWidth: value }).noteWidth);
        } catch (_error) {
        }
      },
      getPersistedViewerScratchWidth() {
        try {
          return normalizeRendererConfig({
            scratchWidth: read(VIEWER_SCRATCH_WIDTH_STORAGE_KEY, DEFAULT_RENDERER_CONFIG.scratchWidth)
          }).scratchWidth;
        } catch (_error) {
          return DEFAULT_RENDERER_CONFIG.scratchWidth;
        }
      },
      setPersistedViewerScratchWidth(value) {
        try {
          write(VIEWER_SCRATCH_WIDTH_STORAGE_KEY, normalizeRendererConfig({ scratchWidth: value }).scratchWidth);
        } catch (_error) {
        }
      },
      getPersistedViewerNoteHeight() {
        try {
          return normalizeRendererConfig({
            noteHeight: read(VIEWER_NOTE_HEIGHT_STORAGE_KEY, DEFAULT_RENDERER_CONFIG.noteHeight)
          }).noteHeight;
        } catch (_error) {
          return DEFAULT_RENDERER_CONFIG.noteHeight;
        }
      },
      setPersistedViewerNoteHeight(value) {
        try {
          write(VIEWER_NOTE_HEIGHT_STORAGE_KEY, normalizeRendererConfig({ noteHeight: value }).noteHeight);
        } catch (_error) {
        }
      },
      getPersistedViewerBarLineHeight() {
        try {
          return normalizeRendererConfig({
            barLineHeight: read(VIEWER_BAR_LINE_HEIGHT_STORAGE_KEY, DEFAULT_RENDERER_CONFIG.barLineHeight)
          }).barLineHeight;
        } catch (_error) {
          return DEFAULT_RENDERER_CONFIG.barLineHeight;
        }
      },
      setPersistedViewerBarLineHeight(value) {
        try {
          write(VIEWER_BAR_LINE_HEIGHT_STORAGE_KEY, normalizeRendererConfig({ barLineHeight: value }).barLineHeight);
        } catch (_error) {
        }
      },
      getPersistedViewerMarkerHeight() {
        try {
          return normalizeRendererConfig({
            markerHeight: read(VIEWER_MARKER_HEIGHT_STORAGE_KEY, DEFAULT_RENDERER_CONFIG.markerHeight)
          }).markerHeight;
        } catch (_error) {
          return DEFAULT_RENDERER_CONFIG.markerHeight;
        }
      },
      setPersistedViewerMarkerHeight(value) {
        try {
          write(VIEWER_MARKER_HEIGHT_STORAGE_KEY, normalizeRendererConfig({ markerHeight: value }).markerHeight);
        } catch (_error) {
        }
      },
      getPersistedViewerSeparatorWidth() {
        try {
          return normalizeRendererConfig({
            separatorWidth: read(VIEWER_SEPARATOR_WIDTH_STORAGE_KEY, DEFAULT_RENDERER_CONFIG.separatorWidth)
          }).separatorWidth;
        } catch (_error) {
          return DEFAULT_RENDERER_CONFIG.separatorWidth;
        }
      },
      setPersistedViewerSeparatorWidth(value) {
        try {
          write(VIEWER_SEPARATOR_WIDTH_STORAGE_KEY, normalizeRendererConfig({ separatorWidth: value }).separatorWidth);
        } catch (_error) {
        }
      }
    };
  }
  function expandPreviewRenderMask(renderMask = 0) {
    let expandedMask = renderMask;
    if (expandedMask & PREVIEW_RENDER_DIRTY.viewerModel) {
      expandedMask |= PREVIEW_RENDER_DIRTY.viewerMode | PREVIEW_RENDER_DIRTY.invisible | PREVIEW_RENDER_DIRTY.judgeLinePosition | PREVIEW_RENDER_DIRTY.spacing | PREVIEW_RENDER_DIRTY.gameTimingConfig | PREVIEW_RENDER_DIRTY.rendererConfig;
    }
    return expandedMask;
  }
  var BMSDATA_CSS = `
  .bmsdata {
    --bd-dctx: #333;
    --bd-dcbk: #fff;
    --bd-hdtx: #eef;
    --bd-hdbk: #669;
  }
  .bmsdata * { line-height: 100%; color: var(--bd-dctx); background-color: var(--bd-dcbk); font-family: "Inconsolata", "Noto Sans JP"; vertical-align: middle; box-sizing: content-box; }
  .bd-info { display: flex; border: 0px; height: 9.6rem; }
  .bd-info a { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border: 1px solid; border-radius: 2px; font-size: 0.750rem; color: #155dfc; text-decoration: none; }
  .bd-info a:hover { color: red; }
  .bd-icon { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border-radius: 2px; background: var(--bd-dctx); color: var(--bd-dcbk); font-size: 0.750rem; }
  .bd-icon:nth-child(n+2) { margin-left: 0.4rem; }
  .bd-info .bd-info-table { flex: 1; border-collapse: collapse; height: 100%; }
  .bd-info td { border: unset; padding: 0.1rem 0.2rem; height: 1rem; white-space: nowrap; font-size: 0.875rem; }
  .bd-info .bd-header-cell { background-color: var(--bd-hdbk); color: var(--bd-hdtx); }
  .bd-info .bd-lanenote { margin-right: 0.2rem; padding: 0.1rem 0.2rem; border-radius: 2px; font-size: 0.750rem; }
  .bd-table-list { flex: 1; display: flex; min-width: 100px; flex-direction: column; box-sizing: border-box; }
  .bd-table-list .bd-header-cell { padding: 0.1rem 0.2rem; min-height: 1rem; white-space: nowrap; font-size: 0.875rem; color: var(--bd-hdtx); display: flex; align-items: center; }
  .bd-table-scroll { overflow: auto; flex: 1 1 auto; scrollbar-color: var(--bd-hdbk) white; scrollbar-width: thin; }
  .bd-table-list ul { padding: 0.1rem 0.2rem; margin: 0; }
  .bd-table-list li { margin-bottom: 0.2rem; line-height: 1rem; font-size: 0.875rem; white-space: nowrap; list-style-type: none; }
  .bd-lanenote[lane="0"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="1"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="2"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="3"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="4"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="5"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="6"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="7"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="8"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="9"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="10"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="11"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="12"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="13"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="14"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="15"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="g0"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="g1"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g2"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g3"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g4"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g5"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g6"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g7"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g8"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g9"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g10"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g11"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="p0"] { background: #c4c4c4; color: #000; }
  .bd-lanenote[lane="p1"] { background: #fff500; color: #000; }
  .bd-lanenote[lane="p2"] { background: #99ff67; color: #000; }
  .bd-lanenote[lane="p3"] { background: #30b9f9; color: #000; }
  .bd-lanenote[lane="p4"] { background: #ff6c6c; color: #000; }
  .bd-lanenote[lane="p5"] { background: #30b9f9; color: #000; }
  .bd-lanenote[lane="p6"] { background: #99ff67; color: #000; }
  .bd-lanenote[lane="p7"] { background: #fff500; color: #000; }
  .bd-lanenote[lane="p8"] { background: #c4c4c4; color: #000; }
`;
  var ISOLATED_UI_FONT_FAMILY = '"Inconsolata", "Noto Sans JP"';
  var ISOLATED_UI_HOST_CLASS = "bmsie-surface-host";
  var GRAPH_SURFACE_HOST_CLASS = "bmsie-graph-surface-host";
  var OVERLAY_SURFACE_HOST_CLASS = "bmsie-overlay-surface-host";
  var PREVIEW_OVERLAY_HOST_ID = "bd-preview-overlay-host";
  var ISOLATED_UI_BASE_CSS = `
  :host,
  :host *,
  :host *::before,
  :host *::after,
  .bmsie-surface-root,
  .bmsie-surface-root *,
  .bmsie-surface-root *::before,
  .bmsie-surface-root *::after {
    box-sizing: border-box;
  }

  .bmsie-surface-root {
    all: initial;
    position: relative;
    display: block;
    min-inline-size: 0;
    color: #fff;
    font-family: ${ISOLATED_UI_FONT_FAMILY};
    font-size: 16px;
    line-height: 1.25;
    box-sizing: border-box;
  }

  .bmsie-ui-button {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    min-inline-size: 0;
    align-items: center;
    justify-content: center;
    color: inherit;
    font: inherit;
    line-height: inherit;
    text-align: center;
    white-space: nowrap;
    cursor: pointer;
  }

  .bmsie-ui-input,
  .bmsie-ui-select {
    all: unset;
    box-sizing: border-box;
    display: block;
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    padding: 1px 6px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 4px;
    background: rgba(16, 16, 28, 0.95);
    color: inherit;
    font: inherit;
    line-height: inherit;
  }

  .bmsie-ui-input[type="number"] {
    appearance: textfield;
    -webkit-appearance: textfield;
  }

  .bmsie-ui-select {
    appearance: auto;
    -webkit-appearance: menulist;
    padding: 1px;
  }

  .bmsie-ui-checkbox {
    all: unset;
    box-sizing: border-box;
    display: inline-block;
    inline-size: 12px;
    min-inline-size: 12px;
    block-size: 12px;
    min-block-size: 12px;
    margin: 0;
    color: inherit;
    font: inherit;
    line-height: inherit;
    accent-color: #ffffff;
    appearance: auto;
    -webkit-appearance: checkbox;
    cursor: pointer;
  }

  .bmsie-ui-range {
    all: unset;
    box-sizing: border-box;
    display: block;
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    color: inherit;
    font: inherit;
    line-height: inherit;
    accent-color: #ffffff;
    appearance: auto;
    -webkit-appearance: auto;
    cursor: pointer;
  }
`;
  var GRAPH_SURFACE_CSS = `
  :host {
    all: initial;
    position: relative;
    display: block;
    overflow-x: auto;
    overflow-y: hidden;
    background: #000;
    scrollbar-color: var(--bd-hdbk, #669) black;
    scrollbar-width: thin;
    contain: layout paint style;
    color: #fff;
    font-family: ${ISOLATED_UI_FONT_FAMILY};
    font-size: 16px;
    line-height: 1.25;
    box-sizing: border-box;
    text-size-adjust: 100%;
    -webkit-text-size-adjust: 100%;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ${ISOLATED_UI_BASE_CSS}

  .bmsie-graph-surface {
    position: relative;
    display: inline-block;
    min-inline-size: 100%;
    line-height: 0;
    background: #000;
  }

  .bd-graph-canvas {
    display: block;
    background: #000;
  }

  .bd-graph-toolbar {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .bd-graph-toolbar-button {
    inline-size: 18px;
    min-inline-size: 18px;
    block-size: 18px;
    min-block-size: 18px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    font-size: 0.8125rem;
    line-height: 1;
    box-shadow: none;
  }

  .bd-graph-toolbar-button:hover {
    background: rgba(255, 255, 255, 0.24);
  }

  .bd-graph-toolbar-button:focus-visible {
    outline: 1px solid rgba(145, 210, 255, 0.95);
    outline-offset: 1px;
  }

  .bd-scoreviewer-pin {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    border-radius: 6px;
    background: rgba(32, 32, 64, 0.5);
    color: #fff;
    font-size: 0.75rem;
    line-height: 1.25;
    white-space: nowrap;
  }

  .bd-scoreviewer-pin span {
    display: inline-block;
    white-space: nowrap;
  }
`;
  var OVERLAY_SURFACE_CSS = `
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147482998;
    pointer-events: none;
    color: #fff;
    font-family: ${ISOLATED_UI_FONT_FAMILY};
    font-size: 16px;
    line-height: 1.25;
    box-sizing: border-box;
    text-size-adjust: 100%;
    -webkit-text-size-adjust: 100%;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ${ISOLATED_UI_BASE_CSS}

  .bmsie-overlay-surface {
    position: relative;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
  }

  .bd-graph-settings-popup {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 2147482999;
    display: grid;
    gap: 6px;
    min-width: 220px;
    padding: 8px 10px;
    border: 1px solid rgba(160, 160, 196, 0.22);
    border-radius: 10px;
    background: rgba(32, 32, 64, 0.88);
    color: #fff;
    font-size: 0.8125rem;
    line-height: 1.25;
    white-space: nowrap;
    pointer-events: auto;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
  }

  .bd-graph-settings-popup[hidden] {
    display: none;
  }

  .bd-graph-tooltip {
    position: fixed;
    z-index: 2147483002;
    display: none;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(32, 32, 64, 0.88);
    color: #fff;
    font-size: 0.8125rem;
    line-height: 1.25;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
  }

  .bd-graph-settings-header,
  .score-viewer-detail-settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .bd-graph-settings-title,
  .score-viewer-detail-settings-title,
  .score-viewer-spacing-title,
  .score-viewer-mode-title,
  .bd-graph-settings-label {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.82);
  }

  .bd-graph-settings-group,
  .score-viewer-settings-group,
  .score-viewer-detail-settings-pair-cell {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .bd-graph-settings-close,
  .score-viewer-detail-settings-close,
  .score-viewer-detail-settings-toggle {
    inline-size: 18px;
    min-inline-size: 18px;
    block-size: 18px;
    min-block-size: 18px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    line-height: 1;
  }

  .bd-graph-settings-close,
  .score-viewer-detail-settings-close {
    border: 1px solid rgba(255, 255, 255, 0.24);
    font-size: 0.7rem;
  }

  .bd-graph-settings-close:hover,
  .score-viewer-detail-settings-close:hover,
  .score-viewer-detail-settings-toggle:hover {
    background: rgba(255, 255, 255, 0.24);
  }

  .bd-graph-settings-close:focus-visible,
  .score-viewer-detail-settings-close:focus-visible,
  .score-viewer-detail-settings-toggle:focus-visible {
    outline: 1px solid rgba(145, 210, 255, 0.95);
    outline-offset: 1px;
  }

  .bd-graph-settings-select,
  .score-viewer-mode-select,
  .score-viewer-detail-settings-input {
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  .score-viewer-detail-settings-popup {
    position: fixed;
    z-index: 2147483001;
    display: grid;
    gap: 6px;
    width: min(240px, calc(100vw - 24px));
    min-width: 0;
    max-width: calc(100vw - 24px);
    max-height: calc(100dvh - 24px);
    padding: 8px 10px;
    border: 1px solid rgba(160, 160, 196, 0.22);
    border-radius: 10px;
    background: rgba(32, 32, 64, 0.88);
    color: #fff;
    font-size: 0.8125rem;
    line-height: 1.25;
    white-space: nowrap;
    pointer-events: auto;
    overflow-x: hidden;
    overflow-y: auto;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
    contain: layout paint style;
  }

  .score-viewer-detail-settings-popup[hidden] {
    display: none;
  }

  .score-viewer-detail-settings-popup > * {
    min-width: 0;
  }

  .score-viewer-detail-settings-pair-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    align-items: start;
  }

  .score-viewer-shell {
    --score-viewer-width: 520px;
    position: fixed;
    top: 0;
    right: 0;
    width: var(--score-viewer-width);
    height: 100dvh;
    background: #000;
    border-left: 1px solid rgba(112, 112, 132, 0.4);
    box-shadow: -12px 0 32px rgba(0, 0, 0, 0.38);
    overflow: hidden;
    z-index: 2147483000;
    opacity: 0;
    pointer-events: none;
    transform: translateX(100%);
    transition: transform 120ms ease, opacity 120ms ease;
    isolation: isolate;
    contain: layout paint style;
  }

  .score-viewer-shell.is-visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0);
  }

  .score-viewer-shell.is-drag-handle-hovered,
  .score-viewer-shell.is-drag-handle-dragging {
    cursor: ns-resize;
  }

  .score-viewer-scroll-host {
    position: absolute;
    inset: 0;
    overflow-x: hidden;
    overflow-y: hidden;
    scrollbar-gutter: stable;
    contain: layout paint;
  }

  .score-viewer-scroll-host.is-scrollable {
    overflow-y: auto;
    cursor: grab;
    touch-action: none;
  }

  .score-viewer-scroll-host.is-scrollable.is-dragging {
    cursor: grabbing;
  }

  .score-viewer-scroll-host.is-drag-handle-hovered,
  .score-viewer-scroll-host.is-drag-handle-dragging {
    cursor: ns-resize;
  }

  .score-viewer-spacer {
    width: 1px;
    opacity: 0;
  }

  .score-viewer-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .score-viewer-marker-overlay,
  .score-viewer-marker-labels {
    position: absolute;
    inset: 0;
    pointer-events: none;
    contain: layout paint;
  }

  .score-viewer-marker-label {
    position: absolute;
    top: 0;
    font-size: 0.75rem;
    line-height: 1;
    white-space: nowrap;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.72);
  }

  .score-viewer-marker-label.is-left {
    transform: translate(-100%, -50%);
    text-align: right;
  }

  .score-viewer-marker-label.is-right {
    transform: translate(0, -50%);
    text-align: left;
  }

  .score-viewer-bottom-bar {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 3;
    pointer-events: none;
    contain: layout paint;
  }

  .score-viewer-status-panel {
    position: relative;
    display: grid;
    gap: 4px;
    min-width: 180px;
    padding: 8px 10px 8px 10px;
    border: 1px solid rgba(160, 160, 196, 0.22);
    border-radius: 10px;
    background: rgba(32, 32, 64, 0.8);
    color: #fff;
    font-size: 0.8125rem;
    line-height: 1.25;
    white-space: nowrap;
    pointer-events: auto;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
    contain: layout paint style;
  }

  .score-viewer-metrics-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }

  .score-viewer-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .score-viewer-status-row.is-time {
    justify-content: flex-start;
    gap: 8px;
    padding-right: 24px;
  }

  .score-viewer-status-metric,
  .score-viewer-mode-controls {
    min-width: 0;
  }

  .score-viewer-status-metric,
  .score-viewer-playback-time,
  .score-viewer-spacing-value {
    font-variant-numeric: tabular-nums;
  }

  .score-viewer-settings-panel {
    display: grid;
    gap: 4px;
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease, max-height 120ms ease;
  }

  .score-viewer-settings-panel.is-popup {
    max-height: none;
    overflow: visible;
    opacity: 1;
    pointer-events: auto;
    transition: none;
  }

  .score-viewer-status-panel:hover .score-viewer-settings-panel,
  .score-viewer-status-panel:focus-within .score-viewer-settings-panel {
    max-height: 320px;
    opacity: 1;
    pointer-events: auto;
  }

  .score-viewer-spacing-row {
    padding-top: 2px;
  }

  .score-viewer-spacing-value {
    margin-left: auto;
    display: inline-flex;
    align-items: baseline;
    gap: 0;
    color: #fff;
    letter-spacing: 0.02em;
  }

  .score-viewer-spacing-value-secondary {
    color: #00FF00;
  }

  .score-viewer-mode-row {
    display: grid;
    gap: 4px;
    align-items: stretch;
  }

  .score-viewer-mode-controls {
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(0, 5fr);
    gap: 6px;
    width: 100%;
  }

  .score-viewer-mode-cell {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .score-viewer-mode-select:disabled,
  .score-viewer-playback-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .score-viewer-checkbox-row {
    justify-content: space-between;
    gap: 10px;
  }

  .score-viewer-playback-button {
    inline-size: 16px;
    min-inline-size: 16px;
    block-size: 16px;
    min-block-size: 16px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    font-size: 0.464rem;
    line-height: 1;
    pointer-events: auto;
    box-shadow: none;
  }

  .score-viewer-detail-settings-toggle {
    position: absolute;
    top: 8px;
    right: 10px;
    z-index: 1;
    pointer-events: auto;
  }

  .score-viewer-spacing-input {
    pointer-events: auto;
  }

  .score-viewer-drag-line {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    transform: translateY(-50%);
    pointer-events: none;
    z-index: 2;
  }

  .score-viewer-drag-line::after {
    content: "";
    width: 100%;
    height: 1px;
    opacity: 0;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.48) 48%, rgba(255, 255, 255, 0.06) 100%);
    box-shadow: 0 0 16px rgba(255, 255, 255, 0.08);
  }

  .score-viewer-drag-line.is-draggable::after,
  .score-viewer-drag-line.is-dragging::after {
    opacity: 1;
    height: 2px;
    background: linear-gradient(90deg, rgba(145, 210, 255, 0.18) 0%, rgba(145, 210, 255, 0.95) 48%, rgba(145, 210, 255, 0.18) 100%);
    box-shadow: 0 0 22px rgba(145, 210, 255, 0.2);
  }

  .score-viewer-lane-height-handle::after {
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.3) 48%, rgba(255, 255, 255, 0.04) 100%);
  }

  .score-viewer-lane-cover-handle::after {
    background: linear-gradient(90deg, rgba(137, 255, 178, 0.06) 0%, rgba(137, 255, 178, 0.42) 48%, rgba(137, 255, 178, 0.06) 100%);
  }

  .score-viewer-judge-line {
    position: absolute;
    left: 0;
    right: 0;
    top: var(--score-viewer-judge-line-top, calc(var(--score-viewer-judge-line-ratio, 0.5) * 100%));
    display: flex;
    align-items: center;
    transform: translateY(-100%);
    pointer-events: none;
  }

  .score-viewer-judge-line::after {
    content: "";
    width: 100%;
    height: ${SCORE_VIEWER_JUDGE_LINE_HEIGHT_PX}px;
    background: linear-gradient(90deg, rgba(187, 71, 49, 0.18) 0%, rgba(187, 71, 49, 0.94) 48%, rgba(187, 71, 49, 0.18) 100%);
    box-shadow: 0 0 20px rgba(187, 71, 49, 0.2);
  }

  .score-viewer-judge-line.is-draggable::after,
  .score-viewer-judge-line.is-dragging::after {
    background: linear-gradient(90deg, rgba(255, 132, 94, 0.28) 0%, rgba(255, 120, 88, 1) 48%, rgba(255, 132, 94, 0.28) 100%);
    box-shadow: 0 0 28px rgba(255, 120, 88, 0.34);
  }
`;
  var BMSDATA_TEMPLATE_HTML = `
  <div id="bmsdata-container" class="bmsdata" style="display: none;">
    <div class="bd-info">
      <table class="bd-info-table">
        <tr>
          <td class="bd-header-cell">LINK</td>
          <td colspan="3">
            <a href="" id="bd-lr2ir" style="display: none;">LR2IR</a><a href="" id="bd-minir" style="display: none;">MinIR</a><a href="" id="bd-mocha" style="display: none;">Mocha</a><a href="" id="bd-viewer" style="display: none;">Viewer</a><a href="" id="bd-bmssearch" style="display: none;">BMS<span style="display:inline-block; width:2px;"></span>SEARCH</a><a href="" id="bd-bokutachi" style="display: none;">Bokutachi</a><a href="" id="bd-stellaverse" style="display: none;">STELLAVERSE</a>
          </td>
        </tr>
        <tr>
          <td class="bd-header-cell">SHA256</td>
          <td colspan="3" id="bd-sha256">Loading...</td>
        </tr>
        <tr>
          <td class="bd-header-cell">MD5</td>
          <td id="bd-md5">Loading...</td>
          <td class="bd-header-cell">BMSID</td>
          <td id="bd-bmsid">Loading...</td>
        </tr>
        <tr>
          <td class="bd-header-cell">BPM</td>
          <td>
            <span class="bd-icon">MAIN</span><span id="bd-mainbpm">0</span><span class="bd-icon">MIN</span><span
              id="bd-minbpm">0</span><span class="bd-icon">MAX</span><span id="bd-maxbpm">0</span>
          </td>
          <td class="bd-header-cell">MODE</td>
          <td id="bd-mode">0</td>
        </tr>
        <tr>
          <td class="bd-header-cell">FEATURE</td>
          <td id="bd-feature">Loading...</td>
          <td class="bd-header-cell">JUDGERANK</td>
          <td id="bd-judgerank">0</td>
        </tr>
        <tr>
          <td class="bd-header-cell">NOTES</td>
          <td id="bd-notes">0 (N: 0, LN: 0, SC: 0, LNSC: 0)</td>
          <td class="bd-header-cell">TOTAL</td>
          <td id="bd-total">0 (0.000 T/N)</td>
        </tr>
        <tr>
          <td class="bd-header-cell">DENSITY</td>
          <td><span class="bd-icon">AVG</span><span id="bd-avgdensity">0.0</span><span class="bd-icon">PEAK</span><span
              id="bd-peakdensity">0</span><span class="bd-icon">END</span><span id="bd-enddensity">0.0</span></td>
          <td class="bd-header-cell">DURATION</td>
          <td id="bd-duration">000.000 s</td>
        </tr>
        <tr>
          <td class="bd-header-cell">LANENOTES</td>
          <td colspan="3">
            <div class="bd-lanenotes" id="bd-lanenotes-div"></div>
          </td>
        </tr>
      </table>
      <div class="bd-table-list">
        <div class="bd-header-cell">TABLES</div>
        <div class="bd-table-scroll">
          <ul id="bd-tables-ul">
          </ul>
        </div>
      </div>
    </div>
    <div id="bd-graph"></div>
  </div>
`;
  function ensureBmsDataStyleOnce(documentRef = document) {
    if (documentRef.getElementById(BMSDATA_STYLE_ID)) {
      return;
    }
    const styleElement = documentRef.createElement("style");
    styleElement.id = BMSDATA_STYLE_ID;
    styleElement.textContent = BMSDATA_CSS;
    documentRef.head.appendChild(styleElement);
  }
  function createBmsDataContainer({ documentRef = document, theme }) {
    ensureBmsDataStyleOnce(documentRef);
    const template = documentRef.createElement("template");
    template.innerHTML = BMSDATA_TEMPLATE_HTML.trim();
    const container = template.content.firstElementChild;
    if (!container) {
      throw new Error("BMS preview template did not create a container.");
    }
    if (theme) {
      container.style.setProperty("--bd-dctx", theme.dctx);
      container.style.setProperty("--bd-dcbk", theme.dcbk);
      container.style.setProperty("--bd-hdtx", theme.hdtx);
      container.style.setProperty("--bd-hdbk", theme.hdbk);
    }
    return container;
  }
  function insertBmsDataContainer({ documentRef = document, insertion, theme }) {
    const container = createBmsDataContainer({ documentRef, theme });
    insertion.element.insertAdjacentElement(insertion.position, container);
    return container;
  }
  async function fetchBmsInfoRecordByIdentifiers({ md5 = null, sha256 = null, bmsid = null }) {
    const lookupKey = md5 ?? sha256 ?? bmsid;
    if (!lookupKey) {
      return false;
    }
    try {
      return await fetchBmsInfoRecordByLookupKey(lookupKey);
    } catch (error) {
      console.error("Fetch or parse error:", error);
      return false;
    }
  }
  async function checkBmsSearchPatternExists(sha256) {
    if (!sha256) {
      return false;
    }
    let cachedPromise = bmsSearchPatternAvailabilityCache.get(sha256);
    if (!cachedPromise) {
      cachedPromise = (async () => {
        try {
          const response = await fetch(`${BMSSEARCH_PATTERN_API_BASE_URL}/${sha256}`);
          return response.ok;
        } catch (error) {
          bmsSearchPatternAvailabilityCache.delete(sha256);
          console.warn("BMS SEARCH APIで譜面の存在確認に失敗しました:", error);
          return false;
        }
      })();
      bmsSearchPatternAvailabilityCache.set(sha256, cachedPromise);
    }
    return cachedPromise;
  }
  async function renderBmsSearchLinkIfAvailable(container, sha256) {
    try {
      if (!sha256 || !await checkBmsSearchPatternExists(sha256) || !container.isConnected) {
        return;
      }
      const bmsSearchLink = container.querySelector("#bd-bmssearch");
      if (!bmsSearchLink) {
        return;
      }
      showLink(bmsSearchLink, `${BMSSEARCH_PATTERN_PAGE_BASE_URL}/${sha256}`);
    } catch (error) {
      console.warn("BMS SEARCHリンクの表示に失敗しました:", error);
    }
  }
  function renderBmsData(container, normalizedRecord) {
    const getById = (id) => container.querySelector(`#${id}`);
    renderLinks(container, normalizedRecord);
    getById("bd-sha256").textContent = normalizedRecord.sha256;
    getById("bd-md5").textContent = normalizedRecord.md5;
    getById("bd-bmsid").textContent = normalizedRecord.bmsid ? normalizedRecord.bmsid : "Undefined";
    getById("bd-mainbpm").textContent = formatCompactNumber(normalizedRecord.mainbpm);
    getById("bd-maxbpm").textContent = formatCompactNumber(normalizedRecord.maxbpm);
    getById("bd-minbpm").textContent = formatCompactNumber(normalizedRecord.minbpm);
    getById("bd-mode").textContent = normalizedRecord.mode;
    getById("bd-feature").textContent = normalizedRecord.featureNames.join(", ");
    getById("bd-judgerank").textContent = normalizedRecord.judge;
    getById("bd-notes").textContent = normalizedRecord.notesStr;
    getById("bd-total").textContent = normalizedRecord.totalStr;
    getById("bd-avgdensity").textContent = normalizedRecord.density.toFixed(3);
    getById("bd-peakdensity").textContent = formatCompactNumber(normalizedRecord.peakdensity);
    getById("bd-enddensity").textContent = formatCompactNumber(normalizedRecord.enddensity);
    getById("bd-duration").textContent = normalizedRecord.durationStr;
    renderLaneNotes(container, normalizedRecord);
    renderTables(container, normalizedRecord);
    container.style.display = "block";
    void renderBmsSearchLinkIfAvailable(container, normalizedRecord.sha256);
  }
  function createBmsInfoPreview({
    container,
    documentRef = document,
    loadParsedScore = async () => null,
    prefetchParsedScore = async () => {
    },
    getPersistedViewerMode = () => DEFAULT_VIEWER_MODE,
    setPersistedViewerMode = () => {
    },
    getPersistedInvisibleNoteVisibility = () => DEFAULT_INVISIBLE_NOTE_VISIBILITY,
    setPersistedInvisibleNoteVisibility = () => {
    },
    getPersistedJudgeLinePositionRatio = () => DEFAULT_JUDGE_LINE_POSITION_RATIO,
    setPersistedJudgeLinePositionRatio = () => {
    },
    getPersistedSpacingScale = () => DEFAULT_SPACING_SCALE2,
    setPersistedSpacingScale = () => {
    },
    getPersistedGameDurationMs = () => DEFAULT_GAME_DURATION_MS,
    setPersistedGameDurationMs = () => {
    },
    getPersistedGameLaneHeightPercent = () => DEFAULT_GAME_LANE_HEIGHT_PERCENT,
    setPersistedGameLaneHeightPercent = () => {
    },
    getPersistedGameLaneCoverPermille = () => DEFAULT_GAME_LANE_COVER_PERMILLE,
    setPersistedGameLaneCoverPermille = () => {
    },
    getPersistedGameLaneCoverVisible = () => DEFAULT_GAME_LANE_COVER_VISIBLE,
    setPersistedGameLaneCoverVisible = () => {
    },
    getPersistedGameHsFixMode = () => DEFAULT_GAME_HS_FIX_MODE,
    setPersistedGameHsFixMode = () => {
    },
    getPersistedGraphInteractionMode = () => DEFAULT_GRAPH_INTERACTION_MODE,
    setPersistedGraphInteractionMode = () => {
    },
    getPersistedViewerNoteWidth = () => DEFAULT_RENDERER_CONFIG.noteWidth,
    setPersistedViewerNoteWidth = () => {
    },
    getPersistedViewerScratchWidth = () => DEFAULT_RENDERER_CONFIG.scratchWidth,
    setPersistedViewerScratchWidth = () => {
    },
    getPersistedViewerNoteHeight = () => DEFAULT_RENDERER_CONFIG.noteHeight,
    setPersistedViewerNoteHeight = () => {
    },
    getPersistedViewerBarLineHeight = () => DEFAULT_RENDERER_CONFIG.barLineHeight,
    setPersistedViewerBarLineHeight = () => {
    },
    getPersistedViewerMarkerHeight = () => DEFAULT_RENDERER_CONFIG.markerHeight,
    setPersistedViewerMarkerHeight = () => {
    },
    getPersistedViewerSeparatorWidth = () => DEFAULT_RENDERER_CONFIG.separatorWidth,
    setPersistedViewerSeparatorWidth = () => {
    },
    onSelectedTimeChange = () => {
    },
    onPinChange = () => {
    },
    onPlaybackChange = () => {
    },
    onViewerOpenChange = () => {
    },
    onRuntimeError = () => {
    }
  }) {
    const graphHost = container.querySelector("#bd-graph");
    if (!graphHost) {
      throw new Error("BMS preview graph host element is missing.");
    }
    const graphSurface = createIsolatedSurface({
      documentRef,
      host: graphHost,
      cssText: GRAPH_SURFACE_CSS,
      hostClassName: GRAPH_SURFACE_HOST_CLASS,
      rootClassName: "bmsie-graph-surface"
    });
    const overlaySurface = createIsolatedSurface({
      documentRef,
      hostId: PREVIEW_OVERLAY_HOST_ID,
      mountTo: documentRef.body,
      cssText: OVERLAY_SURFACE_CSS,
      hostClassName: OVERLAY_SURFACE_HOST_CLASS,
      rootClassName: "bmsie-overlay-surface"
    });
    const graphElements = createGraphSurfaceElements(documentRef, graphHost);
    graphSurface.mount.append(graphElements.root);
    const {
      scrollHost: graphScrollHost,
      canvas: graphCanvas,
      pinInput,
      settingsToggle: graphSettingsToggle
    } = graphElements;
    const graphTooltip = documentRef.createElement("div");
    graphTooltip.id = "bd-graph-tooltip";
    graphTooltip.className = "bd-graph-tooltip";
    overlaySurface.mount.append(graphTooltip);
    const graphSettingsPopup = documentRef.createElement("div");
    graphSettingsPopup.id = "bd-graph-settings-popup";
    graphSettingsPopup.className = "bd-graph-settings-popup";
    graphSettingsPopup.hidden = true;
    const graphSettingsHeader = documentRef.createElement("div");
    graphSettingsHeader.className = "bd-graph-settings-header";
    const graphSettingsTitle = documentRef.createElement("span");
    graphSettingsTitle.className = "bd-graph-settings-title";
    graphSettingsTitle.textContent = "Graph Settings";
    const graphSettingsClose = documentRef.createElement("button");
    graphSettingsClose.id = "bd-graph-settings-close";
    graphSettingsClose.className = "bd-graph-settings-close bmsie-ui-button";
    graphSettingsClose.type = "button";
    graphSettingsClose.setAttribute("aria-label", "Close graph settings");
    graphSettingsClose.textContent = "x";
    graphSettingsHeader.append(graphSettingsTitle, graphSettingsClose);
    const graphSettingsGroup = documentRef.createElement("div");
    graphSettingsGroup.className = "bd-graph-settings-group";
    const initialGraphInteractionMode = getInitialGraphInteractionMode(getPersistedGraphInteractionMode);
    const graphInteractionLabel = documentRef.createElement("label");
    graphInteractionLabel.className = "bd-graph-settings-label";
    graphInteractionLabel.setAttribute("for", "bd-graph-interaction-select");
    graphInteractionLabel.textContent = "Line Control";
    const graphInteractionSelect = documentRef.createElement("select");
    graphInteractionSelect.id = "bd-graph-interaction-select";
    graphInteractionSelect.className = "bd-graph-settings-select bmsie-ui-select";
    graphInteractionSelect.append(
      createPopupOption(documentRef, "hover", "Hover Follow"),
      createPopupOption(documentRef, "drag", "Click & Drag")
    );
    graphInteractionSelect.value = initialGraphInteractionMode;
    graphSettingsGroup.append(graphInteractionLabel, graphInteractionSelect);
    graphSettingsPopup.append(graphSettingsHeader, graphSettingsGroup);
    overlaySurface.mount.append(graphSettingsPopup);
    const shell = documentRef.createElement("div");
    shell.className = "score-viewer-shell";
    overlaySurface.mount.append(shell);
    const parsedScoreCache = /* @__PURE__ */ new Map();
    const loadPromiseCache = /* @__PURE__ */ new Map();
    const compressedAvailabilityBySha256 = /* @__PURE__ */ new Map();
    const state = {
      record: null,
      selectedSha256: null,
      selectedTimeSec: 0,
      selectedBeat: 0,
      viewerMode: getInitialViewerMode(getPersistedViewerMode),
      invisibleNoteVisibility: getInitialInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility),
      judgeLinePositionRatio: getInitialJudgeLinePositionRatio(getPersistedJudgeLinePositionRatio),
      spacingScaleByMode: getInitialSpacingScaleByMode(getPersistedSpacingScale),
      gameTimingConfig: getInitialGameTimingConfig({
        getPersistedGameDurationMs,
        getPersistedGameLaneHeightPercent,
        getPersistedGameLaneCoverPermille,
        getPersistedGameLaneCoverVisible,
        getPersistedGameHsFixMode
      }),
      rendererConfig: getInitialRendererConfig({
        getPersistedViewerNoteWidth,
        getPersistedViewerScratchWidth,
        getPersistedViewerNoteHeight,
        getPersistedViewerBarLineHeight,
        getPersistedViewerMarkerHeight,
        getPersistedViewerSeparatorWidth
      }),
      graphInteractionMode: initialGraphInteractionMode,
      isPinned: false,
      isViewerOpen: false,
      isViewerDetailSettingsOpen: false,
      isPlaying: false,
      isGraphHovered: false,
      isGraphSettingsOpen: false,
      parsedScore: null,
      viewerModel: null,
      loadToken: 0,
      renderFrameId: null,
      pendingRenderMask: 0,
      playbackFrameId: null,
      lastPlaybackTimestamp: null,
      lastViewerOpenState: false,
      isDestroyed: false
    };
    const viewerController = createScoreViewerController({
      root: shell,
      onTimeChange: (selection) => {
        const nextTimeSec = typeof selection === "object" ? selection.timeSec : selection;
        setSelectedTimeSec(nextTimeSec, {
          openViewer: true,
          notify: true,
          beatHint: selection?.beat,
          source: selection?.source ?? "viewer"
        });
      },
      onPlaybackToggle: (nextPlaying) => {
        setPlaybackState(nextPlaying);
      },
      onViewerModeChange: (nextViewerMode) => {
        setViewerMode(nextViewerMode);
      },
      onInvisibleNoteVisibilityChange: (nextVisibility) => {
        setInvisibleNoteVisibility(nextVisibility);
      },
      onJudgeLinePositionChange: (nextRatio) => {
        setJudgeLinePositionRatio(nextRatio);
      },
      onSpacingScaleChange: (mode, nextScale) => {
        setSpacingScale(mode, nextScale);
      },
      onGameTimingConfigChange: (nextGameTimingConfig) => {
        setGameTimingConfig(nextGameTimingConfig);
      },
      onRendererConfigChange: (nextRendererConfig) => {
        setRendererConfig(nextRendererConfig);
      }
    });
    const statusPanel = findFirstElementByClass(shell, "score-viewer-status-panel");
    const detailSettingsToggle = findFirstElementByClass(shell, "score-viewer-detail-settings-toggle");
    if (!statusPanel || !detailSettingsToggle) {
      throw new Error("BMS preview viewer detail settings elements are missing.");
    }
    detailSettingsToggle.setAttribute("aria-expanded", "false");
    const viewerDetailSettingsPopup = documentRef.createElement("div");
    viewerDetailSettingsPopup.id = "bd-viewer-detail-settings-popup";
    viewerDetailSettingsPopup.className = "score-viewer-detail-settings-popup";
    viewerDetailSettingsPopup.hidden = true;
    const viewerDetailSettingsHeader = documentRef.createElement("div");
    viewerDetailSettingsHeader.className = "score-viewer-detail-settings-header";
    const viewerDetailSettingsTitle = documentRef.createElement("span");
    viewerDetailSettingsTitle.className = "score-viewer-detail-settings-title";
    viewerDetailSettingsTitle.textContent = "Viewer Details";
    const viewerDetailSettingsClose = documentRef.createElement("button");
    viewerDetailSettingsClose.className = "score-viewer-detail-settings-close bmsie-ui-button";
    viewerDetailSettingsClose.type = "button";
    viewerDetailSettingsClose.setAttribute("aria-label", "Close viewer detail settings");
    viewerDetailSettingsClose.textContent = "x";
    viewerDetailSettingsHeader.append(viewerDetailSettingsTitle, viewerDetailSettingsClose);
    const viewerDetailSettingsGroup = documentRef.createElement("div");
    viewerDetailSettingsGroup.className = "bd-graph-settings-group";
    const noteWidthControl = createViewerDetailNumberField(documentRef, {
      id: "bd-viewer-note-width-input",
      key: "noteWidth",
      label: "Note Width",
      min: 0,
      max: 64,
      value: state.rendererConfig.noteWidth
    });
    const scratchWidthControl = createViewerDetailNumberField(documentRef, {
      id: "bd-viewer-scratch-width-input",
      key: "scratchWidth",
      label: "Scratch Width",
      min: 0,
      max: 64,
      value: state.rendererConfig.scratchWidth
    });
    const viewerDetailSettingsControls = [
      noteWidthControl,
      scratchWidthControl,
      createViewerDetailNumberField(documentRef, {
        id: "bd-viewer-note-height-input",
        key: "noteHeight",
        label: "Note Height",
        min: 0,
        max: 32,
        value: state.rendererConfig.noteHeight
      }),
      createViewerDetailNumberField(documentRef, {
        id: "bd-viewer-bar-line-height-input",
        key: "barLineHeight",
        label: "Bar Line Height",
        min: 0,
        max: 16,
        value: state.rendererConfig.barLineHeight
      }),
      createViewerDetailNumberField(documentRef, {
        id: "bd-viewer-marker-height-input",
        key: "markerHeight",
        label: "Marker Height",
        min: 0,
        max: 16,
        value: state.rendererConfig.markerHeight
      }),
      createViewerDetailNumberField(documentRef, {
        id: "bd-viewer-separator-width-input",
        key: "separatorWidth",
        label: "Separator Width",
        min: 0,
        max: 16,
        value: state.rendererConfig.separatorWidth
      })
    ];
    const viewerDetailSettingsWidthRow = documentRef.createElement("div");
    viewerDetailSettingsWidthRow.className = "score-viewer-detail-settings-pair-row";
    viewerDetailSettingsWidthRow.append(
      createViewerDetailSettingsPairCell(documentRef, noteWidthControl),
      createViewerDetailSettingsPairCell(documentRef, scratchWidthControl)
    );
    viewerDetailSettingsGroup.append(viewerDetailSettingsWidthRow);
    for (const control of viewerDetailSettingsControls.slice(2)) {
      viewerDetailSettingsGroup.append(control.label, control.input);
    }
    viewerDetailSettingsPopup.append(viewerDetailSettingsHeader, viewerDetailSettingsGroup);
    overlaySurface.mount.append(viewerDetailSettingsPopup);
    const graphController = createBmsInfoGraph({
      scrollHost: graphScrollHost,
      canvas: graphCanvas,
      tooltip: graphTooltip,
      pinInput,
      interactionMode: state.graphInteractionMode,
      onHoverTime: () => {
        handleGraphHover();
      },
      onHoverLeave: () => {
        state.isGraphHovered = false;
        if (!state.isPinned && !state.isPlaying) {
          state.isViewerOpen = false;
        }
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);
      },
      onSelectTime: (timeSec) => {
        void activateRecord({ openViewer: true });
        setSelectedTimeSec(timeSec, { openViewer: true, notify: true });
      },
      onPinChange: (nextPinned) => {
        state.isPinned = Boolean(nextPinned);
        onPinChange(state.isPinned);
        if (state.isPinned) {
          state.isViewerOpen = true;
          void activateRecord({ openViewer: true });
        } else if (!state.isGraphHovered && !state.isPlaying) {
          state.isViewerOpen = false;
        }
        scheduleRender(PREVIEW_RENDER_DIRTY.pin | PREVIEW_RENDER_DIRTY.viewerOpen);
      }
    });
    graphSettingsToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setGraphSettingsOpen(!state.isGraphSettingsOpen);
    });
    graphSettingsClose.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setGraphSettingsOpen(false);
    });
    graphInteractionSelect.addEventListener("change", () => {
      setGraphInteractionMode(graphInteractionSelect.value);
    });
    detailSettingsToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setViewerDetailSettingsOpen(!state.isViewerDetailSettingsOpen);
    });
    viewerDetailSettingsClose.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setViewerDetailSettingsOpen(false);
    });
    for (const control of viewerDetailSettingsControls) {
      control.input.addEventListener("input", () => {
        setRendererConfig({
          [control.key]: normalizeViewerDetailInputValue(control.input.value, control.max, state.rendererConfig[control.key])
        });
      });
      control.input.addEventListener("wheel", (event) => {
        const delta = event.deltaY < 0 ? 1 : event.deltaY > 0 ? -1 : 0;
        if (delta === 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const normalizedValue = normalizeViewerDetailInputValue(
          Number(control.input.value) + delta,
          control.max,
          state.rendererConfig[control.key]
        );
        control.input.value = String(normalizedValue);
        setRendererConfig({
          [control.key]: normalizedValue
        });
      }, { passive: false });
      control.input.addEventListener("change", () => {
        const normalizedValue = normalizeViewerDetailInputValue(control.input.value, control.max, state.rendererConfig[control.key]);
        control.input.value = String(normalizedValue);
        setRendererConfig({
          [control.key]: normalizedValue
        });
      });
    }
    viewerDetailSettingsPopup.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.isViewerDetailSettingsOpen) {
        return;
      }
      event.preventDefault();
      setViewerDetailSettingsOpen(false);
    });
    documentRef.body.addEventListener("pointerdown", handleDocumentBodyPointerDown);
    documentRef.body.addEventListener("keydown", handleDocumentBodyKeydown);
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("resize", positionViewerDetailSettingsPopup);
    }
    return {
      setRecord,
      setSelectedTimeSec,
      setViewerMode,
      setInvisibleNoteVisibility,
      setJudgeLinePositionRatio,
      setSpacingScale,
      setGameTimingConfig,
      setPinned,
      setPlaybackState,
      prefetch,
      destroy,
      getState: () => ({
        ...state,
        resolvedViewerMode: getResolvedViewerMode(state)
      })
    };
    function setRecord(normalizedRecord, { parsedScore = null } = {}) {
      const previousSha256 = state.record?.sha256 ?? null;
      const nextSha256Value = normalizedRecord?.sha256 ?? null;
      const recordChanged = previousSha256 !== nextSha256Value || state.record !== normalizedRecord;
      let renderMask = 0;
      state.record = normalizedRecord;
      if (!normalizedRecord) {
        state.selectedSha256 = null;
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedTimeSec = 0;
        state.selectedBeat = 0;
        state.isViewerOpen = false;
        renderMask |= PREVIEW_RENDER_ALL;
        scheduleRender(renderMask);
        return;
      }
      if (recordChanged) {
        renderBmsData(container, normalizedRecord);
        shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(normalizedRecord.mode, state.rendererConfig)}px`);
        renderMask |= PREVIEW_RENDER_DIRTY.record;
      }
      const nextSha256 = normalizedRecord.sha256 ? normalizedRecord.sha256.toLowerCase() : null;
      if (parsedScore && nextSha256) {
        const viewerModel = buildViewerModel(parsedScore, normalizedRecord, state.viewerMode);
        parsedScoreCache.set(nextSha256, { score: parsedScore, viewerModel });
        compressedAvailabilityBySha256.set(nextSha256, { status: "ready" });
        state.parsedScore = parsedScore;
        state.viewerModel = viewerModel;
        state.selectedSha256 = nextSha256;
        state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
        renderMask |= PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection;
      } else if (state.selectedSha256 !== nextSha256) {
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedSha256 = nextSha256;
        state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        state.selectedBeat = 0;
        renderMask |= PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection;
      }
      scheduleRender(renderMask || PREVIEW_RENDER_DIRTY.selection);
    }
    async function prefetch() {
      if (!state.record?.sha256) {
        return;
      }
      await ensureCompressedScoreAvailability(state.record);
    }
    function handleGraphHover() {
      state.isGraphHovered = true;
      void activateRecord({ openViewer: true });
    }
    async function activateRecord({ openViewer = false } = {}) {
      if (!state.record) {
        return;
      }
      if (openViewer) {
        state.isViewerOpen = true;
      }
      const sha256 = state.record.sha256 ? state.record.sha256.toLowerCase() : null;
      if (!sha256) {
        state.parsedScore = null;
        state.viewerModel = null;
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.viewerOpen);
        return;
      }
      if (state.selectedSha256 === sha256 && state.viewerModel) {
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);
        return;
      }
      state.selectedSha256 = sha256;
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);
      const isCompressedScoreAvailable = await ensureCompressedScoreAvailability(state.record);
      if (state.isDestroyed || getNormalizedRecordSha256(state.record) !== sha256) {
        return;
      }
      if (!isCompressedScoreAvailable) {
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedBeat = 0;
        state.isViewerOpen = false;
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection | PREVIEW_RENDER_DIRTY.viewerOpen);
        return;
      }
      await loadSelectedRecord(state.record);
    }
    async function loadSelectedRecord(normalizedRecord) {
      if (!normalizedRecord?.sha256) {
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedBeat = 0;
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection);
        return;
      }
      const sha256 = normalizedRecord.sha256.toLowerCase();
      const loadToken = ++state.loadToken;
      if (parsedScoreCache.has(sha256)) {
        const cached = parsedScoreCache.get(sha256);
        if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
          return;
        }
        applyLoadedScore(cached.score, cached.viewerModel);
        return;
      }
      try {
        let loadPromise = loadPromiseCache.get(sha256);
        if (!loadPromise) {
          loadPromise = Promise.resolve(loadParsedScore(normalizedRecord)).then((parsedScore) => {
            if (!parsedScore) {
              throw new Error("Parsed score was not returned.");
            }
            const viewerModel = buildViewerModel(parsedScore, normalizedRecord, state.viewerMode);
            const cached2 = { score: parsedScore, viewerModel };
            parsedScoreCache.set(sha256, cached2);
            loadPromiseCache.delete(sha256);
            return cached2;
          }).catch((error) => {
            loadPromiseCache.delete(sha256);
            throw error;
          });
          loadPromiseCache.set(sha256, loadPromise);
        }
        const cached = await loadPromise;
        if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
          return;
        }
        applyLoadedScore(cached.score, cached.viewerModel);
      } catch (error) {
        if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
          return;
        }
        console.warn("Score viewer parse/load failed:", error);
        onRuntimeError(error);
        state.parsedScore = null;
        state.viewerModel = null;
        state.selectedBeat = 0;
        state.isViewerOpen = false;
        scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection | PREVIEW_RENDER_DIRTY.viewerOpen);
      }
    }
    function applyLoadedScore(parsedScore, viewerModel) {
      state.parsedScore = parsedScore;
      state.viewerModel = viewerModel;
      if (state.selectedSha256) {
        compressedAvailabilityBySha256.set(state.selectedSha256, { status: "ready" });
      }
      state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
      state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection);
    }
    function getNormalizedRecordSha256(record) {
      return record?.sha256 ? record.sha256.toLowerCase() : null;
    }
    async function ensureCompressedScoreAvailability(record) {
      const sha256 = getNormalizedRecordSha256(record);
      if (!sha256) {
        return false;
      }
      if (parsedScoreCache.has(sha256)) {
        compressedAvailabilityBySha256.set(sha256, { status: "ready" });
        return true;
      }
      const existingAvailability = compressedAvailabilityBySha256.get(sha256);
      if (existingAvailability?.status === "ready") {
        return true;
      }
      if (existingAvailability?.status === "unavailable") {
        return false;
      }
      if (existingAvailability?.status === "pending" && existingAvailability.promise) {
        return existingAvailability.promise;
      }
      const availabilityPromise = Promise.resolve(prefetchParsedScore(record)).then(() => {
        compressedAvailabilityBySha256.set(sha256, { status: "ready" });
        return true;
      }).catch((error) => {
        compressedAvailabilityBySha256.set(sha256, { status: "unavailable" });
        console.warn("Score prefetch failed:", error);
        return false;
      });
      compressedAvailabilityBySha256.set(sha256, {
        status: "pending",
        promise: availabilityPromise
      });
      return availabilityPromise;
    }
    function setSelectedTimeSec(nextTimeSec, { openViewer = false, notify = false, beatHint = void 0, source = "external" } = {}) {
      const clampedTimeSec = clampSelectedTimeSec(state, nextTimeSec);
      const resolvedViewerMode = getResolvedViewerMode(state);
      const nextBeat = resolveSelectedBeat(state, clampedTimeSec, beatHint, resolvedViewerMode);
      const changed = hasViewerSelectionChanged(
        state.viewerModel,
        resolvedViewerMode,
        state.selectedTimeSec,
        clampedTimeSec,
        state.selectedBeat,
        nextBeat
      );
      if (openViewer) {
        state.isViewerOpen = true;
      }
      state.selectedTimeSec = clampedTimeSec;
      state.selectedBeat = nextBeat;
      if (notify && changed) {
        onSelectedTimeChange({
          timeSec: clampedTimeSec,
          beat: nextBeat,
          viewerMode: resolvedViewerMode,
          source
        });
      }
      if (!changed && !openViewer) {
        return;
      }
      scheduleRender(
        PREVIEW_RENDER_DIRTY.selection | (openViewer ? PREVIEW_RENDER_DIRTY.viewerOpen : 0)
      );
    }
    function setViewerMode(nextViewerMode) {
      const normalizedMode = normalizeViewerMode(nextViewerMode);
      if (state.viewerMode === normalizedMode) {
        return;
      }
      state.viewerMode = normalizedMode;
      if (state.parsedScore) {
        state.viewerModel = buildViewerModel(state.parsedScore, state.record, state.viewerMode);
        state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
      }
      state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
      try {
        setPersistedViewerMode(normalizedMode);
      } catch (error) {
        console.warn("Failed to persist viewer mode:", error);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerMode | PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection);
    }
    function setInvisibleNoteVisibility(nextVisibility) {
      const normalizedVisibility = normalizeInvisibleNoteVisibility(nextVisibility);
      if (state.invisibleNoteVisibility === normalizedVisibility) {
        return;
      }
      state.invisibleNoteVisibility = normalizedVisibility;
      try {
        setPersistedInvisibleNoteVisibility(normalizedVisibility);
      } catch (error) {
        console.warn("Failed to persist invisible note visibility:", error);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.invisible);
    }
    function setJudgeLinePositionRatio(nextRatio) {
      const normalizedRatio = normalizeJudgeLinePositionRatio(nextRatio);
      if (Math.abs(state.judgeLinePositionRatio - normalizedRatio) < 1e-6) {
        return;
      }
      state.judgeLinePositionRatio = normalizedRatio;
      try {
        setPersistedJudgeLinePositionRatio(normalizedRatio);
      } catch (error) {
        console.warn("Failed to persist judge line position ratio:", error);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.judgeLinePosition);
    }
    function setSpacingScale(mode, nextScale) {
      const normalizedMode = normalizeSpacingMode2(mode);
      const normalizedScale = normalizeSpacingScale(nextScale);
      if (Math.abs((state.spacingScaleByMode[normalizedMode] ?? DEFAULT_SPACING_SCALE2) - normalizedScale) < 1e-6) {
        return;
      }
      state.spacingScaleByMode = {
        ...state.spacingScaleByMode,
        [normalizedMode]: normalizedScale
      };
      try {
        setPersistedSpacingScale(normalizedMode, normalizedScale);
      } catch (error) {
        console.warn("Failed to persist spacing scale:", error);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.spacing);
    }
    function setGameTimingConfig(nextGameTimingConfig = {}) {
      const normalizedGameTimingConfig = normalizeGameTimingConfig({
        ...state.gameTimingConfig,
        ...nextGameTimingConfig
      });
      if (areGameTimingConfigsEqual2(state.gameTimingConfig, normalizedGameTimingConfig)) {
        return;
      }
      state.gameTimingConfig = normalizedGameTimingConfig;
      try {
        setPersistedGameDurationMs(normalizedGameTimingConfig.durationMs);
        setPersistedGameLaneHeightPercent(normalizedGameTimingConfig.laneHeightPercent);
        setPersistedGameLaneCoverPermille(normalizedGameTimingConfig.laneCoverPermille);
        setPersistedGameLaneCoverVisible(normalizedGameTimingConfig.laneCoverVisible);
        setPersistedGameHsFixMode(normalizedGameTimingConfig.hsFixMode);
      } catch (error) {
        console.warn("Failed to persist game timing config:", error);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.gameTimingConfig);
    }
    function setGraphInteractionMode(nextMode) {
      const normalizedMode = normalizeGraphInteractionMode(nextMode);
      if (state.graphInteractionMode === normalizedMode) {
        return;
      }
      state.graphInteractionMode = normalizedMode;
      try {
        setPersistedGraphInteractionMode(normalizedMode);
      } catch (error) {
        console.warn("Failed to persist graph interaction mode:", error);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.graphInteractionMode);
    }
    function setGraphSettingsOpen(nextOpen) {
      const normalizedOpen = Boolean(nextOpen);
      if (state.isGraphSettingsOpen === normalizedOpen) {
        return;
      }
      state.isGraphSettingsOpen = normalizedOpen;
      scheduleRender(PREVIEW_RENDER_DIRTY.graphSettings);
    }
    function setRendererConfig(nextRendererConfig = {}) {
      const normalizedRendererConfig = normalizeRendererConfig({
        ...state.rendererConfig,
        ...nextRendererConfig
      });
      if (areRendererConfigsEqual(state.rendererConfig, normalizedRendererConfig)) {
        return;
      }
      state.rendererConfig = normalizedRendererConfig;
      try {
        setPersistedViewerNoteWidth(normalizedRendererConfig.noteWidth);
        setPersistedViewerScratchWidth(normalizedRendererConfig.scratchWidth);
        setPersistedViewerNoteHeight(normalizedRendererConfig.noteHeight);
        setPersistedViewerBarLineHeight(normalizedRendererConfig.barLineHeight);
        setPersistedViewerMarkerHeight(normalizedRendererConfig.markerHeight);
        setPersistedViewerSeparatorWidth(normalizedRendererConfig.separatorWidth);
      } catch (error) {
        console.warn("Failed to persist renderer config:", error);
      }
      if (state.record) {
        shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(state.record.mode, state.rendererConfig)}px`);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.rendererConfig);
    }
    function setViewerDetailSettingsOpen(nextOpen) {
      const normalizedOpen = Boolean(nextOpen);
      if (state.isViewerDetailSettingsOpen === normalizedOpen) {
        if (normalizedOpen) {
          positionViewerDetailSettingsPopup();
        }
        return;
      }
      state.isViewerDetailSettingsOpen = normalizedOpen;
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerDetailSettings);
    }
    function setPinned(nextPinned) {
      const normalized = Boolean(nextPinned);
      if (state.isPinned === normalized) {
        return;
      }
      state.isPinned = normalized;
      onPinChange(state.isPinned);
      if (state.isPinned) {
        state.isViewerOpen = true;
        void activateRecord({ openViewer: true });
      } else if (!state.isGraphHovered && !state.isPlaying) {
        state.isViewerOpen = false;
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.pin | PREVIEW_RENDER_DIRTY.viewerOpen);
    }
    function setPlaybackState(nextPlaying) {
      if (state.isPlaying === Boolean(nextPlaying) && state.viewerModel && state.parsedScore) {
        return;
      }
      if (!state.viewerModel || !state.parsedScore) {
        stopPlayback(false);
        scheduleRender(PREVIEW_RENDER_DIRTY.playback);
        return;
      }
      if (nextPlaying) {
        startPlayback();
      } else {
        stopPlayback(true);
      }
    }
    function startPlayback() {
      if (!state.viewerModel || !state.parsedScore) {
        return;
      }
      const maxTimeSec = getScoreTotalDurationSec(state.viewerModel.score);
      if (maxTimeSec <= 0) {
        return;
      }
      if (state.selectedTimeSec >= maxTimeSec - 5e-4) {
        setSelectedTimeSec(0, { notify: true, source: "playback" });
      }
      state.isPlaying = true;
      state.isViewerOpen = true;
      state.lastPlaybackTimestamp = null;
      onPlaybackChange(true);
      if (state.playbackFrameId !== null) {
        cancelAnimationFrame(state.playbackFrameId);
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.playback | PREVIEW_RENDER_DIRTY.viewerOpen);
      state.playbackFrameId = requestAnimationFrame(stepPlayback);
    }
    function stopPlayback(renderAfter = true) {
      if (state.playbackFrameId !== null) {
        cancelAnimationFrame(state.playbackFrameId);
        state.playbackFrameId = null;
      }
      state.lastPlaybackTimestamp = null;
      if (state.isPlaying) {
        state.isPlaying = false;
        onPlaybackChange(false);
      }
      if (renderAfter) {
        scheduleRender(PREVIEW_RENDER_DIRTY.playback);
      }
    }
    function stepPlayback(timestamp) {
      if (!state.isPlaying || !state.viewerModel || !state.parsedScore) {
        state.playbackFrameId = null;
        state.lastPlaybackTimestamp = null;
        return;
      }
      if (state.lastPlaybackTimestamp === null || timestamp - state.lastPlaybackTimestamp > SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS) {
        state.lastPlaybackTimestamp = timestamp;
        state.playbackFrameId = requestAnimationFrame(stepPlayback);
        return;
      }
      const deltaSec = (timestamp - state.lastPlaybackTimestamp) / 1e3;
      state.lastPlaybackTimestamp = timestamp;
      const maxTimeSec = getScoreTotalDurationSec(state.viewerModel.score);
      const nextTimeSec = Math.min(state.selectedTimeSec + deltaSec, maxTimeSec);
      const resolvedViewerMode = getResolvedViewerMode(state);
      const nextBeat = resolveSelectedBeat(state, nextTimeSec, void 0, resolvedViewerMode);
      const changed = hasViewerSelectionChanged(
        state.viewerModel,
        resolvedViewerMode,
        state.selectedTimeSec,
        nextTimeSec,
        state.selectedBeat,
        nextBeat
      );
      state.selectedTimeSec = nextTimeSec;
      state.selectedBeat = nextBeat;
      if (changed) {
        onSelectedTimeChange({
          timeSec: state.selectedTimeSec,
          beat: nextBeat,
          viewerMode: resolvedViewerMode,
          source: "playback"
        });
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.selection);
      if (nextTimeSec >= maxTimeSec - 5e-4) {
        stopPlayback(false);
        scheduleRender(PREVIEW_RENDER_DIRTY.selection | PREVIEW_RENDER_DIRTY.playback);
        return;
      }
      state.playbackFrameId = requestAnimationFrame(stepPlayback);
    }
    function scheduleRender(renderMask = PREVIEW_RENDER_ALL) {
      if (state.isDestroyed) {
        return;
      }
      state.pendingRenderMask |= renderMask;
      if (state.renderFrameId !== null) {
        return;
      }
      state.renderFrameId = requestAnimationFrame(() => {
        state.renderFrameId = null;
        flushRender(state.pendingRenderMask);
        state.pendingRenderMask = 0;
      });
    }
    function flushRender(renderMask = PREVIEW_RENDER_ALL) {
      const expandedRenderMask = expandPreviewRenderMask(renderMask);
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.record) {
        graphController.setRecord(state.record);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.pin) {
        graphController.setPinned(state.isPinned);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.selection) {
        graphController.setSelectedTimeSec(state.selectedTimeSec);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.graphInteractionMode) {
        graphController.setInteractionMode(state.graphInteractionMode);
        graphInteractionSelect.value = state.graphInteractionMode;
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.playback) {
        graphController.setPlaybackState(state.isPlaying);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.graphSettings) {
        graphSettingsPopup.hidden = !state.isGraphSettingsOpen;
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerDetailSettings) {
        viewerDetailSettingsPopup.hidden = !state.isViewerDetailSettingsOpen;
        detailSettingsToggle.setAttribute("aria-expanded", String(state.isViewerDetailSettingsOpen));
      }
      if (state.isViewerDetailSettingsOpen) {
        positionViewerDetailSettingsPopup();
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel) {
        viewerController.setModel(state.viewerModel);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerMode) {
        viewerController.setViewerMode(state.viewerMode);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.invisible) {
        viewerController.setInvisibleNoteVisibility(state.invisibleNoteVisibility);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.judgeLinePosition) {
        viewerController.setJudgeLinePositionRatio(state.judgeLinePositionRatio);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.spacing) {
        viewerController.setSpacingScaleByMode(state.spacingScaleByMode);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.gameTimingConfig) {
        viewerController.setGameTimingConfig(state.gameTimingConfig);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.rendererConfig) {
        viewerController.setRendererConfig(state.rendererConfig);
        for (const control of viewerDetailSettingsControls) {
          control.input.value = String(state.rendererConfig[control.key]);
        }
        if (state.record) {
          shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(state.record.mode, state.rendererConfig)}px`);
        }
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.playback) {
        viewerController.setPlaybackState(state.isPlaying);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.pin) {
        viewerController.setPinned(state.isPinned);
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.selection || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerMode) {
        viewerController.setSelectedTimeSec(state.selectedTimeSec, { beatHint: state.selectedBeat });
      }
      if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerOpen || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel) {
        viewerController.setOpen(Boolean(state.isViewerOpen && state.viewerModel));
      }
      const isActuallyOpen = Boolean(state.isViewerOpen && state.viewerModel);
      if (state.lastViewerOpenState !== isActuallyOpen) {
        state.lastViewerOpenState = isActuallyOpen;
        onViewerOpenChange(isActuallyOpen);
      }
    }
    function destroy() {
      state.isDestroyed = true;
      if (state.renderFrameId !== null) {
        cancelAnimationFrame(state.renderFrameId);
        state.renderFrameId = null;
      }
      stopPlayback(false);
      graphController.destroy();
      viewerController.destroy();
      graphSettingsPopup.remove();
      documentRef.body.removeEventListener("pointerdown", handleDocumentBodyPointerDown);
      documentRef.body.removeEventListener("keydown", handleDocumentBodyKeydown);
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("resize", positionViewerDetailSettingsPopup);
      }
      viewerDetailSettingsPopup.remove();
      clearIsolatedSurface(graphSurface);
      overlaySurface.host.remove();
    }
    function positionViewerDetailSettingsPopup() {
      if (!state.isViewerDetailSettingsOpen || viewerDetailSettingsPopup.hidden || !statusPanel.isConnected) {
        return;
      }
      const statusRect = statusPanel.getBoundingClientRect();
      const viewportWidth = documentRef.documentElement?.clientWidth ?? window.innerWidth ?? 0;
      const viewportHeight = documentRef.documentElement?.clientHeight ?? window.innerHeight ?? 0;
      const popupWidth = Math.max(
        viewerDetailSettingsPopup.offsetWidth || viewerDetailSettingsPopup.getBoundingClientRect?.().width || 240,
        0
      );
      const popupHeight = Math.max(
        viewerDetailSettingsPopup.offsetHeight || viewerDetailSettingsPopup.getBoundingClientRect?.().height || 0,
        0
      );
      const left = Math.max(statusRect.left - popupWidth - 12, 12);
      const top = Math.min(
        Math.max(statusRect.bottom - popupHeight, 12),
        Math.max(viewportHeight - popupHeight - 12, 12)
      );
      viewerDetailSettingsPopup.style.left = `${left}px`;
      viewerDetailSettingsPopup.style.top = `${top}px`;
      viewerDetailSettingsPopup.style.right = "auto";
      viewerDetailSettingsPopup.style.bottom = "auto";
      viewerDetailSettingsPopup.style.transform = "none";
    }
    function handleDocumentBodyPointerDown(event) {
      if (!state.isViewerDetailSettingsOpen) {
        return;
      }
      if (eventPathIncludes(event, viewerDetailSettingsPopup) || eventPathIncludes(event, detailSettingsToggle)) {
        return;
      }
      setViewerDetailSettingsOpen(false);
    }
    function handleDocumentBodyKeydown(event) {
      if (!state.isViewerDetailSettingsOpen || event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setViewerDetailSettingsOpen(false);
    }
  }
  function renderLinks(container, normalizedRecord) {
    const getById = (id) => container.querySelector(`#${id}`);
    if (normalizedRecord.md5) {
      showLink(getById("bd-lr2ir"), `http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5=${normalizedRecord.md5}`);
      showLink(getById("bd-viewer"), `https://bms-score-viewer.pages.dev/view?md5=${normalizedRecord.md5}`);
    }
    if (normalizedRecord.sha256) {
      showLink(getById("bd-minir"), `https://www.gaftalk.com/minir/#/viewer/song/${normalizedRecord.sha256}/0`);
      showLink(getById("bd-mocha"), `https://mocha-repository.info/song.php?sha256=${normalizedRecord.sha256}`);
    }
    if (normalizedRecord.stella) {
      showLink(getById("bd-stellaverse"), `https://stellabms.xyz/song/${normalizedRecord.stella}`);
    }
  }
  function renderLaneNotes(container, normalizedRecord) {
    const laneNotesContainer = container.querySelector("#bd-lanenotes-div");
    if (!laneNotesContainer) {
      return;
    }
    laneNotesContainer.replaceChildren();
    normalizedRecord.lanenotesArr.forEach((laneNotes, index) => {
      const span = container.ownerDocument.createElement("span");
      span.className = "bd-lanenote";
      span.setAttribute("lane", getLaneChipKey(normalizedRecord.mode, index));
      span.textContent = String(laneNotes[3]);
      laneNotesContainer.appendChild(span);
    });
  }
  function renderTables(container, normalizedRecord) {
    const tableList = container.querySelector("#bd-tables-ul");
    if (!tableList) {
      return;
    }
    tableList.replaceChildren();
    normalizedRecord.tables.forEach((text) => {
      const item = container.ownerDocument.createElement("li");
      item.textContent = text;
      tableList.appendChild(item);
    });
  }
  function showLink(linkElement, href) {
    if (!linkElement) {
      return;
    }
    linkElement.href = href;
    linkElement.style.display = "inline";
  }
  function findFirstElementByClass(root, className) {
    if (!root) {
      return null;
    }
    const classNames = String(root.className ?? "").split(/\s+/).filter(Boolean);
    if (root.classList?.contains?.(className) || classNames.includes(className)) {
      return root;
    }
    for (const child of root.children ?? []) {
      const match = findFirstElementByClass(child, className);
      if (match) {
        return match;
      }
    }
    return null;
  }
  function isDescendantOf2(node, ancestor) {
    if (!node || !ancestor) {
      return false;
    }
    let current = node;
    while (current) {
      if (current === ancestor) {
        return true;
      }
      current = current.parentNode ?? null;
    }
    return false;
  }
  function createIsolatedSurface({
    documentRef,
    host = null,
    hostId = "",
    mountTo = null,
    cssText = "",
    hostClassName = "",
    rootClassName = ""
  }) {
    const surfaceHost = host ?? documentRef.createElement("div");
    surfaceHost.classList?.add?.(ISOLATED_UI_HOST_CLASS);
    if (hostClassName) {
      surfaceHost.classList?.add?.(hostClassName);
    }
    if (hostId) {
      surfaceHost.id = hostId;
    }
    if (!host) {
      mountTo?.appendChild?.(surfaceHost);
    }
    let root = surfaceHost.shadowRoot;
    if (!root) {
      if (typeof surfaceHost.attachShadow !== "function") {
        throw new Error("Shadow DOM is required for isolated preview surfaces");
      }
      root = surfaceHost.attachShadow({ mode: "open" });
    }
    if (typeof root.replaceChildren === "function") {
      root.replaceChildren();
    }
    const styleElement = documentRef.createElement("style");
    styleElement.textContent = cssText;
    const mount = documentRef.createElement("div");
    mount.className = `bmsie-surface-root${rootClassName ? ` ${rootClassName}` : ""}`;
    root.append(styleElement, mount);
    return {
      host: surfaceHost,
      root,
      mount
    };
  }
  function clearIsolatedSurface(surface) {
    if (typeof surface?.root?.replaceChildren === "function") {
      surface.root.replaceChildren();
    }
  }
  function createGraphSurfaceElements(documentRef, scrollHost) {
    const root = documentRef.createElement("div");
    root.className = "bmsie-graph-surface";
    const toolbar = documentRef.createElement("div");
    toolbar.className = "bd-graph-toolbar";
    const settingsToggle = documentRef.createElement("button");
    settingsToggle.id = "bd-graph-settings-toggle";
    settingsToggle.className = "bd-graph-toolbar-button bmsie-ui-button";
    settingsToggle.type = "button";
    settingsToggle.setAttribute("aria-label", "Open graph settings");
    settingsToggle.textContent = "⚙";
    const pinLabel = documentRef.createElement("label");
    pinLabel.className = "bd-scoreviewer-pin";
    const pinInput = documentRef.createElement("input");
    pinInput.id = "bd-scoreviewer-pin-input";
    pinInput.className = "bmsie-ui-checkbox";
    pinInput.type = "checkbox";
    const pinText = documentRef.createElement("span");
    pinText.textContent = "PIN THE VIEWER";
    pinLabel.append(pinInput, pinText);
    const canvas = documentRef.createElement("canvas");
    canvas.id = "bd-graph-canvas";
    canvas.className = "bd-graph-canvas";
    toolbar.append(settingsToggle, pinLabel);
    root.append(toolbar, canvas);
    return {
      root,
      scrollHost,
      canvas,
      pinInput,
      settingsToggle
    };
  }
  function getEventPath(event) {
    if (typeof event?.composedPath === "function") {
      return event.composedPath();
    }
    return event?.target ? [event.target] : [];
  }
  function eventPathIncludes(event, ancestor) {
    if (!ancestor) {
      return false;
    }
    for (const pathEntry of getEventPath(event)) {
      if (pathEntry === ancestor || isDescendantOf2(pathEntry, ancestor)) {
        return true;
      }
    }
    return false;
  }
  function clampSelectedTimeSec(state, timeSec) {
    if (state.viewerModel) {
      return getClampedSelectedTimeSec(state.viewerModel, timeSec);
    }
    const maxTimeSec = state.record?.durationSec ?? 0;
    return clampValue(Number.isFinite(timeSec) ? timeSec : 0, 0, Math.max(maxTimeSec, 0));
  }
  function getResolvedViewerMode(state) {
    return resolveViewerModeForModel(state.viewerModel, state.viewerMode);
  }
  function resolveSelectedBeat(state, timeSec, beatHint = void 0, resolvedViewerMode = getResolvedViewerMode(state)) {
    if (resolvedViewerMode === "time") {
      return 0;
    }
    if (Number.isFinite(beatHint)) {
      return getClampedSelectedBeat(state.viewerModel, beatHint);
    }
    return getBeatAtTimeSec(state.viewerModel, timeSec);
  }
  function getInitialViewerMode(getPersistedViewerMode) {
    try {
      return normalizeViewerMode(getPersistedViewerMode?.());
    } catch (error) {
      console.warn("Failed to read persisted viewer mode:", error);
      return DEFAULT_VIEWER_MODE;
    }
  }
  function getInitialInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility) {
    try {
      return normalizeInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility?.());
    } catch (error) {
      console.warn("Failed to read persisted invisible note visibility:", error);
      return DEFAULT_INVISIBLE_NOTE_VISIBILITY;
    }
  }
  function getInitialJudgeLinePositionRatio(getPersistedJudgeLinePositionRatio) {
    try {
      const persistedValue = getPersistedJudgeLinePositionRatio?.();
      if (persistedValue === null || persistedValue === void 0 || persistedValue === "") {
        return DEFAULT_JUDGE_LINE_POSITION_RATIO;
      }
      return normalizeJudgeLinePositionRatio(Number(persistedValue));
    } catch (error) {
      console.warn("Failed to read persisted judge line position ratio:", error);
      return DEFAULT_JUDGE_LINE_POSITION_RATIO;
    }
  }
  function getInitialSpacingScaleByMode(getPersistedSpacingScale) {
    return {
      time: getInitialSpacingScale("time", getPersistedSpacingScale),
      editor: getInitialSpacingScale("editor", getPersistedSpacingScale),
      game: getInitialSpacingScale("game", getPersistedSpacingScale)
    };
  }
  function getInitialGameTimingConfig({
    getPersistedGameDurationMs,
    getPersistedGameLaneHeightPercent,
    getPersistedGameLaneCoverPermille,
    getPersistedGameLaneCoverVisible,
    getPersistedGameHsFixMode
  } = {}) {
    return normalizeGameTimingConfig({
      durationMs: getPersistedGameDurationMs?.(),
      laneHeightPercent: getPersistedGameLaneHeightPercent?.(),
      laneCoverPermille: getPersistedGameLaneCoverPermille?.(),
      laneCoverVisible: getPersistedGameLaneCoverVisible?.(),
      hsFixMode: getPersistedGameHsFixMode?.()
    });
  }
  function getInitialGraphInteractionMode(getPersistedGraphInteractionMode) {
    try {
      return normalizeGraphInteractionMode(getPersistedGraphInteractionMode?.());
    } catch (error) {
      console.warn("Failed to read persisted graph interaction mode:", error);
      return DEFAULT_GRAPH_INTERACTION_MODE;
    }
  }
  function getInitialRendererConfig({
    getPersistedViewerNoteWidth,
    getPersistedViewerScratchWidth,
    getPersistedViewerNoteHeight,
    getPersistedViewerBarLineHeight,
    getPersistedViewerMarkerHeight,
    getPersistedViewerSeparatorWidth
  } = {}) {
    try {
      return normalizeRendererConfig({
        noteWidth: getPersistedViewerNoteWidth?.(),
        scratchWidth: getPersistedViewerScratchWidth?.(),
        noteHeight: getPersistedViewerNoteHeight?.(),
        barLineHeight: getPersistedViewerBarLineHeight?.(),
        markerHeight: getPersistedViewerMarkerHeight?.(),
        separatorWidth: getPersistedViewerSeparatorWidth?.()
      });
    } catch (error) {
      console.warn("Failed to read persisted renderer config:", error);
      return DEFAULT_RENDERER_CONFIG;
    }
  }
  function getInitialSpacingScale(mode, getPersistedSpacingScale) {
    try {
      return normalizeSpacingScale(Number(getPersistedSpacingScale?.(normalizeSpacingMode2(mode))));
    } catch (error) {
      console.warn("Failed to read persisted spacing scale:", error);
      return DEFAULT_SPACING_SCALE2;
    }
  }
  function estimateViewerWidthFromNumericMode(mode, rendererConfig = DEFAULT_RENDERER_CONFIG) {
    switch (Number(mode)) {
      case 5:
        return estimateViewerWidth("5k", 6, rendererConfig);
      case 7:
        return estimateViewerWidth("7k", 8, rendererConfig);
      case 9:
        return estimateViewerWidth("popn-9k", 9, rendererConfig);
      case 10:
        return estimateViewerWidth("10k", 12, rendererConfig);
      case 14:
        return estimateViewerWidth("14k", 16, rendererConfig);
      default:
        return estimateViewerWidth(String(mode ?? ""), getDisplayLaneCount(mode), rendererConfig);
    }
  }
  function createPopupOption(documentRef, value, label) {
    const option = documentRef.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }
  function createViewerDetailNumberField(documentRef, {
    id,
    key,
    label,
    min,
    max,
    value
  }) {
    const labelElement = documentRef.createElement("label");
    labelElement.className = "bd-graph-settings-label";
    labelElement.setAttribute("for", id);
    labelElement.textContent = label;
    const inputElement = documentRef.createElement("input");
    inputElement.id = id;
    inputElement.className = "bd-graph-settings-select score-viewer-detail-settings-input bmsie-ui-input";
    inputElement.type = "number";
    inputElement.min = String(min);
    inputElement.max = String(max);
    inputElement.step = "1";
    inputElement.value = String(value);
    return {
      key,
      max,
      label: labelElement,
      input: inputElement
    };
  }
  function createViewerDetailSettingsPairCell(documentRef, control) {
    const cellElement = documentRef.createElement("div");
    cellElement.className = "score-viewer-detail-settings-pair-cell";
    cellElement.append(control.label, control.input);
    return cellElement;
  }
  function normalizeViewerDetailInputValue(value, maxValue, fallbackValue) {
    if (value === "" || value === null || value === void 0) {
      return fallbackValue;
    }
    if (!Number.isFinite(Number(value))) {
      return fallbackValue;
    }
    return Math.min(Math.max(Math.round(Number(value)), 0), maxValue);
  }
  function getDisplayLaneCount(mode) {
    switch (mode) {
      case 5:
      case "5k":
        return 6;
      case 7:
      case "7k":
        return 8;
      case 10:
      case "10k":
        return 12;
      case 14:
      case "14k":
        return 16;
      case 9:
      case "9k":
      case "popn-9k":
        return 9;
      case "popn-5k":
        return 5;
      default:
        return Number.isFinite(Number(mode)) && Number(mode) > 0 ? Number(mode) : 8;
    }
  }
  function formatCompactNumber(value) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return Number.isInteger(value) ? String(Math.trunc(value)) : String(value);
  }
  function clampValue(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }
  function createViewerModelBpmSummary(normalizedRecord) {
    if (!normalizedRecord) {
      return void 0;
    }
    return {
      minBpm: normalizedRecord.minbpm,
      maxBpm: normalizedRecord.maxbpm,
      mainBpm: normalizedRecord.mainbpm
    };
  }
  function getViewerModelGameProfile(viewerMode) {
    return normalizeViewerMode(viewerMode) === "lunatic" ? "lunatic" : "game";
  }
  function buildViewerModel(parsedScore, normalizedRecord, viewerMode) {
    return createScoreViewerModel(parsedScore, {
      bpmSummary: createViewerModelBpmSummary(normalizedRecord),
      gameProfile: getViewerModelGameProfile(viewerMode)
    });
  }
  function areGameTimingConfigsEqual2(left, right) {
    return Math.abs((left?.durationMs ?? DEFAULT_GAME_DURATION_MS) - (right?.durationMs ?? DEFAULT_GAME_DURATION_MS)) < 1e-6 && Math.abs((left?.laneHeightPercent ?? DEFAULT_GAME_LANE_HEIGHT_PERCENT) - (right?.laneHeightPercent ?? DEFAULT_GAME_LANE_HEIGHT_PERCENT)) < 1e-6 && Math.abs((left?.laneCoverPermille ?? DEFAULT_GAME_LANE_COVER_PERMILLE) - (right?.laneCoverPermille ?? DEFAULT_GAME_LANE_COVER_PERMILLE)) < 1e-6 && (left?.laneCoverVisible ?? DEFAULT_GAME_LANE_COVER_VISIBLE) === (right?.laneCoverVisible ?? DEFAULT_GAME_LANE_COVER_VISIBLE) && (left?.hsFixMode ?? DEFAULT_GAME_HS_FIX_MODE) === (right?.hsFixMode ?? DEFAULT_GAME_HS_FIX_MODE);
  }
  function getSpacingScaleStorageKey(mode) {
    return SPACING_SCALE_STORAGE_KEYS[normalizeSpacingMode2(mode)];
  }
  function normalizeSpacingMode2(mode) {
    return mode === "editor" ? "editor" : mode === "game" || mode === "lunatic" ? "game" : "time";
  }
  function normalizeSpacingScale(value) {
    if (!Number.isFinite(value) || value < 0.5 || value > 8) {
      return DEFAULT_SPACING_SCALE2;
    }
    return value;
  }

  // tampermonkey/src/main.js
  (function() {
    "use strict";
    console.info("BMS Info Extenderが起動しました");
    const fontCSS = GM_getResourceText("googlefont");
    GM_addStyle(fontCSS);
    const SCORE_BASE_URL = "https://bms-info-extender.netlify.app/score";
    const SCORE_R2_BASE_URL = "https://bms.howan.jp/score";
    const SCORE_PARSER_BASE_URL = "https://bms-info-extender.netlify.app/score-parser";
    const SCORE_PARSER_VERSION = "0.6.5";
    const BMSSEARCH_PATTERN_PAGE_BASE_URL2 = "https://bmssearch.net/patterns";
    const SCRIPT_VERSION_FALLBACK = "2.2.0";
    const SKIP_VERSION_NOTIFICATION = false;
    const VERSION_NOTIFICATION_STORAGE_KEYS = {
      lastNotifiedVersion: "bms-info-extender.versionNotification.lastNotifiedVersion",
      notificationLanguage: "bms-info-extender.versionNotification.language"
    };
    const VERSION_NOTIFICATION_DEFAULT_LANGUAGE = "ja";
    const VERSION_NOTIFICATION_MODAL_ID = "bms-info-extender-version-notification";
    const VERSION_NOTIFICATION_STYLE = `
    :host {
      all: initial;
    }
    :host, :host * {
      box-sizing: border-box;
      font-family: "Inconsolata", "Noto Sans JP", sans-serif;
    }
    .bmsie-version-notice-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(0, 0, 0, 0.56);
      z-index: 2147483647;
      color: #f4f6ff;
      line-height: 1.5;
      text-align: left;
    }
    .bmsie-version-notice-window {
      width: min(680px, calc(100vw - 32px));
      max-height: min(760px, calc(100vh - 32px));
      overflow: auto;
      padding: 20px 20px 16px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 12px;
      background: #1d2030;
      color: #f4f6ff;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
    }
    .bmsie-version-notice-version {
      margin: 0 0 10px;
      color: #b7c2ff;
      font-size: 0.95rem;
    }
    .bmsie-version-notice-title {
      margin: 0 0 14px;
      font-size: 1.25rem;
      line-height: 1.35;
    }
    .bmsie-version-notice-section + .bmsie-version-notice-section {
      margin-top: 14px;
    }
    .bmsie-version-notice-section-title {
      margin: 0 0 8px;
      font-size: 1rem;
      line-height: 1.4;
      color: #ffffff;
    }
    .bmsie-version-notice-list {
      margin: 0;
      padding-left: 1.25rem;
      line-height: 1.6;
    }
    .bmsie-version-notice-sublist {
      margin-top: 6px;
      padding-left: 1.1rem;
      line-height: 1.5;
    }
    .bmsie-version-notice-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 18px;
    }
    .bmsie-version-notice-language {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #d9def8;
      font-size: 0.95rem;
    }
    .bmsie-version-notice-select {
      min-width: 140px;
      padding: 4px 8px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 6px;
      background: #11131d;
      color: #f4f6ff;
      font-size: 0.95rem;
    }
    .bmsie-version-notice-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 16px;
    }
    .bmsie-version-notice-checkbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      line-height: 1.45;
      color: #f4f6ff;
      cursor: pointer;
    }
    .bmsie-version-notice-checkbox input {
      margin: 0;
      accent-color: #84a4ff;
    }
    .bmsie-version-notice-ok {
      min-width: 92px;
      padding: 7px 14px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: linear-gradient(180deg, #7ea1ff 0%, #4f73d6 100%);
      color: #ffffff;
      font-size: 0.95rem;
      cursor: pointer;
    }
  `;
    const VERSION_NOTIFICATION_CONTENT = {
      "2.2.0": {
        ja: {
          title: "譜面ビューアに変更を加えました",
          sections: [
            {
              title: null,
              items: [
                "判定ラインをドラッグ可能にしました",
                "譜面ビューアをダブルクリックで再生・停止できるようにしました",
                "グラフ左上に設定を追加し、再生ラインを Hover Follow または Click・再生ラインのドラッグ・右クリックの掴みっぱなしで動かす設定を選べるようにしました",
                "下部情報ウィンドウの設定情報は自動的に隠すようにしました",
                "Game モードの挙動を beatoraja に近づけました",
                "LR2風の Lunatic モードを追加しました(負数STOPワープ、SCROLL無視)",
                {
                  text: "緑数字、レーン高さ、レーンカバー、HS-FIX が設定可能です",
                  subitems: [
                    "レーン高さ、レーンカバーはドラッグ可能です"
                  ]
                },
                "スライダーの設定値を保存するようにしました",
                "スライダーはホイールで微調整可能です"
              ]
            },
            {
              title: "従来からの挙動について補足",
              items: [
                "譜面ビューアはドラッグやホイールでも動かすことができます"
              ]
            }
          ],
          languageLabel: "言語",
          dontShowAgainLabel: "このバージョンの通知を再度表示しない",
          okLabel: "OK",
          languageOptions: {
            ja: "日本語",
            en: "English"
          }
        },
        en: {
          title: "The score viewer has been updated",
          sections: [
            {
              title: null,
              items: [
                "The judge line is now draggable",
                "You can now play or stop the score viewer by double-clicking it",
                "A new graph setting lets you choose whether the playback line follows hover or uses clicks, playback-line dragging, and right-click sticky dragging",
                "The settings in the bottom info panel are now hidden automatically",
                "Game mode now behaves more like beatoraja",
                "Added an LR2-style Lunatic mode with negative-STOP warps and no SCROLL support",
                {
                  text: "Green number, lane height, lane cover, and HS-FIX are now configurable",
                  subitems: [
                    "Lane height and lane cover can also be adjusted by dragging"
                  ]
                },
                "Slider values are now persisted",
                "Sliders can now be fine-tuned with the mouse wheel"
              ]
            },
            {
              title: "Notes about existing behavior",
              items: [
                "The score viewer can still be moved by dragging or using the mouse wheel"
              ]
            }
          ],
          languageLabel: "Language",
          dontShowAgainLabel: "Do not show this version notice again",
          okLabel: "OK",
          languageOptions: {
            ja: "日本語",
            en: "English"
          }
        }
      }
    };
    let scoreLoaderContextPromise = null;
    let activeBmsPreviewRuntime = null;
    const LR2IR_SELECTORS = {
      allAnchors: "a",
      registeredSongHeading: "#box > h2",
      search: "#search",
      registeredSongFallbackBody: "#box > table:nth-child(10) > tbody"
    };
    const STELLAVERSE_SELECTORS = {
      datetimeElem: "#thread-1 > div:nth-child(1) > div > div:nth-child(1) > div:nth-child(1) > p:last-of-type",
      targetElem: "#scroll-area > section > main > h2",
      tableContainer: '[data-slot="table-container"]',
      tableRow: '[data-slot="table-row"]',
      tableHead: '[data-slot="table-head"]',
      tableCell: '[data-slot="table-cell"]',
      anchor: "a"
    };
    const STELLAVERSE_INDEXES = {
      notesCell: 1,
      totalCell: 3,
      removeRowsAfterSuccess: [4, 0]
    };
    const MINIR_SELECTORS = {
      targetElement: "#root > div > div > div > div.compact.tabulator"
    };
    const MOCHA_SELECTORS = {
      songInfoTable: "#main > table.songinfo",
      songInfoBody: "#main > table.songinfo > tbody",
      form: "#main > form",
      songInfoContentCell: "td.songinfo_content",
      anchor: "a"
    };
    const MOCHA_ROW_INDEXES = {
      mode: 1,
      totalNotes: 3,
      total: 4,
      judgerank: 5,
      bpm: 6,
      otherIr: 10
    };
    const MOCHA_LINK_INDEXES = {
      lr2irInOtherIrRow: 2
    };
    void initializeVersionNotification();
    bootstrap();
    async function initializeVersionNotification() {
      const currentVersion = getCurrentScriptVersion();
      if (SKIP_VERSION_NOTIFICATION) {
        persistNotifiedVersion(currentVersion);
        return;
      }
      if (!shouldShowVersionNotification(currentVersion)) {
        return;
      }
      const notificationContent = getVersionNotificationContent(currentVersion);
      if (!notificationContent) {
        persistNotifiedVersion(currentVersion);
        return;
      }
      await ensureDocumentBodyReady();
      if (!document.body || document.getElementById(VERSION_NOTIFICATION_MODAL_ID)) {
        return;
      }
      showVersionNotificationModal({
        version: currentVersion,
        notificationContent,
        initialLanguage: getPersistedNotificationLanguage()
      });
    }
    function getCurrentScriptVersion() {
      return typeof GM_info === "object" && GM_info?.script?.version ? String(GM_info.script.version) : SCRIPT_VERSION_FALLBACK;
    }
    function getVersionNotificationContent(version) {
      return VERSION_NOTIFICATION_CONTENT[version] ?? null;
    }
    function shouldShowVersionNotification(currentVersion) {
      return getLastNotifiedVersion() !== currentVersion;
    }
    function getLastNotifiedVersion() {
      return typeof GM_getValue === "function" ? String(GM_getValue(VERSION_NOTIFICATION_STORAGE_KEYS.lastNotifiedVersion, "")) : "";
    }
    function persistNotifiedVersion(version) {
      if (typeof GM_setValue === "function") {
        GM_setValue(VERSION_NOTIFICATION_STORAGE_KEYS.lastNotifiedVersion, version);
      }
    }
    function getPersistedNotificationLanguage() {
      const persistedLanguage = typeof GM_getValue === "function" ? String(GM_getValue(VERSION_NOTIFICATION_STORAGE_KEYS.notificationLanguage, VERSION_NOTIFICATION_DEFAULT_LANGUAGE)) : VERSION_NOTIFICATION_DEFAULT_LANGUAGE;
      return persistedLanguage === "en" ? "en" : "ja";
    }
    function persistNotificationLanguage(language) {
      if (typeof GM_setValue === "function") {
        GM_setValue(VERSION_NOTIFICATION_STORAGE_KEYS.notificationLanguage, language === "en" ? "en" : "ja");
      }
    }
    function ensureDocumentBodyReady() {
      if (document.body) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const onReady = () => {
          if (!document.body) {
            return;
          }
          document.removeEventListener("DOMContentLoaded", onReady);
          resolve();
        };
        document.addEventListener("DOMContentLoaded", onReady);
      });
    }
    function showVersionNotificationModal({ version, notificationContent, initialLanguage }) {
      const host = document.createElement("div");
      host.id = VERSION_NOTIFICATION_MODAL_ID;
      const shadowRoot = host.attachShadow({ mode: "open" });
      const styleElement = document.createElement("style");
      styleElement.textContent = VERSION_NOTIFICATION_STYLE;
      const overlay = document.createElement("div");
      overlay.className = "bmsie-version-notice-overlay";
      const windowElement = document.createElement("div");
      windowElement.className = "bmsie-version-notice-window";
      const versionElement = document.createElement("p");
      versionElement.className = "bmsie-version-notice-version";
      const titleElement = document.createElement("h2");
      titleElement.className = "bmsie-version-notice-title";
      const contentElement = document.createElement("div");
      contentElement.className = "bmsie-version-notice-content";
      const controlsElement = document.createElement("div");
      controlsElement.className = "bmsie-version-notice-controls";
      const languageLabel = document.createElement("label");
      languageLabel.className = "bmsie-version-notice-language";
      const languageLabelText = document.createElement("span");
      const languageSelect = document.createElement("select");
      languageSelect.className = "bmsie-version-notice-select";
      languageSelect.append(
        createNotificationLanguageOption("ja", "日本語"),
        createNotificationLanguageOption("en", "English")
      );
      languageLabel.append(languageLabelText, languageSelect);
      controlsElement.append(languageLabel);
      const footerElement = document.createElement("div");
      footerElement.className = "bmsie-version-notice-footer";
      const checkboxLabel = document.createElement("label");
      checkboxLabel.className = "bmsie-version-notice-checkbox";
      const suppressCheckbox = document.createElement("input");
      suppressCheckbox.type = "checkbox";
      suppressCheckbox.checked = false;
      const checkboxText = document.createElement("span");
      checkboxLabel.append(suppressCheckbox, checkboxText);
      const okButton = document.createElement("button");
      okButton.type = "button";
      okButton.className = "bmsie-version-notice-ok";
      footerElement.append(checkboxLabel, okButton);
      windowElement.append(versionElement, titleElement, contentElement, controlsElement, footerElement);
      overlay.append(windowElement);
      let currentLanguage = initialLanguage === "en" ? "en" : "ja";
      languageSelect.value = currentLanguage;
      renderNotificationLanguage(currentLanguage);
      languageSelect.addEventListener("change", () => {
        currentLanguage = languageSelect.value === "en" ? "en" : "ja";
        persistNotificationLanguage(currentLanguage);
        renderNotificationLanguage(currentLanguage);
      });
      okButton.addEventListener("click", () => {
        if (suppressCheckbox.checked) {
          persistNotifiedVersion(version);
        }
        host.remove();
      });
      shadowRoot.append(styleElement, overlay);
      document.body.appendChild(host);
      function renderNotificationLanguage(language) {
        const localizedContent = notificationContent[language] ?? notificationContent.ja;
        versionElement.textContent = `version: ${version}`;
        titleElement.textContent = localizedContent.title;
        languageLabelText.textContent = localizedContent.languageLabel;
        checkboxText.textContent = localizedContent.dontShowAgainLabel;
        okButton.textContent = localizedContent.okLabel;
        updateNotificationLanguageOptions(languageSelect, localizedContent.languageOptions);
        renderNotificationSections(contentElement, localizedContent.sections);
      }
    }
    function createNotificationLanguageOption(value, label) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }
    function updateNotificationLanguageOptions(languageSelect, languageOptions = {}) {
      if (!languageSelect) {
        return;
      }
      for (const option of languageSelect.options) {
        option.textContent = languageOptions[option.value] ?? option.textContent;
      }
    }
    function renderNotificationSections(contentElement, sections) {
      contentElement.replaceChildren();
      for (const section of sections) {
        const sectionElement = document.createElement("section");
        sectionElement.className = "bmsie-version-notice-section";
        if (section.title) {
          const sectionTitleElement = document.createElement("h3");
          sectionTitleElement.className = "bmsie-version-notice-section-title";
          sectionTitleElement.textContent = section.title;
          sectionElement.appendChild(sectionTitleElement);
        }
        sectionElement.appendChild(createNotificationList(section.items));
        contentElement.appendChild(sectionElement);
      }
    }
    function createNotificationList(items = []) {
      const listElement = document.createElement("ul");
      listElement.className = "bmsie-version-notice-list";
      for (const item of items) {
        const listItemElement = document.createElement("li");
        if (typeof item === "string") {
          listItemElement.textContent = item;
        } else {
          listItemElement.textContent = item.text;
          if (Array.isArray(item.subitems) && item.subitems.length > 0) {
            const sublistElement = document.createElement("ul");
            sublistElement.className = "bmsie-version-notice-sublist";
            for (const subitem of item.subitems) {
              const subitemElement = document.createElement("li");
              subitemElement.textContent = subitem;
              sublistElement.appendChild(subitemElement);
            }
            listItemElement.appendChild(sublistElement);
          }
        }
        listElement.appendChild(listItemElement);
      }
      return listElement;
    }
    function bootstrap() {
      switch (location.hostname) {
        case "www.dream-pro.info":
          lr2ir();
          break;
        case "stellabms.xyz":
          stellaverse();
          break;
        case "www.gaftalk.com":
          minir();
          break;
        case "mocha-repository.info":
          mocha();
          break;
        default:
          break;
      }
    }
    function installLocationChangeHookOnce() {
      const hookFlag = "__bmsInfoExtenderLocationHookInstalled";
      if (window[hookFlag]) {
        return;
      }
      window[hookFlag] = true;
      const dispatchLocationChange = () => {
        window.dispatchEvent(new Event("locationchange"));
      };
      const pushState = history.pushState;
      history.pushState = function(...args) {
        const result = pushState.apply(this, args);
        dispatchLocationChange();
        return result;
      };
      const replaceState = history.replaceState;
      history.replaceState = function(...args) {
        const result = replaceState.apply(this, args);
        dispatchLocationChange();
        return result;
      };
      window.addEventListener("popstate", dispatchLocationChange);
    }
    function watchSpaPage({ siteName, matchUrl, updatePage, isSettled }) {
      let lastUrl = location.href;
      let completedUrl = null;
      let observer = null;
      let isUpdating = false;
      function markUpdated() {
        completedUrl = location.href;
      }
      function shouldStopObserving() {
        return completedUrl === location.href || !matchUrl(location.href) || Boolean(isSettled?.());
      }
      async function runUpdate() {
        if (isUpdating || completedUrl === location.href || !matchUrl(location.href) || isSettled?.()) {
          if (shouldStopObserving()) {
            stopObserving();
          }
          return;
        }
        isUpdating = true;
        try {
          await updatePage({ markUpdated });
        } finally {
          isUpdating = false;
          if (shouldStopObserving()) {
            stopObserving();
          }
        }
      }
      function startObserving() {
        if (observer || !matchUrl(location.href) || !document.body) {
          return;
        }
        console.log(`👁️ ${siteName}: MutationObserverによる監視を開始します`);
        observer = new MutationObserver(async () => {
          console.info("MutationObserverがDOMの変化を検知しました");
          if (!document.hidden) {
            await runUpdate();
          }
          if (shouldStopObserving()) {
            stopObserving();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
      function stopObserving() {
        if (observer) {
          observer.disconnect();
          observer = null;
          console.log(`🛑 ${siteName}: MutationObserverによる監視を停止します`);
        }
      }
      installLocationChangeHookOnce();
      if (document.readyState === "complete") {
        console.info("🔥 loadイベントは発火済でした");
        startObserving();
        void runUpdate();
      } else {
        window.addEventListener("load", () => {
          console.info("🔥 loadイベントが発火しました");
          startObserving();
          void runUpdate();
        });
      }
      document.addEventListener("visibilitychange", () => {
        console.info("🔥 Visibilitychangeイベントが発火しました");
        if (document.hidden) {
          return;
        }
        startObserving();
        void runUpdate();
      });
      window.addEventListener("locationchange", () => {
        if (location.href === lastUrl) {
          return;
        }
        lastUrl = location.href;
        completedUrl = null;
        console.log("🔄 URLが変化しました:", lastUrl);
        resetActiveBmsPreviewRuntime();
        if (matchUrl(location.href)) {
          startObserving();
          if (!document.hidden) {
            void runUpdate();
          }
        } else {
          stopObserving();
        }
      });
      startObserving();
    }
    function resetActiveBmsPreviewRuntime() {
      if (!activeBmsPreviewRuntime) {
        return;
      }
      activeBmsPreviewRuntime.destroy();
      activeBmsPreviewRuntime = null;
    }
    function findAnchorByText(anchors, text) {
      let matchedAnchor = null;
      for (const anchor of anchors) {
        if (anchor.innerText == text) {
          matchedAnchor = anchor;
        }
      }
      return matchedAnchor;
    }
    function getStellaverseDomRefs() {
      const datetimeElem = document.querySelector(STELLAVERSE_SELECTORS.datetimeElem);
      const targetElem = document.querySelector(STELLAVERSE_SELECTORS.targetElem);
      const tableContainer = document.querySelector(STELLAVERSE_SELECTORS.tableContainer);
      const tableRows = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableRow)) : [];
      const tableHeads = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableHead)) : [];
      const tableCells = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableCell)) : [];
      const anchors = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.anchor)) : [];
      return { datetimeElem, targetElem, tableContainer, tableRows, tableHeads, tableCells, anchors };
    }
    function getMochaSongInfoRefs() {
      const songInfoTable = document.querySelector(MOCHA_SELECTORS.songInfoTable);
      const songInfoBody = document.querySelector(MOCHA_SELECTORS.songInfoBody);
      const songInfoRows = songInfoBody ? Array.from(songInfoBody.children) : [];
      return { songInfoTable, songInfoBody, songInfoRows };
    }
    async function lr2ir() {
      console.info("LR2IRの処理に入りました");
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", async (event) => {
          console.info("🔥 DOMContentLoadedイベントが発火しました");
          await updatePage();
        });
      } else {
        console.info("🔥 DOMContentLoadedイベントは発火済です");
        await updatePage();
      }
      async function updatePage() {
        if (!location.href.startsWith("http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking")) {
          return;
        }
        console.info("LR2IR曲ページの書き換え処理に入りました");
        let targetbmsid = null;
        const anchors = Array.from(document.querySelectorAll(LR2IR_SELECTORS.allAnchors));
        const historyAnchor = findAnchorByText(anchors, "更新履歴");
        if (historyAnchor) {
          targetbmsid = new URL(historyAnchor.href).searchParams.get("bmsid");
        }
        const targetmd5 = new URL(window.location.href).searchParams.get("bmsmd5");
        let htmlTargetElement = document.querySelector(LR2IR_SELECTORS.registeredSongHeading);
        let htmlTargetDest = "afterend";
        if (!htmlTargetElement) {
          htmlTargetElement = document.querySelector(LR2IR_SELECTORS.search);
        }
        if ((targetmd5 || targetbmsid) && htmlTargetElement && htmlTargetDest) {
          const pageContext = {
            identifiers: { md5: targetmd5, sha256: null, bmsid: targetbmsid },
            insertion: { element: htmlTargetElement, position: htmlTargetDest },
            theme: { dctx: "#333", dcbk: "#fff", hdtx: "#eef", hdbk: "#669" }
          };
          const container = insertBmsDataTemplate(pageContext);
          if (await insertBmsData(pageContext, container)) {
            console.info("✅ 外部データの取得とページの書き換えが成功しました");
          } else {
            console.error("❌ 外部データの取得とページの書き換えが失敗しました");
            const tbody = document.querySelector(LR2IR_SELECTORS.registeredSongFallbackBody);
            if (tbody) {
              const md5Row = document.createElement("tr");
              md5Row.innerHTML = `<th>MD5</th><td colspan="7">${targetmd5}</td>`;
              const viewerRow = document.createElement("tr");
              viewerRow.innerHTML = `<th>VIEWER</th><td colspan="7"><a href="https://bms-score-viewer.pages.dev/view?md5=${targetmd5}">https://bms-score-viewer.pages.dev/view?md5=${targetmd5}</a></td>`;
              tbody.appendChild(md5Row);
              tbody.appendChild(viewerRow);
            } else {
              const table_element = document.createElement("table");
              table_element.innerHTML = `<tr><th>MD5</th><td>${targetmd5}</td></tr><tr><th>VIEWER</th><td><a href="https://bms-score-viewer.pages.dev/view?md5=${targetmd5}">https://bms-score-viewer.pages.dev/view?md5=${targetmd5}</a></td></tr>`;
              const searchElement = document.querySelector(LR2IR_SELECTORS.search);
              if (searchElement) {
                searchElement.after(table_element);
              } else {
                console.error("❌ LR2IRの検索フォームが見つかりませんでした");
              }
            }
          }
        } else {
          console.info("❌ LR2IRのページ書き換えはスキップされました。MD5/BMSIDかターゲット要素が取得できませんでした");
        }
      }
    }
    async function stellaverse() {
      console.info("STELLAVERSEの処理に入りました");
      watchSpaPage({
        siteName: "STELLAVERSE",
        matchUrl: (url) => url.startsWith("https://stellabms.xyz/thread/"),
        updatePage
      });
      async function updatePage({ markUpdated }) {
        if (!location.href.startsWith("https://stellabms.xyz/thread/")) {
          return;
        }
        console.info("スレッドページの書き換え処理に入りました");
        if (document.getElementById("bmsdata-container")) {
          console.info("前回の拡張情報がまだ残っているためスキップします");
          return;
        }
        const stellaverseRefs = getStellaverseDomRefs();
        const { datetimeElem, targetElem, tableContainer, anchors } = stellaverseRefs;
        if (!datetimeElem || !targetElem || !tableContainer) {
          console.info("処理対象エレメントのいずれかが見つかりません");
          return;
        }
        const match = datetimeElem.textContent.trim().match(/@ (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
        if (!match) {
          console.info("❌ 投稿日時がパースできませんでした");
          return;
        }
        const postedDate = new Date(match[1].replace(/\//g, "-"));
        const now = /* @__PURE__ */ new Date();
        const diffMs = now - postedDate;
        const diffDays = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs % (1e3 * 60 * 60 * 24) / (1e3 * 60 * 60));
        const diffMinutes = Math.floor(diffMs % (1e3 * 60 * 60) / (1e3 * 60));
        const elapsedText = `Elapsed time: ${diffDays} days ${String(diffHours).padStart(2, "0")} hours ${String(diffMinutes).padStart(2, "0")} minutes`;
        const elapsedTimeElement = document.createElement("p");
        elapsedTimeElement.textContent = elapsedText;
        targetElem.insertAdjacentElement("afterend", elapsedTimeElement);
        markUpdated();
        const firstTableRow = stellaverseRefs.tableRows[0];
        if (!firstTableRow) {
          console.info("処理対象のテーブル行が見つかりません");
          return;
        }
        const removedHeadCount = firstTableRow.querySelectorAll(STELLAVERSE_SELECTORS.tableHead).length;
        const removedCellCount = firstTableRow.querySelectorAll(STELLAVERSE_SELECTORS.tableCell).length;
        const tableRows = stellaverseRefs.tableRows.slice(1);
        const tableHeads = stellaverseRefs.tableHeads.slice(removedHeadCount);
        const tableCells = stellaverseRefs.tableCells.slice(removedCellCount);
        firstTableRow.remove();
        tableRows.forEach((el) => {
          el.style.borderBottomWidth = "0";
        });
        tableHeads.forEach((el) => {
          el.style.height = "1.2rem";
          el.style.lineHeight = "100%";
          el.style.padding = "0.1rem 0.2rem";
          el.style.fontFamily = '"Inconsolata"';
        });
        tableCells.forEach((el) => {
          el.style.lineHeight = "100%";
          el.style.padding = "0.1rem 0.2rem";
          el.style.fontFamily = '"Inconsolata"';
        });
        const totalCellElement = tableCells[STELLAVERSE_INDEXES.totalCell];
        const notesCellElement = tableCells[STELLAVERSE_INDEXES.notesCell];
        if (!totalCellElement || !notesCellElement) {
          console.info("TOTALかNOTESのセルが見つかりません");
          return;
        }
        const total = Number(totalCellElement.textContent.trim());
        const notes = Number(notesCellElement.textContent.trim());
        let beatorajaTotal;
        let lr2Total;
        if (total === 0) {
          beatorajaTotal = Math.max(260, 7.605 * notes / (0.01 * notes + 6.5));
          lr2Total = 160 + (notes + Math.min(Math.max(notes - 400, 0), 200)) * 0.16;
          totalCellElement.textContent = `0, so #TOTAL is undefined. beatoraja is ${beatorajaTotal.toFixed(2)}(${(beatorajaTotal / notes).toFixed(3)}T/N), LR2 is ${lr2Total.toFixed(2)}(${(lr2Total / notes).toFixed(3)}T/N).`;
        }
        let bokutachi;
        let targetmd5 = null;
        for (const a of anchors) {
          if (a.textContent.trim() === "LR2IR") {
            const href = a.href;
            const match2 = href.match(/[a-f0-9]{32}$/i);
            if (match2) {
              targetmd5 = match2[0];
            }
          } else if (a.textContent.trim() === "Bokutachi") {
            bokutachi = a.href;
          }
          if (targetmd5 && bokutachi) break;
        }
        if (targetmd5) {
          const isDarkMode = document.documentElement.style.getPropertyValue("color-scheme").includes("dark");
          const pageContext = {
            identifiers: { md5: targetmd5, sha256: null, bmsid: null },
            insertion: { element: tableContainer, position: "beforeend" },
            theme: isDarkMode ? { dctx: "#fafafa", dcbk: "#09090b", hdtx: "#fafafa", hdbk: "#18191d" } : { dctx: "#09090b", dcbk: "#ffffff", hdtx: "#09090b", hdbk: "#e9eaed" }
          };
          const container = insertBmsDataTemplate(pageContext);
          if (await insertBmsData(pageContext, container)) {
            console.info("✅ 外部データの取得とページの書き換えが成功しました");
            const bokutachiLink = container.querySelector("#bd-bokutachi");
            if (bokutachi && bokutachiLink) {
              bokutachiLink.setAttribute("href", `${bokutachi}`);
              bokutachiLink.setAttribute("style", "display: inline;");
            }
            const rowsToRemoveAfterSuccess = STELLAVERSE_INDEXES.removeRowsAfterSuccess.map((index) => tableRows[index]).filter(Boolean);
            rowsToRemoveAfterSuccess.forEach((row) => {
              row.remove();
            });
          } else {
            console.error("❌ 外部データの取得とページの書き換えが失敗しました");
          }
        } else {
          console.info("❌ STELLAVERSEのページ書き換えはスキップされました。MD5が取得できませんでした");
        }
      }
    }
    async function minir() {
      console.info("MinIRの処理に入りました");
      watchSpaPage({
        siteName: "MinIR",
        matchUrl: (url) => url.startsWith("https://www.gaftalk.com/minir/#/viewer/song/"),
        updatePage,
        isSettled: () => Boolean(document.getElementById("bmsdata-container"))
      });
      async function updatePage({ markUpdated }) {
        if (!location.href.startsWith("https://www.gaftalk.com/minir/#/viewer/song/")) {
          return;
        }
        console.info("MinIRの曲ページ書き換え処理に入りました");
        const url = window.location.href;
        let targetsha256 = null;
        const match = url.match(/\/song\/([a-f0-9]{64})\/\d/);
        if (match) {
          targetsha256 = match[1];
        }
        const htmlTargetElement = document.querySelector(MINIR_SELECTORS.targetElement);
        const htmlTargetDest = "beforebegin";
        if (targetsha256 && htmlTargetElement && htmlTargetDest && !document.getElementById("bmsdata-container")) {
          const pageContext = {
            identifiers: { md5: null, sha256: targetsha256, bmsid: null },
            insertion: { element: htmlTargetElement, position: htmlTargetDest },
            theme: { dctx: "#1A202C", dcbk: "#ffffff", hdtx: "#000000DE", hdbk: "#f1f1f1" }
          };
          const container = insertBmsDataTemplate(pageContext);
          if (await insertBmsData(pageContext, container)) {
            console.info("✅ 外部データの取得とページの書き換えが成功しました");
            markUpdated();
          } else {
            console.error("❌ 外部データの取得とページの書き換えが失敗しました");
          }
        } else {
          console.info("❌ MinIRのページ書き換えはスキップされました。既にbmsdataが挿入済みか、ターゲット要素が見つかりませんでした");
        }
      }
    }
    async function mocha() {
      console.info("Mochaの処理に入りました");
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", async (event) => {
          console.info("🔥 DOMContentLoadedイベントが発火しました");
          await updatePage();
        });
      } else {
        console.info("🔥 DOMContentLoadedイベントは発火済です");
        await updatePage();
      }
      async function updatePage() {
        console.info("Mochaの曲ページ書き換え処理に入りました");
        const url = window.location.href;
        let targetsha256 = null;
        const match = url.match(/sha256=([a-f0-9]{64})/);
        if (match) {
          targetsha256 = match[1];
        }
        const { songInfoTable, songInfoBody, songInfoRows } = getMochaSongInfoRefs();
        let htmlTargetElement = songInfoTable;
        let htmlTargetDest = "afterend";
        if (!htmlTargetElement) {
          htmlTargetElement = document.querySelector(MOCHA_SELECTORS.form);
          htmlTargetDest = "beforebegin";
        }
        if (targetsha256 && htmlTargetElement && htmlTargetDest) {
          const pageContext = {
            identifiers: { md5: null, sha256: targetsha256, bmsid: null },
            insertion: { element: htmlTargetElement, position: htmlTargetDest },
            theme: { dctx: "#ffffff", dcbk: "#333333", hdtx: "#ffffff", hdbk: "#666666" }
          };
          const container = insertBmsDataTemplate(pageContext);
          if (await insertBmsData(pageContext, container)) {
            if (songInfoTable) {
              const rowsToRemove = [
                songInfoRows[MOCHA_ROW_INDEXES.otherIr],
                songInfoRows[MOCHA_ROW_INDEXES.bpm],
                songInfoRows[MOCHA_ROW_INDEXES.judgerank],
                songInfoRows[MOCHA_ROW_INDEXES.total],
                songInfoRows[MOCHA_ROW_INDEXES.totalNotes],
                songInfoRows[MOCHA_ROW_INDEXES.mode]
              ].filter(Boolean);
              rowsToRemove.forEach((row) => {
                row.remove();
              });
            }
            console.info("✅ 外部データの取得とページの書き換えが成功しました");
          } else {
            console.error("❌ 外部データの取得とページの書き換えが失敗しました");
            const otherIrRow = songInfoRows[MOCHA_ROW_INDEXES.otherIr];
            const otherIrLinks = otherIrRow ? Array.from(otherIrRow.querySelectorAll(MOCHA_SELECTORS.anchor)) : [];
            const lr2irLink = otherIrLinks[MOCHA_LINK_INDEXES.lr2irInOtherIrRow];
            if (lr2irLink) {
              const href = lr2irLink.getAttribute("href");
              const md5Match = href ? href.match(/bmsmd5=([0-9a-fA-F]{32})/) : null;
              if (!md5Match) {
                console.error("❌ LR2IRリンクからMD5が取得できませんでした");
                return;
              }
              const md5 = md5Match[1];
              const sha256Row = document.createElement("tr");
              sha256Row.setAttribute("height", "20");
              sha256Row.className = "ranking_header";
              sha256Row.innerHTML = `<td class="songinfo_header">Sha256</td><td class="songinfo_content">${targetsha256}</td>`;
              const md5Row = document.createElement("tr");
              md5Row.setAttribute("height", "20");
              md5Row.className = "ranking_header";
              md5Row.innerHTML = `<td class="songinfo_header">Md5</td><td class="songinfo_content">${md5}</td>`;
              if (songInfoBody) {
                songInfoBody.appendChild(sha256Row);
                songInfoBody.appendChild(md5Row);
              } else {
                console.error("❌ Mochaの曲情報テーブル本文が見つかりませんでした");
                return;
              }
              const targetTd = otherIrRow.querySelector(MOCHA_SELECTORS.songInfoContentCell);
              if (targetTd) {
                const viewerLink = document.createElement("a");
                viewerLink.href = `https://bms-score-viewer.pages.dev/view?md5=${md5}`;
                viewerLink.target = "_blank";
                viewerLink.textContent = "Viewer";
                targetTd.appendChild(document.createTextNode("　"));
                targetTd.appendChild(viewerLink);
                void appendBmsSearchLinkIfAvailable(targetTd, targetsha256);
              } else {
                console.error("❌ Mochaのリンク追加先セルが見つかりませんでした");
              }
            } else {
              console.error("❌ LR2IRリンクが見つかりませんでした");
            }
          }
        } else {
          console.info("❌ Mochaのページ書き換えはスキップされました。sha256かターゲット要素が取得できませんでした");
        }
      }
    }
    function insertBmsDataTemplate(pageContext) {
      return insertBmsDataContainer({
        documentRef: document,
        insertion: pageContext.insertion,
        theme: pageContext.theme
      });
    }
    async function insertBmsData(pageContext, container) {
      const normalizedRecord = await fetchBmsInfoRecordByIdentifiers(pageContext.identifiers);
      if (!normalizedRecord) {
        container.remove();
        return false;
      }
      renderBmsData(container, normalizedRecord);
      if (container.__bmsPreviewRuntime) {
        container.__bmsPreviewRuntime.destroy();
      }
      resetActiveBmsPreviewRuntime();
      const previewPreferenceStorage = createPreviewPreferenceStorage({
        read: (key, fallbackValue) => {
          return typeof GM_getValue === "function" ? GM_getValue(key, fallbackValue) : fallbackValue;
        },
        write: (key, value) => {
          if (typeof GM_setValue === "function") {
            GM_setValue(key, value);
          }
        }
      });
      container.__bmsPreviewRuntime = createBmsInfoPreview({
        container,
        documentRef: document,
        loadParsedScore: async (record) => {
          const loaderContext = await ensureScoreLoaderContext();
          const parsedResult = await loaderContext.loader.loadParsedScore(record.sha256.toLowerCase());
          return parsedResult.score;
        },
        prefetchParsedScore: async (record) => {
          if (!record?.sha256) {
            return;
          }
          const loaderContext = await ensureScoreLoaderContext();
          await loaderContext.loader.prefetchScore(record.sha256.toLowerCase());
        },
        ...previewPreferenceStorage,
        onRuntimeError: (error) => {
          console.warn("Score viewer runtime failed:", error);
        }
      });
      activeBmsPreviewRuntime = container.__bmsPreviewRuntime;
      container.__bmsPreviewRuntime.setRecord(normalizedRecord);
      if (normalizedRecord.sha256) {
        void container.__bmsPreviewRuntime.prefetch();
      }
      return true;
    }
    async function checkBmsSearchPatternExists2(sha256) {
      return checkBmsSearchPatternExists(sha256);
    }
    async function appendBmsSearchLinkIfAvailable(targetTd, sha256) {
      try {
        if (!sha256) {
          return;
        }
        if (!await checkBmsSearchPatternExists2(sha256)) {
          return;
        }
        if (!targetTd.isConnected) {
          return;
        }
        const href = `${BMSSEARCH_PATTERN_PAGE_BASE_URL2}/${sha256}`;
        const existingLink = Array.from(targetTd.querySelectorAll("a")).find((anchor) => anchor.href === href);
        if (existingLink) {
          return;
        }
        const bmsSearchLink = document.createElement("a");
        bmsSearchLink.href = href;
        bmsSearchLink.target = "_blank";
        bmsSearchLink.textContent = "BMS SEARCH";
        targetTd.appendChild(document.createTextNode("　"));
        targetTd.appendChild(bmsSearchLink);
      } catch (error) {
        console.warn("MochaフォールバックへのBMS SEARCHリンク追加に失敗しました:", error);
      }
    }
    async function ensureScoreLoaderContext() {
      if (scoreLoaderContextPromise) {
        return scoreLoaderContextPromise;
      }
      const moduleUrl = `${SCORE_PARSER_BASE_URL}/v${SCORE_PARSER_VERSION}/score_loader.js`;
      scoreLoaderContextPromise = import(moduleUrl).then((module) => ({
        moduleUrl,
        loader: module.createScoreLoader({
          scoreSources: [
            { baseUrl: SCORE_BASE_URL, pathStyle: "sharded" },
            { baseUrl: SCORE_R2_BASE_URL, pathStyle: "flat" }
          ]
        })
      })).catch((error) => {
        scoreLoaderContextPromise = null;
        throw error;
      });
      return scoreLoaderContextPromise;
    }
  })();
})();
