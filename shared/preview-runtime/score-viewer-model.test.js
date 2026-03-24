import assert from "node:assert/strict";
import test from "node:test";

import {
  BEAT_SELECTION_EPSILON,
  DEFAULT_EDITOR_PIXELS_PER_BEAT,
  DEFAULT_VIEWER_PIXELS_PER_SECOND,
  createEditorMeasureRanges,
  createScoreViewerModel,
  getBeatAtTimeSec,
  getClampedSelectedTimeSec,
  getComboCountAtTime,
  getContentHeightPx,
  getEditorFrameState,
  getEditorContentHeightPx,
  getEditorScrollTopForBeat,
  getEditorScrollTopForTimeSec,
  hasViewerSelectionChanged,
  getMeasureIndexAtTime,
  getScrollTopForTimeSec,
  getTimeSecForBeat,
  getTimeSecForEditorScrollTop,
  getTimeSecForScrollTop,
  getVisibleTimeRange,
  getViewerCursor,
} from "./score-viewer-model.js";

test("viewer model resolves measure and combo positions from comboEvents and bar lines", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 10,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 3, normal: 2, long: 1, invisible: 0, mine: 0, all: 3 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 2, beat: 4, endBeat: 6, endTimeSec: 3, timeSec: 2, kind: "long" },
    ],
    comboEvents: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 2, beat: 4, timeSec: 2, kind: "long-start" },
      { lane: 2, beat: 6, timeSec: 3, kind: "long-end" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(getMeasureIndexAtTime(model, 0), 0);
  assert.equal(getMeasureIndexAtTime(model, 1.99), 0);
  assert.equal(getMeasureIndexAtTime(model, 2), 1);
  assert.equal(getComboCountAtTime(model, 0.99), 0);
  assert.equal(getComboCountAtTime(model, 2.5), 2);
  assert.equal(getComboCountAtTime(model, 3), 3);

  const cursor = getViewerCursor(model, 3, "editor");
  assert.equal(cursor.beat, 6);
  assert.equal(cursor.measureIndex, 1);
  assert.equal(cursor.totalMeasureIndex, 1);
  assert.equal(cursor.comboCount, 3);
  assert.equal(cursor.totalCombo, 3);

  const totalDurationCursor = getViewerCursor(model, 11.75);
  assert.equal(totalDurationCursor.timeSec, 11.75);
  assert.equal(totalDurationCursor.measureIndex, 1);
  assert.equal(totalDurationCursor.comboCount, 3);
  assert.equal(getClampedSelectedTimeSec(model, 20), 12);
  assert.equal(getVisibleTimeRange(model, 11.8, 480).endTimeSec, 12);
  assert.equal(getContentHeightPx(model, 480, DEFAULT_VIEWER_PIXELS_PER_SECOND), 12 * DEFAULT_VIEWER_PIXELS_PER_SECOND + 480);
  assert.equal(getScrollTopForTimeSec(model, 20, 480, DEFAULT_VIEWER_PIXELS_PER_SECOND), 12 * DEFAULT_VIEWER_PIXELS_PER_SECOND);
});

test("viewer model converts between seconds and beats across BPM changes and STOPs", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 6,
    lastPlayableTimeSec: 6,
    lastTimelineTimeSec: 6,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 3 }, { beat: 12, timeSec: 5 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 240 }],
    stops: [{ beat: 8, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(getBeatAtTimeSec(model, 1.5), 3);
  assert.equal(getBeatAtTimeSec(model, 2.5), 6);
  assert.equal(getBeatAtTimeSec(model, 3.25), 8);
  assert.equal(getBeatAtTimeSec(model, 3.75), 8);
  assert.equal(getBeatAtTimeSec(model, 4.5), 10);
  assert.equal(getTimeSecForBeat(model, 10), 4.5);
});

test("viewer model prefers parser timingActions over lossy bpmChanges", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 5.75,
    lastPlayableTimeSec: 5.75,
    lastTimelineTimeSec: 5.75,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 3.75 }, { beat: 12, timeSec: 5.75 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 240 }],
    stops: [],
    scrollChanges: [],
    timingActions: [
      { type: "bpm", beat: 4, timeSec: 2, bpm: 240 },
      { type: "bpm", beat: 5, timeSec: 2.25, bpm: 120 },
    ],
    warnings: [],
  });

  assert.equal(getBeatAtTimeSec(model, 3), 6.5);
  assert.equal(getTimeSecForBeat(model, 6.5), 3);
});

test("viewer model excludes malformed beatless notes from editor indexes", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 12,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 2, normal: 2, long: 0, invisible: 0, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 4, timeSec: 2, kind: "normal" },
      { lane: 7, timeSec: 10, kind: "normal" },
    ],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(model.notes.length, 2);
  assert.equal(model.notesByBeat.length, 1);
  assert.deepEqual(model.notesByBeat.map((note) => ({ lane: note.lane, beat: note.beat, timeSec: note.timeSec })), [
    { lane: 1, beat: 4, timeSec: 2 },
  ]);
});

test("viewer model keeps invisible notes separate from visible note indexes", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 12,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 2, normal: 1, long: 1, invisible: 2, mine: 0, all: 4 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 2, beat: 4, endBeat: 6, endTimeSec: 3, timeSec: 2, kind: "long" },
      { lane: 3, beat: 5, timeSec: 2.5, kind: "invisible" },
      { lane: 4, timeSec: 3.5, kind: "invisible" },
    ],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(model.notes.length, 2);
  assert.equal(model.invisibleNotes.length, 2);
  assert.deepEqual(model.notes.map((note) => note.kind), ["normal", "long"]);
  assert.deepEqual(model.invisibleNotes.map((note) => note.kind), ["invisible", "invisible"]);
  assert.deepEqual(model.invisibleNotesByBeat.map((note) => ({ lane: note.lane, beat: note.beat, timeSec: note.timeSec })), [
    { lane: 3, beat: 5, timeSec: 2.5 },
  ]);
});

test("viewer model editor scroll mapping uses beat axis", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "popn-9k",
    laneCount: 9,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  const viewportHeight = 480;
  const scrollTop = getEditorScrollTopForTimeSec(model, 1, viewportHeight, DEFAULT_EDITOR_PIXELS_PER_BEAT);
  assert.equal(scrollTop, 2 * DEFAULT_EDITOR_PIXELS_PER_BEAT);
  assert.equal(getEditorScrollTopForBeat(model, 2, viewportHeight, DEFAULT_EDITOR_PIXELS_PER_BEAT), scrollTop);
  assert.equal(getTimeSecForEditorScrollTop(model, scrollTop, DEFAULT_EDITOR_PIXELS_PER_BEAT), 1);
  assert.equal(getEditorContentHeightPx(model, viewportHeight, DEFAULT_EDITOR_PIXELS_PER_BEAT), 8 * DEFAULT_EDITOR_PIXELS_PER_BEAT + viewportHeight);
  assert.equal(getTimeSecForScrollTop(model, getScrollTopForTimeSec(model, 1, viewportHeight, DEFAULT_VIEWER_PIXELS_PER_SECOND), DEFAULT_VIEWER_PIXELS_PER_SECOND), 1);
});

test("viewer model reuses editor frame state semantics around BPM and STOP transitions", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 6,
    lastPlayableTimeSec: 6,
    lastTimelineTimeSec: 6,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 3 }, { beat: 12, timeSec: 5 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 240 }],
    stops: [{ beat: 8, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [],
    warnings: [],
  });

  const frameState = getEditorFrameState(model, 3.75, 480, DEFAULT_EDITOR_PIXELS_PER_BEAT);
  assert.equal(frameState.selectedBeat, 8);
  assert.equal(frameState.viewportHeight, 480);
  assert.equal(frameState.startBeat < frameState.selectedBeat, true);
  assert.equal(frameState.endBeat > frameState.selectedBeat, true);
});

test("viewer model builds editor measure ranges including trailing beats after the last bar line", () => {
  const measureRanges = createEditorMeasureRanges(
    [
      { beat: 0, timeSec: 0 },
      { beat: 3, timeSec: 1.5 },
      { beat: 7.5, timeSec: 4 },
    ],
    10,
  );

  assert.deepEqual(measureRanges, [
    { startBeat: 0, endBeat: 3 },
    { startBeat: 3, endBeat: 7.5 },
    { startBeat: 7.5, endBeat: 10 },
  ]);
});

test("viewer selection change in editor mode is beat-based for extremely high BPM", () => {
  const initialBpm = 14500145;
  const totalBeat = 8;
  const totalDurationSec = (totalBeat * 60) / initialBpm;
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm,
    totalDurationSec,
    lastPlayableTimeSec: totalDurationSec,
    lastTimelineTimeSec: totalDurationSec,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: (4 * 60) / initialBpm }, { beat: totalBeat, timeSec: totalDurationSec }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  const nextBeat = 1 / DEFAULT_EDITOR_PIXELS_PER_BEAT;
  const nextTimeSec = getTimeSecForBeat(model, nextBeat);

  assert.equal(nextTimeSec < 0.0005, true);
  assert.equal(hasViewerSelectionChanged(model, "editor", 0, nextTimeSec, 0, nextBeat), true);
  assert.equal(nextBeat > BEAT_SELECTION_EPSILON, true);
});

test("viewer selection change in editor mode stays monotonic for BPM below one", () => {
  const initialBpm = 0.5;
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm,
    totalDurationSec: 960,
    lastPlayableTimeSec: 960,
    lastTimelineTimeSec: 960,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 480 }, { beat: 8, timeSec: 960 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  const nextBeat = 1 / DEFAULT_EDITOR_PIXELS_PER_BEAT;
  const nextTimeSec = getTimeSecForBeat(model, nextBeat);

  assert.equal(nextTimeSec > 0, true);
  assert.equal(getBeatAtTimeSec(model, nextTimeSec), nextBeat);
  assert.equal(hasViewerSelectionChanged(model, "editor", 0, nextTimeSec, 0, nextBeat), true);
});
