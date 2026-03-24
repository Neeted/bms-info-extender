export const DEFAULT_VIEWER_PIXELS_PER_SECOND = 160;
export const DEFAULT_EDITOR_PIXELS_PER_BEAT = 64;
export const DEFAULT_VIEWER_MODE = "time";

const ACTION_PRECEDENCE = {
  bpm: 1,
  stop: 2,
};

export function normalizeViewerMode(value) {
  return value === "editor" || value === "game" || value === "time"
    ? value
    : DEFAULT_VIEWER_MODE;
}

export function resolveViewerModeForModel(model, viewerMode) {
  const normalizedMode = normalizeViewerMode(viewerMode);
  if (normalizedMode === "editor" && model?.supportsEditorMode) {
    return "editor";
  }
  return DEFAULT_VIEWER_MODE;
}

export function createScoreViewerModel(score) {
  if (!score) {
    return null;
  }

  const notes = score.notes
    .filter((note) => note.kind !== "invisible")
    .map((note) => ({ ...note }))
    .sort(compareNoteLike);

  const comboEvents = (score.comboEvents?.length > 0 ? score.comboEvents : createFallbackComboEvents(score.notes))
    .map((event) => ({ ...event }))
    .sort(compareComboEvent)
    .map((event, index) => ({
      ...event,
      combo: index + 1,
    }));

  const longEndEventKeys = new Set(
    comboEvents
      .filter((event) => event.kind === "long-end")
      .map(createTimedLaneKey),
  );

  const beatTimingIndex = createBeatTimingIndex(score);
  const totalBeat = getScoreTotalBeat(score);
  const notesByBeat = [...notes].sort(compareBeatNoteLike);
  const longNotesByBeat = notesByBeat.filter((note) => note.kind === "long");
  const longNotesByEndBeat = [...longNotesByBeat].sort(compareLongNoteEndBeat);
  const measureRanges = createEditorMeasureRanges(score.barLines, totalBeat);

  return {
    score,
    notes,
    notesByBeat,
    longNotesByBeat,
    longNotesByEndBeat,
    measureRanges,
    comboEvents,
    longEndEventKeys,
    barLines: [...score.barLines].sort(compareTimedBeatLike),
    bpmChanges: [...score.bpmChanges].sort(compareTimedBeatLike),
    stops: [...score.stops].sort(compareTimedBeatLike),
    scrollChanges: [...(score.scrollChanges ?? [])].sort(compareTimedBeatLike),
    totalCombo: comboEvents.length,
    beatTimingIndex,
    totalBeat,
    supportsEditorMode: Boolean(beatTimingIndex && Number.isFinite(totalBeat)),
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
  return Math.max(maxBeat, 0);
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
) {
  if (!model) {
    return { startTimeSec: 0, endTimeSec: 0 };
  }
  const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
  const halfViewportSec = viewportHeight / pixelsPerSecond / 2;
  const overscanSec = Math.max(halfViewportSec * 0.35, 0.75);
  return {
    startTimeSec: Math.max(0, clampedTimeSec - halfViewportSec - overscanSec),
    endTimeSec: Math.min(getScoreTotalDurationSec(model.score), clampedTimeSec + halfViewportSec + overscanSec),
  };
}

export function getVisibleBeatRange(
  model,
  selectedTimeSec,
  viewportHeight,
  pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
) {
  return getEditorFrameState(model, selectedTimeSec, viewportHeight, pixelsPerBeat);
}

export function getEditorFrameState(
  model,
  selectedTimeSec,
  viewportHeight,
  pixelsPerBeat = DEFAULT_EDITOR_PIXELS_PER_BEAT,
) {
  if (!model) {
    return {
      selectedBeat: 0,
      startBeat: 0,
      endBeat: 0,
      viewportHeight: Math.max(viewportHeight, 0),
    };
  }
  const selectedBeat = getBeatAtTimeSec(model, selectedTimeSec);
  const halfViewportBeat = viewportHeight / pixelsPerBeat / 2;
  const overscanBeat = Math.max(halfViewportBeat * 0.35, 1);
  return {
    selectedBeat,
    startBeat: Math.max(0, selectedBeat - halfViewportBeat - overscanBeat),
    endBeat: Math.min(model.totalBeat ?? 0, selectedBeat + halfViewportBeat + overscanBeat),
    viewportHeight,
  };
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
    beat: resolvedMode === "editor" ? selectedBeat : 0,
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
  if (!model || note?.kind !== "long" || !Number.isFinite(note?.endTimeSec)) {
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
  return notes
    .filter((note) => note.kind === "normal" || note.kind === "long")
    .map((note) => ({
      lane: note.lane,
      beat: Number.isFinite(note.beat) ? note.beat : 0,
      timeSec: note.timeSec,
      kind: note.kind === "long" ? "long-start" : "normal",
      ...(note.side ? { side: note.side } : {}),
    }));
}

function createBeatTimingIndex(score) {
  const initialBpm = Number.isFinite(score.initialBpm) && score.initialBpm > 0 ? score.initialBpm : null;
  if (!initialBpm) {
    return null;
  }

  const actions = [];
  for (const event of score.bpmChanges ?? []) {
    if (Number.isFinite(event?.beat) && Number.isFinite(event?.bpm) && event.bpm > 0) {
      actions.push({ type: "bpm", beat: event.beat, bpm: event.bpm });
    }
  }
  for (const event of score.stops ?? []) {
    if (Number.isFinite(event?.beat) && Number.isFinite(event?.stopBeats) && event.stopBeats > 0) {
      actions.push({ type: "stop", beat: event.beat, stopBeats: event.stopBeats });
    }
  }

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
    if (action.beat > currentBeat) {
      const nextSeconds = currentSeconds + ((action.beat - currentBeat) * 60) / currentBpm;
      segments.push({
        type: "linear",
        startSec: currentSeconds,
        endSec: nextSeconds,
        startBeat: currentBeat,
        endBeat: action.beat,
        bpm: currentBpm,
      });
      currentBeat = action.beat;
      currentSeconds = nextSeconds;
    }

    if (action.type === "bpm") {
      currentBpm = action.bpm;
    } else {
      const stopDurationSec = ((action.stopBeats ?? 0) * 60) / currentBpm;
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
        return (normalizedBeat * 60) / initialBpm;
      }
      return stateSeconds[actionIndex] + ((normalizedBeat - stateBeats[actionIndex]) * 60) / stateBpms[actionIndex];
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
          return segment.startBeat + ((normalizedSeconds - segment.startSec) * segment.bpm) / 60;
        }
      }
      return currentBeat + ((normalizedSeconds - currentSeconds) * currentBpm) / 60;
    },
  };
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

function createTimedLaneKey(input, timeSec, side = undefined) {
  if (typeof input === "object" && input !== null) {
    return createTimedLaneKey(input.lane, input.timeSec ?? input.endTimeSec, input.side);
  }
  return `${side ?? "-"}:${input}:${Math.round((timeSec ?? 0) * 1000000)}`;
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}
