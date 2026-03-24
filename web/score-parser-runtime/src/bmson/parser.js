import { createEmptyScore, createWarning, failure, success } from "../dto.js";
import {
  Timing,
  buildBpmChangesFromTimingActions,
  buildStopsFromTimingActions,
  materializeTimingActions,
} from "../shared/timing.js";

export function parseBmsonText(text, options) {
  let bmson;
  try {
    bmson = JSON.parse(text);
  } catch (error) {
    return failure("parse_failure", `Failed to parse BMSON JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!bmson || typeof bmson !== "object") {
    return failure("parse_failure", "Parsed BMSON did not produce an object.");
  }

  const warnings = [];
  const resolution = Number.isFinite(bmson.info?.resolution) && bmson.info.resolution > 0
    ? bmson.info.resolution
    : 240;
  const initialBpm = Number.isFinite(bmson.info?.init_bpm) && bmson.info.init_bpm > 0
    ? bmson.info.init_bpm
    : 60;
  const mode = detectBmsonMode(bmson);
  if (mode === "unknown") {
    return failure("unsupported_mode", "Could not determine a supported BMSON mode.");
  }

  const laneCount = laneCountForBmsonMode(mode);
  const actions = [];
  for (const event of bmson.bpm_events ?? []) {
    if (Number.isFinite(event?.y) && Number.isFinite(event?.bpm) && event.bpm > 0) {
      actions.push({
        type: "bpm",
        beat: event.y / resolution,
        bpm: event.bpm,
      });
    } else {
      warnings.push(createWarning("parse_warning", "Ignored invalid bmson bpm_event."));
    }
  }
  for (const event of bmson.stop_events ?? []) {
    if (Number.isFinite(event?.y) && Number.isFinite(event?.duration) && event.duration > 0) {
      actions.push({
        type: "stop",
        beat: event.y / resolution,
        stopBeats: event.duration / resolution,
      });
    } else {
      warnings.push(createWarning("parse_warning", "Ignored invalid bmson stop_event."));
    }
  }
  for (const event of bmson.scroll_events ?? []) {
    if (!Number.isFinite(event?.y) || !Number.isFinite(event?.rate)) {
      warnings.push(createWarning("parse_warning", "Ignored invalid bmson scroll_event."));
    }
  }

  const timing = new Timing(initialBpm, actions);
  const timingActions = materializeTimingActions(timing);
  const notes = [];
  const comboEvents = [];
  let lastPlayableTimeSec = 0;
  for (const channel of bmson.sound_channels ?? []) {
    for (const note of channel.notes ?? []) {
      const mapping = mapBmsonLane(mode, note?.x);
      if (!mapping) {
        warnings.push(createWarning("parse_warning", `Ignored unsupported BMSON lane x=${String(note?.x)} for mode ${mode}.`));
        continue;
      }
      const beat = note.y / resolution;
      const timeSec = timing.beatToSeconds(beat);
      const endBeat = Number.isFinite(note.l) && note.l > 0
        ? (note.y + note.l) / resolution
        : undefined;
      const endTimeSec = Number.isFinite(note.l) && note.l > 0
        ? timing.beatToSeconds(endBeat)
        : undefined;
      notes.push({
        lane: mapping.lane,
        beat,
        timeSec,
        endBeat,
        endTimeSec,
        kind: endTimeSec === undefined ? "normal" : "long",
        side: mapping.side,
      });
      if (endTimeSec === undefined) {
        comboEvents.push(createComboEvent(mapping, beat, timeSec, "normal"));
      } else {
        comboEvents.push(createComboEvent(mapping, beat, timeSec, "long-start"));
        if (shouldCountBmsonLongEnd(note)) {
          comboEvents.push(createComboEvent(mapping, endBeat, endTimeSec, "long-end"));
        }
      }
      lastPlayableTimeSec = Math.max(lastPlayableTimeSec, endTimeSec ?? timeSec);
    }
  }

  notes.sort((left, right) => {
    if (left.timeSec !== right.timeSec) {
      return left.timeSec - right.timeSec;
    }
    if ((left.endTimeSec ?? left.timeSec) !== (right.endTimeSec ?? right.timeSec)) {
      return (left.endTimeSec ?? left.timeSec) - (right.endTimeSec ?? right.timeSec);
    }
    return left.lane - right.lane;
  });
  comboEvents.sort((left, right) => {
    if (left.timeSec !== right.timeSec) {
      return left.timeSec - right.timeSec;
    }
    const order = comboEventOrder(left.kind) - comboEventOrder(right.kind);
    if (order !== 0) {
      return order;
    }
    return left.lane - right.lane;
  });

  const bpmChanges = buildBpmChangesFromTimingActions(initialBpm, timingActions);
  const stops = buildStopsFromTimingActions(timingActions);

  const scrollChanges = (bmson.scroll_events ?? [])
    .filter((event) => Number.isFinite(event?.rate) && Number.isFinite(event?.y))
    .map((event) => ({
      beat: event.y / resolution,
      timeSec: timing.beatToSeconds(event.y / resolution),
      rate: event.rate,
    }))
    .sort((left, right) => left.beat - right.beat || left.timeSec - right.timeSec);

  const barLines = (bmson.lines ?? [])
    .filter((line) => Number.isFinite(line?.y))
    .map((line) => ({
      beat: line.y / resolution,
      timeSec: timing.beatToSeconds(line.y / resolution),
    }))
    .sort((left, right) => left.beat - right.beat || left.timeSec - right.timeSec);

  let lastTimelineTimeSec = lastPlayableTimeSec;
  for (const event of bmson.bpm_events ?? []) {
    if (Number.isFinite(event?.y)) {
      lastTimelineTimeSec = Math.max(lastTimelineTimeSec, timing.beatToSeconds(event.y / resolution));
    }
  }
  for (const event of bmson.stop_events ?? []) {
    if (Number.isFinite(event?.y)) {
      lastTimelineTimeSec = Math.max(lastTimelineTimeSec, timing.beatToSeconds(event.y / resolution));
    }
  }
  for (const event of bmson.scroll_events ?? []) {
    if (Number.isFinite(event?.y)) {
      lastTimelineTimeSec = Math.max(lastTimelineTimeSec, timing.beatToSeconds(event.y / resolution));
    }
  }
  for (const event of bmson.bga?.bga_events ?? []) {
    if (Number.isFinite(event?.y)) {
      lastTimelineTimeSec = Math.max(lastTimelineTimeSec, timing.beatToSeconds(event.y / resolution));
    }
  }
  for (const event of bmson.bga?.layer_events ?? []) {
    if (Number.isFinite(event?.y)) {
      lastTimelineTimeSec = Math.max(lastTimelineTimeSec, timing.beatToSeconds(event.y / resolution));
    }
  }
  for (const event of bmson.bga?.poor_events ?? []) {
    if (Number.isFinite(event?.y)) {
      lastTimelineTimeSec = Math.max(lastTimelineTimeSec, timing.beatToSeconds(event.y / resolution));
    }
  }

  return success(createEmptyScore({
    sha256: options.sha256,
    format: "bmson",
    mode,
    laneCount,
    initialBpm,
    notes,
    comboEvents,
    barLines,
    bpmChanges,
    stops,
    scrollChanges,
    timingActions,
    warnings,
    lastPlayableTimeSec,
    lastTimelineTimeSec,
  }));
}

function detectBmsonMode(bmson) {
  const modeHint = bmson.info?.mode_hint;
  if (modeHint === "popn-5k") {
    return "popn-5k";
  }
  if (modeHint === "popn-9k") {
    return "popn-9k";
  }
  if (modeHint === "beat-5k") {
    return "5k";
  }
  if (modeHint === "beat-7k") {
    return "7k";
  }
  if (modeHint === "beat-10k") {
    return "10k";
  }
  if (modeHint === "beat-14k") {
    return "14k";
  }

  const xs = [];
  for (const channel of bmson.sound_channels ?? []) {
    for (const note of channel.notes ?? []) {
      if (Number.isFinite(note?.x)) {
        xs.push(Number(note.x));
      }
    }
  }
  if (xs.length === 0) {
    return "unknown";
  }
  if (xs.every((x) => x >= 1 && x <= 9)) {
    return "9k";
  }
  const hasSecondPlayer = xs.some((x) => x >= 9 && x <= 16);
  const hasDeluxeKeys = xs.some((x) => x === 6 || x === 7 || x === 14 || x === 15);
  if (hasSecondPlayer) {
    return hasDeluxeKeys ? "14k" : "10k";
  }
  return hasDeluxeKeys ? "7k" : "5k";
}

function laneCountForBmsonMode(mode) {
  switch (mode) {
    case "5k":
      return 6;
    case "7k":
      return 8;
    case "popn-5k":
      return 5;
    case "9k":
      return 9;
    case "popn-9k":
      return 9;
    case "10k":
      return 12;
    case "14k":
      return 16;
    default:
      return 0;
  }
}

function mapBmsonLane(mode, xValue) {
  const x = Number(xValue);
  switch (mode) {
    case "5k":
      if (x === 8) {
        return { lane: 0, side: "p1" };
      }
      if (x >= 1 && x <= 5) {
        return { lane: x, side: "p1" };
      }
      return null;
    case "7k":
      if (x === 8) {
        return { lane: 0, side: "p1" };
      }
      if (x >= 1 && x <= 7) {
        return { lane: x, side: "p1" };
      }
      return null;
    case "popn-5k":
      if (x >= 1 && x <= 5) {
        return { lane: x - 1 };
      }
      return null;
    case "9k":
      if (x >= 1 && x <= 9) {
        return { lane: x - 1 };
      }
      return null;
    case "popn-9k":
      if (x >= 1 && x <= 9) {
        return { lane: x - 1 };
      }
      return null;
    case "10k":
      if (x === 8) {
        return { lane: 0, side: "p1" };
      }
      if (x >= 1 && x <= 5) {
        return { lane: x, side: "p1" };
      }
      if (x === 16) {
        return { lane: 6, side: "p2" };
      }
      if (x >= 9 && x <= 13) {
        return { lane: x - 2, side: "p2" };
      }
      return null;
    case "14k":
      if (x === 8) {
        return { lane: 0, side: "p1" };
      }
      if (x >= 1 && x <= 7) {
        return { lane: x, side: "p1" };
      }
      if (x === 16) {
        return { lane: 8, side: "p2" };
      }
      if (x >= 9 && x <= 15) {
        return { lane: x, side: "p2" };
      }
      return null;
    default:
      return null;
  }
}

function shouldCountBmsonLongEnd(note) {
  return note?.t === 2 || note?.t === 3;
}

function createComboEvent(mapping, beat, timeSec, kind) {
  const event = {
    lane: mapping.lane,
    beat,
    timeSec,
    kind,
  };
  if (mapping.side) {
    event.side = mapping.side;
  }
  return event;
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
