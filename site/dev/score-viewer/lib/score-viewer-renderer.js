import {
  VIEWER_PIXELS_PER_SECOND,
  getVisibleTimeRange,
  shouldDrawLongEndCap,
} from "./score-viewer-model.js";

const HORIZONTAL_PADDING = 16;
const DP_GUTTER_UNITS = 1.2;
const FIXED_LANE_WIDTH = 44;
const BACKGROUND_FILL = "#000000";
const SEPARATOR_COLOR = "rgba(72, 72, 72, 0.95)";
const BAR_LINE = "rgba(255, 255, 255, 0.92)";
const BPM_MARKER = "rgba(90, 170, 110, 0.82)";
const STOP_MARKER = "rgba(200, 156, 80, 0.82)";
const MINE_COLOR = "#880000";
const NOTE_HEAD_HEIGHT = 10;

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

  function resize(nextWidth, nextHeight) {
    width = Math.max(1, Math.floor(nextWidth));
    height = Math.max(1, Math.floor(nextHeight));
    dpr = typeof window === "undefined" ? 1 : Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render(model, selectedTimeSec) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = BACKGROUND_FILL;
    context.fillRect(0, 0, width, height);

    if (!model) {
      return;
    }

    const lanes = createLaneLayout(model.score.mode, model.score.laneCount, width);
    const { startTimeSec, endTimeSec } = getVisibleTimeRange(model, selectedTimeSec, height);

    drawBarLines(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height);
    drawTempoMarkers(context, model.bpmChanges, model.stops, lanes, selectedTimeSec, startTimeSec, endTimeSec, height);
    drawLongBodies(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height);
    drawNoteHeads(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height);
    drawLaneSeparators(context, lanes, height);
  }

  return { resize, render };
}

function drawBarLines(context, barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight) {
  if (lanes.length === 0) {
    return;
  }
  const leftX = lanes[0].x;
  const rightX = lanes[lanes.length - 1].x + lanes[lanes.length - 1].width;
  context.save();
  context.strokeStyle = BAR_LINE;
  context.lineWidth = 1;
  for (const barLine of barLines) {
    if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
      continue;
    }
    const y = timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight);
    context.beginPath();
    context.moveTo(leftX, y + 0.5);
    context.lineTo(rightX, y + 0.5);
    context.stroke();
  }
  context.restore();
}

function drawTempoMarkers(context, bpmChanges, stops, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight) {
  if (lanes.length === 0) {
    return;
  }
  const leftX = lanes[0].x;
  const rightX = lanes[lanes.length - 1].x + lanes[lanes.length - 1].width;

  context.save();
  context.lineWidth = 2;

  context.strokeStyle = BPM_MARKER;
  for (const bpmChange of bpmChanges) {
    if (bpmChange.timeSec < startTimeSec || bpmChange.timeSec > endTimeSec) {
      continue;
    }
    const y = timeToViewportY(bpmChange.timeSec, selectedTimeSec, viewportHeight);
    context.beginPath();
    context.moveTo(rightX - 14, y + 0.5);
    context.lineTo(rightX, y + 0.5);
    context.stroke();
  }

  context.strokeStyle = STOP_MARKER;
  for (const stop of stops) {
    if (stop.timeSec < startTimeSec || stop.timeSec > endTimeSec) {
      continue;
    }
    const y = timeToViewportY(stop.timeSec, selectedTimeSec, viewportHeight);
    context.beginPath();
    context.moveTo(leftX, y + 0.5);
    context.lineTo(leftX + 14, y + 0.5);
    context.stroke();
  }

  context.restore();
}

function drawLongBodies(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight) {
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
    const startY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight);
    const endY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight);
    const topY = Math.max(Math.min(startY, endY), -NOTE_HEAD_HEIGHT - 24);
    const bottomY = Math.min(Math.max(startY, endY), viewportHeight + NOTE_HEAD_HEIGHT + 24);
    const bodyHeight = Math.max(bottomY - topY, 2);
    context.fillStyle = dimColor(lane.note, 0.42);
    context.fillRect(lane.x, topY, lane.width, bodyHeight);
  }
  context.restore();
}

function drawNoteHeads(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight) {
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

    const headY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight);
    drawRectNote(context, lane, headY, note.kind === "mine" ? MINE_COLOR : lane.note);

    if (note.kind === "long" && Number.isFinite(note.endTimeSec) && shouldDrawLongEndCap(model, note)) {
      const endHeadY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight);
      drawRectNote(context, lane, endHeadY, lane.note);
    }
  }
  context.restore();
}

function drawRectNote(context, lane, y, color) {
  context.fillStyle = color;
  context.fillRect(lane.x, Math.round(y - NOTE_HEAD_HEIGHT), lane.width, NOTE_HEAD_HEIGHT);
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

function createLaneLayout(mode, laneCount, viewportWidth) {
  const layout = getModeLayout(mode, laneCount);
  const gutterWidth = layout.splitAfter === null ? 0 : FIXED_LANE_WIDTH * DP_GUTTER_UNITS;
  const contentWidth = layout.display.length * FIXED_LANE_WIDTH + gutterWidth;
  const startX = Math.max(HORIZONTAL_PADDING, Math.floor((viewportWidth - contentWidth) / 2));
  const lanes = new Array(Math.max(1, laneCount));

  let cursorX = startX;
  for (let slotIndex = 0; slotIndex < layout.display.length; slotIndex += 1) {
    if (layout.splitAfter !== null && slotIndex === layout.splitAfter) {
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

  return lanes;
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

function timeToViewportY(eventTimeSec, selectedTimeSec, viewportHeight) {
  return viewportHeight / 2 - (eventTimeSec - selectedTimeSec) * VIEWER_PIXELS_PER_SECOND;
}

function dimColor(color, factor) {
  if (!color.startsWith("#")) {
    return color;
  }
  const [red, green, blue] = hexToRgb(color);
  return `rgb(${Math.round(red * factor)}, ${Math.round(green * factor)}, ${Math.round(blue * factor)})`;
}

function hexToRgb(color) {
  const normalized = color.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return [red, green, blue];
}
