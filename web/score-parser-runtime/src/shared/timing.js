export class TimeSignatures {
  constructor() {
    this.values = new Map();
  }

  set(measure, value) {
    if (Number.isInteger(measure) && Number.isFinite(value) && value > 0) {
      this.values.set(measure, value);
    }
  }

  get(measure) {
    return this.values.get(measure) ?? 1;
  }

  getBeats(measure) {
    return this.get(measure) * 4;
  }

  measureToBeat(measure, fraction) {
    let sum = 0;
    for (let index = 0; index < measure; index += 1) {
      sum += this.getBeats(index);
    }
    return sum + this.getBeats(measure) * fraction;
  }

  maxConfiguredMeasure() {
    let maxMeasure = 0;
    for (const measure of this.values.keys()) {
      maxMeasure = Math.max(maxMeasure, measure);
    }
    return maxMeasure;
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
  }

  beatToSeconds(beat) {
    let currentBeat = 0;
    let currentSeconds = 0;
    let currentBpm = this.initialBpm;

    for (const action of this.actions) {
      if (beat < action.beat) {
        return currentSeconds + ((beat - currentBeat) * 60) / currentBpm;
      }

      currentSeconds += ((action.beat - currentBeat) * 60) / currentBpm;
      currentBeat = action.beat;

      if (action.type === "bpm") {
        currentBpm = action.bpm;
        continue;
      }

      currentSeconds += ((action.stopBeats ?? 0) * 60) / currentBpm;
    }

    return currentSeconds + ((beat - currentBeat) * 60) / currentBpm;
  }
}
