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
  const { notes, lastPlayableTimeSec } = buildNotes(timelineObjects, mode, chart.headers, noteWarnings);
  const barLines = buildBarLines(chart.timeSignatures, timing, timelineObjects);
  const bpmChanges = buildBpmChanges(chart, timingWarnings);
  const stops = buildStops(chart, timingWarnings, timing);
  const lastTimelineTimeSec = computeLastTimelineTimeSec(timelineObjects, notes, lastPlayableTimeSec);

  return success(createEmptyScore({
    sha256: options.sha256,
    format: "bms",
    mode,
    laneCount: laneCountForMode(mode),
    notes,
    barLines,
    bpmChanges,
    stops,
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
      const bpm = Number.parseFloat(chart.headers.get(`BPM${object.value}`) ?? "");
      if (Number.isFinite(bpm) && bpm > 0) {
        actions.push({ type: "bpm", beat, bpm });
      } else {
        warnings.push(createWarning("parse_warning", `Ignored missing or invalid extended BPM reference BPM${object.value}.`));
      }
      continue;
    }
    if (object.channel === "09") {
      const stopValue = Number.parseFloat(chart.headers.get(`STOP${object.value}`) ?? "");
      if (Number.isFinite(stopValue) && stopValue > 0) {
        actions.push({ type: "stop", beat, stopBeats: stopValue / 48 });
      } else {
        warnings.push(createWarning("parse_warning", `Ignored missing or invalid STOP reference STOP${object.value}.`));
      }
    }
  }

  return new Timing(initialBpm, actions);
}

function buildBpmChanges(chart, warnings) {
  const changes = [];
  const timing = buildTiming(chart, []);
  let currentBpm = Number.parseFloat(chart.headers.get("BPM") ?? "60");
  if (!Number.isFinite(currentBpm) || currentBpm <= 0) {
    currentBpm = 60;
  }

  for (const object of chart.objects) {
    const beat = chart.timeSignatures.measureToBeat(object.measure, object.fraction);
    let nextBpm = null;
    if (object.channel === "03") {
      const bpm = Number.parseInt(object.value, 16);
      if (Number.isFinite(bpm) && bpm > 0) {
        nextBpm = bpm;
      }
    } else if (object.channel === "08") {
      const bpm = Number.parseFloat(chart.headers.get(`BPM${object.value}`) ?? "");
      if (Number.isFinite(bpm) && bpm > 0) {
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
  for (const object of chart.objects) {
    if (object.channel !== "09") {
      continue;
    }
    const stopValue = Number.parseFloat(chart.headers.get(`STOP${object.value}`) ?? "");
    if (!Number.isFinite(stopValue) || stopValue <= 0) {
      warnings.push(createWarning("parse_warning", `Ignored invalid STOP reference STOP${object.value}.`));
      continue;
    }
    const beat = chart.timeSignatures.measureToBeat(object.measure, object.fraction);
    const bpm = effectiveBpmAtBeat(chart, beat);
    stops.push({
      timeSec: timing.beatToSeconds(beat),
      durationSec: (stopValue / 48) * 60 / bpm,
    });
  }
  stops.sort((left, right) => left.timeSec - right.timeSec);
  return stops;
}

function effectiveBpmAtBeat(chart, beat) {
  let bpm = Number.parseFloat(chart.headers.get("BPM") ?? "60");
  if (!Number.isFinite(bpm) || bpm <= 0) {
    bpm = 60;
  }

  const changes = [];
  for (const object of chart.objects) {
    const objectBeat = chart.timeSignatures.measureToBeat(object.measure, object.fraction);
    if (objectBeat > beat) {
      continue;
    }
    if (object.channel === "03") {
      const nextBpm = Number.parseInt(object.value, 16);
      if (Number.isFinite(nextBpm) && nextBpm > 0) {
        changes.push({ beat: objectBeat, bpm: nextBpm });
      }
    } else if (object.channel === "08") {
      const nextBpm = Number.parseFloat(chart.headers.get(`BPM${object.value}`) ?? "");
      if (Number.isFinite(nextBpm) && nextBpm > 0) {
        changes.push({ beat: objectBeat, bpm: nextBpm });
      }
    }
  }

  changes.sort((left, right) => left.beat - right.beat);
  for (const change of changes) {
    bpm = change.bpm;
  }
  return bpm;
}

function buildNotes(timelineObjects, mode, headers, warnings) {
  const notes = [];
  const longGroups = new Map();
  const playableGroups = new Map();
  let lastPlayableTimeSec = 0;
  const lnobj = headers.get("LNOBJ")?.toUpperCase();

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

  return { notes, lastPlayableTimeSec };
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
    if (isBackgroundChannel(object.channel) || isBgaChannel(object.channel)) {
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
