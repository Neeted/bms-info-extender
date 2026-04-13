import {
  createDefaultGameTimingConfig,
  DEFAULT_EDITOR_PIXELS_PER_BEAT,
  GAME_GREEN_NUMBER_RATIO,
  DEFAULT_JUDGE_LINE_POSITION_RATIO,
  DEFAULT_VIEWER_MODE,
  DEFAULT_VIEWER_PIXELS_PER_SECOND,
  getBeatAtTimeSec,
  getGameCurrentDurationForTimingState,
  getGameLaneCoverBounds,
  getGameJudgeLineY,
  getGameLaneGeometry,
  getGameTimingDerivedMetrics,
  getGameTimingStateAtTimeSec,
  getJudgeLineY,
  getEditorFrameState,
  getVisibleTimeRange,
  normalizeGameTimingConfig,
  resolveViewerModeForModel,
  shouldDrawLongEndCap,
} from "./score-viewer-model.js";

export const VIEWER_LANE_SIDE_PADDING = 6;
export const DP_GUTTER_UNITS = 1.2;
export const NOTE_WIDTH = 15;
export const SCRATCH_WIDTH = 30;
export const SEPARATOR_WIDTH = 1;
export const BAR_LINE_HEIGHT = 1;
const BACKGROUND_FILL = "#000000";
const DP_GUTTER_FILL = "#808080";
const SEPARATOR_COLOR = "#404040";
const BAR_LINE = "#ffffff";
const EDITOR_BEAT_GRID_LINE = "#808080";
const EDITOR_SIXTEENTH_GRID_LINE = "#404040";
const BPM_MARKER = "#00ff00";
const STOP_MARKER = "#ff00ff";
const SCROLL_MARKER = "#ff0";
const MINE_COLOR = "#880000";
const INVISIBLE_NOTE_COLOR = "#FFFF00";
const KEYBOARD_LANE_BACKGROUND_PRIMARY = "#000030";
const KEYBOARD_LANE_BACKGROUND_SECONDARY = "#1a1a45";
const KEYBOARD_WHEEL_UP_COLOR = "#0000ff";
const KEYBOARD_WHEEL_DOWN_COLOR = "#ff0000";
const KEYBOARD_WHITE_KEY_COLOR = "#bebebe";
const KEYBOARD_BLACK_KEY_COLOR = "#5074fe";
const KEYBOARD_DOUBLE_SEPARATOR_COLOR = "#ffffff";
export const NOTE_HEAD_HEIGHT = 4;
export const TEMPO_MARKER_HEIGHT = 1;
export const JUDGE_LINE_HEIGHT = 2;
const TEMPO_MARKER_WIDTH = 8;
const TEMPO_LABEL_GAP = 8;
const TEMPO_LABEL_MIN_GAP = 12;
const TEMPO_LABEL_FONT = '12px "Inconsolata", "Noto Sans JP"';
const MEASURE_LABEL_COLOR = "#FFFFFF";
const JUDGE_LINE_SIDE_OVERHANG = 48;
const JUDGE_LINE_COLOR = "#ff0000";

const BEAT_LANE_COLORS = new Map([
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
  ["g11", "#e04a4a"],
]);

const POPN_LANE_COLORS = new Map([
  ["p0", "#c4c4c4"],
  ["p1", "#fff500"],
  ["p2", "#99ff67"],
  ["p3", "#30b9f9"],
  ["p4", "#ff6c6c"],
  ["p5", "#30b9f9"],
  ["p6", "#99ff67"],
  ["p7", "#fff500"],
  ["p8", "#c4c4c4"],
]);

const KEYBOARD_24_BASE_COLUMNS = [
  { widthType: "scratch", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
];

const KEYBOARD_48_BASE_COLUMNS = [
  ...KEYBOARD_24_BASE_COLUMNS,
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_SECONDARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "note", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
  { widthType: "scratch", backgroundFill: KEYBOARD_LANE_BACKGROUND_PRIMARY },
];

const KEYBOARD_24_LANE_SPECS = [
  { lane: 0, position: 0, widthType: "scratch", note: KEYBOARD_WHEEL_UP_COLOR },
  { lane: 1, position: 0, widthType: "scratch", note: KEYBOARD_WHEEL_DOWN_COLOR },
  { lane: 2, position: 1, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 3, position: 1.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 4, position: 2, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 5, position: 2.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 6, position: 3, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 7, position: 4, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 8, position: 4.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 9, position: 5, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 10, position: 5.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 11, position: 6, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 12, position: 6.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 13, position: 7, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 14, position: 8, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 15, position: 8.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 16, position: 9, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 17, position: 9.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 18, position: 10, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 19, position: 11, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 20, position: 11.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 21, position: 12, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 22, position: 12.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 23, position: 13, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
  { lane: 24, position: 13.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR },
  { lane: 25, position: 14, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR },
];

const KEYBOARD_48_LANE_SPECS = [
  ...KEYBOARD_24_LANE_SPECS.map((spec) => ({ ...spec, side: "p1" })),
  { lane: 26, position: 15, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 27, position: 15.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 28, position: 16, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 29, position: 16.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 30, position: 17, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 31, position: 18, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 32, position: 18.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 33, position: 19, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 34, position: 19.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 35, position: 20, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 36, position: 20.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 37, position: 21, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 38, position: 22, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 39, position: 22.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 40, position: 23, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 41, position: 23.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 42, position: 24, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 43, position: 25, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 44, position: 25.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 45, position: 26, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 46, position: 26.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 47, position: 27, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 48, position: 27.5, widthType: "note", note: KEYBOARD_BLACK_KEY_COLOR, side: "p2" },
  { lane: 49, position: 28, widthType: "note", note: KEYBOARD_WHITE_KEY_COLOR, side: "p2" },
  { lane: 50, position: 29, widthType: "scratch", note: KEYBOARD_WHEEL_UP_COLOR, side: "p2" },
  { lane: 51, position: 29, widthType: "scratch", note: KEYBOARD_WHEEL_DOWN_COLOR, side: "p2" },
];

export const DEFAULT_RENDERER_CONFIG = Object.freeze({
  noteWidth: NOTE_WIDTH,
  scratchWidth: SCRATCH_WIDTH,
  noteHeight: NOTE_HEAD_HEIGHT,
  barLineHeight: BAR_LINE_HEIGHT,
  markerHeight: TEMPO_MARKER_HEIGHT,
  judgeLineHeight: JUDGE_LINE_HEIGHT,
  separatorWidth: SEPARATOR_WIDTH,
});

let currentRendererConfig = DEFAULT_RENDERER_CONFIG;

export function createScoreViewerRenderer(canvas) {
  const context = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let laneLayoutCache = {
    mode: null,
    laneCount: null,
    columnCount: null,
    noteWidth: null,
    scratchWidth: null,
    separatorWidth: null,
    width: 0,
    layout: null,
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
      columnCount: null,
      noteWidth: null,
      scratchWidth: null,
      separatorWidth: null,
      width: 0,
      layout: null,
    };
  }

  function render(
    model,
    selectedTimeSec,
    {
      viewerMode = DEFAULT_VIEWER_MODE,
      pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND,
      pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
      columnCount = 1,
      editorFrameState = null,
      showInvisibleNotes = false,
      judgeLineY = getJudgeLineY(height, DEFAULT_JUDGE_LINE_POSITION_RATIO),
      gameTimingConfig = createDefaultGameTimingConfig(),
      rendererConfig = undefined,
    } = {},
  ) {
    return withRendererConfig(rendererConfig, () => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = BACKGROUND_FILL;
      context.fillRect(0, 0, width, height);

      if (!model) {
        return createEmptyRenderResult();
      }

      const resolvedMode = resolveViewerModeForModel(model, viewerMode);
      const normalizedColumnCount = isGameMode(resolvedMode) ? 1 : normalizeColumnCount(columnCount);
      const laneLayout = getCachedLaneLayout(model.score.mode, model.score.laneCount, normalizedColumnCount);

      if (resolvedMode === "time") {
        return renderTimeMode(model, laneLayout, selectedTimeSec, pixelsPerSecond, showInvisibleNotes, judgeLineY, normalizedColumnCount);
      }
      if (resolvedMode === "game" || resolvedMode === "lunatic") {
        return renderGameMode(model, laneLayout, selectedTimeSec, showInvisibleNotes, judgeLineY, gameTimingConfig);
      }

      return renderEditorMode(
        model,
        laneLayout,
        getExtendedEditorFrameState(
          editorFrameState ?? getEditorFrameState(model, selectedTimeSec, height, pixelsPerBeat, judgeLineY),
          model,
          height,
          pixelsPerBeat,
          normalizedColumnCount,
        ),
        pixelsPerBeat,
        showInvisibleNotes,
        judgeLineY,
        normalizedColumnCount,
      );
    });
  }

  return { resize, render };

  function renderTimeMode(model, laneLayout, selectedTimeSec, pixelsPerSecond, showInvisibleNotes, judgeLineY, columnCount) {
    const { startTimeSec, endTimeSec } = getExtendedVisibleTimeRange(
      model,
      selectedTimeSec,
      height,
      pixelsPerSecond,
      judgeLineY,
      columnCount,
    );

    drawColumnLaneLayouts(context, laneLayout.columns, height);
    drawBarLinesTimeMode(context, model.barLines, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY, columnCount);
    drawMeasureLabelsTimeMode(context, model.barLines, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY, columnCount);
    drawTempoMarkersTimeMode(
      context,
      model.bpmChanges,
      model.stops,
      model.warps ?? [],
      model.scrollChanges,
      laneLayout,
      selectedTimeSec,
      startTimeSec,
      endTimeSec,
      height,
      pixelsPerSecond,
      judgeLineY,
      columnCount,
    );
    drawJudgeLineTimeMode(context, laneLayout.columns[0]?.lanes ?? [], judgeLineY);
    drawLongBodiesTimeMode(context, model, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY, columnCount);
    drawNoteHeadsTimeMode(context, model, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY, columnCount);
    if (showInvisibleNotes) {
      drawInvisibleNoteHeadsTimeMode(context, model, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond, judgeLineY, columnCount);
    }

    return {
      markers: [],
      laneBounds: getLaneBounds(laneLayout),
    };
  }

  function renderEditorMode(model, laneLayout, editorFrameState, pixelsPerBeat, showInvisibleNotes, judgeLineY, columnCount) {
    drawColumnLaneBackgrounds(context, laneLayout.columns, height);
    drawEditorSubGrid(context, model.measureRanges, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount);
    drawColumnLaneForegrounds(context, laneLayout.columns, height);
    drawBarLinesEditorMode(context, model.barLines, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount);
    drawMeasureLabelsEditorMode(context, model.barLines, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount);
    drawTempoMarkersEditorMode(
      context,
      model,
      laneLayout,
      editorFrameState,
      pixelsPerBeat,
      judgeLineY,
      columnCount,
    );
    drawJudgeLineEditorMode(context, laneLayout.columns[0]?.lanes ?? [], judgeLineY);
    drawLongBodiesEditorMode(context, model, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount);
    drawNoteHeadsEditorMode(context, model, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount);
    if (showInvisibleNotes) {
      drawInvisibleNoteHeadsEditorMode(context, model, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount);
    }

    return {
      markers: [],
      laneBounds: getLaneBounds(laneLayout),
    };
  }

  function renderGameMode(model, laneLayout, selectedTimeSec, showInvisibleNotes, judgeLineY, gameTimingConfig) {
    const { lanes } = laneLayout;
    const normalizedGameTimingConfig = normalizeGameTimingConfig(gameTimingConfig);
    const laneGeometry = getGameLaneGeometry(
      height,
      getJudgeLineRatioFromGeometry(height, judgeLineY),
      normalizedGameTimingConfig.laneHeightPx,
    );
    const projection = collectGameProjection(model, selectedTimeSec, height, {
      gameTimingConfig: normalizedGameTimingConfig,
      laneGeometry,
    });

    drawLaneBackgrounds(context, lanes, height, laneGeometry.laneTopY, laneGeometry.laneBottomY);
    drawDpGutter(context, laneLayout, height, laneGeometry.laneTopY, laneGeometry.laneBottomY);
    drawLaneSeparators(context, lanes, height, laneGeometry.laneTopY, laneGeometry.laneBottomY);
    clipToGameRenderWindow(context, projection, width, () => {
      drawBarLinesGameMode(context, lanes, projection);
      drawMeasureLabelsGameMode(context, model.barLines, lanes, projection);
      drawTempoMarkersGameMode(context, lanes, projection);
      drawJudgeLineGameMode(context, lanes, projection);
      drawLongBodiesGameMode(context, model, lanes, projection);
      drawNoteHeadsGameMode(context, model, lanes, projection, showInvisibleNotes);
    });
    drawLaneCoverGameMode(context, laneLayout, projection);

    return {
      markers: [],
      laneBounds: getLaneBounds(laneLayout),
    };
  }

  function getCachedLaneLayout(mode, laneCount, columnCount = 1) {
    if (
      laneLayoutCache.mode === mode
      && laneLayoutCache.laneCount === laneCount
      && laneLayoutCache.columnCount === columnCount
      && laneLayoutCache.noteWidth === currentRendererConfig.noteWidth
      && laneLayoutCache.scratchWidth === currentRendererConfig.scratchWidth
      && laneLayoutCache.separatorWidth === currentRendererConfig.separatorWidth
      && laneLayoutCache.width === width
      && laneLayoutCache.layout
    ) {
      return laneLayoutCache.layout;
    }
    const layout = createLaneLayout(mode, laneCount, width, columnCount);
    laneLayoutCache = {
      mode,
      laneCount,
      columnCount,
      noteWidth: currentRendererConfig.noteWidth,
      scratchWidth: currentRendererConfig.scratchWidth,
      separatorWidth: currentRendererConfig.separatorWidth,
      width,
      layout,
    };
    return layout;
  }
}

export function estimateViewerWidth(mode, laneCount, rendererConfig = undefined, columnCount = 1) {
  return withRendererConfig(rendererConfig, () => {
    const layout = getModeLayout(mode, laneCount);
    const gutterWidth = layout.splitAfter === null ? 0 : getDpGutterWidth();
    const contentWidth = getDisplayLaneAreaWidth(layout.display) + gutterWidth;
    return Math.ceil(contentWidth + JUDGE_LINE_SIDE_OVERHANG * 2) * normalizeColumnCount(columnCount);
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

export function normalizeRendererConfig(rendererConfig = {}) {
  return {
    noteWidth: normalizeRendererDimension(rendererConfig?.noteWidth, NOTE_WIDTH),
    scratchWidth: normalizeRendererDimension(rendererConfig?.scratchWidth, SCRATCH_WIDTH),
    noteHeight: normalizeRendererDimension(rendererConfig?.noteHeight, NOTE_HEAD_HEIGHT),
    barLineHeight: normalizeRendererDimension(rendererConfig?.barLineHeight, BAR_LINE_HEIGHT),
    markerHeight: normalizeRendererDimension(rendererConfig?.markerHeight, TEMPO_MARKER_HEIGHT),
    judgeLineHeight: normalizeRendererDimension(rendererConfig?.judgeLineHeight, JUDGE_LINE_HEIGHT),
    separatorWidth: normalizeRendererDimension(rendererConfig?.separatorWidth, SEPARATOR_WIDTH),
  };
}

export function areRendererConfigsEqual(left, right) {
  const normalizedLeft = normalizeRendererConfig(left);
  const normalizedRight = normalizeRendererConfig(right);
  return normalizedLeft.noteWidth === normalizedRight.noteWidth
    && normalizedLeft.scratchWidth === normalizedRight.scratchWidth
    && normalizedLeft.noteHeight === normalizedRight.noteHeight
    && normalizedLeft.barLineHeight === normalizedRight.barLineHeight
    && normalizedLeft.markerHeight === normalizedRight.markerHeight
    && normalizedLeft.judgeLineHeight === normalizedRight.judgeLineHeight
    && normalizedLeft.separatorWidth === normalizedRight.separatorWidth;
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

function getJudgeLineHeight() {
  return currentRendererConfig.judgeLineHeight;
}

function getLaneNoteWidth(isScratch = false) {
  return isScratch ? getScratchWidth() : getNoteWidth();
}

function getLaneSlotWidth(isScratch = false) {
  return getLaneNoteWidth(isScratch) + getSeparatorWidth();
}

function getDisplaySeparatorCount(displayLaneCount) {
  return displayLaneCount > 0 ? displayLaneCount + 1 : 0;
}

function getDisplayLaneAreaWidth(displaySlots) {
  return displaySlots.reduce(
    (totalWidth, slot) => totalWidth + getLaneSlotWidth(Boolean(slot?.isScratch)),
    getSeparatorWidth(),
  );
}

function getDpGutterWidth() {
  return getNoteWidth() * DP_GUTTER_UNITS;
}

function getLaneContentLeftX(lane) {
  if (Number.isFinite(lane?.contentLeftX)) {
    return lane.contentLeftX;
  }
  return lane.x + getSeparatorWidth();
}

function getLaneContentWidth(lane) {
  if (Number.isFinite(lane?.contentWidth)) {
    return Math.max(lane.contentWidth, 0);
  }
  return Math.max(lane.width - getSeparatorWidth(), 0);
}

function getLaneRightEdgeWithSeparator(lane) {
  return lane.x + lane.width + getSeparatorWidth();
}

function getSeparatorStrokeCenterX(boundaryX) {
  return boundaryX + getSeparatorWidth() / 2;
}

function getExtendedVisibleTimeRange(model, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY, columnCount = 1) {
  const baseRange = getVisibleTimeRange(
    model,
    selectedTimeSec,
    viewportHeight,
    pixelsPerSecond,
    judgeLineY,
  );
  return {
    startTimeSec: baseRange.startTimeSec,
    endTimeSec: Math.min(
      model?.score?.totalDurationSec ?? baseRange.endTimeSec,
      baseRange.endTimeSec + Math.max(normalizeColumnCount(columnCount) - 1, 0) * Math.max(viewportHeight, 0) / Math.max(pixelsPerSecond, 1),
    ),
  };
}

function getExtendedEditorFrameState(frameState, model, viewportHeight, pixelsPerBeat, columnCount = 1) {
  if (!frameState) {
    return frameState;
  }
  return {
    ...frameState,
    endBeat: Math.min(
      model?.totalBeat ?? frameState.endBeat,
      frameState.endBeat + Math.max(normalizeColumnCount(columnCount) - 1, 0) * Math.max(viewportHeight, 0) / Math.max(pixelsPerBeat, 1),
    ),
  };
}

function drawColumnLaneLayouts(context, columns, viewportHeight, topY = 0, bottomY = viewportHeight) {
  drawColumnLaneBackgrounds(context, columns, viewportHeight, topY, bottomY);
  drawColumnLaneForegrounds(context, columns, viewportHeight, topY, bottomY);
}

function drawColumnLaneBackgrounds(context, columns, viewportHeight, topY = 0, bottomY = viewportHeight) {
  for (const column of columns ?? []) {
    drawLaneBackgrounds(context, column.lanes, viewportHeight, topY, bottomY);
  }
}

function drawColumnLaneForegrounds(context, columns, viewportHeight, topY = 0, bottomY = viewportHeight) {
  for (const column of columns ?? []) {
    drawDpGutter(context, column, viewportHeight, topY, bottomY);
    drawLaneSeparators(context, column.lanes, viewportHeight, topY, bottomY);
  }
}

function getWrappedColumnPlacement(rawY, viewportHeight, columnCount = 1) {
  const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
  if (!(normalizedViewportHeight > 0)) {
    return null;
  }
  const normalizedColumnCount = normalizeColumnCount(columnCount);
  if (normalizedColumnCount <= 1) {
    return {
      columnIndex: 0,
      y: rawY,
    };
  }
  if (rawY > normalizedViewportHeight) {
    return null;
  }
  const columnIndex = rawY >= 0 ? 0 : Math.floor((-rawY - 1e-9) / normalizedViewportHeight) + 1;
  if (columnIndex < 0 || columnIndex >= normalizedColumnCount) {
    return null;
  }
  return {
    columnIndex,
    y: rawY + columnIndex * normalizedViewportHeight,
  };
}

function getWrappedLongBodySegments(rawStartY, rawEndY, viewportHeight, columnCount = 1) {
  const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
  if (!(normalizedViewportHeight > 0)) {
    return [];
  }
  const rawTop = Math.min(rawStartY, rawEndY);
  const rawBottom = Math.max(rawStartY, rawEndY);
  const segments = [];
  for (let columnIndex = 0; columnIndex < normalizeColumnCount(columnCount); columnIndex += 1) {
    const rawWindowTop = -columnIndex * normalizedViewportHeight;
    const rawWindowBottom = rawWindowTop + normalizedViewportHeight;
    const segmentTop = Math.max(rawTop, rawWindowTop);
    const segmentBottom = Math.min(rawBottom, rawWindowBottom);
    if (!(segmentBottom > segmentTop)) {
      continue;
    }
    segments.push({
      columnIndex,
      topY: segmentTop + columnIndex * normalizedViewportHeight,
      bottomY: segmentBottom + columnIndex * normalizedViewportHeight,
    });
  }
  return segments;
}

function drawBarLinesTimeMode(context, barLines, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY, columnCount) {
  context.save();
  context.strokeStyle = BAR_LINE;
  context.lineWidth = getBarLineHeight();
  for (const barLine of barLines) {
    if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
      continue;
    }
    const placement = getWrappedColumnPlacement(
      timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
      viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane || !rightLane) {
      continue;
    }
    const y = Math.round(placement.y) - context.lineWidth / 2;
    context.beginPath();
    context.moveTo(leftLane.x, y);
    context.lineTo(getLaneRightEdgeWithSeparator(rightLane), y);
    context.stroke();
  }
  context.restore();
}

function drawMeasureLabelsTimeMode(context, barLines, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY, columnCount) {
  const candidates = [];
  for (const [index, barLine] of barLines.entries()) {
    if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
      continue;
    }
    const placement = getWrappedColumnPlacement(
      timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
      viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane) {
      continue;
    }
    candidates.push({
      label: formatMeasureLabel(index),
      x: leftLane.x - TEMPO_LABEL_GAP,
      y: placement.y,
    });
  }
  drawMeasureLabels(context, candidates);
}

function drawJudgeLineTimeMode(context, lanes, judgeLineY) {
  drawJudgeLineAcrossLanes(context, lanes, judgeLineY);
}

function drawTempoMarkersTimeMode(
  context,
  bpmChanges,
  stops,
  warps,
  scrollChanges,
  laneLayout,
  selectedTimeSec,
  startTimeSec,
  endTimeSec,
  viewportHeight,
  pixelsPerSecond,
  judgeLineY,
  columnCount,
) {
  const bpmCandidates = [];
  const stopCandidates = [];
  const scrollCandidates = [];
  context.save();
  for (const bpmChange of bpmChanges) {
    if (bpmChange.timeSec < startTimeSec || bpmChange.timeSec > endTimeSec) {
      continue;
    }
    const placement = getWrappedColumnPlacement(
      timeToViewportY(bpmChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
      viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { rightLane } = getVisualLaneEdges(lanes);
    if (!placement || !rightLane) {
      continue;
    }
    const markerRect = getTempoMarkerRect(rightLane, "right");
    context.fillStyle = BPM_MARKER;
    context.fillRect(markerRect.x, Math.round(placement.y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
    bpmCandidates.push({
      type: "bpm",
      timeSec: bpmChange.timeSec,
      y: placement.y,
      label: formatBpmMarkerLabel(bpmChange.bpm),
      side: "right",
      color: BPM_MARKER,
      x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP,
    });
  }

  for (const stop of stops) {
    if (stop.timeSec < startTimeSec || stop.timeSec > endTimeSec) {
      continue;
    }
    const placement = getWrappedColumnPlacement(
      timeToViewportY(stop.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
      viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane) {
      continue;
    }
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillStyle = STOP_MARKER;
    context.fillRect(markerRect.x, Math.round(placement.y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
    stopCandidates.push({
      type: "stop",
      timeSec: stop.timeSec,
      y: placement.y,
      label: formatStopMarkerLabel(stop.durationSec),
      side: "left",
      color: STOP_MARKER,
      x: leftLane.x - TEMPO_LABEL_GAP,
    });
  }

  for (const warp of warps) {
    if (warp.timeSec < startTimeSec || warp.timeSec > endTimeSec) {
      continue;
    }
    const placement = getWrappedColumnPlacement(
      timeToViewportY(warp.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
      viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane) {
      continue;
    }
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillStyle = STOP_MARKER;
    context.fillRect(markerRect.x, Math.round(placement.y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
    stopCandidates.push({
      type: "warp",
      timeSec: warp.timeSec,
      y: placement.y,
      label: formatWarpMarkerLabel(),
      side: "left",
      color: STOP_MARKER,
      x: leftLane.x - TEMPO_LABEL_GAP,
    });
  }

  for (const scrollChange of scrollChanges) {
    if (scrollChange.timeSec < startTimeSec || scrollChange.timeSec > endTimeSec) {
      continue;
    }
    const placement = getWrappedColumnPlacement(
      timeToViewportY(scrollChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
      viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane) {
      continue;
    }
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillStyle = SCROLL_MARKER;
    context.fillRect(markerRect.x, Math.round(placement.y - getTempoMarkerHeight()), markerRect.width, getTempoMarkerHeight());
    scrollCandidates.push({
      type: "scroll",
      timeSec: scrollChange.timeSec,
      y: placement.y,
      label: formatScrollMarkerLabel(scrollChange.rate),
      side: "left",
      color: SCROLL_MARKER,
      x: leftLane.x - TEMPO_LABEL_GAP,
    });
  }
  context.restore();
  drawSpacedTempoMarkerLabels(context, bpmCandidates);
  drawSpacedTempoMarkerLabels(context, stopCandidates);
  drawSpacedTempoMarkerLabels(context, scrollCandidates);
}

function drawLongBodiesTimeMode(context, model, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY, columnCount) {
  context.save();
  for (const note of model.notes) {
    if (note.kind !== "long" || !Number.isFinite(note.endTimeSec)) {
      continue;
    }
    if (note.endTimeSec < startTimeSec || note.timeSec > endTimeSec) {
      continue;
    }
    const startY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
    const endY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY);
    for (const segment of getWrappedLongBodySegments(startY, endY, viewportHeight, columnCount)) {
      const lane = laneLayout.columns[segment.columnIndex]?.lanes[note.lane];
      if (!lane) {
        continue;
      }
      context.fillStyle = dimColor(lane.note, 0.42);
      const contentWidth = getLaneContentWidth(lane);
      if (!(contentWidth > 0)) {
        continue;
      }
      context.fillRect(
        getLaneContentLeftX(lane),
        segment.topY,
        contentWidth,
        Math.max(segment.bottomY - segment.topY, 2),
      );
    }
  }
  context.restore();
}

function drawJudgeLineEditorMode(context, lanes, judgeLineY) {
  drawJudgeLineAcrossLanes(context, lanes, judgeLineY);
}

function drawNoteHeadsTimeMode(context, model, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY, columnCount) {
  context.save();
  for (const note of model.notes) {
    const noteEndTimeSec = note.endTimeSec ?? note.timeSec;
    if (noteEndTimeSec < startTimeSec || note.timeSec > endTimeSec) {
      continue;
    }
    const headPlacement = getWrappedColumnPlacement(
      timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
      viewportHeight,
      columnCount,
    );
    const headLane = laneLayout.columns[headPlacement?.columnIndex]?.lanes[note.lane];
    if (!headPlacement || !headLane || note.kind === "invisible") {
      continue;
    }
    drawRectNote(context, headLane, headPlacement.y, note.kind === "mine" ? MINE_COLOR : headLane.note);

    if (note.kind === "long" && Number.isFinite(note.endTimeSec) && shouldDrawLongEndCap(model, note)) {
      const endPlacement = getWrappedColumnPlacement(
        timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
        viewportHeight,
        columnCount,
      );
      const endLane = laneLayout.columns[endPlacement?.columnIndex]?.lanes[note.lane];
      if (!endPlacement || !endLane) {
        continue;
      }
      drawRectNote(context, endLane, endPlacement.y, endLane.note);
    }
  }
  context.restore();
}

function drawInvisibleNoteHeadsTimeMode(context, model, laneLayout, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond, judgeLineY, columnCount) {
  context.save();
  context.strokeStyle = INVISIBLE_NOTE_COLOR;
  context.lineWidth = 1;
  for (const note of model.invisibleNotes ?? []) {
    if (note.timeSec < startTimeSec || note.timeSec > endTimeSec) {
      continue;
    }
    const placement = getWrappedColumnPlacement(
      timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond, judgeLineY),
      viewportHeight,
      columnCount,
    );
    const lane = laneLayout.columns[placement?.columnIndex]?.lanes[note.lane];
    if (!placement || !lane) {
      continue;
    }
    drawOutlinedRectNote(context, lane, placement.y, INVISIBLE_NOTE_COLOR);
  }
  context.restore();
}

export function collectGameProjection(
  model,
  selectedTimeSec,
  viewportHeight,
  options = {},
  legacyJudgeLineY = undefined,
) {
  const normalizedOptions = normalizeGameProjectionOptions(viewportHeight, options, legacyJudgeLineY);
  const normalizedGameTimingConfig = normalizedOptions.gameTimingConfig;
  const resolvedLaneGeometry = normalizedOptions.laneGeometry;
  const derivedMetrics = getGameTimingDerivedMetrics(
    model,
    normalizedGameTimingConfig,
    { includeGreenNumberRange: normalizedGameTimingConfig.laneCoverVisible },
  );
  const currentTimingState = getGameTimingStateAtTimeSec(model, selectedTimeSec);
  const laneCoverBounds = getGameLaneCoverBounds(
    viewportHeight,
    getJudgeLineRatioFromGeometry(
      viewportHeight,
      resolvedLaneGeometry.judgeLineY,
    ),
    normalizedGameTimingConfig.laneHeightPx,
    normalizedGameTimingConfig.laneCoverPermille,
  );
  const currentGreenNumber = normalizedGameTimingConfig.laneCoverVisible
    ? Math.round(getGameCurrentDurationForTimingState(currentTimingState, derivedMetrics) * GAME_GREEN_NUMBER_RATIO)
    : null;
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
    greenNumberRange: normalizedGameTimingConfig.laneCoverVisible
      ? derivedMetrics.greenNumberRange
      : null,
    hsFixBaseBpm: derivedMetrics.hsFixBaseBpm,
    hispeed: derivedMetrics.hispeed,
    gameTimingConfig: normalizedGameTimingConfig,
    scanMargin: getNoteHeadHeight() + 24,
    points: [],
    pointYByIndex: new Map(),
    exitPoint: null,
  };
  if (!model?.gameTimeline?.length) {
    return projection;
  }
  projection.lunaticReverseMeta = getActiveLunaticReverseMeta(model, selectedTimeSec);

  if (projection.lunaticReverseMeta) {
    collectLunaticReverseProjection(model, projection);
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
        pixelsPerSection,
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

function collectLunaticReverseProjection(model, projection) {
  const timeline = model?.gameTimeline ?? [];
  const reverseMeta = projection.lunaticReverseMeta;
  if (!reverseMeta || timeline.length === 0) {
    return;
  }

  const pixelsPerSection = projection.judgeDistancePx * projection.hispeed;
  const reverseOffsetSections = Math.max(projection.selectedTrackPosition - reverseMeta.startTrackPosition, 0);
  const startIndex = Math.min(Math.max(reverseMeta.firstFutureTimelineIndex ?? timeline.length, 0), timeline.length);

  for (let index = startIndex; index < timeline.length; index += 1) {
    const point = timeline[index];
    const pointSections = finiteOrZero(point?.trackPosition) / 4;
    const y = projection.judgeLineY - ((pointSections - reverseMeta.startTrackPosition) + reverseOffsetSections) * pixelsPerSection;

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
}

function getInitialGameProjectionDeltaY(point, selectedTimeSec, pixelsPerSection) {
  const pointTimeSec = finiteOrZero(point?.timeSec);
  if (!(pointTimeSec > 0)) {
    return 0;
  }
  const remainingRatio = clamp(
    (pointTimeSec - selectedTimeSec) / pointTimeSec,
    0,
    1,
  );
  return (finiteOrZero(point?.beat) / 4) * remainingRatio * pixelsPerSection;
}

function getGameProjectionDeltaY(previousPoint, point, selectedTimeSec, pixelsPerSection) {
  const deltaSection = (finiteOrZero(point?.beat) - finiteOrZero(previousPoint?.beat)) / 4;
  if (Math.abs(deltaSection) < 1e-9) {
    return 0;
  }
  const scrollRate = getGameProjectionScrollRate(previousPoint);
  if (finiteOrZero(previousPoint?.timeSec) + finiteOrZero(previousPoint?.stopDurationSec) > selectedTimeSec) {
    return deltaSection * scrollRate * pixelsPerSection;
  }
  const traversableDurationSec = finiteOrZero(point?.timeSec)
    - finiteOrZero(previousPoint?.timeSec)
    - finiteOrZero(previousPoint?.stopDurationSec);
  if (!(traversableDurationSec > 0)) {
    return selectedTimeSec < finiteOrZero(point?.timeSec)
      ? deltaSection * scrollRate * pixelsPerSection
      : 0;
  }
  const remainingRatio = clamp(
    (finiteOrZero(point?.timeSec) - selectedTimeSec) / traversableDurationSec,
    0,
    1,
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
        y: projectedPoint.y,
      });
    }
  }
  drawMeasureLabels(context, candidates);
}

function drawLongBodiesGameMode(context, model, lanes, projection) {
  context.save();
  for (const note of model.notes) {
    if (!shouldDrawGameLongBody(note, projection)) {
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
    const topY = clamp(Math.min(startY, endY), projection.renderTopY, projection.renderBottomY);
    const bottomY = clamp(Math.max(startY, endY), projection.renderTopY, projection.renderBottomY);
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

function drawNoteHeadsGameMode(context, model, lanes, projection, showInvisibleNotes = false) {
  context.save();
  if (showInvisibleNotes) {
    context.strokeStyle = INVISIBLE_NOTE_COLOR;
    context.lineWidth = 1;
  }
  const renderedPointIndexSet = createRenderedGameProjectionPointIndexSet(projection);
  const heldLongStartHeadEvents = collectHeldLongStartHeadEvents(model, projection, renderedPointIndexSet);
  let heldHeadEventIndex = 0;
  for (const projectedPoint of projection.points) {
    while (heldHeadEventIndex < heldLongStartHeadEvents.length && heldLongStartHeadEvents[heldHeadEventIndex].index < projectedPoint.index) {
      drawHeldLongStartHead(context, lanes, projection, heldLongStartHeadEvents[heldHeadEventIndex].note);
      heldHeadEventIndex += 1;
    }

    const shouldRenderProjectedPoint = isGameProjectionYWithinRenderBounds(projectedPoint.y, projection);
    if (shouldRenderProjectedPoint) {
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

    while (heldHeadEventIndex < heldLongStartHeadEvents.length && heldLongStartHeadEvents[heldHeadEventIndex].index === projectedPoint.index) {
      drawHeldLongStartHead(context, lanes, projection, heldLongStartHeadEvents[heldHeadEventIndex].note);
      heldHeadEventIndex += 1;
    }

    if (!shouldRenderProjectedPoint || !showInvisibleNotes) {
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
  while (heldHeadEventIndex < heldLongStartHeadEvents.length) {
    drawHeldLongStartHead(context, lanes, projection, heldLongStartHeadEvents[heldHeadEventIndex].note);
    heldHeadEventIndex += 1;
  }
  context.restore();
}

function createRenderedGameProjectionPointIndexSet(projection) {
  const renderedPointIndexSet = new Set();
  for (const projectedPoint of projection?.points ?? []) {
    if (!isGameProjectionYWithinRenderBounds(projectedPoint.y, projection)) {
      continue;
    }
    renderedPointIndexSet.add(projectedPoint.index);
  }
  return renderedPointIndexSet;
}

function collectHeldLongStartHeadEvents(model, projection, renderedPointIndexSet) {
  return (model?.notes ?? [])
    .filter((note) => shouldDrawHeldLongStartHead(note, projection, renderedPointIndexSet))
    .map((note) => ({
      index: Number.isInteger(note?.gameTimelineIndex) ? note.gameTimelineIndex : Number.POSITIVE_INFINITY,
      note,
    }))
    .sort(compareHeldLongStartHeadEvent);
}

function compareHeldLongStartHeadEvent(left, right) {
  if (left.index !== right.index) {
    return left.index - right.index;
  }
  const leftBeat = Number.isFinite(left?.note?.beat) ? left.note.beat : 0;
  const rightBeat = Number.isFinite(right?.note?.beat) ? right.note.beat : 0;
  if (leftBeat !== rightBeat) {
    return leftBeat - rightBeat;
  }
  const leftTimeSec = Number.isFinite(left?.note?.timeSec) ? left.note.timeSec : 0;
  const rightTimeSec = Number.isFinite(right?.note?.timeSec) ? right.note.timeSec : 0;
  if (leftTimeSec !== rightTimeSec) {
    return leftTimeSec - rightTimeSec;
  }
  return (left?.note?.lane ?? 0) - (right?.note?.lane ?? 0);
}

function drawHeldLongStartHead(context, lanes, projection, note) {
  if (!note) {
    return;
  }
  const lane = lanes[note.lane];
  if (!lane) {
    return;
  }
  const headY = getHeldLongStartHeadY(note, projection);
  if (!isGameProjectionYWithinRenderBounds(headY, projection)) {
    return;
  }
  drawRectNote(context, lane, headY, lane.note);
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

function drawJudgeLineGameMode(context, lanes, projection) {
  drawJudgeLineAcrossLanes(context, lanes, projection.judgeLineY, {
    topY: projection.renderTopY,
    bottomY: projection.renderBottomY,
  });
}

function drawJudgeLineAcrossLanes(context, lanes, judgeLineY, viewportBounds = null) {
  const { leftLane, rightLane } = getVisualLaneEdges(lanes);
  const judgeLineHeight = getJudgeLineHeight();
  if (!leftLane || !rightLane || !(judgeLineHeight > 0)) {
    return;
  }
  const bottomY = Math.round(judgeLineY);
  const topY = bottomY - judgeLineHeight;
  const clippedTopY = Math.max(topY, viewportBounds?.topY ?? Number.NEGATIVE_INFINITY);
  const clippedBottomY = Math.min(bottomY, viewportBounds?.bottomY ?? Number.POSITIVE_INFINITY);
  const clippedHeight = Math.max(clippedBottomY - clippedTopY, 0);
  if (!(clippedHeight > 0)) {
    return;
  }
  context.save();
  context.fillStyle = JUDGE_LINE_COLOR;
  context.fillRect(
    leftLane.x,
    clippedTopY,
    getLaneRightEdgeWithSeparator(rightLane) - leftLane.x,
    clippedHeight,
  );
  context.restore();
}

function getProjectedGameLongBodyStartY(note, projection) {
  const projectedStartY = projection.pointYByIndex.get(note.gameTimelineIndex);
  if (Number.isFinite(projectedStartY)) {
    return projectedStartY;
  }
  if (isLunaticReverseHeldLongStart(note, projection)) {
    return getLunaticReverseHeldLongStartY(projection);
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
    return clamp(projection.exitPoint.y, projection.renderTopY, projection.renderBottomY);
  }
  return null;
}

function shouldDrawHeldLongStartHead(note, projection, renderedPointIndexSet = null) {
  if (note?.kind !== "long" || !Number.isFinite(note?.timeSec) || !Number.isFinite(note?.endTimeSec)) {
    return false;
  }
  if (!isActiveHeldLongStart(note, projection)) {
    return false;
  }
  const effectiveRenderedPointIndexSet = renderedPointIndexSet ?? createRenderedGameProjectionPointIndexSet(projection);
  return !isGameTimelinePointRendered(note?.gameTimelineIndex, effectiveRenderedPointIndexSet);
}

function shouldDrawGameLongBody(note, projection) {
  if (note?.kind !== "long" || !Number.isFinite(note?.endTimeSec)) {
    return false;
  }
  if (projection?.lunaticReverseMeta && Number.isFinite(note?.endBeat) && note.endBeat > projection.lunaticReverseMeta.startBeat) {
    return true;
  }
  return note.endTimeSec > projection.selectedTimeSec;
}

function getHeldLongStartHeadY(note, projection) {
  if (isLunaticReverseHeldLongStart(note, projection)) {
    return getLunaticReverseHeldLongStartY(projection);
  }
  return projection.judgeLineY;
}

function isActiveHeldLongStart(note, projection) {
  if (isLunaticReverseHeldLongStart(note, projection)) {
    return true;
  }
  return note.timeSec < projection.selectedTimeSec && projection.selectedTimeSec < note.endTimeSec;
}

function isGameTimelinePointRendered(pointIndex, renderedPointIndexSet) {
  return Number.isInteger(pointIndex) && renderedPointIndexSet?.has(pointIndex) === true;
}

function isLunaticReverseHeldLongStart(note, projection) {
  const reverseMeta = projection?.lunaticReverseMeta;
  if (!reverseMeta || note?.kind !== "long") {
    return false;
  }
  if (!(projection.selectedTimeSec >= reverseMeta.startTimeSec)) {
    return false;
  }
  if (!Number.isFinite(note?.beat) || !Number.isFinite(note?.endBeat)) {
    return false;
  }
  return note.beat < reverseMeta.startBeat && note.endBeat > reverseMeta.startBeat;
}

function getLunaticReverseHeldLongStartY(projection) {
  const reverseMeta = projection?.lunaticReverseMeta;
  if (!reverseMeta) {
    return projection?.judgeLineY ?? 0;
  }
  return projection.judgeLineY
    - Math.max(projection.selectedTrackPosition - reverseMeta.startTrackPosition, 0)
      * projection.judgeDistancePx
      * projection.hispeed;
}

function getActiveLunaticReverseMeta(model, selectedTimeSec) {
  const reverseMeta = model?.lunaticReverseMeta;
  if (!reverseMeta) {
    return null;
  }
  return selectedTimeSec >= reverseMeta.startTimeSec ? reverseMeta : null;
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
    coverLeftX + (coverWidth / 2),
    rangeTextY,
  );
  context.fillStyle = "#00FF00";
  context.fillText(
    String(projection.currentGreenNumber),
    coverLeftX + (coverWidth / 2),
    currentGreenTextY,
  );
  context.restore();
}

function drawEditorSubGrid(context, measureRanges, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount) {
  if (!Array.isArray(measureRanges) || measureRanges.length === 0) {
    return;
  }
  const visibleGridLines = collectVisibleEditorGridLines(
    measureRanges,
    editorFrameState.startBeat,
    editorFrameState.endBeat,
  );

  if (visibleGridLines.sixteenthBeats.length === 0 && visibleGridLines.beatBeats.length === 0) {
    return;
  }

  context.save();
  context.lineWidth = getBarLineHeight();
  context.strokeStyle = EDITOR_SIXTEENTH_GRID_LINE;
  for (const beat of visibleGridLines.sixteenthBeats) {
    const placement = getWrappedColumnPlacement(
      beatToViewportY(beat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane || !rightLane) {
      continue;
    }
    const y = Math.round(placement.y) - context.lineWidth / 2;
    context.beginPath();
    context.moveTo(leftLane.x, y);
    context.lineTo(getLaneRightEdgeWithSeparator(rightLane), y);
    context.stroke();
  }
  context.strokeStyle = EDITOR_BEAT_GRID_LINE;
  for (const beat of visibleGridLines.beatBeats) {
    const placement = getWrappedColumnPlacement(
      beatToViewportY(beat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane || !rightLane) {
      continue;
    }
    const y = Math.round(placement.y) - context.lineWidth / 2;
    context.beginPath();
    context.moveTo(leftLane.x, y);
    context.lineTo(getLaneRightEdgeWithSeparator(rightLane), y);
    context.stroke();
  }
  context.restore();
}

function drawBarLinesEditorMode(context, barLines, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount) {
  const visibleWindow = getBeatWindowIndices(barLines, editorFrameState.startBeat, editorFrameState.endBeat);
  context.save();
  context.strokeStyle = BAR_LINE;
  context.lineWidth = getBarLineHeight();
  for (let index = visibleWindow.startIndex; index < visibleWindow.endIndex; index += 1) {
    const barLine = barLines[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(barLine.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane, rightLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane || !rightLane) {
      continue;
    }
    const y = Math.round(placement.y) - context.lineWidth / 2;
    context.beginPath();
    context.moveTo(leftLane.x, y);
    context.lineTo(getLaneRightEdgeWithSeparator(rightLane), y);
    context.stroke();
  }
  context.restore();
}

function drawMeasureLabelsEditorMode(context, barLines, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount) {
  const visibleWindow = getBeatWindowIndices(barLines, editorFrameState.startBeat, editorFrameState.endBeat);
  const candidates = [];
  for (let index = visibleWindow.startIndex; index < visibleWindow.endIndex; index += 1) {
    const barLine = barLines[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(barLine.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane) {
      continue;
    }
    candidates.push({
      label: formatMeasureLabel(index),
      x: leftLane.x - TEMPO_LABEL_GAP,
      y: placement.y,
    });
  }
  drawMeasureLabels(context, candidates);
}

function drawTempoMarkersEditorMode(context, model, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount) {
  const bpmCandidates = [];
  const stopCandidates = [];
  const scrollCandidates = [];
  const bpmWindow = getBeatWindowIndices(model.bpmChanges, editorFrameState.startBeat, editorFrameState.endBeat);
  const stopWindow = getBeatWindowIndices(model.stops, editorFrameState.startBeat, editorFrameState.endBeat);
  const warpWindow = getBeatWindowIndices(model.warps ?? [], editorFrameState.startBeat, editorFrameState.endBeat);
  const scrollWindow = getBeatWindowIndices(model.scrollChanges, editorFrameState.startBeat, editorFrameState.endBeat);

  context.save();
  for (let index = bpmWindow.startIndex; index < bpmWindow.endIndex; index += 1) {
    const bpmChange = model.bpmChanges[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(bpmChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { rightLane } = getVisualLaneEdges(lanes);
    if (!placement || !rightLane) {
      continue;
    }
    const markerRect = getTempoMarkerRect(rightLane, "right");
    context.fillStyle = BPM_MARKER;
    context.fillRect(
      markerRect.x,
      Math.round(placement.y - getTempoMarkerHeight()),
      markerRect.width,
      getTempoMarkerHeight(),
    );
    bpmCandidates.push({
      type: "bpm",
      timeSec: bpmChange.timeSec,
      y: placement.y,
      label: formatBpmMarkerLabel(bpmChange.bpm),
      side: "right",
      color: BPM_MARKER,
      x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP,
    });
  }

  for (let index = stopWindow.startIndex; index < stopWindow.endIndex; index += 1) {
    const stop = model.stops[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(stop.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane) {
      continue;
    }
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillStyle = STOP_MARKER;
    context.fillRect(
      markerRect.x,
      Math.round(placement.y - getTempoMarkerHeight()),
      markerRect.width,
      getTempoMarkerHeight(),
    );
    stopCandidates.push({
      type: "stop",
      timeSec: stop.timeSec,
      y: placement.y,
      label: formatStopMarkerLabel(stop.durationSec),
      side: "left",
      color: STOP_MARKER,
      x: leftLane.x - TEMPO_LABEL_GAP,
    });
  }

  for (let index = warpWindow.startIndex; index < warpWindow.endIndex; index += 1) {
    const warp = model.warps[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(warp.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane) {
      continue;
    }
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillStyle = STOP_MARKER;
    context.fillRect(
      markerRect.x,
      Math.round(placement.y - getTempoMarkerHeight()),
      markerRect.width,
      getTempoMarkerHeight(),
    );
    stopCandidates.push({
      type: "warp",
      timeSec: warp.timeSec,
      y: placement.y,
      label: formatWarpMarkerLabel(),
      side: "left",
      color: STOP_MARKER,
      x: leftLane.x - TEMPO_LABEL_GAP,
    });
  }

  for (let index = scrollWindow.startIndex; index < scrollWindow.endIndex; index += 1) {
    const scrollChange = model.scrollChanges[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(scrollChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lanes = laneLayout.columns[placement?.columnIndex]?.lanes ?? [];
    const { leftLane } = getVisualLaneEdges(lanes);
    if (!placement || !leftLane) {
      continue;
    }
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillStyle = SCROLL_MARKER;
    context.fillRect(
      markerRect.x,
      Math.round(placement.y - getTempoMarkerHeight()),
      markerRect.width,
      getTempoMarkerHeight(),
    );
    scrollCandidates.push({
      type: "scroll",
      timeSec: scrollChange.timeSec,
      y: placement.y,
      label: formatScrollMarkerLabel(scrollChange.rate),
      side: "left",
      color: SCROLL_MARKER,
      x: leftLane.x - TEMPO_LABEL_GAP,
    });
  }
  context.restore();
  drawSpacedTempoMarkerLabels(context, bpmCandidates);
  drawSpacedTempoMarkerLabels(context, stopCandidates);
  drawSpacedTempoMarkerLabels(context, scrollCandidates);
}

function shouldKeepTempoMarkerLabel(lastAcceptedY, nextY) {
  return !Number.isFinite(lastAcceptedY) || Math.abs(nextY - lastAcceptedY) >= TEMPO_LABEL_MIN_GAP;
}

function getTempoMarkerRect(lane, side) {
  const width = TEMPO_MARKER_WIDTH;
  if (side === "left") {
    return {
      x: lane.x + getSeparatorWidth() - width,
      width,
    };
  }
  return {
    x: lane.x + lane.width,
    width,
  };
}

function drawLongBodiesEditorMode(context, model, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount) {
  context.save();
  const candidateWindow = getLongBodyWindow(model, editorFrameState.startBeat, editorFrameState.endBeat);
  for (let index = candidateWindow.startIndex; index < candidateWindow.endIndex; index += 1) {
    const note = candidateWindow.items[index];
    const noteStartBeat = note.beat ?? 0;
    const noteEndBeat = getNoteEndBeat(note);
    if (noteEndBeat < editorFrameState.startBeat || noteStartBeat > editorFrameState.endBeat) {
      continue;
    }
    const startY = beatToViewportY(noteStartBeat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
    const endY = beatToViewportY(noteEndBeat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY);
    for (const segment of getWrappedLongBodySegments(startY, endY, editorFrameState.viewportHeight, columnCount)) {
      const lane = laneLayout.columns[segment.columnIndex]?.lanes[note.lane];
      if (!lane) {
        continue;
      }
      context.fillStyle = dimColor(lane.note, 0.42);
      const contentWidth = getLaneContentWidth(lane);
      if (!(contentWidth > 0)) {
        continue;
      }
      context.fillRect(
        getLaneContentLeftX(lane),
        segment.topY,
        contentWidth,
        Math.max(segment.bottomY - segment.topY, 2),
      );
    }
  }
  context.restore();
}

function drawNoteHeadsEditorMode(context, model, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount) {
  context.save();
  const noteWindow = getBeatWindowIndices(model.notesByBeat, editorFrameState.startBeat, editorFrameState.endBeat);
  for (let index = noteWindow.startIndex; index < noteWindow.endIndex; index += 1) {
    const note = model.notesByBeat[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(note.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lane = laneLayout.columns[placement?.columnIndex]?.lanes[note.lane];
    if (!placement || !lane || note.kind === "invisible") {
      continue;
    }
    drawRectNote(context, lane, placement.y, note.kind === "mine" ? MINE_COLOR : lane.note);
  }

  const longEndWindow = getBeatWindowIndices(model.longNotesByEndBeat, editorFrameState.startBeat, editorFrameState.endBeat, getNoteEndBeat);
  for (let index = longEndWindow.startIndex; index < longEndWindow.endIndex; index += 1) {
    const note = model.longNotesByEndBeat[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(getNoteEndBeat(note), editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lane = laneLayout.columns[placement?.columnIndex]?.lanes[note.lane];
    if (!placement || !lane || !shouldDrawLongEndCap(model, note)) {
      continue;
    }
    drawRectNote(context, lane, placement.y, lane.note);
  }
  context.restore();
}

function drawInvisibleNoteHeadsEditorMode(context, model, laneLayout, editorFrameState, pixelsPerBeat, judgeLineY, columnCount) {
  context.save();
  context.strokeStyle = INVISIBLE_NOTE_COLOR;
  context.lineWidth = 1;
  const noteWindow = getBeatWindowIndices(model.invisibleNotesByBeat ?? [], editorFrameState.startBeat, editorFrameState.endBeat);
  for (let index = noteWindow.startIndex; index < noteWindow.endIndex; index += 1) {
    const note = model.invisibleNotesByBeat[index];
    const placement = getWrappedColumnPlacement(
      beatToViewportY(note.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat, judgeLineY),
      editorFrameState.viewportHeight,
      columnCount,
    );
    const lane = laneLayout.columns[placement?.columnIndex]?.lanes[note.lane];
    if (!placement || !lane) {
      continue;
    }
    drawOutlinedRectNote(context, lane, placement.y, INVISIBLE_NOTE_COLOR);
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
    Math.max(getNoteHeadHeight() - 1, 1),
  );
}

function drawSpacedTempoMarkerLabels(context, candidates) {
  const lastAcceptedYByGroup = new Map();
  for (const candidate of [...candidates].sort((left, right) => left.y - right.y)) {
    const groupKey = getLabelCollisionKey(candidate);
    const lastAcceptedY = lastAcceptedYByGroup.get(groupKey) ?? Number.POSITIVE_INFINITY;
    if (!shouldKeepTempoMarkerLabel(lastAcceptedY, candidate.y)) {
      continue;
    }
    drawTempoMarkerLabel(context, candidate);
    lastAcceptedYByGroup.set(groupKey, candidate.y);
  }
}

function drawMeasureLabels(context, candidates) {
  const lastAcceptedYByGroup = new Map();
  context.save();
  context.font = TEMPO_LABEL_FONT;
  context.fillStyle = MEASURE_LABEL_COLOR;
  context.textBaseline = "bottom";
  context.textAlign = "right";
  for (const candidate of [...candidates].sort((left, right) => left.y - right.y)) {
    const groupKey = getLabelCollisionKey(candidate);
    const lastAcceptedY = lastAcceptedYByGroup.get(groupKey) ?? Number.POSITIVE_INFINITY;
    if (!shouldKeepTempoMarkerLabel(lastAcceptedY, candidate.y)) {
      continue;
    }
    context.fillText(candidate.label, candidate.x, candidate.y);
    lastAcceptedYByGroup.set(groupKey, candidate.y);
  }
  context.restore();
}

function getLabelCollisionKey(candidate) {
  return `${candidate.side ?? "measure"}:${Math.round(candidate.x ?? 0)}`;
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
  const visualColumns = getVisualColumns(lanes);
  if (visualColumns.length === 0) {
    return;
  }
  const separatorWidth = getSeparatorWidth();
  if (!(separatorWidth > 0)) {
    return;
  }
  context.save();
  context.lineWidth = separatorWidth;
  const startY = Math.max(Number.isFinite(topY) ? topY : 0, 0);
  const endY = Math.min(Number.isFinite(bottomY) ? bottomY : viewportHeight, viewportHeight);
  if (endY <= startY) {
    context.restore();
    return;
  }
  const uniqueBoundaries = new Set();
  uniqueBoundaries.add(Math.round(visualColumns[0].x));
  for (const column of visualColumns) {
    uniqueBoundaries.add(Math.round(column.x));
    uniqueBoundaries.add(Math.round(column.x + column.width));
  }
  const separatorOverrides = lanes?.separatorOverrides ?? null;
  for (const x of [...uniqueBoundaries].sort((left, right) => left - right)) {
    context.strokeStyle = separatorOverrides?.get?.(x) ?? SEPARATOR_COLOR;
    context.beginPath();
    const strokeCenterX = getSeparatorStrokeCenterX(x);
    context.moveTo(strokeCenterX, startY);
    context.lineTo(strokeCenterX, endY);
    context.stroke();
  }
  context.restore();
}

function drawLaneBackgrounds(context, lanes, viewportHeight, topY = 0, bottomY = viewportHeight) {
  const visualColumns = getVisualColumns(lanes);
  if (visualColumns.length === 0) {
    return;
  }
  const startY = Math.max(Number.isFinite(topY) ? topY : 0, 0);
  const endY = Math.min(Number.isFinite(bottomY) ? bottomY : viewportHeight, viewportHeight);
  if (endY <= startY) {
    return;
  }
  context.save();
  for (const column of visualColumns) {
    if (!column?.backgroundFill) {
      continue;
    }
    const contentWidth = getLaneContentWidth(column);
    if (!(contentWidth > 0)) {
      continue;
    }
    context.fillStyle = column.backgroundFill;
    context.fillRect(getLaneContentLeftX(column), startY, contentWidth, endY - startY);
  }
  context.restore();
}

function getLaneBounds(laneLayout) {
  const lanes = laneLayout?.columns?.flatMap((column) => getVisualColumns(column.lanes)) ?? getVisualColumns(laneLayout?.lanes ?? []);
  const { leftLane, rightLane } = getVisualLaneEdges(lanes);
  if (!leftLane || !rightLane) {
    return {
      leftX: 0,
      rightX: 0,
    };
  }
  return {
    leftX: leftLane.x,
    rightX: rightLane.x + rightLane.width,
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
  const visibleLanes = getVisualColumns(lanes);
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

function getVisualColumns(lanes) {
  if (Array.isArray(lanes?.visualColumns)) {
    return lanes.visualColumns.filter(Boolean);
  }
  if (Array.isArray(lanes)) {
    return lanes.filter(Boolean);
  }
  return [];
}

function createEmptyRenderResult() {
  return {
    markers: [],
    laneBounds: {
      leftX: 0,
      rightX: 0,
    },
  };
}

function createLaneLayout(mode, laneCount, viewportWidth, columnCount = 1) {
  const layout = getModeLayout(mode, laneCount);
  if (typeof layout.buildColumns === "function") {
    return layout.buildColumns(viewportWidth, columnCount, laneCount);
  }
  const gutterWidth = layout.splitAfter === null ? 0 : getDpGutterWidth();
  const contentWidth = getDisplayLaneAreaWidth(layout.display) + gutterWidth;
  const normalizedColumnCount = normalizeColumnCount(columnCount);
  const columnWidth = Math.max(Math.floor(viewportWidth / normalizedColumnCount), 1);
  const columns = [];
  for (let columnIndex = 0; columnIndex < normalizedColumnCount; columnIndex += 1) {
    const columnLeftX = Math.max(columnWidth * columnIndex, 0);
    const startX = columnLeftX + Math.max(VIEWER_LANE_SIDE_PADDING, Math.floor((columnWidth - contentWidth) / 2));
    const lanes = new Array(Math.max(1, laneCount));
    let gutterRect = null;
    let cursorX = startX;
    for (let slotIndex = 0; slotIndex < layout.display.length; slotIndex += 1) {
      if (layout.splitAfter !== null && slotIndex === layout.splitAfter) {
        gutterRect = {
          x: cursorX,
          width: gutterWidth,
        };
        cursorX += gutterWidth;
      }

      const slot = layout.display[slotIndex];
      const slotWidth = getLaneSlotWidth(slot.isScratch);
      lanes[slot.actualLane] = {
        lane: slot.actualLane,
        x: cursorX,
        width: slotWidth,
        note: slot.note,
      };
      cursorX += slotWidth;
    }
    columns.push({
      columnIndex,
      leftX: columnLeftX,
      width: columnWidth,
      lanes,
      gutterRect,
    });
  }
  return {
    lanes: columns[0]?.lanes ?? [],
    gutterRect: columns[0]?.gutterRect ?? null,
    columns,
    columnWidth,
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
        (slotIndex) => `g${slotIndex}`,
      );
    case "14k":
      return createDisplayLayout(
        [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8],
        8,
        (slotIndex) => getBeatNoteColor(String(slotIndex)),
        (slotIndex) => String(slotIndex),
      );
    case "24k":
      return createKeyboardModeLayout(KEYBOARD_24_BASE_COLUMNS, KEYBOARD_24_LANE_SPECS);
    case "48k":
      return createKeyboardModeLayout(KEYBOARD_48_BASE_COLUMNS, KEYBOARD_48_LANE_SPECS, 14);
    case "popn-5k":
      return createDisplayLayout([0, 1, 2, 3, 4], null, (slotIndex) => getPopnNoteColor(slotIndex), (slotIndex) => `p${slotIndex}`);
    case "popn-9k":
    case "9k":
      return createDisplayLayout(
        Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
        null,
        (slotIndex) => getPopnNoteColor(slotIndex),
        (slotIndex) => `p${slotIndex}`,
      );
    default:
      return createDisplayLayout(
        Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
        null,
        () => "#bebebe",
        (_slotIndex, actualLane) => String(actualLane),
      );
  }
}

function createKeyboardModeLayout(baseColumns, laneSpecs, highlightedSeparatorAfterIndex = null) {
  return {
    splitAfter: null,
    display: baseColumns.map((column, index) => ({
      actualLane: index,
      laneKey: `kbd-${index}`,
      isScratch: column.widthType === "scratch",
      note: KEYBOARD_WHITE_KEY_COLOR,
    })),
    buildColumns(viewportWidth, columnCount = 1, laneCount = laneSpecs.length) {
      const contentWidth = getDisplayLaneAreaWidth(this.display);
      const normalizedColumnCount = normalizeColumnCount(columnCount);
      const columnWidth = Math.max(Math.floor(viewportWidth / normalizedColumnCount), 1);
      const columns = [];
      for (let columnIndex = 0; columnIndex < normalizedColumnCount; columnIndex += 1) {
        const columnLeftX = Math.max(columnWidth * columnIndex, 0);
        const startX = columnLeftX + Math.max(VIEWER_LANE_SIDE_PADDING, Math.floor((columnWidth - contentWidth) / 2));
        const visualColumns = [];
        let cursorX = startX;
        for (const column of baseColumns) {
          const slotWidth = getLaneSlotWidth(column.widthType === "scratch");
          visualColumns.push({
            x: cursorX,
            width: slotWidth,
            contentLeftX: cursorX + getSeparatorWidth(),
            contentWidth: getLaneNoteWidth(column.widthType === "scratch"),
            backgroundFill: column.backgroundFill ?? null,
          });
          cursorX += slotWidth;
        }

        const lanes = new Array(Math.max(1, laneCount));
        for (const spec of laneSpecs) {
          const contentWidthForLane = getLaneNoteWidth(spec.widthType === "scratch");
          let contentLeftX;
          if (Number.isInteger(spec.position)) {
            contentLeftX = visualColumns[spec.position]?.contentLeftX;
          } else {
            const leftColumn = visualColumns[Math.floor(spec.position)];
            const centerX = leftColumn
              ? leftColumn.x + leftColumn.width + getSeparatorWidth() / 2
              : NaN;
            contentLeftX = Number.isFinite(centerX)
              ? Math.round(centerX - contentWidthForLane / 2)
              : NaN;
          }
          if (!Number.isFinite(contentLeftX)) {
            continue;
          }
          lanes[spec.lane] = {
            lane: spec.lane,
            x: contentLeftX - getSeparatorWidth(),
            width: contentWidthForLane + getSeparatorWidth(),
            contentLeftX,
            contentWidth: contentWidthForLane,
            note: spec.note,
            side: spec.side,
          };
        }
        lanes.visualColumns = visualColumns;
        if (Number.isInteger(highlightedSeparatorAfterIndex) && visualColumns[highlightedSeparatorAfterIndex]) {
          lanes.separatorOverrides = new Map([
            [Math.round(visualColumns[highlightedSeparatorAfterIndex].x + visualColumns[highlightedSeparatorAfterIndex].width), KEYBOARD_DOUBLE_SEPARATOR_COLOR],
          ]);
        }
        columns.push({
          columnIndex,
          leftX: columnLeftX,
          width: columnWidth,
          lanes,
          visualColumns,
          gutterRect: null,
        });
      }
      return {
        lanes: columns[0]?.lanes ?? [],
        gutterRect: null,
        columns,
        columnWidth,
      };
    },
  };
}

function createDisplayLayout(displayOrder, splitAfter, getColor, getLaneKey = (_slotIndex, actualLane) => String(actualLane)) {
  return {
    splitAfter,
    display: displayOrder.map((actualLane, slotIndex) => ({
      actualLane,
      laneKey: getLaneKey(slotIndex, actualLane),
      isScratch: isScratchLaneKey(getLaneKey(slotIndex, actualLane)),
      note: getColor(slotIndex),
    })),
  };
}

function isScratchLaneKey(laneKey) {
  return laneKey === "0" || laneKey === "15" || laneKey === "g0" || laneKey === "g11";
}

function normalizeColumnCount(value) {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1));
}

function isGameMode(mode) {
  return mode === "game" || mode === "lunatic";
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

function gameTrackPositionToViewportY(eventTrackPosition, selectedTrackPosition, viewportHeight, pixelsPerBeat, judgeLineY = getJudgeLineY(viewportHeight)) {
  return judgeLineY - (eventTrackPosition - selectedTrackPosition) * pixelsPerBeat;
}

function getJudgeLineRatioFromGeometry(viewportHeight, judgeLineY) {
  const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
  if (!(normalizedViewportHeight > 0)) {
    return DEFAULT_JUDGE_LINE_POSITION_RATIO;
  }
  return clamp(judgeLineY / normalizedViewportHeight, 0, 1);
}

function normalizeGameProjectionOptions(viewportHeight, options, legacyJudgeLineY) {
  const isLegacySignature = Number.isFinite(options);
  const normalizedGameTimingConfig = normalizeGameTimingConfig(
    !isLegacySignature && options?.gameTimingConfig ? options.gameTimingConfig : createDefaultGameTimingConfig(),
  );
  if (!isLegacySignature && options?.laneGeometry) {
    return {
      gameTimingConfig: normalizedGameTimingConfig,
      laneGeometry: options.laneGeometry,
    };
  }
    const judgeLineY = Number.isFinite(legacyJudgeLineY)
      ? legacyJudgeLineY
      : getGameJudgeLineY(
        viewportHeight,
        DEFAULT_JUDGE_LINE_POSITION_RATIO,
      );
    return {
      gameTimingConfig: normalizedGameTimingConfig,
      laneGeometry: getGameLaneGeometry(
        viewportHeight,
        getJudgeLineRatioFromGeometry(viewportHeight, judgeLineY),
        normalizedGameTimingConfig.laneHeightPx,
      ),
    };
  }

function isViewportYVisible(y, viewportTopY, viewportBottomY, margin = getNoteHeadHeight() + 24) {
  return y >= viewportTopY - margin && y <= viewportBottomY + margin;
}

function getEventTrackPosition(event) {
  return Number.isFinite(event?.trackPosition) ? event.trackPosition : 0;
}

function getNoteEndTrackPosition(note) {
  return Number.isFinite(note?.endTrackPosition) ? note.endTrackPosition : getEventTrackPosition(note);
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

export function collectVisibleEditorGridLines(measureRanges, startBeat, endBeat) {
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
    endIndex: upperBoundByBeat(items, endBeat, getBeat),
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
      endIndex: visibleStartCount,
    };
  }
  return {
    items: model.longNotesByEndBeat,
    startIndex: visibleEndStartIndex,
    endIndex: model.longNotesByEndBeat.length,
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

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

function hexToRgb(color) {
  const normalized = color.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return [red, green, blue];
}
