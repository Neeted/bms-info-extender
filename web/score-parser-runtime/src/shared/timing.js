export class TimeSignatures {
  constructor() {
    this.values = new Map();
    this.prefixBeats = [0];
    this.prefixValidThrough = -1;
  }

  set(measure, value) {
    if (Number.isInteger(measure) && Number.isFinite(value) && value > 0) {
      const previousValue = this.values.get(measure);
      if (previousValue === value) {
        return;
      }
      this.values.set(measure, value);
      this.prefixValidThrough = Math.min(this.prefixValidThrough, measure - 1);
    }
  }

  get(measure) {
    return this.values.get(measure) ?? 1;
  }

  getBeats(measure) {
    return this.get(measure) * 4;
  }

  measureToBeat(measure, fraction) {
    const normalizedMeasure = Number.isInteger(measure) && measure >= 0 ? measure : 0;
    this.ensurePrefixBeats(normalizedMeasure);
    return this.prefixBeats[normalizedMeasure] + this.getBeats(normalizedMeasure) * fraction;
  }

  maxConfiguredMeasure() {
    let maxMeasure = 0;
    for (const measure of this.values.keys()) {
      maxMeasure = Math.max(maxMeasure, measure);
    }
    return maxMeasure;
  }

  ensurePrefixBeats(measure) {
    if (measure <= this.prefixValidThrough) {
      return;
    }

    const startMeasure = Math.max(0, this.prefixValidThrough + 1);
    for (let index = startMeasure; index <= measure; index += 1) {
      const beatsBefore = index === 0 ? 0 : this.prefixBeats[index];
      this.prefixBeats[index + 1] = beatsBefore + this.getBeats(index);
    }
    this.prefixValidThrough = Math.max(this.prefixValidThrough, measure);
  }
}

const ACTION_PRECEDENCE = {
  bpm: 1,
  stop: 2,
};

export class Timing {
  constructor(initialBpm, actions) {
    this.initialBpm = initialBpm;
    this.actions = actions
      .filter((action) => Number.isFinite(action.beat))
      .slice()
      .sort((left, right) => {
        if (left.beat !== right.beat) {
          return left.beat - right.beat;
        }
        return ACTION_PRECEDENCE[left.type] - ACTION_PRECEDENCE[right.type];
      });
    this.stateBeats = new Array(this.actions.length);
    this.stateSeconds = new Array(this.actions.length);
    this.stateBpms = new Array(this.actions.length);
    this.buildStateIndex();
  }

  beatToSeconds(beat) {
    const actionIndex = upperBoundActionsByBeat(this.actions, beat) - 1;
    if (actionIndex < 0) {
      return (beat * 60) / this.initialBpm;
    }
    return this.stateSeconds[actionIndex] + ((beat - this.stateBeats[actionIndex]) * 60) / this.stateBpms[actionIndex];
  }

  getBpmAtBeat(beat) {
    const actionIndex = upperBoundActionsByBeat(this.actions, beat) - 1;
    if (actionIndex < 0) {
      return this.initialBpm;
    }
    return this.stateBpms[actionIndex];
  }

  buildStateIndex() {
    let currentBeat = 0;
    let currentSeconds = 0;
    let currentBpm = this.initialBpm;

    for (let index = 0; index < this.actions.length; index += 1) {
      const action = this.actions[index];
      currentSeconds += ((action.beat - currentBeat) * 60) / currentBpm;
      currentBeat = action.beat;

      if (action.type === "bpm") {
        currentBpm = action.bpm;
      } else {
        currentSeconds += ((action.stopBeats ?? 0) * 60) / currentBpm;
      }

      this.stateBeats[index] = currentBeat;
      this.stateSeconds[index] = currentSeconds;
      this.stateBpms[index] = currentBpm;
    }
  }
}

export function materializeTimingActions(timing) {
  if (!timing || !Array.isArray(timing.actions)) {
    return [];
  }

  return timing.actions.map((action, index) => {
    const beat = Number.isFinite(action?.beat) ? action.beat : 0;
    if (action.type === "bpm") {
      return {
        type: "bpm",
        beat,
        timeSec: timing.stateSeconds[index],
        bpm: action.bpm,
      };
    }

    const bpm = timing.stateBpms[index];
    const durationSec = Number.isFinite(action?.stopBeats) && action.stopBeats > 0 && Number.isFinite(bpm) && bpm > 0
      ? (action.stopBeats * 60) / bpm
      : 0;
    return {
      type: "stop",
      beat,
      timeSec: timing.stateSeconds[index] - durationSec,
      stopBeats: action.stopBeats,
      durationSec,
      ...(action.stopResolution ? { stopResolution: action.stopResolution } : {}),
      ...(action.stopLunaticBehavior ? { stopLunaticBehavior: action.stopLunaticBehavior } : {}),
    };
  });
}

export function buildBpmChangesFromTimingActions(initialBpm, timingActions) {
  const changes = [];
  let currentBpm = Number.isFinite(initialBpm) && initialBpm > 0 ? initialBpm : 60;

  for (const action of timingActions ?? []) {
    if (action?.type !== "bpm" || !Number.isFinite(action.beat) || !Number.isFinite(action.timeSec) || !Number.isFinite(action.bpm) || action.bpm <= 0) {
      continue;
    }
    if (action.bpm !== currentBpm) {
      changes.push({
        beat: action.beat,
        timeSec: action.timeSec,
        bpm: action.bpm,
      });
    }
    currentBpm = action.bpm;
  }

  return changes;
}

export function buildStopsFromTimingActions(timingActions) {
  return (timingActions ?? [])
    .filter((action) => action?.type === "stop"
      && Number.isFinite(action.beat)
      && Number.isFinite(action.timeSec)
      && Number.isFinite(action.stopBeats)
      && action.stopBeats > 0
      && Number.isFinite(action.durationSec)
      && action.durationSec > 0)
    .map((action) => ({
      beat: action.beat,
      // ParsedStop.timeSec has historically pointed to the time after the stop.
      timeSec: action.timeSec + action.durationSec,
      stopBeats: action.stopBeats,
      durationSec: action.durationSec,
    }));
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
