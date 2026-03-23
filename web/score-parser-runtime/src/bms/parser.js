import { createEmptyScore, createWarning, failure, success } from "../dto.js";
import { TimeSignatures, Timing } from "../shared/timing.js";
import { compileBms } from "./compiler.js";
import {
  detectBmsMode,
  getNoteChannelDescriptor,
  isBackgroundChannel,
  isBgaChannel,
  laneCountForMode,
  mapBmsLane,
} from "./channels.js";

export function parseBmsText(text, options) {
  const timeSignatures = new TimeSignatures();
  const { chart, warnings } = compileBms(text, { rng: options.rng, timeSignatures });
  const noteDescriptors = chart.objects
    .map((object) => getNoteChannelDescriptor(object.channel))
    .filter(Boolean);

  const mode = detectBmsMode(noteDescriptors);
  if (mode === "unknown") {
    return failure("unsupported_mode", "Could not determine a supported BMS key mode.");
  }

  const timingWarnings = [];
  const timing = buildTiming(chart, timingWarnings);
  const timelineObjects = chart.objects.map((object) => {
    const beat = chart.timeSignatures.measureToBeat(object.measure, object.fraction);
    return {
      ...object,
      beat,
      timeSec: timing.beatToSeconds(beat),
      descriptor: getNoteChannelDescriptor(object.channel),
    };
  });

  const noteWarnings = [];
  const { notes, comboEvents, lastPlayableTimeSec } = buildNotes(timelineObjects, mode, chart.headers, noteWarnings);
  const barLines = buildBarLines(chart.timeSignatures, timing, timelineObjects);
  const bpmChanges = buildBpmChanges(chart, timingWarnings, timing);
  const stops = buildStops(chart, timingWarnings, timing);
  const scrollChanges = buildScrollChanges(chart, timingWarnings, timing);
  const lastTimelineTimeSec = computeLastTimelineTimeSec(timelineObjects, notes, lastPlayableTimeSec);

  return success(createEmptyScore({
    sha256: options.sha256,
    format: "bms",
    mode,
    laneCount: laneCountForMode(mode),
    notes,
    comboEvents,
    barLines,
    bpmChanges,
    stops,
    scrollChanges,
    warnings: [...warnings, ...timingWarnings, ...noteWarnings],
    lastPlayableTimeSec,
    lastTimelineTimeSec,
  }));
}

function buildTiming(chart, warnings) {
  let initialBpm = Number.parseFloat(chart.headers.get("BPM") ?? "60");
  if (!Number.isFinite(initialBpm) || initialBpm <= 0) {
    warnings.push(createWarning("parse_warning", "Invalid #BPM header. Falling back to BPM 60."));
    initialBpm = 60;
  }

  const actions = [];
  const extendedBpmCache = new Map();
  const stopBeatsCache = new Map();
  for (const object of chart.objects) {
    const beat = chart.timeSignatures.measureToBeat(object.measure, object.fraction);
    if (object.channel === "03") {
      const bpm = Number.parseInt(object.value, 16);
      if (Number.isFinite(bpm) && bpm > 0) {
        actions.push({ type: "bpm", beat, bpm });
      } else {
        warnings.push(createWarning("parse_warning", `Ignored non-positive direct BPM value ${object.value}.`));
      }
      continue;
    }
    if (object.channel === "08") {
      const bpm = resolveExtendedBpm(chart.headers, object.value, extendedBpmCache);
      if (bpm !== null) {
        actions.push({ type: "bpm", beat, bpm });
      } else {
        warnings.push(createWarning("parse_warning", `Ignored missing or invalid extended BPM reference BPM${object.value}.`));
      }
      continue;
    }
    if (object.channel === "09") {
      const stopBeats = resolveStopBeats(chart.headers, object.value, stopBeatsCache);
      if (stopBeats !== null) {
        actions.push({ type: "stop", beat, stopBeats });
      } else {
        warnings.push(createWarning("parse_warning", `Ignored missing or invalid STOP reference STOP${object.value}.`));
      }
    }
  }

  return new Timing(initialBpm, actions);
}

function buildBpmChanges(chart, warnings, timing) {
  const changes = [];
  let currentBpm = Number.parseFloat(chart.headers.get("BPM") ?? "60");
  if (!Number.isFinite(currentBpm) || currentBpm <= 0) {
    currentBpm = 60;
  }

  const extendedBpmCache = new Map();
  for (const object of chart.objects) {
    const beat = chart.timeSignatures.measureToBeat(object.measure, object.fraction);
    let nextBpm = null;
    if (object.channel === "03") {
      const bpm = Number.parseInt(object.value, 16);
      if (Number.isFinite(bpm) && bpm > 0) {
        nextBpm = bpm;
      }
    } else if (object.channel === "08") {
      const bpm = resolveExtendedBpm(chart.headers, object.value, extendedBpmCache);
      if (bpm !== null) {
        nextBpm = bpm;
      } else {
        warnings.push(createWarning("parse_warning", `Ignored invalid BPM change reference BPM${object.value}.`));
      }
    }

    if (nextBpm !== null && nextBpm !== currentBpm) {
      changes.push({ timeSec: timing.beatToSeconds(beat), bpm: nextBpm });
      currentBpm = nextBpm;
    } else if (nextBpm !== null) {
      currentBpm = nextBpm;
    }
  }
  changes.sort((left, right) => left.timeSec - right.timeSec || left.bpm - right.bpm);
  return changes;
}

function buildStops(chart, warnings, timing) {
  const stops = [];
  const stopBeatsCache = new Map();
  for (const object of chart.objects) {
    if (object.channel !== "09") {
      continue;
    }
    const stopBeats = resolveStopBeats(chart.headers, object.value, stopBeatsCache);
    if (stopBeats === null) {
      warnings.push(createWarning("parse_warning", `Ignored invalid STOP reference STOP${object.value}.`));
      continue;
    }
    const beat = chart.timeSignatures.measureToBeat(object.measure, object.fraction);
    const bpm = timing.getBpmAtBeat(beat);
    stops.push({
      timeSec: timing.beatToSeconds(beat),
      durationSec: (stopBeats * 60) / bpm,
    });
  }
  stops.sort((left, right) => left.timeSec - right.timeSec);
  return stops;
}

function buildScrollChanges(chart, warnings, timing) {
  const scrollChanges = [];
  const scrollRateCache = new Map();
  for (const object of chart.objects) {
    if (object.channel !== "SC") {
      continue;
    }
    const rate = resolveScrollRate(chart.headers, object.value, scrollRateCache);
    if (rate === null) {
      warnings.push(createWarning("parse_warning", `Ignored invalid SCROLL reference SCROLL${object.value}.`));
      continue;
    }
    const beat = chart.timeSignatures.measureToBeat(object.measure, object.fraction);
    scrollChanges.push({
      timeSec: timing.beatToSeconds(beat),
      rate,
    });
  }
  scrollChanges.sort((left, right) => left.timeSec - right.timeSec);
  return scrollChanges;
}

function resolveExtendedBpm(headers, value, cache) {
  if (cache.has(value)) {
    return cache.get(value);
  }

  const parsedValue = Number.parseFloat(headers.get(`BPM${value}`) ?? "");
  const bpm = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
  cache.set(value, bpm);
  return bpm;
}

function resolveStopBeats(headers, value, cache) {
  if (cache.has(value)) {
    return cache.get(value);
  }

  const parsedValue = Number.parseFloat(headers.get(`STOP${value}`) ?? "");
  const stopBeats = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue / 48 : null;
  cache.set(value, stopBeats);
  return stopBeats;
}

function resolveScrollRate(headers, value, cache) {
  if (cache.has(value)) {
    return cache.get(value);
  }

  const parsedValue = Number.parseFloat(headers.get(`SCROLL${value}`) ?? "");
  const rate = Number.isFinite(parsedValue) ? parsedValue : null;
  cache.set(value, rate);
  return rate;
}

function buildNotes(timelineObjects, mode, headers, warnings) {
  const notes = [];
  const comboEvents = [];
  const longGroups = new Map();
  const playableGroups = new Map();
  let lastPlayableTimeSec = 0;
  const lnobj = headers.get("LNOBJ")?.toUpperCase();
  const longNoteType = readLongNoteType(headers);

  for (const object of timelineObjects) {
    const descriptor = object.descriptor;
    if (!descriptor) {
      continue;
    }
    const lane = mapBmsLane(mode, descriptor.side, descriptor.key);
    if (lane === null) {
      warnings.push(createWarning("parse_warning", `Ignored unsupported note channel ${object.channel} for mode ${mode}.`));
      continue;
    }

    const parsedSide = parsedSideForMode(mode, descriptor.side);
    const noteBase = {
      lane,
      timeSec: object.timeSec,
      ...(parsedSide ? { side: parsedSide } : {}),
    };

    if (descriptor.family === "invisible") {
      notes.push({ ...noteBase, kind: "invisible" });
      continue;
    }
    if (descriptor.family === "mine") {
      notes.push({ ...noteBase, kind: "mine" });
      continue;
    }

    const groupKey = `${descriptor.family}:${descriptor.side}:${String(descriptor.key)}`;
    if (descriptor.family === "long") {
      if (!longGroups.has(groupKey)) {
        longGroups.set(groupKey, []);
      }
      longGroups.get(groupKey).push({ ...object, lane, side: parsedSide });
      continue;
    }

    if (!playableGroups.has(groupKey)) {
      playableGroups.set(groupKey, []);
    }
    playableGroups.get(groupKey).push({ ...object, lane, side: parsedSide });
  }

  for (const group of longGroups.values()) {
    group.sort(compareTimelineObject);
    for (let index = 0; index + 1 < group.length; index += 2) {
      const start = group[index];
      const end = group[index + 1];
      notes.push({
        lane: start.lane,
        timeSec: start.timeSec,
        endTimeSec: end.timeSec,
        kind: "long",
        side: start.side,
      });
      comboEvents.push(createComboEvent(start, "long-start"));
      if (shouldCountLongEnd(longNoteType)) {
        comboEvents.push(createComboEvent(end, "long-end"));
      }
      lastPlayableTimeSec = Math.max(lastPlayableTimeSec, end.timeSec);
    }
    if (group.length % 2 === 1) {
      warnings.push(createWarning("parse_warning", `Dropped dangling LNTYPE1 endpoint on lane ${group[group.length - 1].lane}.`));
    }
  }

  for (const group of playableGroups.values()) {
    group.sort(compareTimelineObject);
    if (lnobj) {
      let pendingStart = null;
      for (const object of group) {
        if (object.value === lnobj) {
          if (pendingStart) {
            notes.push({
              lane: pendingStart.lane,
              timeSec: pendingStart.timeSec,
              endTimeSec: object.timeSec,
              kind: "long",
              side: pendingStart.side,
            });
            comboEvents.push(createComboEvent(pendingStart, "long-start"));
            if (shouldCountLongEnd(longNoteType)) {
              comboEvents.push(createComboEvent(object, "long-end"));
            }
            lastPlayableTimeSec = Math.max(lastPlayableTimeSec, object.timeSec);
            pendingStart = null;
          }
          continue;
        }
        if (pendingStart) {
          notes.push({
            lane: pendingStart.lane,
            timeSec: pendingStart.timeSec,
            kind: "normal",
            side: pendingStart.side,
          });
          comboEvents.push(createComboEvent(pendingStart, "normal"));
          lastPlayableTimeSec = Math.max(lastPlayableTimeSec, pendingStart.timeSec);
        }
        pendingStart = object;
      }
      if (pendingStart) {
        notes.push({
          lane: pendingStart.lane,
          timeSec: pendingStart.timeSec,
          kind: "normal",
          side: pendingStart.side,
        });
        comboEvents.push(createComboEvent(pendingStart, "normal"));
        lastPlayableTimeSec = Math.max(lastPlayableTimeSec, pendingStart.timeSec);
      }
      continue;
    }

    for (const object of group) {
      notes.push({
        lane: object.lane,
        timeSec: object.timeSec,
        kind: "normal",
        side: object.side,
      });
      comboEvents.push(createComboEvent(object, "normal"));
      lastPlayableTimeSec = Math.max(lastPlayableTimeSec, object.timeSec);
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

  comboEvents.sort(compareComboEvent);

  return { notes, comboEvents, lastPlayableTimeSec };
}

function parsedSideForMode(mode, side) {
  switch (mode) {
    case "5k":
    case "7k":
    case "10k":
    case "14k":
      return side;
    default:
      return undefined;
  }
}

function compareTimelineObject(left, right) {
  if (left.beat !== right.beat) {
    return left.beat - right.beat;
  }
  if (left.lineNumber !== right.lineNumber) {
    return left.lineNumber - right.lineNumber;
  }
  return left.index - right.index;
}

function readLongNoteType(headers) {
  const lnmode = Number.parseInt(headers.get("LNMODE") ?? "", 10);
  return lnmode >= 1 && lnmode <= 3 ? lnmode : 0;
}

function shouldCountLongEnd(longNoteType) {
  return longNoteType === 2 || longNoteType === 3;
}

function createComboEvent(object, kind) {
  const event = {
    lane: object.lane,
    timeSec: object.timeSec,
    kind,
  };
  if (object.side) {
    event.side = object.side;
  }
  return event;
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

function buildBarLines(timeSignatures, timing, timelineObjects) {
  const maxObjectMeasure = timelineObjects.reduce((maxMeasure, object) => Math.max(maxMeasure, object.measure), 0);
  const maxMeasure = Math.max(maxObjectMeasure, timeSignatures.maxConfiguredMeasure()) + 1;
  const barLines = [];
  for (let measure = 0; measure <= maxMeasure; measure += 1) {
    const beat = timeSignatures.measureToBeat(measure, 0);
    barLines.push({ timeSec: timing.beatToSeconds(beat) });
  }
  return barLines;
}

function computeLastTimelineTimeSec(timelineObjects, notes, lastPlayableTimeSec) {
  let maxTimeSec = lastPlayableTimeSec;
  for (const object of timelineObjects) {
    if (isTimelineStateChannel(object.channel) || isBackgroundChannel(object.channel) || isBgaChannel(object.channel)) {
      maxTimeSec = Math.max(maxTimeSec, object.timeSec);
      continue;
    }
    const descriptor = object.descriptor;
    if (descriptor && (descriptor.family === "invisible" || descriptor.family === "mine")) {
      maxTimeSec = Math.max(maxTimeSec, object.timeSec);
    }
  }
  for (const note of notes) {
    if (note.kind === "invisible" || note.kind === "mine") {
      maxTimeSec = Math.max(maxTimeSec, note.timeSec);
    }
  }
  return maxTimeSec;
}

function isTimelineStateChannel(channel) {
  return channel === "03" || channel === "08" || channel === "09" || channel === "SC";
}
