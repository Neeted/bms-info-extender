// このファイルは script/build_preview_targets.mjs により生成されます。手編集しないでください。

// shared/preview-runtime/score-viewer-model.js
var DEFAULT_VIEWER_PIXELS_PER_SECOND = 160;
var DEFAULT_EDITOR_PIXELS_PER_BEAT = 64;
var DEFAULT_VIEWER_MODE = "time";
var DEFAULT_INVISIBLE_NOTE_VISIBILITY = "hide";
var TIME_SELECTION_EPSILON_SEC = 5e-4;
var BEAT_SELECTION_EPSILON = 1e-6;
var ACTION_PRECEDENCE = {
  bpm: 1,
  stop: 2
};
function normalizeViewerMode(value) {
  return value === "editor" || value === "game" || value === "time" ? value : DEFAULT_VIEWER_MODE;
}
function resolveViewerModeForModel(model, viewerMode) {
  const normalizedMode = normalizeViewerMode(viewerMode);
  if (normalizedMode === "editor" && model?.supportsEditorMode) {
    return "editor";
  }
  return DEFAULT_VIEWER_MODE;
}
function normalizeInvisibleNoteVisibility(value) {
  return value === "show" ? "show" : DEFAULT_INVISIBLE_NOTE_VISIBILITY;
}
function createScoreViewerModel(score) {
  if (!score) {
    return null;
  }
  const allNotes = score.notes.map((note) => ({ ...note })).sort(compareNoteLike);
  const notes = allNotes.filter((note) => note.kind !== "invisible");
  const invisibleNotes = allNotes.filter((note) => note.kind === "invisible");
  const comboEvents = (score.comboEvents?.length > 0 ? score.comboEvents : createFallbackComboEvents(score.notes)).map((event) => ({ ...event })).sort(compareComboEvent).map((event, index) => ({
    ...event,
    combo: index + 1
  }));
  const longEndEventKeys = new Set(
    comboEvents.filter((event) => event.kind === "long-end").map(createTimedLaneKey)
  );
  const beatTimingIndex = createBeatTimingIndex(score);
  const totalBeat = getScoreTotalBeat(score);
  const editorNotes = notes.filter((note) => Number.isFinite(note.beat));
  const editorInvisibleNotes = invisibleNotes.filter((note) => Number.isFinite(note.beat));
  const notesByBeat = [...editorNotes].sort(compareBeatNoteLike);
  const invisibleNotesByBeat = [...editorInvisibleNotes].sort(compareBeatNoteLike);
  const longNotesByBeat = notesByBeat.filter((note) => note.kind === "long" && Number.isFinite(note.endBeat ?? note.beat));
  const longNotesByEndBeat = [...longNotesByBeat].sort(compareLongNoteEndBeat);
  const measureRanges = createEditorMeasureRanges(score.barLines, totalBeat);
  return {
    score,
    notes,
    invisibleNotes,
    notesByBeat,
    invisibleNotesByBeat,
    longNotesByBeat,
    longNotesByEndBeat,
    measureRanges,
    comboEvents,
    longEndEventKeys,
    barLines: [...score.barLines].sort(compareTimedBeatLike),
    bpmChanges: [...score.bpmChanges].sort(compareTimedBeatLike),
    stops: [...score.stops].sort(compareTimedBeatLike),
    scrollChanges: [...score.scrollChanges ?? []].sort(compareTimedBeatLike),
    totalCombo: comboEvents.length,
    beatTimingIndex,
    totalBeat,
    supportsEditorMode: Boolean(beatTimingIndex && Number.isFinite(totalBeat))
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
function getVisibleTimeRange(model, selectedTimeSec, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
  if (!model) {
    return { startTimeSec: 0, endTimeSec: 0 };
  }
  const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
  const halfViewportSec = viewportHeight / pixelsPerSecond / 2;
  const overscanSec = Math.max(halfViewportSec * 0.35, 0.75);
  return {
    startTimeSec: Math.max(0, clampedTimeSec - halfViewportSec - overscanSec),
    endTimeSec: Math.min(getScoreTotalDurationSec(model.score), clampedTimeSec + halfViewportSec + overscanSec)
  };
}
function getEditorFrameStateForBeat(model, selectedBeat, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
  if (!model) {
    return {
      selectedBeat: 0,
      startBeat: 0,
      endBeat: 0,
      viewportHeight: Math.max(viewportHeight, 0)
    };
  }
  const clampedBeat = getClampedSelectedBeat(model, selectedBeat);
  const halfViewportBeat = viewportHeight / pixelsPerBeat / 2;
  const overscanBeat = Math.max(halfViewportBeat * 0.35, 1);
  return {
    selectedBeat: clampedBeat,
    startBeat: Math.max(0, clampedBeat - halfViewportBeat - overscanBeat),
    endBeat: Math.min(model.totalBeat ?? 0, clampedBeat + halfViewportBeat + overscanBeat),
    viewportHeight
  };
}
function getEditorFrameState(model, selectedTimeSec, viewportHeight, pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT) {
  return getEditorFrameStateForBeat(
    model,
    getBeatAtTimeSec(model, selectedTimeSec),
    viewportHeight,
    pixelsPerBeat
  );
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
    beat: resolvedMode === "editor" ? selectedBeat : 0,
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
      segments.push({
        type: "linear",
        startSec: currentSeconds,
        endSec: nextSeconds,
        startBeat: currentBeat,
        endBeat: actionBeat
      });
      currentBeat = actionBeat;
      currentSeconds = nextSeconds;
    } else {
      currentSeconds = actionTimeSec;
    }
    if (action.type === "bpm") {
      currentBpm = action.bpm;
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
      const actionIndex = upperBoundActionsByBeat(actions, normalizedBeat) - 1;
      if (actionIndex < 0) {
        return normalizedBeat * 60 / initialBpm;
      }
      return stateSeconds[actionIndex] + (normalizedBeat - stateBeats[actionIndex]) * 60 / stateBpms[actionIndex];
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
function createTimingActionsFromCanonicalScore(score) {
  return [...score?.timingActions ?? []].filter((action) => Number.isFinite(action?.beat) && action.type === "bpm" && Number.isFinite(action?.bpm) && action.bpm > 0 || Number.isFinite(action?.beat) && action.type === "stop" && Number.isFinite(action?.stopBeats) && action.stopBeats > 0).map((action) => {
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
      durationSec: action.durationSec
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
function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}
function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

// shared/preview-runtime/score-viewer-renderer.js
var VIEWER_LANE_SIDE_PADDING = 6;
var DP_GUTTER_UNITS = 1.2;
var FIXED_LANE_WIDTH = 16;
var BACKGROUND_FILL = "#000000";
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
var TEMPO_MARKER_WIDTH_RATIO = 0.5;
var TEMPO_LABEL_GAP = 8;
var TEMPO_LABEL_MIN_GAP = 12;
var LEFT_TEMPO_MARKER_SEPARATOR_COMPENSATION_PX = 1;
var JUDGE_LINE_SIDE_OVERHANG = FIXED_LANE_WIDTH * 3;
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
function createScoreViewerRenderer(canvas) {
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
  function render2(model, selectedTimeSec, {
    viewerMode = DEFAULT_VIEWER_MODE,
    pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND,
    pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
    editorFrameState = null,
    showInvisibleNotes = false
  } = {}) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = BACKGROUND_FILL;
    context.fillRect(0, 0, width, height);
    if (!model) {
      return createEmptyRenderResult();
    }
    const lanes = createLaneLayout(model.score.mode, model.score.laneCount, width);
    const resolvedMode = resolveViewerModeForModel(model, viewerMode);
    if (resolvedMode === "time") {
      return renderTimeMode(model, lanes, selectedTimeSec, pixelsPerSecond, showInvisibleNotes);
    }
    return renderEditorMode(
      model,
      lanes,
      editorFrameState ?? getEditorFrameState(model, selectedTimeSec, height, pixelsPerBeat),
      pixelsPerBeat,
      showInvisibleNotes
    );
  }
  return { resize, render: render2 };
  function renderTimeMode(model, lanes, selectedTimeSec, pixelsPerSecond, showInvisibleNotes) {
    const { startTimeSec, endTimeSec } = getVisibleTimeRange(model, selectedTimeSec, height, pixelsPerSecond);
    drawBarLinesTimeMode(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    drawLongBodiesTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    drawNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    if (showInvisibleNotes) {
      drawInvisibleNoteHeadsTimeMode(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
    }
    drawLaneSeparators(context, lanes, height);
    const markers = drawTempoMarkersTimeMode(
      context,
      model.bpmChanges,
      model.stops,
      model.scrollChanges,
      lanes,
      selectedTimeSec,
      startTimeSec,
      endTimeSec,
      height,
      pixelsPerSecond
    );
    return {
      markers,
      laneBounds: getLaneBounds(lanes)
    };
  }
  function renderEditorMode(model, lanes, editorFrameState, pixelsPerBeat, showInvisibleNotes) {
    drawEditorSubGrid(context, model.measureRanges, lanes, editorFrameState, pixelsPerBeat);
    drawBarLinesEditorMode(context, model.barLines, lanes, editorFrameState, pixelsPerBeat);
    drawLongBodiesEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
    drawNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
    if (showInvisibleNotes) {
      drawInvisibleNoteHeadsEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat);
    }
    drawLaneSeparators(context, lanes, height);
    const markers = drawTempoMarkersEditorMode(
      context,
      model,
      lanes,
      editorFrameState,
      pixelsPerBeat
    );
    return {
      markers,
      laneBounds: getLaneBounds(lanes)
    };
  }
}
function estimateViewerWidth(mode, laneCount) {
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
function drawTempoMarkersTimeMode(context, bpmChanges, stops, scrollChanges, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
  const { leftLane, rightLane } = getVisualLaneEdges(lanes);
  if (!leftLane || !rightLane) {
    return [];
  }
  const markers = [];
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
      markers.push({
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
    const y = timeToViewportY(stop.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillRect(markerRect.x, Math.round(y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
    if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
      markers.push({
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
  context.fillStyle = SCROLL_MARKER;
  for (const scrollChange of scrollChanges) {
    if (scrollChange.timeSec < startTimeSec || scrollChange.timeSec > endTimeSec) {
      continue;
    }
    const y = timeToViewportY(scrollChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillRect(markerRect.x, Math.round(y - TEMPO_MARKER_HEIGHT / 2), markerRect.width, TEMPO_MARKER_HEIGHT);
    if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
      markers.push({
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
  return markers;
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
    editorFrameState.endBeat
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
function drawTempoMarkersEditorMode(context, model, lanes, editorFrameState, pixelsPerBeat) {
  const { leftLane, rightLane } = getVisualLaneEdges(lanes);
  if (!leftLane || !rightLane) {
    return [];
  }
  const markers = [];
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
      TEMPO_MARKER_HEIGHT
    );
    if (shouldKeepTempoMarkerLabel(lastBpmLabelY, y)) {
      markers.push({
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
    const y = beatToViewportY(stop.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillRect(
      markerRect.x,
      Math.round(y - TEMPO_MARKER_HEIGHT / 2),
      markerRect.width,
      TEMPO_MARKER_HEIGHT
    );
    if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
      markers.push({
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
  context.fillStyle = SCROLL_MARKER;
  for (let index = scrollWindow.startIndex; index < scrollWindow.endIndex; index += 1) {
    const scrollChange = model.scrollChanges[index];
    const y = beatToViewportY(scrollChange.beat ?? 0, editorFrameState.selectedBeat, editorFrameState.viewportHeight, pixelsPerBeat);
    const markerRect = getTempoMarkerRect(leftLane, "left");
    context.fillRect(
      markerRect.x,
      Math.round(y - TEMPO_MARKER_HEIGHT / 2),
      markerRect.width,
      TEMPO_MARKER_HEIGHT
    );
    if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
      markers.push({
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
  return markers;
}
function shouldKeepTempoMarkerLabel(lastAcceptedY, nextY) {
  return !Number.isFinite(lastAcceptedY) || Math.abs(nextY - lastAcceptedY) >= TEMPO_LABEL_MIN_GAP;
}
function getTempoMarkerRect(lane, side) {
  const width = lane.width * TEMPO_MARKER_WIDTH_RATIO;
  if (side === "left") {
    return {
      x: lane.x - width + LEFT_TEMPO_MARKER_SEPARATOR_COMPENSATION_PX,
      width
    };
  }
  return {
    x: lane.x + lane.width,
    width
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
    Math.max(NOTE_HEAD_HEIGHT - 1, 1)
  );
}
function drawLaneSeparators(context, lanes, viewportHeight) {
  if (lanes.length === 0) {
    return;
  }
  context.save();
  context.strokeStyle = SEPARATOR_COLOR;
  context.lineWidth = 1;
  const uniqueBoundaries = /* @__PURE__ */ new Set();
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
function getLaneBounds(lanes) {
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
  const gutterWidth = layout.splitAfter === null ? 0 : FIXED_LANE_WIDTH * DP_GUTTER_UNITS;
  const contentWidth = layout.display.length * FIXED_LANE_WIDTH + gutterWidth;
  const startX = Math.max(VIEWER_LANE_SIDE_PADDING, Math.floor((viewportWidth - contentWidth) / 2));
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
      note: slot.note
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
        (slotIndex) => getBeatNoteColor(`g${slotIndex}`)
      );
    case "14k":
      return createDisplayLayout(
        [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8],
        8,
        (slotIndex) => getBeatNoteColor(String(slotIndex))
      );
    case "popn-5k":
      return createDisplayLayout([0, 1, 2, 3, 4], null, (slotIndex) => getPopnNoteColor(slotIndex));
    case "popn-9k":
    case "9k":
      return createDisplayLayout(
        Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
        null,
        (slotIndex) => getPopnNoteColor(slotIndex)
      );
    default:
      return createDisplayLayout(
        Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
        null,
        () => "#bebebe"
      );
  }
}
function createDisplayLayout(displayOrder, splitAfter, getColor) {
  return {
    splitAfter,
    display: displayOrder.map((actualLane, slotIndex) => ({
      actualLane,
      note: getColor(slotIndex)
    }))
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
var SPACING_STEP = 0.01;
var DEFAULT_SPACING_SCALE = 1;
function createScoreViewerController({
  root,
  onTimeChange = () => {
  },
  onPlaybackToggle = () => {
  },
  onViewerModeChange = () => {
  },
  onInvisibleNoteVisibilityChange = () => {
  }
}) {
  const scrollHost = document.createElement("div");
  scrollHost.className = "score-viewer-scroll-host";
  const spacer = document.createElement("div");
  spacer.className = "score-viewer-spacer";
  scrollHost.appendChild(spacer);
  const canvas = document.createElement("canvas");
  canvas.className = "score-viewer-canvas";
  const markerOverlay = document.createElement("div");
  markerOverlay.className = "score-viewer-marker-overlay";
  const markerLabelsLeft = document.createElement("div");
  markerLabelsLeft.className = "score-viewer-marker-labels is-left";
  const markerLabelsRight = document.createElement("div");
  markerLabelsRight.className = "score-viewer-marker-labels is-right";
  markerOverlay.append(markerLabelsLeft, markerLabelsRight);
  const bottomBar = document.createElement("div");
  bottomBar.className = "score-viewer-bottom-bar";
  const statusPanel = document.createElement("div");
  statusPanel.className = "score-viewer-status-panel";
  const playbackRow = document.createElement("div");
  playbackRow.className = "score-viewer-status-row is-time";
  const playbackButton = document.createElement("button");
  playbackButton.className = "score-viewer-playback-button";
  playbackButton.type = "button";
  playbackButton.setAttribute("aria-label", "Play score viewer");
  playbackButton.textContent = "▶";
  const playbackTime = document.createElement("span");
  playbackTime.className = "score-viewer-playback-time";
  playbackRow.append(playbackButton, playbackTime);
  const measureRow = document.createElement("div");
  measureRow.className = "score-viewer-status-row score-viewer-status-metric";
  const comboRow = document.createElement("div");
  comboRow.className = "score-viewer-status-row score-viewer-status-metric";
  const spacingRow = document.createElement("div");
  spacingRow.className = "score-viewer-status-row score-viewer-spacing-row";
  const spacingTitle = document.createElement("span");
  spacingTitle.className = "score-viewer-spacing-title";
  spacingTitle.textContent = "Spacing";
  const spacingValue = document.createElement("span");
  spacingValue.className = "score-viewer-spacing-value";
  spacingRow.append(spacingTitle, spacingValue);
  const spacingInput = document.createElement("input");
  spacingInput.className = "score-viewer-spacing-input";
  spacingInput.type = "range";
  spacingInput.min = String(MIN_SPACING_SCALE);
  spacingInput.max = String(MAX_SPACING_SCALE);
  spacingInput.step = String(SPACING_STEP);
  spacingInput.value = String(DEFAULT_SPACING_SCALE);
  const modeRow = document.createElement("div");
  modeRow.className = "score-viewer-status-row score-viewer-mode-row";
  const modeTitle = document.createElement("span");
  modeTitle.className = "score-viewer-mode-title";
  modeTitle.textContent = "Mode";
  const modeControls = document.createElement("div");
  modeControls.className = "score-viewer-mode-controls";
  const modeSelect = document.createElement("select");
  modeSelect.className = "score-viewer-mode-select";
  modeSelect.append(
    createModeOption("time", "Time"),
    createModeOption("editor", "Editor"),
    createModeOption("game", "Game", true)
  );
  const invisibleNoteVisibilitySelect = document.createElement("select");
  invisibleNoteVisibilitySelect.className = "score-viewer-mode-select score-viewer-invisible-note-select";
  invisibleNoteVisibilitySelect.append(
    createModeOption("hide", "INVISIBLE Hide"),
    createModeOption("show", "INVISIBLE Show")
  );
  modeControls.append(modeSelect, invisibleNoteVisibilitySelect);
  modeRow.append(modeTitle, modeControls);
  statusPanel.append(playbackRow, measureRow, comboRow, spacingRow, spacingInput, modeRow);
  bottomBar.append(statusPanel);
  const judgeLine = document.createElement("div");
  judgeLine.className = "score-viewer-judge-line";
  root.replaceChildren(scrollHost, canvas, markerOverlay, bottomBar, judgeLine);
  const renderer = createScoreViewerRenderer(canvas);
  const state2 = {
    model: null,
    selectedTimeSec: 0,
    selectedBeat: 0,
    isPinned: false,
    isOpen: false,
    isPlaying: false,
    spacingScale: DEFAULT_SPACING_SCALE,
    viewerMode: DEFAULT_VIEWER_MODE,
    invisibleNoteVisibility: DEFAULT_INVISIBLE_NOTE_VISIBILITY
  };
  const uiState = {
    playbackButtonDisabled: null,
    playbackButtonText: null,
    playbackButtonLabel: null,
    playbackTime: null,
    measureText: null,
    comboText: null,
    spacingText: null,
    spacingInputValue: null,
    modeSelectValue: null,
    modeSelectDisabled: null,
    invisibleNoteVisibilityValue: null,
    invisibleNoteVisibilityDisabled: null
  };
  let ignoreScrollUntilNextFrame = false;
  let resizeObserver = null;
  let dragState = null;
  let editorFrameStateCache = null;
  scrollHost.addEventListener("scroll", () => {
    syncTimeFromScrollPosition();
  });
  scrollHost.addEventListener("wheel", (event) => {
    if (!state2.model || !state2.isOpen || !isScrollInteractive()) {
      return;
    }
    scrollHost.scrollTop += normalizeWheelDeltaY(event.deltaY, event.deltaMode, scrollHost.clientHeight);
    syncTimeFromScrollPosition({ force: true });
    event.preventDefault();
  }, { passive: false });
  scrollHost.addEventListener("pointerdown", (event) => {
    if (!canDragScroll(event)) {
      return;
    }
    dragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scrollHost.scrollTop
    };
    scrollHost.classList.add("is-dragging");
    if (typeof scrollHost.setPointerCapture === "function") {
      scrollHost.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  scrollHost.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const deltaY = event.clientY - dragState.startY;
    scrollHost.scrollTop = dragState.startScrollTop + deltaY;
    syncTimeFromScrollPosition({ force: true });
    event.preventDefault();
  });
  scrollHost.addEventListener("pointerup", handlePointerRelease);
  scrollHost.addEventListener("pointercancel", handlePointerRelease);
  scrollHost.addEventListener("lostpointercapture", handlePointerRelease);
  spacingInput.addEventListener("input", () => {
    const nextScale = clampScale(Number.parseFloat(spacingInput.value));
    if (Math.abs(nextScale - state2.spacingScale) < 5e-4) {
      spacingValue.textContent = formatSpacingScale(state2.spacingScale);
      return;
    }
    state2.spacingScale = nextScale;
    spacingValue.textContent = formatSpacingScale(state2.spacingScale);
    refreshLayout();
  });
  modeSelect.addEventListener("change", () => {
    const nextMode = normalizeViewerMode(modeSelect.value);
    if (nextMode === "game") {
      modeSelect.value = getResolvedViewerMode2();
      return;
    }
    if (nextMode === "editor" && !state2.model?.supportsEditorMode) {
      modeSelect.value = getResolvedViewerMode2();
      return;
    }
    if (nextMode === state2.viewerMode) {
      return;
    }
    state2.viewerMode = nextMode;
    onViewerModeChange(state2.viewerMode);
    refreshLayout();
  });
  invisibleNoteVisibilitySelect.addEventListener("change", () => {
    const nextVisibility = normalizeInvisibleNoteVisibility(invisibleNoteVisibilitySelect.value);
    if (nextVisibility === state2.invisibleNoteVisibility) {
      return;
    }
    state2.invisibleNoteVisibility = nextVisibility;
    onInvisibleNoteVisibilityChange(state2.invisibleNoteVisibility);
    renderScene();
  });
  playbackButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state2.model) {
      return;
    }
    onPlaybackToggle(!state2.isPlaying);
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
    if (state2.model === model) {
      return;
    }
    state2.model = model;
    state2.selectedTimeSec = getClampedSelectedTimeSec(state2.model, state2.selectedTimeSec);
    state2.selectedBeat = getBeatAtTimeSec(state2.model, state2.selectedTimeSec);
    editorFrameStateCache = null;
    updateRootWidth();
    refreshLayout();
  }
  function setSelectedTimeSec2(timeSec, { beatHint } = {}) {
    const clampedTimeSec = getClampedSelectedTimeSec(state2.model, timeSec);
    const resolvedViewerMode = getResolvedViewerMode2();
    const nextBeat = resolvedViewerMode === "editor" ? resolveSelectedBeat2(clampedTimeSec, beatHint) : getBeatAtTimeSec(state2.model, clampedTimeSec);
    if (!hasViewerSelectionChanged(
      state2.model,
      resolvedViewerMode,
      state2.selectedTimeSec,
      clampedTimeSec,
      state2.selectedBeat,
      nextBeat
    ) && state2.model) {
      syncScrollPosition();
      renderScene();
      return;
    }
    state2.selectedTimeSec = clampedTimeSec;
    state2.selectedBeat = nextBeat;
    editorFrameStateCache = null;
    syncScrollPosition();
    renderScene();
  }
  function setPinned(nextPinned) {
    state2.isPinned = Boolean(nextPinned);
    updateScrollInteractivity();
    renderScene();
  }
  function setOpen(nextOpen) {
    state2.isOpen = Boolean(nextOpen);
    root.classList.toggle("is-visible", state2.isOpen && Boolean(state2.model));
    syncScrollPosition();
    renderScene();
  }
  function setPlaybackState(nextPlaying) {
    state2.isPlaying = Boolean(nextPlaying);
    updateScrollInteractivity();
    renderScene();
  }
  function setViewerMode(nextViewerMode) {
    const normalizedMode = normalizeViewerMode(nextViewerMode);
    const resolvedInputMode = normalizedMode === "game" ? DEFAULT_VIEWER_MODE : normalizedMode;
    if (state2.viewerMode === resolvedInputMode) {
      renderScene();
      return;
    }
    state2.viewerMode = resolvedInputMode;
    state2.selectedBeat = getBeatAtTimeSec(state2.model, state2.selectedTimeSec);
    editorFrameStateCache = null;
    refreshLayout();
  }
  function setInvisibleNoteVisibility(nextVisibility) {
    const normalizedVisibility = normalizeInvisibleNoteVisibility(nextVisibility);
    if (state2.invisibleNoteVisibility === normalizedVisibility) {
      renderScene();
      return;
    }
    state2.invisibleNoteVisibility = normalizedVisibility;
    renderScene();
  }
  function setEmptyState(_title, _message) {
  }
  function syncScrollPosition() {
    if (!state2.model) {
      scrollHost.scrollTop = 0;
      return;
    }
    ignoreScrollUntilNextFrame = true;
    const viewportHeight = root.clientHeight || 0;
    if (getResolvedViewerMode2() === "editor") {
      scrollHost.scrollTop = getEditorScrollTopForBeat(
        state2.model,
        state2.selectedBeat,
        viewportHeight,
        getPixelsPerBeat()
      );
    } else {
      scrollHost.scrollTop = getScrollTopForResolvedMode(
        state2.model,
        state2.selectedTimeSec,
        viewportHeight
      );
    }
    requestAnimationFrame(() => {
      ignoreScrollUntilNextFrame = false;
    });
  }
  function syncTimeFromScrollPosition({ force = false } = {}) {
    if (!state2.model || !state2.isOpen || !isScrollInteractive()) {
      return;
    }
    if (!force && ignoreScrollUntilNextFrame) {
      return;
    }
    const resolvedViewerMode = getResolvedViewerMode2();
    if (resolvedViewerMode === "editor") {
      const nextBeat = getClampedSelectedBeat(state2.model, scrollHost.scrollTop / getPixelsPerBeat());
      if (!hasViewerSelectionChanged(
        state2.model,
        resolvedViewerMode,
        state2.selectedTimeSec,
        state2.selectedTimeSec,
        state2.selectedBeat,
        nextBeat
      )) {
        return;
      }
      state2.selectedBeat = nextBeat;
      state2.selectedTimeSec = getTimeSecForBeat(state2.model, nextBeat);
      editorFrameStateCache = null;
      renderScene();
      onTimeChange({
        timeSec: state2.selectedTimeSec,
        beat: nextBeat,
        viewerMode: resolvedViewerMode,
        source: "scroll"
      });
      return;
    }
    const nextTimeSec = getTimeSecForResolvedMode(state2.model, scrollHost.scrollTop);
    if (!hasViewerSelectionChanged(state2.model, resolvedViewerMode, state2.selectedTimeSec, nextTimeSec)) {
      return;
    }
    state2.selectedTimeSec = nextTimeSec;
    state2.selectedBeat = getBeatAtTimeSec(state2.model, nextTimeSec);
    editorFrameStateCache = null;
    renderScene();
    onTimeChange({
      timeSec: nextTimeSec,
      beat: state2.selectedBeat,
      viewerMode: resolvedViewerMode,
      source: "scroll"
    });
  }
  function refreshLayout() {
    updateRootWidth();
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(260, root.clientHeight);
    renderer.resize(width, height);
    spacer.style.height = `${getContentHeightForResolvedMode(state2.model, height)}px`;
    syncScrollPosition();
    renderScene();
  }
  function renderScene() {
    const showScene = Boolean(state2.model && state2.isOpen);
    const resolvedViewerMode = getResolvedViewerMode2();
    const editorFrameState = resolvedViewerMode === "editor" ? getEditorFrameStateForCurrentView(root.clientHeight || 0) : null;
    const cursor = getViewerCursor(
      state2.model,
      state2.selectedTimeSec,
      resolvedViewerMode,
      state2.selectedBeat
    );
    canvas.hidden = !showScene;
    markerOverlay.hidden = !showScene;
    bottomBar.hidden = !showScene;
    judgeLine.hidden = !showScene;
    setDisabledIfChanged(playbackButton, !state2.model, "playbackButtonDisabled");
    setTextIfChanged(playbackButton, state2.isPlaying ? "❚❚" : "▶", "playbackButtonText");
    setAttributeIfChanged(
      playbackButton,
      "aria-label",
      state2.isPlaying ? "Pause score viewer" : "Play score viewer",
      "playbackButtonLabel"
    );
    setTextIfChanged(playbackTime, `${formatPlaybackTime(cursor.timeSec)} s`, "playbackTime");
    setTextIfChanged(
      measureRow,
      `Measure: ${formatMeasureCounter(cursor.measureIndex, cursor.totalMeasureIndex)}`,
      "measureText"
    );
    setTextIfChanged(comboRow, `Combo: ${cursor.comboCount}/${cursor.totalCombo}`, "comboText");
    setTextIfChanged(spacingValue, formatSpacingScale(state2.spacingScale), "spacingText");
    setValueIfChanged(spacingInput, String(state2.spacingScale), "spacingInputValue");
    setValueIfChanged(modeSelect, resolvedViewerMode, "modeSelectValue");
    setDisabledIfChanged(modeSelect, !state2.model, "modeSelectDisabled");
    setValueIfChanged(invisibleNoteVisibilitySelect, state2.invisibleNoteVisibility, "invisibleNoteVisibilityValue");
    setDisabledIfChanged(invisibleNoteVisibilitySelect, !state2.model, "invisibleNoteVisibilityDisabled");
    const renderResult = renderer.render(showScene ? state2.model : null, cursor.timeSec, {
      viewerMode: resolvedViewerMode,
      pixelsPerSecond: getPixelsPerSecond(),
      pixelsPerBeat: getPixelsPerBeat(),
      editorFrameState,
      showInvisibleNotes: state2.invisibleNoteVisibility === "show"
    });
    renderMarkerLabels(showScene ? renderResult.markers : []);
  }
  function renderMarkerLabels(markers) {
    markerLabelsLeft.replaceChildren();
    markerLabelsRight.replaceChildren();
    if (!Array.isArray(markers) || markers.length === 0) {
      return;
    }
    const leftMarkers = filterMarkerLabels(markers.filter((marker) => marker.side === "left"));
    const rightMarkers = filterMarkerLabels(markers.filter((marker) => marker.side === "right"));
    for (const marker of leftMarkers) {
      markerLabelsLeft.appendChild(createMarkerLabel(marker, "left"));
    }
    for (const marker of rightMarkers) {
      markerLabelsRight.appendChild(createMarkerLabel(marker, "right"));
    }
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
  spacingValue.textContent = formatSpacingScale(state2.spacingScale);
  modeSelect.value = DEFAULT_VIEWER_MODE;
  invisibleNoteVisibilitySelect.value = DEFAULT_INVISIBLE_NOTE_VISIBILITY;
  refreshLayout();
  return {
    setModel,
    setSelectedTimeSec: setSelectedTimeSec2,
    setPinned,
    setOpen,
    setPlaybackState,
    setViewerMode,
    setInvisibleNoteVisibility,
    setEmptyState,
    refreshLayout,
    destroy
  };
  function handlePointerRelease(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    clearDragState();
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
  }
  function canDragScroll(event) {
    return Boolean(
      state2.model && state2.isOpen && isScrollInteractive() && (event.button === 0 || event.pointerType === "touch" || event.pointerType === "pen")
    );
  }
  function isScrollInteractive() {
    return state2.isPinned || state2.isPlaying;
  }
  function updateRootWidth() {
    if (!state2.model) {
      root.style.removeProperty("--score-viewer-width");
      return;
    }
    root.style.setProperty(
      "--score-viewer-width",
      `${estimateViewerWidth(state2.model.score.mode, state2.model.score.laneCount)}px`
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
    return resolveViewerModeForModel(state2.model, state2.viewerMode);
  }
  function getPixelsPerSecond() {
    return DEFAULT_VIEWER_PIXELS_PER_SECOND * state2.spacingScale;
  }
  function getPixelsPerBeat() {
    return DEFAULT_EDITOR_PIXELS_PER_BEAT * state2.spacingScale;
  }
  function getEditorFrameStateForCurrentView(viewportHeight = root.clientHeight || 0) {
    if (!state2.model || getResolvedViewerMode2() !== "editor") {
      editorFrameStateCache = null;
      return null;
    }
    const pixelsPerBeat = getPixelsPerBeat();
    if (editorFrameStateCache && editorFrameStateCache.model === state2.model && Math.abs(editorFrameStateCache.selectedBeat - state2.selectedBeat) < 1e-6 && editorFrameStateCache.viewportHeight === viewportHeight && Math.abs(editorFrameStateCache.pixelsPerBeat - pixelsPerBeat) < 5e-4) {
      return editorFrameStateCache.frameState;
    }
    const frameState = getEditorFrameStateForBeat(
      state2.model,
      state2.selectedBeat,
      viewportHeight,
      pixelsPerBeat
    );
    editorFrameStateCache = {
      model: state2.model,
      selectedBeat: state2.selectedBeat,
      viewportHeight,
      pixelsPerBeat,
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
    if (!state2.model || getResolvedViewerMode2() !== "editor") {
      return 0;
    }
    if (Number.isFinite(beatHint)) {
      return getClampedSelectedBeat(state2.model, beatHint);
    }
    return getBeatAtTimeSec(state2.model, timeSec);
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
}
function createModeOption(value, label, disabled = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  return option;
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
function createMarkerLabel(marker, side) {
  const label = document.createElement("div");
  label.className = `score-viewer-marker-label is-${marker.type} is-${side}`;
  label.textContent = marker.label;
  label.style.top = `${marker.y}px`;
  label.style.color = marker.color;
  label.style.left = `${marker.x}px`;
  return label;
}
function filterMarkerLabels(markers) {
  const filtered = [];
  let lastY = Number.NEGATIVE_INFINITY;
  for (const marker of [...markers].sort((left, right) => left.y - right.y)) {
    if (Math.abs(marker.y - lastY) < 12) {
      continue;
    }
    filtered.push(marker);
    lastY = marker.y;
  }
  return filtered;
}
function clampScale(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SPACING_SCALE;
  }
  return Math.min(Math.max(value, MIN_SPACING_SCALE), MAX_SPACING_SCALE);
}
function formatSpacingScale(value) {
  return `${clampScale(value).toFixed(2)}x`;
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
function createBmsInfoGraph({
  scrollHost,
  canvas,
  tooltip,
  pinInput,
  onHoverTime = () => {
  },
  onHoverLeave = () => {
  },
  onSelectTime = () => {
  },
  onPinChange = () => {
  }
}) {
  const state2 = {
    record: null,
    selectedTimeSec: 0,
    isPinned: false
  };
  canvas.addEventListener("mousemove", (event) => {
    if (!state2.record) {
      hideTooltip(tooltip);
      return;
    }
    const timeSec = getHoverTimeSec(event, canvas);
    if (timeSec < 0 || timeSec > state2.record.distributionSegments.length) {
      hideTooltip(tooltip);
      return;
    }
    renderTooltip(tooltip, event, state2.record, timeSec);
    onHoverTime(timeSec);
  });
  canvas.addEventListener("mouseleave", () => {
    hideTooltip(tooltip);
    onHoverLeave();
  });
  canvas.addEventListener("click", (event) => {
    if (!state2.record) {
      return;
    }
    const timeSec = getHoverTimeSec(event, canvas);
    if (timeSec < 0) {
      return;
    }
    onSelectTime(timeSec);
  });
  pinInput.addEventListener("change", () => {
    onPinChange(pinInput.checked);
  });
  function setRecord(record) {
    state2.record = record;
    pinInput.disabled = !record;
    render2();
  }
  function setSelectedTimeSec2(timeSec) {
    state2.selectedTimeSec = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0;
    render2();
    syncScrollToSelected();
  }
  function setPinned(nextPinned) {
    state2.isPinned = Boolean(nextPinned);
    pinInput.checked = state2.isPinned;
    pinInput.disabled = !state2.record;
  }
  function render2() {
    const record = state2.record;
    if (!record) {
      canvas.width = 640;
      canvas.height = 180;
      const context2 = canvas.getContext("2d");
      context2.clearRect(0, 0, canvas.width, canvas.height);
      context2.fillStyle = "#000000";
      context2.fillRect(0, 0, canvas.width, canvas.height);
      drawSelectedTimeLine(context2, 0, canvas.height);
      return;
    }
    const segments = record.distributionSegments;
    const timeLength = Math.max(segments.length, 1);
    const maxNotesPerSecond = Math.max(40, Math.min(record.peakdensity || 0, 100));
    const canvasWidth = timeLength * (RECT_WIDTH + SPACING);
    const canvasHeight = maxNotesPerSecond * (RECT_HEIGHT + SPACING) - SPACING;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawHorizontalGrid(context, canvasWidth, canvasHeight, maxNotesPerSecond);
    drawVerticalGrid(context, canvasWidth, canvasHeight, timeLength);
    drawDistributionBars(context, segments, canvasHeight, maxNotesPerSecond);
    drawSpeedChangeLines(context, record, canvasWidth, canvasHeight, timeLength);
    drawSelectedTimeLine(context, timeToX(state2.selectedTimeSec), canvasHeight);
  }
  function syncScrollToSelected() {
    if (!state2.record || !scrollHost) {
      return;
    }
    const x = timeToX(state2.selectedTimeSec);
    const maxScrollLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth);
    const desired = clamp2(x - scrollHost.clientWidth / 2, 0, maxScrollLeft);
    if (Math.abs(scrollHost.scrollLeft - desired) > 8) {
      scrollHost.scrollLeft = desired;
    }
  }
  render2();
  return {
    setRecord,
    setSelectedTimeSec: setSelectedTimeSec2,
    setPinned,
    render: render2
  };
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
        context.strokeStyle = "rgba(127, 127, 127, 0.5)";
        context.beginPath();
        context.moveTo(x2, y2 < y1 ? y1 - 1 : y1 + 1);
        context.lineTo(x2, y2 < y1 ? y2 + 1 : y2 - 1);
        context.stroke();
      }
    }
  }
}
function drawSelectedTimeLine(context, x, canvasHeight) {
  context.save();
  context.strokeStyle = "#ff2c2c";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 0.5, 0);
  context.lineTo(x + 0.5, canvasHeight);
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
function logScaleY(bpm, mainBpm, canvasHeight) {
  const ratio = Math.min(Math.max(bpm / mainBpm, MIN_RATIO), MAX_RATIO);
  const logValue = Math.log10(ratio);
  const t = (logValue - MIN_LOG) / (MAX_LOG - MIN_LOG);
  return canvasHeight - Math.round(t * (canvasHeight - 2));
}
function timeToX(timeSec) {
  return Math.round(timeSec * (RECT_WIDTH + SPACING)) + 1;
}
function clamp2(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

// shared/preview-runtime/index.js
var BMSDATA_STYLE_ID = "bms-info-extender-style";
var BMSSEARCH_PATTERN_API_BASE_URL = "https://api.bmssearch.net/v1/patterns/sha256";
var BMSSEARCH_PATTERN_PAGE_BASE_URL = "https://bmssearch.net/patterns";
var SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS = 250;
var VIEWER_MODE_STORAGE_KEY = "bms-info-extender.viewerMode";
var INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY = "bms-info-extender.invisibleNoteVisibility";
var bmsSearchPatternAvailabilityCache = /* @__PURE__ */ new Map();
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
  #bd-graph { position: relative; padding: 0px; border-width: 0px; background-color: #000; overflow-x: auto; line-height: 0; scrollbar-color: var(--bd-hdbk) black; scrollbar-width: thin; }
  #bd-graph-canvas { background-color: #000; }
  #bd-graph-tooltip { line-height: 1.25; position: fixed; background: rgba(32, 32, 64, 0.88); color: #fff; padding: 4px 8px; font-size: 0.8125rem; pointer-events: none; border-radius: 6px; display: none; z-index: 10; white-space: nowrap; box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22); }
  .bd-scoreviewer-pin { position: absolute; top: 4px; left: 4px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: rgba(32, 32, 64, 0.5); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-sizing: border-box; z-index: 2; width: auto; }
  .bd-scoreviewer-pin * { background: transparent; color: #fff; font-family: "Inconsolata", "Noto Sans JP"; }
  .bd-scoreviewer-pin input { width: auto; flex: 0 0 auto; min-height: auto; margin: 0; padding: 0; border: none; background: transparent; accent-color: #ffffff; }
  .bd-scoreviewer-pin span { display: inline-block; line-height: 1.25; white-space: nowrap; }
  .score-viewer-shell * { box-sizing: content-box; }
  .score-viewer-shell { --score-viewer-width: 520px; position: fixed; top: 0; right: 0; width: var(--score-viewer-width); height: 100dvh; background: #000; border-left: 1px solid rgba(112, 112, 132, 0.4); box-shadow: -12px 0 32px rgba(0, 0, 0, 0.38); overflow: hidden; z-index: 2147483000; opacity: 0; pointer-events: none; transform: translateX(100%); transition: transform 120ms ease, opacity 120ms ease; isolation: isolate; contain: layout paint style; }
  .score-viewer-shell.is-visible { opacity: 1; pointer-events: auto; transform: translateX(0); }
  .score-viewer-scroll-host { position: absolute; inset: 0; overflow-x: hidden; overflow-y: hidden; scrollbar-gutter: stable; contain: layout paint; }
  .score-viewer-scroll-host.is-scrollable { overflow-y: auto; cursor: grab; touch-action: none; }
  .score-viewer-scroll-host.is-scrollable.is-dragging { cursor: grabbing; }
  .score-viewer-spacer { width: 1px; opacity: 0; }
  .score-viewer-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .score-viewer-marker-overlay, .score-viewer-marker-labels { position: absolute; inset: 0; pointer-events: none; contain: layout paint; }
  .score-viewer-marker-label { position: absolute; top: 0; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1; white-space: nowrap; text-shadow: 0 0 4px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.72); }
  .score-viewer-marker-label.is-left { transform: translate(-100%, -50%); text-align: right; }
  .score-viewer-marker-label.is-right { transform: translate(0, -50%); text-align: left; }
  .score-viewer-bottom-bar { position: absolute; left: 12px; bottom: 12px; z-index: 3; pointer-events: none; contain: layout paint; }
  .score-viewer-status-panel { display: grid; gap: 4px; min-width: 180px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(160, 160, 196, 0.22); background: rgba(32, 32, 64, 0.8); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24); pointer-events: auto; contain: layout paint style; }
  .score-viewer-status-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .score-viewer-status-row.is-time { justify-content: flex-start; gap: 8px; }
  .score-viewer-status-metric { font-variant-numeric: tabular-nums; }
  .score-viewer-spacing-row { padding-top: 2px; }
  .score-viewer-spacing-title { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
  .score-viewer-spacing-value { margin-left: auto; color: #fff; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
  .score-viewer-mode-row { display: grid; gap: 4px; align-items: stretch; }
  .score-viewer-mode-title { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
  .score-viewer-mode-controls { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 6px; width: 100%; min-width: 0; box-sizing: border-box; }
  .score-viewer-mode-select { width: 100%; min-width: 0; min-height: auto; padding: 1px 6px; border: 1px solid rgba(255, 255, 255, 0.24); border-radius: 4px; background: rgba(16, 16, 28, 0.95); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1.25; box-sizing: border-box; }
  .score-viewer-mode-select:disabled { opacity: 0.55; cursor: not-allowed; }
  .score-viewer-playback-button { display: inline-flex; align-items: center; justify-content: center; width: 20px; min-width: 20px; height: 20px; min-height: 20px; padding: 0; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.24); background: rgba(255, 255, 255, 0.16); color: #fff; box-shadow: none; font-size: 0.58rem; line-height: 1; pointer-events: auto; cursor: pointer; }
  .score-viewer-playback-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .score-viewer-playback-time { font-variant-numeric: tabular-nums; }
  .score-viewer-spacing-input { width: 100%; min-height: auto; margin: 0; padding: 0; background: transparent; border: none; accent-color: #ffffff; pointer-events: auto; }
  .score-viewer-judge-line { position: absolute; left: 0; right: 0; top: 50%; display: flex; align-items: center; transform: translateY(-50%); pointer-events: none; }
  .score-viewer-judge-line::after { content: ""; width: 100%; height: 2px; background: linear-gradient(90deg, rgba(187, 71, 49, 0.18) 0%, rgba(187, 71, 49, 0.94) 48%, rgba(187, 71, 49, 0.18) 100%); box-shadow: 0 0 20px rgba(187, 71, 49, 0.2); }
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
    <div id="bd-graph">
      <label class="bd-scoreviewer-pin">
        <input id="bd-scoreviewer-pin-input" type="checkbox">
        <span>Pin the score viewer</span>
      </label>
      <div id="bd-graph-tooltip"></div>
      <canvas id="bd-graph-canvas"></canvas>
    </div>
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
  const graphCanvas = container.querySelector("#bd-graph-canvas");
  const graphTooltip = container.querySelector("#bd-graph-tooltip");
  const pinInput = container.querySelector("#bd-scoreviewer-pin-input");
  if (!graphHost || !graphCanvas || !graphTooltip || !pinInput) {
    throw new Error("BMS preview graph elements are missing.");
  }
  const shell = documentRef.createElement("div");
  shell.className = "score-viewer-shell";
  documentRef.body.appendChild(shell);
  const parsedScoreCache = /* @__PURE__ */ new Map();
  const loadPromiseCache = /* @__PURE__ */ new Map();
  const state2 = {
    record: null,
    selectedSha256: null,
    selectedTimeSec: 0,
    selectedBeat: 0,
    viewerMode: getInitialViewerMode(getPersistedViewerMode),
    invisibleNoteVisibility: getInitialInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility),
    isPinned: false,
    isViewerOpen: false,
    isPlaying: false,
    isGraphHovered: false,
    parsedScore: null,
    viewerModel: null,
    loadToken: 0,
    renderFrameId: null,
    playbackFrameId: null,
    lastPlaybackTimestamp: null,
    lastViewerOpenState: false,
    isDestroyed: false
  };
  const viewerController = createScoreViewerController({
    root: shell,
    onTimeChange: (selection) => {
      const nextTimeSec = typeof selection === "object" ? selection.timeSec : selection;
      setSelectedTimeSec2(nextTimeSec, {
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
    }
  });
  const graphController = createBmsInfoGraph({
    scrollHost: graphHost,
    canvas: graphCanvas,
    tooltip: graphTooltip,
    pinInput,
    onHoverTime: (timeSec) => {
      handleGraphHover(timeSec);
    },
    onHoverLeave: () => {
      state2.isGraphHovered = false;
      if (!state2.isPinned && !state2.isPlaying) {
        state2.isViewerOpen = false;
      }
      scheduleRender();
    },
    onSelectTime: (timeSec) => {
      state2.isPinned = true;
      onPinChange(true);
      void activateRecord({ openViewer: true });
      setSelectedTimeSec2(timeSec, { openViewer: true, notify: true });
    },
    onPinChange: (nextPinned) => {
      state2.isPinned = Boolean(nextPinned);
      onPinChange(state2.isPinned);
      if (state2.isPinned) {
        state2.isViewerOpen = true;
        void activateRecord({ openViewer: true });
      } else if (!state2.isGraphHovered && !state2.isPlaying) {
        state2.isViewerOpen = false;
      }
      scheduleRender();
    }
  });
  return {
    setRecord,
    setSelectedTimeSec: setSelectedTimeSec2,
    setViewerMode,
    setInvisibleNoteVisibility,
    setPinned,
    setPlaybackState,
    prefetch,
    destroy,
    getState: () => ({
      ...state2,
      resolvedViewerMode: getResolvedViewerMode(state2)
    })
  };
  function setRecord(normalizedRecord, { parsedScore = null } = {}) {
    const previousSha256 = state2.record?.sha256 ?? null;
    const nextSha256Value = normalizedRecord?.sha256 ?? null;
    const recordChanged = previousSha256 !== nextSha256Value || state2.record !== normalizedRecord;
    state2.record = normalizedRecord;
    if (!normalizedRecord) {
      state2.selectedSha256 = null;
      state2.parsedScore = null;
      state2.viewerModel = null;
      state2.selectedTimeSec = 0;
      state2.selectedBeat = 0;
      state2.isViewerOpen = false;
      graphController.setRecord(null);
      scheduleRender();
      return;
    }
    if (recordChanged) {
      renderBmsData(container, normalizedRecord);
      graphController.setRecord(normalizedRecord);
      shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(normalizedRecord.mode)}px`);
    }
    const nextSha256 = normalizedRecord.sha256 ? normalizedRecord.sha256.toLowerCase() : null;
    if (parsedScore && nextSha256) {
      const viewerModel = createScoreViewerModel(parsedScore);
      parsedScoreCache.set(nextSha256, { score: parsedScore, viewerModel });
      state2.parsedScore = parsedScore;
      state2.viewerModel = viewerModel;
      state2.selectedSha256 = nextSha256;
      state2.selectedTimeSec = clampSelectedTimeSec(state2, state2.selectedTimeSec);
      state2.selectedBeat = getBeatAtTimeSec(state2.viewerModel, state2.selectedTimeSec);
    } else if (state2.selectedSha256 !== nextSha256) {
      state2.parsedScore = null;
      state2.viewerModel = null;
      state2.selectedSha256 = nextSha256;
      state2.selectedTimeSec = clampSelectedTimeSec(state2, state2.selectedTimeSec);
      state2.selectedBeat = 0;
    }
    graphController.setPinned(state2.isPinned);
    graphController.setSelectedTimeSec(state2.selectedTimeSec);
    scheduleRender();
  }
  async function prefetch() {
    if (!state2.record?.sha256) {
      return;
    }
    try {
      await prefetchParsedScore(state2.record);
    } catch (error) {
      console.warn("Score prefetch failed:", error);
    }
  }
  function handleGraphHover(timeSec) {
    state2.isGraphHovered = true;
    void activateRecord({ openViewer: true });
    if (state2.isPlaying) {
      return;
    }
    setSelectedTimeSec2(timeSec, { openViewer: true, notify: true });
  }
  async function activateRecord({ openViewer = false } = {}) {
    if (!state2.record) {
      return;
    }
    if (openViewer) {
      state2.isViewerOpen = true;
    }
    const sha256 = state2.record.sha256 ? state2.record.sha256.toLowerCase() : null;
    if (!sha256) {
      state2.parsedScore = null;
      state2.viewerModel = null;
      scheduleRender();
      return;
    }
    if (state2.selectedSha256 === sha256 && state2.viewerModel) {
      scheduleRender();
      return;
    }
    state2.selectedSha256 = sha256;
    scheduleRender();
    await loadSelectedRecord(state2.record);
  }
  async function loadSelectedRecord(normalizedRecord) {
    if (!normalizedRecord?.sha256) {
      state2.parsedScore = null;
      state2.viewerModel = null;
      state2.selectedBeat = 0;
      scheduleRender();
      return;
    }
    const sha256 = normalizedRecord.sha256.toLowerCase();
    const loadToken = ++state2.loadToken;
    if (parsedScoreCache.has(sha256)) {
      const cached = parsedScoreCache.get(sha256);
      if (loadToken !== state2.loadToken || state2.selectedSha256 !== sha256) {
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
          const viewerModel = createScoreViewerModel(parsedScore);
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
      if (loadToken !== state2.loadToken || state2.selectedSha256 !== sha256) {
        return;
      }
      applyLoadedScore(cached.score, cached.viewerModel);
    } catch (error) {
      if (loadToken !== state2.loadToken || state2.selectedSha256 !== sha256) {
        return;
      }
      console.warn("Score viewer parse/load failed:", error);
      onRuntimeError(error);
      state2.parsedScore = null;
      state2.viewerModel = null;
      state2.selectedBeat = 0;
      state2.isViewerOpen = false;
      scheduleRender();
    }
  }
  function applyLoadedScore(parsedScore, viewerModel) {
    state2.parsedScore = parsedScore;
    state2.viewerModel = viewerModel;
    state2.selectedTimeSec = clampSelectedTimeSec(state2, state2.selectedTimeSec);
    state2.selectedBeat = getBeatAtTimeSec(state2.viewerModel, state2.selectedTimeSec);
    scheduleRender();
  }
  function setSelectedTimeSec2(nextTimeSec, { openViewer = false, notify = false, beatHint = void 0, source = "external" } = {}) {
    const clampedTimeSec = clampSelectedTimeSec(state2, nextTimeSec);
    const resolvedViewerMode = getResolvedViewerMode(state2);
    const nextBeat = resolveSelectedBeat(state2, clampedTimeSec, beatHint, resolvedViewerMode);
    const changed = hasViewerSelectionChanged(
      state2.viewerModel,
      resolvedViewerMode,
      state2.selectedTimeSec,
      clampedTimeSec,
      state2.selectedBeat,
      nextBeat
    );
    if (openViewer) {
      state2.isViewerOpen = true;
    }
    state2.selectedTimeSec = clampedTimeSec;
    state2.selectedBeat = nextBeat;
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
    scheduleRender();
  }
  function setViewerMode(nextViewerMode) {
    const normalizedMode = normalizeViewerMode(nextViewerMode);
    const persistedMode = normalizedMode === "game" ? DEFAULT_VIEWER_MODE : normalizedMode;
    if (state2.viewerMode === persistedMode) {
      scheduleRender();
      return;
    }
    state2.viewerMode = persistedMode;
    state2.selectedBeat = getBeatAtTimeSec(state2.viewerModel, state2.selectedTimeSec);
    try {
      setPersistedViewerMode(persistedMode);
    } catch (error) {
      console.warn("Failed to persist viewer mode:", error);
    }
    scheduleRender();
  }
  function setInvisibleNoteVisibility(nextVisibility) {
    const normalizedVisibility = normalizeInvisibleNoteVisibility(nextVisibility);
    if (state2.invisibleNoteVisibility === normalizedVisibility) {
      scheduleRender();
      return;
    }
    state2.invisibleNoteVisibility = normalizedVisibility;
    try {
      setPersistedInvisibleNoteVisibility(normalizedVisibility);
    } catch (error) {
      console.warn("Failed to persist invisible note visibility:", error);
    }
    scheduleRender();
  }
  function setPinned(nextPinned) {
    const normalized = Boolean(nextPinned);
    if (state2.isPinned === normalized) {
      return;
    }
    state2.isPinned = normalized;
    onPinChange(state2.isPinned);
    if (state2.isPinned) {
      state2.isViewerOpen = true;
      void activateRecord({ openViewer: true });
    } else if (!state2.isGraphHovered && !state2.isPlaying) {
      state2.isViewerOpen = false;
    }
    scheduleRender();
  }
  function setPlaybackState(nextPlaying) {
    if (state2.isPlaying === Boolean(nextPlaying) && state2.viewerModel && state2.parsedScore) {
      return;
    }
    if (!state2.viewerModel || !state2.parsedScore) {
      stopPlayback(false);
      scheduleRender();
      return;
    }
    if (nextPlaying) {
      startPlayback();
    } else {
      stopPlayback(true);
    }
  }
  function startPlayback() {
    if (!state2.viewerModel || !state2.parsedScore) {
      return;
    }
    const maxTimeSec = getScoreTotalDurationSec(state2.parsedScore);
    if (maxTimeSec <= 0) {
      return;
    }
    if (state2.selectedTimeSec >= maxTimeSec - 5e-4) {
      setSelectedTimeSec2(0, { notify: true, source: "playback" });
    }
    state2.isPlaying = true;
    state2.isViewerOpen = true;
    state2.lastPlaybackTimestamp = null;
    onPlaybackChange(true);
    if (state2.playbackFrameId !== null) {
      cancelAnimationFrame(state2.playbackFrameId);
    }
    scheduleRender();
    state2.playbackFrameId = requestAnimationFrame(stepPlayback);
  }
  function stopPlayback(renderAfter = true) {
    if (state2.playbackFrameId !== null) {
      cancelAnimationFrame(state2.playbackFrameId);
      state2.playbackFrameId = null;
    }
    state2.lastPlaybackTimestamp = null;
    if (state2.isPlaying) {
      state2.isPlaying = false;
      onPlaybackChange(false);
    }
    if (renderAfter) {
      scheduleRender();
    }
  }
  function stepPlayback(timestamp) {
    if (!state2.isPlaying || !state2.viewerModel || !state2.parsedScore) {
      state2.playbackFrameId = null;
      state2.lastPlaybackTimestamp = null;
      return;
    }
    if (state2.lastPlaybackTimestamp === null || timestamp - state2.lastPlaybackTimestamp > SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS) {
      state2.lastPlaybackTimestamp = timestamp;
      state2.playbackFrameId = requestAnimationFrame(stepPlayback);
      return;
    }
    const deltaSec = (timestamp - state2.lastPlaybackTimestamp) / 1e3;
    state2.lastPlaybackTimestamp = timestamp;
    const maxTimeSec = getScoreTotalDurationSec(state2.parsedScore);
    const nextTimeSec = Math.min(state2.selectedTimeSec + deltaSec, maxTimeSec);
    const resolvedViewerMode = getResolvedViewerMode(state2);
    const nextBeat = resolveSelectedBeat(state2, nextTimeSec, void 0, resolvedViewerMode);
    const changed = hasViewerSelectionChanged(
      state2.viewerModel,
      resolvedViewerMode,
      state2.selectedTimeSec,
      nextTimeSec,
      state2.selectedBeat,
      nextBeat
    );
    state2.selectedTimeSec = nextTimeSec;
    state2.selectedBeat = nextBeat;
    if (changed) {
      onSelectedTimeChange({
        timeSec: state2.selectedTimeSec,
        beat: nextBeat,
        viewerMode: resolvedViewerMode,
        source: "playback"
      });
    }
    scheduleRender();
    if (nextTimeSec >= maxTimeSec - 5e-4) {
      stopPlayback(false);
      scheduleRender();
      return;
    }
    state2.playbackFrameId = requestAnimationFrame(stepPlayback);
  }
  function scheduleRender() {
    if (state2.isDestroyed || state2.renderFrameId !== null) {
      return;
    }
    state2.renderFrameId = requestAnimationFrame(() => {
      state2.renderFrameId = null;
      flushRender();
    });
  }
  function flushRender() {
    graphController.setPinned(state2.isPinned);
    graphController.setSelectedTimeSec(state2.selectedTimeSec);
    viewerController.setPlaybackState(state2.isPlaying);
    viewerController.setPinned(state2.isPinned);
    viewerController.setModel(state2.viewerModel);
    viewerController.setViewerMode(state2.viewerMode);
    viewerController.setInvisibleNoteVisibility(state2.invisibleNoteVisibility);
    viewerController.setSelectedTimeSec(state2.selectedTimeSec, { beatHint: state2.selectedBeat });
    viewerController.setOpen(Boolean(state2.isViewerOpen && state2.viewerModel));
    const isActuallyOpen = Boolean(state2.isViewerOpen && state2.viewerModel);
    if (state2.lastViewerOpenState !== isActuallyOpen) {
      state2.lastViewerOpenState = isActuallyOpen;
      onViewerOpenChange(isActuallyOpen);
    }
  }
  function destroy() {
    state2.isDestroyed = true;
    if (state2.renderFrameId !== null) {
      cancelAnimationFrame(state2.renderFrameId);
      state2.renderFrameId = null;
    }
    stopPlayback(false);
    graphController.destroy();
    viewerController.destroy();
    shell.remove();
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
function clampSelectedTimeSec(state2, timeSec) {
  if (state2.viewerModel) {
    return getClampedSelectedTimeSec(state2.viewerModel, timeSec);
  }
  const maxTimeSec = state2.record?.durationSec ?? 0;
  return clampValue(Number.isFinite(timeSec) ? timeSec : 0, 0, Math.max(maxTimeSec, 0));
}
function getResolvedViewerMode(state2) {
  return resolveViewerModeForModel(state2.viewerModel, state2.viewerMode);
}
function resolveSelectedBeat(state2, timeSec, beatHint = void 0, resolvedViewerMode = getResolvedViewerMode(state2)) {
  if (resolvedViewerMode !== "editor") {
    return 0;
  }
  if (Number.isFinite(beatHint)) {
    return getClampedSelectedBeat(state2.viewerModel, beatHint);
  }
  return getBeatAtTimeSec(state2.viewerModel, timeSec);
}
function getInitialViewerMode(getPersistedViewerMode) {
  try {
    const persistedMode = normalizeViewerMode(getPersistedViewerMode?.());
    return persistedMode === "game" ? DEFAULT_VIEWER_MODE : persistedMode;
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
function estimateViewerWidthFromNumericMode(mode) {
  switch (Number(mode)) {
    case 5:
      return estimateViewerWidth("5k", 6);
    case 7:
      return estimateViewerWidth("7k", 8);
    case 9:
      return estimateViewerWidth("popn-9k", 9);
    case 10:
      return estimateViewerWidth("10k", 12);
    case 14:
      return estimateViewerWidth("14k", 16);
    default:
      return estimateViewerWidth(String(mode ?? ""), getDisplayLaneCount(mode));
  }
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

// site/dev/score-viewer/src/app.js
var DEFAULT_PARSER_VERSION = "current";
var DEFAULT_SCORE_BASE_URL = "/score";
var PRODUCTION_SCORE_BASE_URL = "https://bms-info-extender.netlify.app/score";
var PRESET_CURRENT = "current";
var PRESET_PRODUCTION = "production";
var PRESET_CUSTOM = "custom";
var LOAD_STATES = /* @__PURE__ */ new Set(["idle", "loading", "ready", "error"]);
var SHA256_PATTERN = /^[0-9a-f]{64}$/i;
var NEARBY_EVENT_WINDOW_SEC = 2;
var MAX_NEARBY_EVENTS = 50;
var elements = {
  form: document.getElementById("control-form"),
  sha256Input: document.getElementById("sha256-input"),
  parserVersionInput: document.getElementById("parser-version-input"),
  scoreSourceSelect: document.getElementById("score-source-select"),
  customScoreBaseUrlInput: document.getElementById("custom-score-base-url-input"),
  timeNumberInput: document.getElementById("time-number-input"),
  timeRangeInput: document.getElementById("time-range-input"),
  loadButton: document.getElementById("load-button"),
  prefetchButton: document.getElementById("prefetch-button"),
  clearMemoryButton: document.getElementById("clear-memory-button"),
  clearIdbButton: document.getElementById("clear-idb-button"),
  reloadButton: document.getElementById("reload-button"),
  statusPill: document.getElementById("status-pill"),
  messageBanner: document.getElementById("message-banner"),
  resolvedScoreUrl: document.getElementById("resolved-score-url"),
  loaderModuleUrl: document.getElementById("loader-module-url"),
  diagnosticParserVersion: document.getElementById("diagnostic-parser-version"),
  compressedSource: document.getElementById("compressed-source"),
  gzipByteLength: document.getElementById("gzip-byte-length"),
  decompressedByteLength: document.getElementById("decompressed-byte-length"),
  scoreShape: document.getElementById("score-shape"),
  lastPlayableDuration: document.getElementById("last-playable-duration"),
  totalDuration: document.getElementById("total-duration"),
  comboTotalDiagnostic: document.getElementById("combo-total-diagnostic"),
  currentComboDiagnostic: document.getElementById("current-combo-diagnostic"),
  eventCounts: document.getElementById("event-counts"),
  warningsCount: document.getElementById("warnings-count"),
  warningsList: document.getElementById("warnings-list"),
  errorType: document.getElementById("error-type"),
  errorMessage: document.getElementById("error-message"),
  errorCause: document.getElementById("error-cause"),
  previewRoot: document.getElementById("preview-root"),
  nearbyEventsWindow: document.getElementById("nearby-events-window"),
  nearbyEventsList: document.getElementById("nearby-events-list")
};
var loaderContextCache = /* @__PURE__ */ new Map();
var state = {
  sha256: "",
  parserVersion: DEFAULT_PARSER_VERSION,
  scoreBaseUrl: DEFAULT_SCORE_BASE_URL,
  scoreSourcePreset: PRESET_CURRENT,
  customScoreBaseUrl: "",
  selectedTimeSec: 0,
  selectedBeat: 0,
  resolvedViewerMode: DEFAULT_VIEWER_MODE,
  isPinned: false,
  isViewerOpen: false,
  isPlaying: false,
  isGraphHovered: false,
  loadState: "idle",
  panelLoadState: "idle",
  compressedSource: null,
  parsedScore: null,
  viewerModel: null,
  bmsDataRecord: null,
  previewRuntime: null,
  previewContainer: null,
  lastError: null,
  panelError: null,
  message: null,
  autoloadEnabled: false,
  resolvedScoreUrl: null,
  loaderModuleUrl: null,
  compressedByteLength: null,
  decompressedByteLength: null
};
var busyOperation = null;
var activeRequestId = 0;
function formatSeconds(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(3)} s`;
}
function formatInteger(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US").format(value);
}
function formatCompactNumber2(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return Number.isInteger(value) ? String(Math.trunc(value)) : value.toFixed(3);
}
function parseOptionalNumber(value, fallbackValue = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}
function clamp3(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}
function summarizeErrorCause(cause) {
  if (!cause) {
    return "-";
  }
  if (typeof cause === "string") {
    return cause;
  }
  if (cause instanceof Error) {
    return cause.message || cause.name;
  }
  if (typeof cause === "object") {
    try {
      return JSON.stringify(cause);
    } catch (_error) {
      return String(cause);
    }
  }
  return String(cause);
}
function createUiError(type, message, cause = null) {
  return { type, message, cause };
}
function normalizeSha256(sha256) {
  if (typeof sha256 !== "string") {
    throw createUiError("validation_error", "sha256 must be a string.");
  }
  const normalized = sha256.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw createUiError("validation_error", "sha256 must be a 64-character hex string.");
  }
  return normalized;
}
function normalizeParserVersion(version) {
  if (typeof version !== "string" || version.trim() === "") {
    throw createUiError("validation_error", "parserVersion must not be empty.");
  }
  return version.trim();
}
function normalizeScoreBaseUrl(scoreBaseUrl) {
  if (typeof scoreBaseUrl !== "string" || scoreBaseUrl.trim() === "") {
    return DEFAULT_SCORE_BASE_URL;
  }
  const trimmed = scoreBaseUrl.trim().replace(/\/+$/, "");
  return trimmed === "" ? DEFAULT_SCORE_BASE_URL : trimmed;
}
function derivePreset(scoreBaseUrl) {
  const normalized = normalizeScoreBaseUrl(scoreBaseUrl);
  if (normalized === DEFAULT_SCORE_BASE_URL || normalized === `${location.origin}/score`) {
    return PRESET_CURRENT;
  }
  if (normalized === PRODUCTION_SCORE_BASE_URL) {
    return PRESET_PRODUCTION;
  }
  return PRESET_CUSTOM;
}
function getPresetScoreBaseUrl(preset, customValue) {
  if (preset === PRESET_PRODUCTION) {
    return PRODUCTION_SCORE_BASE_URL;
  }
  if (preset === PRESET_CUSTOM) {
    return normalizeScoreBaseUrl(customValue);
  }
  return DEFAULT_SCORE_BASE_URL;
}
function readQueryState() {
  const params = new URLSearchParams(location.search);
  const queryScoreBaseUrl = params.get("scoreBaseUrl");
  const initialScoreBaseUrl = normalizeScoreBaseUrl(queryScoreBaseUrl ?? DEFAULT_SCORE_BASE_URL);
  const initialPreset = derivePreset(initialScoreBaseUrl);
  return {
    sha256: (params.get("sha256") ?? "").trim().toLowerCase(),
    parserVersion: params.get("parserVersion")?.trim() || DEFAULT_PARSER_VERSION,
    scoreBaseUrl: initialScoreBaseUrl,
    scoreSourcePreset: initialPreset,
    customScoreBaseUrl: initialPreset === PRESET_CUSTOM ? initialScoreBaseUrl : "",
    selectedTimeSec: Math.max(0, parseOptionalNumber(params.get("timeSec"), 0)),
    autoloadEnabled: params.get("autoload") === "1"
  };
}
function writeQueryState() {
  const params = new URLSearchParams();
  if (state.sha256) {
    params.set("sha256", state.sha256);
  }
  params.set("parserVersion", state.parserVersion);
  params.set("scoreBaseUrl", state.scoreBaseUrl);
  params.set("timeSec", String(state.selectedTimeSec));
  if (state.autoloadEnabled) {
    params.set("autoload", "1");
  }
  const nextUrl = `${location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  history.replaceState(null, "", nextUrl);
}
function syncFormFromState() {
  elements.sha256Input.value = state.sha256;
  elements.parserVersionInput.value = state.parserVersion;
  elements.scoreSourceSelect.value = state.scoreSourcePreset;
  elements.customScoreBaseUrlInput.value = state.scoreSourcePreset === PRESET_CUSTOM ? state.customScoreBaseUrl : state.scoreBaseUrl;
  elements.timeNumberInput.value = state.selectedTimeSec.toFixed(3);
  elements.customScoreBaseUrlInput.disabled = state.scoreSourcePreset !== PRESET_CUSTOM;
}
function updateStateFromControls() {
  state.sha256 = elements.sha256Input.value.trim().toLowerCase();
  state.parserVersion = elements.parserVersionInput.value.trim() || DEFAULT_PARSER_VERSION;
  state.scoreSourcePreset = elements.scoreSourceSelect.value;
  state.customScoreBaseUrl = elements.customScoreBaseUrlInput.value.trim();
  state.scoreBaseUrl = getPresetScoreBaseUrl(state.scoreSourcePreset, state.customScoreBaseUrl);
  state.selectedTimeSec = getNormalizedSelectedTimeSec(parseOptionalNumber(elements.timeNumberInput.value, state.selectedTimeSec));
  writeQueryState();
}
function getNormalizedSelectedTimeSec(value) {
  if (state.viewerModel) {
    return getClampedSelectedTimeSec(state.viewerModel, value);
  }
  if (state.parsedScore) {
    return clamp3(value, 0, getScoreTotalDurationSec(state.parsedScore));
  }
  return Math.max(0, value);
}
function getSelectedBeatForTime(timeSec, viewerMode = state.resolvedViewerMode) {
  if (viewerMode !== "editor") {
    return 0;
  }
  return getBeatAtTimeSec(state.viewerModel, timeSec);
}
function setSelectedTimeSec(nextValue, { openViewer = false, syncUrl = true } = {}) {
  const normalizedValue = getNormalizedSelectedTimeSec(Number.isFinite(nextValue) ? nextValue : 0);
  const nextBeat = getSelectedBeatForTime(normalizedValue);
  const changed = hasViewerSelectionChanged(
    state.viewerModel,
    state.resolvedViewerMode,
    state.selectedTimeSec,
    normalizedValue,
    state.selectedBeat,
    nextBeat
  );
  if (openViewer) {
    state.isViewerOpen = true;
  }
  if (!changed) {
    if (openViewer) {
      render();
    }
    return;
  }
  state.selectedTimeSec = normalizedValue;
  state.selectedBeat = nextBeat;
  elements.timeNumberInput.value = state.selectedTimeSec.toFixed(3);
  elements.timeRangeInput.value = String(state.selectedTimeSec);
  if (state.previewRuntime) {
    state.previewRuntime.setSelectedTimeSec(state.selectedTimeSec, {
      openViewer,
      beatHint: state.selectedBeat
    });
  }
  if (syncUrl) {
    writeQueryState();
  }
  render();
}
function getLoaderModuleUrl(parserVersion) {
  if (parserVersion === "current") {
    return new URL("/score-parser/current/score_loader.js", location.origin).href;
  }
  return new URL(`/score-parser/v${parserVersion}/score_loader.js`, location.origin).href;
}
async function getLoaderContext(parserVersion, scoreBaseUrl) {
  const normalizedParserVersion = normalizeParserVersion(parserVersion);
  const normalizedScoreBaseUrl = normalizeScoreBaseUrl(scoreBaseUrl);
  const cacheKey = `${normalizedParserVersion}::${normalizedScoreBaseUrl}`;
  if (loaderContextCache.has(cacheKey)) {
    return loaderContextCache.get(cacheKey);
  }
  const moduleUrl = getLoaderModuleUrl(normalizedParserVersion);
  let loaderModule;
  try {
    loaderModule = await import(moduleUrl);
  } catch (error) {
    throw createUiError("loader_import_failure", `Failed to import score loader module: ${moduleUrl}`, error);
  }
  const context = {
    moduleUrl,
    loader: loaderModule.createScoreLoader({
      scoreBaseUrl: normalizedScoreBaseUrl
    })
  };
  loaderContextCache.set(cacheKey, context);
  return context;
}
function setBusyState(operationName) {
  busyOperation = operationName;
  state.loadState = "loading";
  render();
}
function clearBusyState(nextLoadState) {
  busyOperation = null;
  state.loadState = LOAD_STATES.has(nextLoadState) ? nextLoadState : state.loadState;
  render();
}
function setMessage(kind, text) {
  state.message = text ? { kind, text } : null;
}
function resetDiagnosticsForNewTarget() {
  if (state.previewRuntime) {
    state.previewRuntime.setPlaybackState(false);
    state.previewRuntime.setRecord(null);
  }
  state.compressedSource = null;
  state.parsedScore = null;
  state.viewerModel = null;
  state.selectedBeat = 0;
  state.resolvedScoreUrl = null;
  state.loaderModuleUrl = null;
  state.compressedByteLength = null;
  state.decompressedByteLength = null;
  state.lastError = null;
  state.bmsDataRecord = null;
  state.panelLoadState = "idle";
  state.panelError = null;
  state.isViewerOpen = false;
  state.isPlaying = false;
  state.isGraphHovered = false;
}
function buildUiErrorFromUnknown(error) {
  if (error && typeof error === "object" && "type" in error && "message" in error) {
    return error;
  }
  if (error instanceof Error) {
    return createUiError("unexpected_error", error.message, error.cause ?? null);
  }
  return createUiError("unexpected_error", String(error));
}
function buildPanelError(error) {
  const normalized = buildUiErrorFromUnknown(error);
  return {
    ...normalized,
    type: normalized.type === "unexpected_error" ? "panel_fetch_failure" : normalized.type
  };
}
function getAbsoluteScoreUrl(scoreUrl) {
  try {
    return new URL(scoreUrl, location.origin).href;
  } catch (_error) {
    return scoreUrl;
  }
}
function getEventCountsLabel(score) {
  if (!score) {
    return "-";
  }
  const noteCounts = score.noteCounts ?? {
    visible: score.notes.length,
    normal: score.notes.filter((note) => note.kind === "normal").length,
    long: score.notes.filter((note) => note.kind === "long").length,
    invisible: score.notes.filter((note) => note.kind === "invisible").length,
    mine: score.notes.filter((note) => note.kind === "mine").length,
    all: score.notes.length
  };
  return [
    `visible ${formatInteger(noteCounts.visible)}`,
    `normal ${formatInteger(noteCounts.normal)}`,
    `long ${formatInteger(noteCounts.long)}`,
    `invisible ${formatInteger(noteCounts.invisible)}`,
    `mines ${formatInteger(noteCounts.mine)}`,
    `barLines ${formatInteger(score.barLines.length)}`,
    `bpmChanges ${formatInteger(score.bpmChanges.length)}`,
    `stops ${formatInteger(score.stops.length)}`,
    `scrollChanges ${formatInteger((score.scrollChanges ?? []).length)}`
  ].join(" / ");
}
function getCurrentCursor() {
  return state.viewerModel ? getViewerCursor(state.viewerModel, state.selectedTimeSec, state.resolvedViewerMode, state.selectedBeat) : null;
}
function renderMessageBanner() {
  const banner = elements.messageBanner;
  if (!state.message) {
    banner.hidden = true;
    banner.textContent = "";
    banner.className = "message-banner";
    return;
  }
  banner.hidden = false;
  banner.textContent = state.message.text;
  banner.className = `message-banner message-${state.message.kind}`;
}
function renderStatusPill() {
  elements.statusPill.textContent = busyOperation ? `${state.loadState} (${busyOperation})` : state.loadState;
  elements.statusPill.className = `status-pill status-${state.loadState}`;
}
function renderDiagnostics() {
  const cursor = getCurrentCursor();
  renderStatusPill();
  renderMessageBanner();
  elements.resolvedScoreUrl.textContent = state.resolvedScoreUrl ?? "-";
  elements.loaderModuleUrl.textContent = state.loaderModuleUrl ?? "-";
  elements.diagnosticParserVersion.textContent = state.parserVersion || "-";
  elements.compressedSource.textContent = state.compressedSource ?? "-";
  elements.gzipByteLength.textContent = state.compressedByteLength === null ? "-" : formatInteger(state.compressedByteLength);
  elements.decompressedByteLength.textContent = state.decompressedByteLength === null ? "-" : formatInteger(state.decompressedByteLength);
  elements.scoreShape.textContent = state.parsedScore ? `${state.parsedScore.format} / ${state.parsedScore.mode} / ${formatInteger(state.parsedScore.laneCount)} lanes` : "-";
  elements.lastPlayableDuration.textContent = state.parsedScore ? formatSeconds(state.parsedScore.lastPlayableTimeSec) : "-";
  elements.totalDuration.textContent = state.parsedScore ? formatSeconds(getScoreTotalDurationSec(state.parsedScore)) : "-";
  elements.comboTotalDiagnostic.textContent = cursor ? formatInteger(cursor.totalCombo) : "-";
  elements.currentComboDiagnostic.textContent = cursor ? formatInteger(cursor.comboCount) : "-";
  elements.eventCounts.textContent = getEventCountsLabel(state.parsedScore);
  const warnings = state.parsedScore?.warnings ?? [];
  elements.warningsCount.textContent = formatInteger(warnings.length);
  elements.warningsList.className = warnings.length > 0 ? "message-list" : "message-list empty-list";
  elements.warningsList.replaceChildren();
  if (warnings.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No warnings.";
    elements.warningsList.appendChild(item);
  } else {
    for (const warning of warnings) {
      const item = document.createElement("li");
      item.className = "warning-item";
      const type = document.createElement("span");
      type.className = "warning-type";
      type.textContent = warning.type;
      const message = document.createElement("div");
      message.className = "warning-message";
      message.textContent = warning.message;
      item.append(type, message);
      elements.warningsList.appendChild(item);
    }
  }
  elements.errorType.textContent = state.lastError?.type ?? "-";
  elements.errorMessage.textContent = state.lastError?.message ?? "-";
  elements.errorCause.textContent = summarizeErrorCause(state.lastError?.cause);
}
function ensurePreviewRuntime() {
  if (state.previewRuntime && state.previewContainer) {
    return state.previewRuntime;
  }
  elements.previewRoot.replaceChildren();
  const previewContainer = createBmsDataContainer({
    documentRef: document,
    theme: { dctx: "#333", dcbk: "#fff", hdtx: "#eef", hdbk: "#669" }
  });
  elements.previewRoot.appendChild(previewContainer);
  state.previewContainer = previewContainer;
  state.previewRuntime = createBmsInfoPreview({
    container: previewContainer,
    documentRef: document,
    loadParsedScore: async (record) => {
      if (state.parsedScore && state.sha256 === record.sha256) {
        return state.parsedScore;
      }
      const loaderContext = await getLoaderContext(state.parserVersion, state.scoreBaseUrl);
      const parsedResult = await loaderContext.loader.loadParsedScore(record.sha256.toLowerCase());
      return parsedResult.score;
    },
    prefetchParsedScore: async (record) => {
      if (!record?.sha256) {
        return;
      }
      const loaderContext = await getLoaderContext(state.parserVersion, state.scoreBaseUrl);
      await loaderContext.loader.prefetchScore(record.sha256.toLowerCase());
    },
    getPersistedViewerMode: () => {
      try {
        return localStorage.getItem(VIEWER_MODE_STORAGE_KEY);
      } catch (_error) {
        return null;
      }
    },
    setPersistedViewerMode: (nextViewerMode) => {
      try {
        localStorage.setItem(VIEWER_MODE_STORAGE_KEY, nextViewerMode);
      } catch (_error) {
      }
    },
    getPersistedInvisibleNoteVisibility: () => {
      try {
        return localStorage.getItem(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY);
      } catch (_error) {
        return null;
      }
    },
    setPersistedInvisibleNoteVisibility: (nextVisibility) => {
      try {
        localStorage.setItem(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, nextVisibility);
      } catch (_error) {
      }
    },
    onSelectedTimeChange: (selection) => {
      const nextTimeSec = typeof selection === "object" ? selection.timeSec : selection;
      const nextViewerMode = selection?.viewerMode ?? state.resolvedViewerMode;
      const nextBeat = nextViewerMode === "editor" ? Number.isFinite(selection?.beat) ? selection.beat : getSelectedBeatForTime(nextTimeSec, nextViewerMode) : 0;
      const changed = hasViewerSelectionChanged(
        state.viewerModel,
        nextViewerMode,
        state.selectedTimeSec,
        nextTimeSec,
        state.selectedBeat,
        nextBeat
      );
      state.selectedTimeSec = nextTimeSec;
      state.selectedBeat = nextBeat;
      state.resolvedViewerMode = nextViewerMode;
      elements.timeNumberInput.value = state.selectedTimeSec.toFixed(3);
      elements.timeRangeInput.value = String(state.selectedTimeSec);
      if (changed) {
        writeQueryState();
      }
      renderDiagnostics();
      renderNearbyEvents();
    },
    onPinChange: (nextPinned) => {
      state.isPinned = Boolean(nextPinned);
      writeQueryState();
      renderDiagnostics();
      renderControls();
    },
    onPlaybackChange: (nextPlaying) => {
      state.isPlaying = Boolean(nextPlaying);
      writeQueryState();
      renderDiagnostics();
    },
    onViewerOpenChange: (nextOpen) => {
      state.isViewerOpen = Boolean(nextOpen);
      renderDiagnostics();
    },
    onRuntimeError: (error) => {
      console.warn("Preview runtime error:", error);
    }
  });
  return state.previewRuntime;
}
function renderPreviewPanel() {
  const previewRuntime = ensurePreviewRuntime();
  const previewState = previewRuntime.getState();
  state.resolvedViewerMode = previewState.resolvedViewerMode ?? state.resolvedViewerMode;
  state.selectedBeat = getSelectedBeatForTime(state.selectedTimeSec, state.resolvedViewerMode);
  if (!state.bmsDataRecord) {
    if (state.previewContainer) {
      state.previewContainer.style.display = "none";
    }
    if (previewState.record) {
      previewRuntime.setRecord(null);
    }
    return;
  }
  if (state.previewContainer) {
    state.previewContainer.style.display = "block";
  }
  previewRuntime.setRecord(state.bmsDataRecord, {
    parsedScore: state.parsedScore && state.sha256 === state.bmsDataRecord.sha256 ? state.parsedScore : null
  });
  if (previewState.isPinned !== state.isPinned) {
    previewRuntime.setPinned(state.isPinned);
  }
  const shouldOpenViewer = state.isViewerOpen && !previewState.isViewerOpen;
  if (hasViewerSelectionChanged(
    state.viewerModel,
    previewState.resolvedViewerMode ?? state.resolvedViewerMode,
    previewState.selectedTimeSec,
    state.selectedTimeSec,
    previewState.selectedBeat,
    state.selectedBeat
  ) || shouldOpenViewer) {
    previewRuntime.setSelectedTimeSec(state.selectedTimeSec, {
      openViewer: shouldOpenViewer,
      beatHint: state.selectedBeat
    });
  }
  if (previewState.isPlaying !== state.isPlaying) {
    previewRuntime.setPlaybackState(state.isPlaying);
  }
}
function buildNearbyEvents(score, selectedTimeSec) {
  const minTime = selectedTimeSec - NEARBY_EVENT_WINDOW_SEC;
  const maxTime = selectedTimeSec + NEARBY_EVENT_WINDOW_SEC;
  const rows = [];
  for (const note of score.notes) {
    if (note.timeSec < minTime || note.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "note",
      timeSec: note.timeSec,
      label: `${note.kind} note`,
      detailParts: [
        `lane ${note.lane}`,
        note.side ? note.side : null,
        note.endTimeSec ? `end ${formatSeconds(note.endTimeSec)}` : null
      ].filter(Boolean)
    });
  }
  for (const barLine of score.barLines) {
    if (barLine.timeSec < minTime || barLine.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "bar line",
      timeSec: barLine.timeSec,
      label: "bar line",
      detailParts: ["measure boundary"]
    });
  }
  for (const bpmChange of score.bpmChanges) {
    if (bpmChange.timeSec < minTime || bpmChange.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "bpm",
      timeSec: bpmChange.timeSec,
      label: "bpm change",
      detailParts: [`bpm ${bpmChange.bpm.toFixed(3)}`]
    });
  }
  for (const stop of score.stops) {
    if (stop.timeSec < minTime || stop.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "stop",
      timeSec: stop.timeSec,
      label: "stop",
      detailParts: [`duration ${formatSeconds(stop.durationSec)}`]
    });
  }
  for (const scrollChange of score.scrollChanges ?? []) {
    if (scrollChange.timeSec < minTime || scrollChange.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "scroll",
      timeSec: scrollChange.timeSec,
      label: "scroll",
      detailParts: [`rate ${formatCompactNumber2(scrollChange.rate)}`]
    });
  }
  rows.sort((left, right) => {
    if (left.timeSec !== right.timeSec) {
      return left.timeSec - right.timeSec;
    }
    return left.kind.localeCompare(right.kind);
  });
  return rows.slice(0, MAX_NEARBY_EVENTS);
}
function renderNearbyEvents() {
  elements.nearbyEventsWindow.textContent = `selectedTimeSec ${formatSeconds(state.selectedTimeSec)} ± 2.0 sec`;
  elements.nearbyEventsList.replaceChildren();
  if (!state.parsedScore) {
    elements.nearbyEventsList.className = "event-list empty-list";
    const item = document.createElement("li");
    item.textContent = "No parsed score loaded.";
    elements.nearbyEventsList.appendChild(item);
    return;
  }
  const nearbyEvents = buildNearbyEvents(state.parsedScore, state.selectedTimeSec);
  if (nearbyEvents.length === 0) {
    elements.nearbyEventsList.className = "event-list empty-list";
    const item = document.createElement("li");
    item.textContent = "No events found in the selected window.";
    elements.nearbyEventsList.appendChild(item);
    return;
  }
  elements.nearbyEventsList.className = "event-list";
  for (const event of nearbyEvents) {
    const item = document.createElement("li");
    item.className = "event-item";
    const header = document.createElement("div");
    header.className = "event-item-header";
    const type = document.createElement("span");
    type.className = "event-type";
    type.textContent = event.label;
    const time = document.createElement("strong");
    time.className = "event-time";
    time.textContent = formatSeconds(event.timeSec);
    header.append(type, time);
    const detail = document.createElement("div");
    detail.className = "event-detail";
    detail.textContent = event.detailParts.join(" / ");
    item.append(header, detail);
    elements.nearbyEventsList.appendChild(item);
  }
}
function renderSliderBounds() {
  const maxValue = state.parsedScore ? getScoreTotalDurationSec(state.parsedScore) : 10;
  elements.timeRangeInput.max = String(maxValue);
  elements.timeNumberInput.min = "0";
  if (state.parsedScore) {
    state.selectedTimeSec = getClampedSelectedTimeSec(state.viewerModel, state.selectedTimeSec);
    state.selectedBeat = getSelectedBeatForTime(state.selectedTimeSec);
  } else {
    state.selectedTimeSec = clamp3(state.selectedTimeSec, 0, maxValue);
    state.selectedBeat = 0;
  }
  elements.timeNumberInput.value = state.selectedTimeSec.toFixed(3);
  elements.timeRangeInput.value = String(state.selectedTimeSec);
}
function renderControls() {
  elements.customScoreBaseUrlInput.disabled = state.scoreSourcePreset !== PRESET_CUSTOM;
  const isBusy = busyOperation !== null;
  elements.loadButton.disabled = isBusy;
  elements.prefetchButton.disabled = isBusy;
  elements.clearMemoryButton.disabled = isBusy;
  elements.clearIdbButton.disabled = isBusy;
  elements.reloadButton.disabled = isBusy;
}
function render() {
  renderControls();
  renderDiagnostics();
  renderPreviewPanel();
  renderNearbyEvents();
}
async function handleLoad({ clearCachesFirst = false } = {}) {
  if (busyOperation !== null) {
    return;
  }
  updateStateFromControls();
  const requestId = ++activeRequestId;
  state.autoloadEnabled = true;
  writeQueryState();
  resetDiagnosticsForNewTarget();
  state.panelLoadState = "loading";
  setMessage(
    "info",
    clearCachesFirst ? "Clearing caches, then loading score and BMS Info Extender panel data." : "Loading compressed score, decompressing, parsing, and fetching BMS Info Extender panel data."
  );
  setBusyState(clearCachesFirst ? "reload" : "load");
  try {
    const normalizedSha256 = normalizeSha256(state.sha256);
    const parserVersion = normalizeParserVersion(state.parserVersion);
    const scoreBaseUrl = normalizeScoreBaseUrl(state.scoreBaseUrl);
    const loaderContext = await getLoaderContext(parserVersion, scoreBaseUrl);
    if (requestId !== activeRequestId) {
      return;
    }
    state.loaderModuleUrl = loaderContext.moduleUrl;
    if (clearCachesFirst) {
      loaderContext.loader.clearMemoryCache();
      if (typeof indexedDB === "undefined") {
        setMessage("warning", "IndexedDB is unavailable in this environment. Reload continues with memory cache only.");
      }
      await loaderContext.loader.clearIndexedDbCache();
    }
    const scorePromise = (async () => {
      const compressedResult = await loaderContext.loader.loadCompressedScore(normalizedSha256);
      const decompressedResult = await loaderContext.loader.loadDecompressedScoreBytes(normalizedSha256);
      const parsedResult = await loaderContext.loader.loadParsedScore(normalizedSha256);
      return { compressedResult, decompressedResult, parsedResult };
    })();
    const panelPromise = fetchBmsInfoRecordByIdentifiers({ sha256: normalizedSha256 });
    const [scoreResult, panelResult] = await Promise.allSettled([scorePromise, panelPromise]);
    if (requestId !== activeRequestId) {
      return;
    }
    state.sha256 = normalizedSha256;
    state.parserVersion = parserVersion;
    state.scoreBaseUrl = scoreBaseUrl;
    if (panelResult.status === "fulfilled") {
      state.bmsDataRecord = panelResult.value;
      state.panelLoadState = "ready";
      state.panelError = null;
    } else {
      state.bmsDataRecord = null;
      state.panelLoadState = "error";
      state.panelError = buildPanelError(panelResult.reason);
    }
    if (scoreResult.status !== "fulfilled") {
      state.parsedScore = null;
      state.viewerModel = null;
      state.selectedBeat = 0;
      state.compressedSource = null;
      state.compressedByteLength = null;
      state.decompressedByteLength = null;
      state.resolvedScoreUrl = null;
      state.lastError = buildUiErrorFromUnknown(scoreResult.reason);
      setMessage("error", state.lastError.message);
      clearBusyState("error");
      renderSliderBounds();
      syncFormFromState();
      writeQueryState();
      render();
      return;
    }
    state.compressedSource = scoreResult.value.compressedResult.source;
    state.resolvedScoreUrl = getAbsoluteScoreUrl(scoreResult.value.compressedResult.url);
    state.compressedByteLength = scoreResult.value.compressedResult.byteLength;
    state.decompressedByteLength = scoreResult.value.decompressedResult.byteLength;
    state.parsedScore = scoreResult.value.parsedResult.score;
    state.viewerModel = createScoreViewerModel(scoreResult.value.parsedResult.score);
    state.lastError = null;
    state.isViewerOpen = false;
    state.selectedTimeSec = getClampedSelectedTimeSec(state.viewerModel, state.selectedTimeSec);
    state.selectedBeat = getSelectedBeatForTime(state.selectedTimeSec);
    if (state.panelError) {
      setMessage("warning", `Loaded score via ${state.compressedSource}, but BMS Info Extender panel fetch failed.`);
    } else {
      setMessage("info", `Loaded score via ${state.compressedSource}. Hover or click the graph to drive the viewer.`);
    }
    clearBusyState("ready");
    renderSliderBounds();
    syncFormFromState();
    writeQueryState();
    render();
  } catch (error) {
    if (requestId !== activeRequestId) {
      return;
    }
    state.parsedScore = null;
    state.viewerModel = null;
    state.selectedBeat = 0;
    state.compressedSource = null;
    state.compressedByteLength = null;
    state.decompressedByteLength = null;
    state.resolvedScoreUrl = null;
    state.bmsDataRecord = null;
    state.panelLoadState = "error";
    state.panelError = buildPanelError(error);
    state.lastError = buildUiErrorFromUnknown(error);
    setMessage("error", state.lastError.message);
    clearBusyState("error");
    renderSliderBounds();
    render();
  }
}
async function handlePrefetch() {
  if (busyOperation !== null) {
    return;
  }
  updateStateFromControls();
  const requestId = ++activeRequestId;
  resetDiagnosticsForNewTarget();
  setMessage("info", "Prefetching compressed score only.");
  setBusyState("prefetch");
  try {
    const normalizedSha256 = normalizeSha256(state.sha256);
    const parserVersion = normalizeParserVersion(state.parserVersion);
    const scoreBaseUrl = normalizeScoreBaseUrl(state.scoreBaseUrl);
    const loaderContext = await getLoaderContext(parserVersion, scoreBaseUrl);
    if (requestId !== activeRequestId) {
      return;
    }
    state.loaderModuleUrl = loaderContext.moduleUrl;
    const compressedResult = await loaderContext.loader.loadCompressedScore(normalizedSha256);
    if (requestId !== activeRequestId) {
      return;
    }
    state.sha256 = normalizedSha256;
    state.parserVersion = parserVersion;
    state.scoreBaseUrl = scoreBaseUrl;
    state.compressedSource = compressedResult.source;
    state.resolvedScoreUrl = getAbsoluteScoreUrl(compressedResult.url);
    state.compressedByteLength = compressedResult.byteLength;
    state.decompressedByteLength = null;
    state.lastError = null;
    setMessage("info", `Prefetched compressed score via ${compressedResult.source}.`);
    clearBusyState("idle");
    syncFormFromState();
    writeQueryState();
    render();
  } catch (error) {
    if (requestId !== activeRequestId) {
      return;
    }
    state.lastError = buildUiErrorFromUnknown(error);
    setMessage("error", state.lastError.message);
    clearBusyState("error");
    render();
  }
}
async function handleClearMemoryCache() {
  if (busyOperation !== null) {
    return;
  }
  updateStateFromControls();
  setBusyState("clear-memory");
  try {
    const loaderContext = await getLoaderContext(state.parserVersion, state.scoreBaseUrl);
    loaderContext.loader.clearMemoryCache();
    state.lastError = null;
    setMessage("info", "Cleared score loader memory cache.");
    clearBusyState(state.parsedScore ? "ready" : "idle");
    render();
  } catch (error) {
    state.lastError = buildUiErrorFromUnknown(error);
    setMessage("error", state.lastError.message);
    clearBusyState("error");
    render();
  }
}
async function handleClearIndexedDbCache() {
  if (busyOperation !== null) {
    return;
  }
  updateStateFromControls();
  setBusyState("clear-idb");
  try {
    const loaderContext = await getLoaderContext(state.parserVersion, state.scoreBaseUrl);
    await loaderContext.loader.clearIndexedDbCache();
    state.lastError = null;
    if (typeof indexedDB === "undefined") {
      setMessage("warning", "IndexedDB is unavailable in this environment. Nothing persisted to clear.");
    } else {
      setMessage("info", "Cleared score loader IndexedDB cache.");
    }
    clearBusyState(state.parsedScore ? "ready" : "idle");
    render();
  } catch (error) {
    state.lastError = buildUiErrorFromUnknown(error);
    setMessage("error", state.lastError.message);
    clearBusyState("error");
    render();
  }
}
function initializeFromQuery() {
  Object.assign(state, readQueryState());
  syncFormFromState();
  renderSliderBounds();
  render();
}
function attachEventListeners() {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleLoad();
  });
  elements.prefetchButton.addEventListener("click", () => {
    void handlePrefetch();
  });
  elements.clearMemoryButton.addEventListener("click", () => {
    void handleClearMemoryCache();
  });
  elements.clearIdbButton.addEventListener("click", () => {
    void handleClearIndexedDbCache();
  });
  elements.reloadButton.addEventListener("click", () => {
    void handleLoad({ clearCachesFirst: true });
  });
  elements.scoreSourceSelect.addEventListener("change", () => {
    state.scoreSourcePreset = elements.scoreSourceSelect.value;
    state.scoreBaseUrl = getPresetScoreBaseUrl(state.scoreSourcePreset, elements.customScoreBaseUrlInput.value);
    elements.customScoreBaseUrlInput.disabled = state.scoreSourcePreset !== PRESET_CUSTOM;
    if (state.scoreSourcePreset !== PRESET_CUSTOM) {
      elements.customScoreBaseUrlInput.value = state.scoreBaseUrl;
    }
    updateStateFromControls();
    render();
  });
  elements.customScoreBaseUrlInput.addEventListener("input", () => {
    updateStateFromControls();
    render();
  });
  elements.sha256Input.addEventListener("input", () => {
    updateStateFromControls();
    render();
  });
  elements.parserVersionInput.addEventListener("input", () => {
    updateStateFromControls();
    render();
  });
  elements.timeNumberInput.addEventListener("input", () => {
    setSelectedTimeSec(parseOptionalNumber(elements.timeNumberInput.value, state.selectedTimeSec), { openViewer: true });
  });
  elements.timeRangeInput.addEventListener("input", () => {
    setSelectedTimeSec(parseOptionalNumber(elements.timeRangeInput.value, state.selectedTimeSec), { openViewer: true });
  });
}
function boot() {
  initializeFromQuery();
  attachEventListeners();
  if (state.autoloadEnabled && state.sha256) {
    void handleLoad();
  }
}
boot();
