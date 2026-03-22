const FORMAT_HINT_VALUES = new Set(["bms", "bmson", "auto"]);
const TEXT_ENCODING_VALUES = new Set(["shift_jis", "utf-8", "auto"]);

export function normalizeParseOptions(options = {}) {
  const formatHint = normalizeValue(options.formatHint, FORMAT_HINT_VALUES, "auto");
  const textEncoding = normalizeValue(options.textEncoding, TEXT_ENCODING_VALUES, "auto");
  const sha256 = typeof options.sha256 === "string" && options.sha256.trim() !== ""
    ? options.sha256.trim().toLowerCase()
    : undefined;
  return { formatHint, textEncoding, sha256 };
}

export function normalizeValue(value, allowedValues, fallbackValue) {
  return typeof value === "string" && allowedValues.has(value) ? value : fallbackValue;
}

export function success(score) {
  return { ok: true, score };
}

export function failure(type, message) {
  return {
    ok: false,
    error: {
      type,
      message,
    },
  };
}

export function createWarning(type, message) {
  return { type, message };
}

export function createEmptyScore({
  sha256,
  format,
  mode,
  laneCount,
  notes = [],
  barLines = [],
  bpmChanges = [],
  stops = [],
  warnings = [],
  lastPlayableTimeSec = 0,
  lastTimelineTimeSec = 0,
}) {
  const noteCounts = summarizeNoteCounts(notes);
  return {
    sha256,
    format,
    mode,
    laneCount,
    totalDurationSec: lastTimelineTimeSec,
    lastPlayableTimeSec,
    lastTimelineTimeSec,
    noteCounts,
    notes,
    barLines,
    bpmChanges,
    stops,
    warnings,
  };
}

export function summarizeNoteCounts(notes) {
  const summary = {
    visible: 0,
    normal: 0,
    long: 0,
    invisible: 0,
    mine: 0,
    all: notes.length,
  };

  for (const note of notes) {
    if (note.kind === "normal") {
      summary.normal += 1;
      summary.visible += 1;
      continue;
    }
    if (note.kind === "long") {
      summary.long += 1;
      summary.visible += 1;
      continue;
    }
    if (note.kind === "invisible") {
      summary.invisible += 1;
      continue;
    }
    if (note.kind === "mine") {
      summary.mine += 1;
    }
  }

  return summary;
}
