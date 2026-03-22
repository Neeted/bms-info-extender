export const DEFAULT_VIEWER_PIXELS_PER_SECOND = 160;

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

  return {
    score,
    notes,
    comboEvents,
    longEndEventKeys,
    barLines: [...score.barLines].sort(compareNoteLike),
    bpmChanges: [...score.bpmChanges].sort(compareNoteLike),
    stops: [...score.stops].sort(compareNoteLike),
    totalCombo: comboEvents.length,
  };
}

export function getClampedSelectedTimeSec(model, timeSec) {
  if (!model) {
    return 0;
  }
  const numericValue = Number.isFinite(timeSec) ? timeSec : 0;
  return clamp(numericValue, 0, model.score.lastPlayableTimeSec);
}

export function getContentHeightPx(model, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
  if (!model) {
    return Math.max(1, viewportHeight);
  }
  return Math.max(
    Math.max(1, viewportHeight),
    Math.ceil(model.score.lastPlayableTimeSec * pixelsPerSecond + viewportHeight),
  );
}

export function getTimeSecForScrollTop(model, scrollTop, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
  if (!model) {
    return 0;
  }
  return getClampedSelectedTimeSec(model, scrollTop / pixelsPerSecond);
}

export function getScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
  if (!model) {
    return 0;
  }
  const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
  const maxScrollTop = Math.max(0, getContentHeightPx(model, viewportHeight, pixelsPerSecond) - viewportHeight);
  return clamp(clampedTimeSec * pixelsPerSecond, 0, maxScrollTop);
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
    endTimeSec: Math.min(model.score.lastPlayableTimeSec, clampedTimeSec + halfViewportSec + overscanSec),
  };
}

export function getViewerCursor(model, selectedTimeSec) {
  if (!model) {
    return {
      timeSec: 0,
      measureIndex: 0,
      comboCount: 0,
      totalCombo: 0,
    };
  }

  const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
  return {
    timeSec: clampedTimeSec,
    measureIndex: getMeasureIndexAtTime(model, clampedTimeSec),
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

function createFallbackComboEvents(notes) {
  return notes
    .filter((note) => note.kind === "normal" || note.kind === "long")
    .map((note) => ({
      lane: note.lane,
      timeSec: note.timeSec,
      kind: note.kind === "long" ? "long-start" : "normal",
      ...(note.side ? { side: note.side } : {}),
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

function compareNoteLike(left, right) {
  if (left.timeSec !== right.timeSec) {
    return left.timeSec - right.timeSec;
  }
  return (left.lane ?? 0) - (right.lane ?? 0);
}

function compareComboEvent(left, right) {
  if (left.timeSec !== right.timeSec) {
    return left.timeSec - right.timeSec;
  }
  const order = comboEventOrder(left.kind) - comboEventOrder(right.kind);
  if (order !== 0) {
    return order;
  }
  return left.lane - right.lane;
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

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}
