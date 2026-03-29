import {
  DEFAULT_EDITOR_PIXELS_PER_BEAT,
  DEFAULT_VIEWER_MODE,
  DEFAULT_VIEWER_PIXELS_PER_SECOND,
  getGameTrackPositionAtTimeSec,
  getEditorFrameState,
  getVisibleTimeRange,
  resolveViewerModeForModel,
  shouldDrawLongEndCap,
} from "./score-viewer-model.js";

export const VIEWER_LANE_SIDE_PADDING = 6;
export const DP_GUTTER_UNITS = 1.2;
export const FIXED_LANE_WIDTH = 16;
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
const NOTE_HEAD_HEIGHT = 4;
const TEMPO_MARKER_HEIGHT = 1;
const TEMPO_MARKER_WIDTH_RATIO = 0.5;
const TEMPO_LABEL_GAP = 8;
const TEMPO_LABEL_MIN_GAP = 12;
const LEFT_TEMPO_MARKER_SEPARATOR_COMPENSATION_PX = 1;
const TEMPO_LABEL_FONT = '12px "Inconsolata", "Noto Sans JP"';
const MEASURE_LABEL_COLOR = "#FFFFFF";
const JUDGE_LINE_SIDE_OVERHANG = FIXED_LANE_WIDTH * 3;

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

export function createScoreViewerRenderer(canvas) {
  const context = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let laneLayoutCache = {
    mode: null,
    laneCount: null,
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
      editorFrameState = null,
      showInvisibleNotes = false,
    } = {},
  ) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = BACKGROUND_FILL;
    context.fillRect(0, 0, width, height);

    if (!model) {
      return createEmptyRenderResult();
    }

    const laneLayout = getCachedLaneLayout(model.score.mode, model.score.laneCount);
    const resolvedMode = resolveViewerModeForModel(model, viewerMode);

    if (resolvedMode === "time") {
      return renderTimeMode(model, laneLayout, selectedTimeSec, pixelsPerSecond, showInvisibleNotes);
    }
    if (resolvedMode === "game") {
      return renderGameMode(model, laneLayout, selectedTimeSec, pixelsPerBeat, showInvisibleNotes);
    }

    return renderEditorMode(
      model,
      laneLayout,
      editorFrameState ?? getEditorFrameState(model, selectedTimeSec, height, pixelsPerBeat),
      pixelsPerBeat,
      showInvisibleNotes,
    );
  }

  return { resize, render };

  function renderTimeMode(model, laneLayout, selectedTimeSec, pixelsPerSecond, showInvisibleNotes) {
    const { lanes } = laneLayout;
    const { startTimeSec, endTimeSec } = getVisibleTimeRange(model, selectedTimeSec, height, pixelsPerSecond);

    drawDpGutter(context, laneLayout, height);
    drawLaneSeparators(context, lanes, height);
    drawBarLinesTimeMode(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    drawMeasureLabelsTimeMode(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    drawTempoMarkersTimeMode(
      context,
      model.bpmChanges,
      model.stops,
      model.scrollChanges,
      lanes,
      selectedTimeSec,
      startTimeSec,
      endTimeSec,
      height,
      pixelsPerSecond,
    );
    drawLongBodiesTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    drawNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    if (showInvisibleNotes) {
      drawInvisibleNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    }

    return {
      markers: [],
      laneBounds: getLaneBounds(laneLayout),
    };
  }

  function renderEditorMode(model, laneLayout, editorFrameState, pixelsPerBeat, showInvisibleNotes) {
    const { lanes } = laneLayout;
    drawEditorSubGrid(context, model.measureRanges, lanes, editorFrameState, pixelsPerBeat);
    drawDpGutter(context, laneLayout, height);
    drawLaneSeparators(context, lanes, height);
    drawBarLinesEditorMode(context, model.barLines, lanes, editorFrameState, pixelsPerBeat);
    drawMeasureLabelsEditorMode(context, model.barLines, lanes, editorFrameState, pixelsPerBeat);
    drawTempoMarkersEditorMode(
      context,
      model,
      lanes,
      editorFrameState,
      pixelsPerBeat,
    );
    drawLongBodiesEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
    drawNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
    if (showInvisibleNotes) {
      drawInvisibleNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
    }

    return {
      markers: [],
      laneBounds: getLaneBounds(laneLayout),
    };
  }

  function renderGameMode(model, laneLayout, selectedTimeSec, pixelsPerBeat, showInvisibleNotes) {
    const { lanes } = laneLayout;
    const projection = collectGameProjection(model, selectedTimeSec, height, pixelsPerBeat);

    drawDpGutter(context, laneLayout, height);
    drawLaneSeparators(context, lanes, height);
    drawBarLinesGameMode(context, lanes, projection);
    drawMeasureLabelsGameMode(context, model.barLines, lanes, projection);
    drawTempoMarkersGameMode(context, lanes, projection);
    drawLongBodiesGameMode(context, model, lanes, projection);
    drawNoteHeadsGameMode(context, model, lanes, projection);
    if (showInvisibleNotes) {
      drawInvisibleNoteHeadsGameMode(context, lanes, projection);
    }

    return {
      markers: [],
      laneBounds: getLaneBounds(laneLayout),
    };
  }

  function getCachedLaneLayout(mode, laneCount) {
    if (
      laneLayoutCache.mode === mode
      && laneLayoutCache.laneCount === laneCount
      && laneLayoutCache.width === width
      && laneLayoutCache.layout
    ) {
      return laneLayoutCache.layout;
    }
    const layout = createLaneLayout(mode, laneCount, width);
    laneLayoutCache = {
      mode,
      laneCount,
      width,
      layout,
    };
    return layout;
  }
}

export function estimateViewerWidth(mode, laneCount) {
  const layout = getModeLayout(mode, laneCount);
  const gutterWidth = layout.splitAfter === null ? 0 : FIXED_LANE_WIDTH * DP_GUTTER_UNITS;
  const contentWidth = layout.display.length * FIXED_LANE_WIDTH + gutterWidth;
  return Math.ceil(contentWidth + JUDGE_LINE_SIDE_OVERHANG * 2);
}

function drawBarLinesTimeMode(context, barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
  const { leftLane, rightLane } = getVisualLaneEdges(lanes);
  if (!leftLane || !rightLane) {
    return;
  }
  const leftX = leftLane.x;
  const rightX = rightLane.x + rightLane.width;
  context.save();
  context.strokeStyle = BAR_LINE;
  context.lineWidth = 1;
  for (const barLine of barLines) {
    if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
      continue;
    }
    const y = timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    context.beginPath();
    context.moveTo(leftX, y + 0.5);
    context.lineTo(rightX, y + 0.5);
    context.stroke();
  }
  context.restore();
}

function drawMeasureLabelsTimeMode(context, barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
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
      y: timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond),
    });
  }
  drawMeasureLabels(context, candidates);
}

function drawTempoMarkersTimeMode(
  context,
  bpmChanges,
  stops,
  scrollChanges,
  lanes,
  selectedTimeSec,
  startTimeSec,
  endTimeSec,
  viewportHeight,
  pixelsPerSecond,
) {
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
    const y = timeToViewportY(bpmChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    const markerRect = getTempoMarkerRect(rightLane, "right");
    context.fillRect(markerRect.x, Math.round(y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
    if (shouldKeepTempoMarkerLabel(lastBpmLabelY, y)) {
      drawTempoMarkerLabel(context, {
        type: "bpm",
        timeSec: bpmChange.timeSec,
        y,
        label: formatBpmMarkerLabel(bpmChange.bpm),
        side: "right",
        color: BPM_MARKER,
        x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP,
      });
      lastBpmLabelY = y;
    }
  }

  context.fillStyle = STOP_MARKER;
  for (const stop of stops) {
    if (stop.timeSec < startTimeSec || stop.timeSec > endTimeSec) {
      continue;
    }
    const y = timeToViewportY(stop.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillRect(markerRect.x, Math.round(y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
    if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
      drawTempoMarkerLabel(context, {
        type: "stop",
        timeSec: stop.timeSec,
        y,
        label: formatStopMarkerLabel(stop.durationSec),
        side: "left",
        color: STOP_MARKER,
        x: leftLane.x - TEMPO_LABEL_GAP,
      });
      lastStopLabelY = y;
    }
  }

  context.fillStyle = SCROLL_MARKER;
  for (const scrollChange of scrollChanges) {
    if (scrollChange.timeSec < startTimeSec || scrollChange.timeSec > endTimeSec) {
      continue;
    }
    const y = timeToViewportY(scrollChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillRect(markerRect.x, Math.round(y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
    if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
      drawTempoMarkerLabel(context, {
        type: "scroll",
        timeSec: scrollChange.timeSec,
        y,
        label: formatScrollMarkerLabel(scrollChange.rate),
        side: "left",
        color: SCROLL_MARKER,
        x: leftLane.x - TEMPO_LABEL_GAP,
      });
      lastScrollLabelY = y;
    }
  }

  context.restore();
}

function drawLongBodiesTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
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
    const startY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    const endY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    const topY = Math.max(Math.min(startY, endY), -NOTE_HEAD_HEIGHT - 24);
    const bottomY = Math.min(Math.max(startY, endY), viewportHeight + NOTE_HEAD_HEIGHT + 24);
    const bodyHeight = Math.max(bottomY - topY, 2);
    context.fillStyle = dimColor(lane.note, 0.42);
    context.fillRect(lane.x, topY, lane.width, bodyHeight);
  }
  context.restore();
}

function drawNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
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

    const headY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    drawRectNote(context, lane, headY, note.kind === "mine" ? MINE_COLOR : lane.note);

    if (note.kind === "long" && Number.isFinite(note.endTimeSec) && shouldDrawLongEndCap(model, note)) {
      const endHeadY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      drawRectNote(context, lane, endHeadY, lane.note);
    }
  }
  context.restore();
}

function drawInvisibleNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
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
    const headY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    drawOutlinedRectNote(context, lane, headY, INVISIBLE_NOTE_COLOR);
  }
  context.restore();
}

export function collectGameProjection(
  model,
  selectedTimeSec,
  viewportHeight,
  pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
) {
  const projection = {
    selectedTimeSec,
    selectedTrackPosition: getGameTrackPositionAtTimeSec(model, selectedTimeSec),
    viewportHeight: Math.max(viewportHeight, 0),
    pixelsPerBeat,
    visibleMargin: NOTE_HEAD_HEIGHT + 24,
    points: [],
    pointYByIndex: new Map(),
    exitPoint: null,
  };
  if (!model?.gameTimeline?.length) {
    return projection;
  }

  const timeline = model.gameTimeline;
  const startIndex = lowerBoundGameTimelineByTime(timeline, selectedTimeSec);
  let y = projection.viewportHeight / 2;

  for (let index = startIndex; index < timeline.length; index += 1) {
    const point = timeline[index];
    if (index > 0) {
      y -= getGameProjectionDeltaY(
        timeline[index - 1],
        point,
        selectedTimeSec,
        pixelsPerBeat,
      );
    } else {
      y -= getInitialGameProjectionDeltaY(point, selectedTimeSec, pixelsPerBeat);
    }

    projection.pointYByIndex.set(index, y);
    if (isGameProjectionPastUpperBound(y, projection.viewportHeight, projection.visibleMargin)) {
      projection.exitPoint = { index, point, y };
      break;
    }
    if (!isViewportYVisible(y, projection.viewportHeight, projection.visibleMargin)) {
      continue;
    }
    projection.points.push({ index, point, y });
  }
  return projection;
}

function getInitialGameProjectionDeltaY(point, selectedTimeSec, pixelsPerBeat) {
  const pointTimeSec = finiteOrZero(point?.timeSec);
  if (!(pointTimeSec > 0)) {
    return 0;
  }
  const remainingRatio = clamp(
    (pointTimeSec - selectedTimeSec) / pointTimeSec,
    0,
    1,
  );
  return finiteOrZero(point?.beat) * remainingRatio * pixelsPerBeat;
}

function getGameProjectionDeltaY(previousPoint, point, selectedTimeSec, pixelsPerBeat) {
  const deltaSection = finiteOrZero(point?.beat) - finiteOrZero(previousPoint?.beat);
  if (Math.abs(deltaSection) < 1e-9) {
    return 0;
  }
  const scrollRate = getGameProjectionScrollRate(previousPoint);
  if (finiteOrZero(previousPoint?.timeSec) + finiteOrZero(previousPoint?.stopDurationSec) > selectedTimeSec) {
    return deltaSection * scrollRate * pixelsPerBeat;
  }
  const traversableDurationSec = finiteOrZero(point?.timeSec)
    - finiteOrZero(previousPoint?.timeSec)
    - finiteOrZero(previousPoint?.stopDurationSec);
  if (!(traversableDurationSec > 0)) {
    return 0;
  }
  const remainingRatio = clamp(
    (finiteOrZero(point?.timeSec) - selectedTimeSec) / traversableDurationSec,
    0,
    1,
  );
  return deltaSection * scrollRate * remainingRatio * pixelsPerBeat;
}

function isGameProjectionPastUpperBound(y, viewportHeight, margin) {
  return y < -Math.max(margin, 0);
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
  const rightX = rightLane.x + rightLane.width;
  context.save();
  context.strokeStyle = BAR_LINE;
  context.lineWidth = 1;
  for (const projectedPoint of projection.points) {
    if (projectedPoint.point.barLines.length === 0) {
      continue;
    }
    for (const _barLine of projectedPoint.point.barLines) {
      context.beginPath();
      context.moveTo(leftX, projectedPoint.y + 0.5);
      context.lineTo(rightX, projectedPoint.y + 0.5);
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
    const topY = Math.max(Math.min(startY, endY), -NOTE_HEAD_HEIGHT - 24);
    const bottomY = Math.min(Math.max(startY, endY), projection.viewportHeight + NOTE_HEAD_HEIGHT + 24);
    if (bottomY <= topY) {
      continue;
    }
    context.fillStyle = dimColor(lane.note, 0.42);
    context.fillRect(lane.x, topY, lane.width, Math.max(bottomY - topY, 2));
  }
  context.restore();
}

function drawNoteHeadsGameMode(context, model, lanes, projection) {
  context.save();
  for (const projectedPoint of projection.points) {
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
    context.fillStyle = BPM_MARKER;
    for (const bpmChange of projectedPoint.point.bpmChanges) {
      const markerRect = getTempoMarkerRect(rightLane, "right");
      context.fillRect(markerRect.x, Math.round(projectedPoint.y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
      bpmCandidates.push({
        type: "bpm",
        timeSec: bpmChange.timeSec,
        y: projectedPoint.y,
        label: formatBpmMarkerLabel(bpmChange.bpm),
        side: "right",
        color: BPM_MARKER,
        x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP,
      });
    }

    context.fillStyle = STOP_MARKER;
    for (const stop of projectedPoint.point.stops) {
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(markerRect.x, Math.round(projectedPoint.y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
      stopCandidates.push({
        type: "stop",
        timeSec: stop.timeSec,
        y: projectedPoint.y,
        label: formatStopMarkerLabel(stop.durationSec),
        side: "left",
        color: STOP_MARKER,
        x: leftLane.x - TEMPO_LABEL_GAP,
      });
    }

    context.fillStyle = SCROLL_MARKER;
    for (const scrollChange of projectedPoint.point.scrollChanges) {
      const markerRect = getTempoMarkerRect(leftLane, "left");
      context.fillRect(markerRect.x, Math.round(projectedPoint.y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
      scrollCandidates.push({
        type: "scroll",
        timeSec: scrollChange.timeSec,
        y: projectedPoint.y,
        label: formatScrollMarkerLabel(scrollChange.rate),
        side: "left",
        color: SCROLL_MARKER,
        x: leftLane.x - TEMPO_LABEL_GAP,
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
    return projection.viewportHeight / 2;
  }
  return null;
}

function getProjectedGameLongBodyEndY(note, projection) {
  const projectedEndY = projection.pointYByIndex.get(note.gameTimelineEndIndex);
  if (Number.isFinite(projectedEndY)) {
    return projectedEndY;
  }
  if (projection.exitPoint && Number.isInteger(note.gameTimelineEndIndex) && note.gameTimelineEndIndex >= projection.exitPoint.index) {
    return Math.min(
      Math.max(projection.exitPoint.y, -NOTE_HEAD_HEIGHT - 24),
      projection.viewportHeight + NOTE_HEAD_HEIGHT + 24,
    );
  }
  return null;
}

function drawEditorSubGrid(context, measureRanges, lanes, editorFrameState, pixelsPerBeat) {
  const { leftLane, rightLane } = getVisualLaneEdges(lanes);
  if (!leftLane || !rightLane || !Array.isArray(measureRanges) || measureRanges.length === 0) {
    return;
  }
  const leftX = leftLane.x;
  const rightX = rightLane.x + rightLane.width;
  const visibleGridLines = collectVisibleEditorGridLines(
    measureRanges,
    editorFrameState.startBeat,
    editorFrameState.endBeat,
  );

  if (visibleGridLines.sixteenthBeats.length === 0 && visibleGridLines.beatBeats.length === 0) {
    return;
  }

  context.save();
  context.lineWidth = 1;

  context.strokeStyle = EDITOR_SIXTEENTH_GRID_LINE;
  for (const beat of visibleGridLines.sixteenthBeats) {
    const y = beatToViewportY(beat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    context.beginPath();
    context.moveTo(leftX, y + 0.5);
    context.lineTo(rightX, y + 0.5);
    context.stroke();
  }

  context.strokeStyle = EDITOR_BEAT_GRID_LINE;
  for (const beat of visibleGridLines.beatBeats) {
    const y = beatToViewportY(beat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    context.beginPath();
    context.moveTo(leftX, y + 0.5);
    context.lineTo(rightX, y + 0.5);
    context.stroke();
  }

  context.restore();
}

function drawBarLinesEditorMode(context, barLines, lanes, editorFrameState, pixelsPerBeat) {
  const { leftLane, rightLane } = getVisualLaneEdges(lanes);
  if (!leftLane || !rightLane) {
    return;
  }
  const leftX = leftLane.x;
  const rightX = rightLane.x + rightLane.width;
  const visibleWindow = getBeatWindowIndices(barLines, editorFrameState.startBeat, editorFrameState.endBeat);
  context.save();
  context.strokeStyle = BAR_LINE;
  context.lineWidth = 1;
  for (let index = visibleWindow.startIndex; index < visibleWindow.endIndex; index += 1) {
    const barLine = barLines[index];
    const y = beatToViewportY(barLine.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    context.beginPath();
    context.moveTo(leftX, y + 0.5);
    context.lineTo(rightX, y + 0.5);
    context.stroke();
  }
  context.restore();
}

function drawMeasureLabelsEditorMode(context, barLines, lanes, editorFrameState, pixelsPerBeat) {
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
      y: beatToViewportY(barLine.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat),
    });
  }
  drawMeasureLabels(context, candidates);
}

function drawTempoMarkersEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
  const { leftLane, rightLane } = getVisualLaneEdges(lanes);
  if (!leftLane || !rightLane) {
    return;
  }
  let lastBpmLabelY = Number.POSITIVE_INFINITY;
  let lastStopLabelY = Number.POSITIVE_INFINITY;
  let lastScrollLabelY = Number.POSITIVE_INFINITY;
  const bpmWindow = getBeatWindowIndices(model.bpmChanges, editorFrameState.startBeat, editorFrameState.endBeat);
  const stopWindow = getBeatWindowIndices(model.stops, editorFrameState.startBeat, editorFrameState.endBeat);
  const scrollWindow = getBeatWindowIndices(model.scrollChanges, editorFrameState.startBeat, editorFrameState.endBeat);

  context.save();
  context.fillStyle = BPM_MARKER;
  for (let index = bpmWindow.startIndex; index < bpmWindow.endIndex; index += 1) {
    const bpmChange = model.bpmChanges[index];
    const y = beatToViewportY(bpmChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    const markerRect = getTempoMarkerRect(rightLane, "right");
    context.fillRect(
      markerRect.x,
      Math.round(y - TEMPO_MARKER_HEIGHT / 2),
      markerRect.width,
      TEMPO_MARKER_HEIGHT,
    );
    if (shouldKeepTempoMarkerLabel(lastBpmLabelY, y)) {
      drawTempoMarkerLabel(context, {
        type: "bpm",
        timeSec: bpmChange.timeSec,
        y,
        label: formatBpmMarkerLabel(bpmChange.bpm),
        side: "right",
        color: BPM_MARKER,
        x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP,
      });
      lastBpmLabelY = y;
    }
  }

  context.fillStyle = STOP_MARKER;
  for (let index = stopWindow.startIndex; index < stopWindow.endIndex; index += 1) {
    const stop = model.stops[index];
    const y = beatToViewportY(stop.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillRect(
      markerRect.x,
      Math.round(y - TEMPO_MARKER_HEIGHT / 2),
      markerRect.width,
      TEMPO_MARKER_HEIGHT,
    );
    if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
      drawTempoMarkerLabel(context, {
        type: "stop",
        timeSec: stop.timeSec,
        y,
        label: formatStopMarkerLabel(stop.durationSec),
        side: "left",
        color: STOP_MARKER,
        x: leftLane.x - TEMPO_LABEL_GAP,
      });
      lastStopLabelY = y;
    }
  }

  context.fillStyle = SCROLL_MARKER;
  for (let index = scrollWindow.startIndex; index < scrollWindow.endIndex; index += 1) {
    const scrollChange = model.scrollChanges[index];
    const y = beatToViewportY(scrollChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillRect(
      markerRect.x,
      Math.round(y - TEMPO_MARKER_HEIGHT / 2),
      markerRect.width,
      TEMPO_MARKER_HEIGHT,
    );
    if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
      drawTempoMarkerLabel(context, {
        type: "scroll",
        timeSec: scrollChange.timeSec,
        y,
        label: formatScrollMarkerLabel(scrollChange.rate),
        side: "left",
        color: SCROLL_MARKER,
        x: leftLane.x - TEMPO_LABEL_GAP,
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
  const width = lane.width * TEMPO_MARKER_WIDTH_RATIO;
  if (side === "left") {
    // 左側はセパレーター線と重なりすぎないように 1px だけ内側へ寄せる。
    return {
      x: lane.x - width + LEFT_TEMPO_MARKER_SEPARATOR_COMPENSATION_PX,
      width,
    };
  }
  return {
    x: lane.x + lane.width,
    width,
  };
}

function drawLongBodiesEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
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
    const startY = beatToViewportY(noteStartBeat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    const endY = beatToViewportY(noteEndBeat, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    const topY = Math.max(Math.min(startY, endY), -NOTE_HEAD_HEIGHT - 24);
    const bottomY = Math.min(Math.max(startY, endY), editorFrameState.viewportHeight + NOTE_HEAD_HEIGHT + 24);
    const bodyHeight = Math.max(bottomY - topY, 2);
    context.fillStyle = dimColor(lane.note, 0.42);
    context.fillRect(lane.x, topY, lane.width, bodyHeight);
  }
  context.restore();
}

function drawNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
  context.save();
  const noteWindow = getBeatWindowIndices(model.notesByBeat, editorFrameState.startBeat, editorFrameState.endBeat);
  for (let index = noteWindow.startIndex; index < noteWindow.endIndex; index += 1) {
    const note = model.notesByBeat[index];
    const lane = lanes[note.lane];
    if (!lane || note.kind === "invisible") {
      continue;
    }

    const headY = beatToViewportY(note.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    drawRectNote(context, lane, headY, note.kind === "mine" ? MINE_COLOR : lane.note);
  }

  const longEndWindow = getBeatWindowIndices(model.longNotesByEndBeat, editorFrameState.startBeat, editorFrameState.endBeat, getNoteEndBeat);
  for (let index = longEndWindow.startIndex; index < longEndWindow.endIndex; index += 1) {
    const note = model.longNotesByEndBeat[index];
    const lane = lanes[note.lane];
    if (!lane || !shouldDrawLongEndCap(model, note)) {
      continue;
    }
    const endHeadY = beatToViewportY(getNoteEndBeat(note), editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    drawRectNote(context, lane, endHeadY, lane.note);
  }
  context.restore();
}

function drawInvisibleNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
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
    const headY = beatToViewportY(note.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    drawOutlinedRectNote(context, lane, headY, INVISIBLE_NOTE_COLOR);
  }
  context.restore();
}

function drawRectNote(context, lane, y, color) {
  context.fillStyle = color;
  context.fillRect(lane.x, Math.round(y - NOTE_HEAD_HEIGHT), lane.width, NOTE_HEAD_HEIGHT);
}

function drawOutlinedRectNote(context, lane, y, color) {
  const topY = Math.round(y - NOTE_HEAD_HEIGHT);
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.strokeRect(
    lane.x + 1.5,
    topY + 0.5,
    Math.max(lane.width - 2, 1),
    Math.max(NOTE_HEAD_HEIGHT - 1, 1),
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

function drawLaneSeparators(context, lanes, viewportHeight) {
  if (lanes.length === 0) {
    return;
  }
  context.save();
  context.strokeStyle = SEPARATOR_COLOR;
  context.lineWidth = 1;
  const uniqueBoundaries = new Set();
  uniqueBoundaries.add(Math.round(lanes[0].x));
  for (const lane of lanes) {
    uniqueBoundaries.add(Math.round(lane.x));
    uniqueBoundaries.add(Math.round(lane.x + lane.width));
  }
  for (const x of [...uniqueBoundaries].sort((left, right) => left - right)) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, viewportHeight);
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
      rightX: 0,
    };
  }
  return {
    leftX: leftLane.x,
    rightX: rightLane.x + rightLane.width,
  };
}

function drawDpGutter(context, laneLayout, viewportHeight) {
  const gutterRect = laneLayout?.gutterRect;
  if (!gutterRect || !(gutterRect.width > 0)) {
    return;
  }
  context.save();
  context.fillStyle = DP_GUTTER_FILL;
  context.fillRect(gutterRect.x, 0, gutterRect.width, viewportHeight);
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
      rightX: 0,
    },
  };
}

function createLaneLayout(mode, laneCount, viewportWidth) {
  const layout = getModeLayout(mode, laneCount);
  const gutterWidth = layout.splitAfter === null ? 0 : FIXED_LANE_WIDTH * DP_GUTTER_UNITS;
  const contentWidth = layout.display.length * FIXED_LANE_WIDTH + gutterWidth;
  const startX = Math.max(VIEWER_LANE_SIDE_PADDING, Math.floor((viewportWidth - contentWidth) / 2));
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
    lanes[slot.actualLane] = {
      lane: slot.actualLane,
      x: cursorX,
      width: FIXED_LANE_WIDTH,
      note: slot.note,
    };
    cursorX += FIXED_LANE_WIDTH;
  }

  return {
    lanes,
    gutterRect,
  };
}

function getModeLayout(mode, laneCount) {
  switch (mode) {
    case "5k":
      return createDisplayLayout([0, 1, 2, 3, 4, 5], null, (slotIndex) => getBeatNoteColor(`g${slotIndex}`));
    case "7k":
      return createDisplayLayout([0, 1, 2, 3, 4, 5, 6, 7], null, (slotIndex) => getBeatNoteColor(String(slotIndex)));
    case "10k":
      return createDisplayLayout(
        [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 6],
        6,
        (slotIndex) => getBeatNoteColor(`g${slotIndex}`),
      );
    case "14k":
      return createDisplayLayout(
        [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8],
        8,
        (slotIndex) => getBeatNoteColor(String(slotIndex)),
      );
    case "popn-5k":
      return createDisplayLayout([0, 1, 2, 3, 4], null, (slotIndex) => getPopnNoteColor(slotIndex));
    case "popn-9k":
    case "9k":
      return createDisplayLayout(
        Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
        null,
        (slotIndex) => getPopnNoteColor(slotIndex),
      );
    default:
      return createDisplayLayout(
        Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
        null,
        () => "#bebebe",
      );
  }
}

function createDisplayLayout(displayOrder, splitAfter, getColor) {
  return {
    splitAfter,
    display: displayOrder.map((actualLane, slotIndex) => ({
      actualLane,
      note: getColor(slotIndex),
    })),
  };
}

function getBeatNoteColor(key) {
  return BEAT_LANE_COLORS.get(key) ?? "#bebebe";
}

function getPopnNoteColor(slotIndex) {
  return POPN_LANE_COLORS.get(`p${slotIndex}`) ?? "#c4c4c4";
}

function timeToViewportY(eventTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond) {
  return viewportHeight / 2 - (eventTimeSec - selectedTimeSec) * pixelsPerSecond;
}

function beatToViewportY(eventBeat, selectedBeat, viewportHeight, pixelsPerBeat) {
  return viewportHeight / 2 - (eventBeat - selectedBeat) * pixelsPerBeat;
}

function gameTrackPositionToViewportY(eventTrackPosition, selectedTrackPosition, viewportHeight, pixelsPerBeat) {
  return viewportHeight / 2 - (eventTrackPosition - selectedTrackPosition) * pixelsPerBeat;
}

function isViewportYVisible(y, viewportHeight, margin = NOTE_HEAD_HEIGHT + 24) {
  return y >= -margin && y <= viewportHeight + margin;
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
