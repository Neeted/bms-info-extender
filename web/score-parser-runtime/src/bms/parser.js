import { createEmptyScore, createWarning, failure, success } from "../dto.js";
import {
  TimeSignatures,
  Timing,
  buildBpmChangesFromTimingActions,
  buildStopsFromTimingActions,
  materializeTimingActions,
} from "../shared/timing.js";
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
  const { timing, supplementalTimingActions } = buildTiming(chart, timingWarnings);
  const timingActions = mergeTimingActions(
    materializeTimingActions(timing),
    materializeSupplementalTimingActions(supplementalTimingActions, timing),
  );
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
  const bpmChanges = buildBpmChangesFromTimingActions(timing.initialBpm, timingActions);
  const stops = buildStopsFromTimingActions(timingActions);
  const scrollChanges = buildScrollChanges(chart, timingWarnings, timing);
  const lastTimelineTimeSec = computeLastTimelineTimeSec(timelineObjects, notes, lastPlayableTimeSec);

  return success(createEmptyScore({
    sha256: options.sha256,
    format: "bms",
    mode,
    laneCount: laneCountForMode(mode),
    initialBpm: timing.initialBpm,
    notes,
    comboEvents,
    barLines,
    bpmChanges,
    stops,
    scrollChanges,
    timingActions,
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
  const supplementalTimingActions = [];
  const extendedBpmCache = new Map();
  const stopResolutionCache = new Map();
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
        if (bpm > 0) {
          actions.push({ type: "bpm", beat, bpm });
        } else {
          supplementalTimingActions.push({ type: "bpm", beat, bpm });
        }
      } else {
        warnings.push(createWarning("parse_warning", `Ignored missing or invalid extended BPM reference BPM${object.value}.`));
      }
      continue;
    }
    if (object.channel === "09") {
      const stopResolution = resolveStopResolution(chart.headers, object.value, stopResolutionCache);
      if (stopResolution) {
        actions.push({
          type: "stop",
          beat,
          stopBeats: stopResolution.stopBeats,
          stopResolution: stopResolution.kind,
          stopLunaticBehavior: stopResolution.lunaticBehavior,
        });
      }
      if (stopResolution?.warningMessage) {
        warnings.push(createWarning("parse_warning", stopResolution.warningMessage));
      }
      if (!stopResolution) {
        warnings.push(createWarning("parse_warning", `Ignored missing or invalid STOP reference STOP${object.value}.`));
      }
      continue;
    }
  }

  return {
    timing: new Timing(initialBpm, actions),
    supplementalTimingActions,
  };
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
      beat,
      timeSec: timing.beatToSeconds(beat),
      rate,
    });
  }
  scrollChanges.sort((left, right) => left.beat - right.beat || left.timeSec - right.timeSec);
  return scrollChanges;
}

function resolveExtendedBpm(headers, value, cache) {
  if (cache.has(value)) {
    return cache.get(value);
  }

  const parsedValue = Number.parseFloat(headers.get(`BPM${value}`) ?? "");
  const bpm = Number.isFinite(parsedValue) && parsedValue !== 0 ? parsedValue : null;
  cache.set(value, bpm);
  return bpm;
}

function materializeSupplementalTimingActions(actions, timing) {
  return (actions ?? []).map((action) => ({
    ...action,
    timeSec: timing.beatToSeconds(action.beat),
  }));
}

function mergeTimingActions(primaryActions, supplementalActions) {
  return [...(primaryActions ?? []), ...(supplementalActions ?? [])]
    .sort((left, right) => {
      if ((left?.beat ?? 0) !== (right?.beat ?? 0)) {
        return (left?.beat ?? 0) - (right?.beat ?? 0);
      }
      if ((left?.timeSec ?? 0) !== (right?.timeSec ?? 0)) {
        return (left?.timeSec ?? 0) - (right?.timeSec ?? 0);
      }
      const leftOrder = left?.type === "bpm" ? 0 : 1;
      const rightOrder = right?.type === "bpm" ? 0 : 1;
      return leftOrder - rightOrder;
    });
}

function resolveStopResolution(headers, value, cache) {
  if (cache.has(value)) {
    return cache.get(value);
  }

  const rawValue = headers.get(`STOP${value}`) ?? "";
  const parsedValue = Number.parseFloat(rawValue);
  let resolved = null;

  if (Number.isFinite(parsedValue)) {
    if (parsedValue < 0) {
      resolved = {
        kind: "resolved",
        stopBeats: Math.abs(parsedValue) / 48,
        warningMessage: `Negative STOP value STOP${value} was normalized to its absolute value.`,
        lunaticBehavior: "warp",
      };
    } else if (parsedValue > 0) {
      resolved = {
        kind: "resolved",
        stopBeats: parsedValue / 48,
        warningMessage: null,
        lunaticBehavior: Number.isInteger(parsedValue) ? "normal" : "warp",
      };
    } else {
      resolved = {
        kind: "invalid",
        stopBeats: 0,
        warningMessage: `Ignored missing or invalid STOP reference STOP${value}.`,
        lunaticBehavior: "warp",
      };
    }
  } else {
    resolved = {
      kind: "invalid",
      stopBeats: 0,
      warningMessage: `Ignored missing or invalid STOP reference STOP${value}.`,
      lunaticBehavior: "warp",
    };
  }

  cache.set(value, resolved);
  return resolved;
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
      beat: object.beat,
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
        beat: start.beat,
        timeSec: start.timeSec,
        endBeat: end.beat,
        endTimeSec: end.timeSec,
        kind: "long",
        longNoteType,
        side: start.side,
      });
      comboEvents.push(...createLongComboEvents(start, end, longNoteType));
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
            beat: pendingStart.beat,
            timeSec: pendingStart.timeSec,
            endBeat: object.beat,
            endTimeSec: object.timeSec,
            kind: "long",
            longNoteType,
            side: pendingStart.side,
          });
            comboEvents.push(...createLongComboEvents(pendingStart, object, longNoteType));
            lastPlayableTimeSec = Math.max(lastPlayableTimeSec, object.timeSec);
            pendingStart = null;
          }
          continue;
        }
        if (pendingStart) {
          notes.push({
            lane: pendingStart.lane,
            beat: pendingStart.beat,
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
          beat: pendingStart.beat,
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
        beat: object.beat,
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
  switch (lnmode) {
    case 2:
      return "cn";
    case 3:
      return "hcn";
    case 1:
    default:
      return "ln";
  }
}

function createLongComboEvents(start, end, longNoteType) {
  if (longNoteType === "cn" || longNoteType === "hcn") {
    return [
      createComboEvent(start, "long-start"),
      createComboEvent(end, "long-end"),
    ];
  }
  return [createComboEvent(end, "long-end")];
}

function createComboEvent(object, kind) {
  const event = {
    lane: object.lane,
    beat: object.beat,
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
    barLines.push({ beat, timeSec: timing.beatToSeconds(beat) });
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
