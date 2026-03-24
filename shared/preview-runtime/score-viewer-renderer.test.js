import assert from "node:assert/strict";
import test from "node:test";

import { createScoreViewerModel } from "./score-viewer-model.js";
import {
  collectGameProjection,
  collectVisibleEditorGridLines,
  createScoreViewerRenderer,
} from "./score-viewer-renderer.js";

test("collectVisibleEditorGridLines emits quarter and sixteenth lines without duplicating bar lines", () => {
  const gridLines = collectVisibleEditorGridLines(
    [
      { startBeat: 0, endBeat: 4 },
      { startBeat: 4, endBeat: 7.5 },
    ],
    0,
    8,
  );

  assert.deepEqual(gridLines.beatBeats, [1, 2, 3, 5, 6, 7]);
  assert.deepEqual(
    gridLines.sixteenthBeats,
    [
      0.25, 0.5, 0.75,
      1.25, 1.5, 1.75,
      2.25, 2.5, 2.75,
      3.25, 3.5, 3.75,
      4.25, 4.5, 4.75,
      5.25, 5.5, 5.75,
      6.25, 6.5, 6.75,
      7.25,
    ],
  );
});

test("renderer hides invisible notes by default in time mode and draws yellow outlines when enabled", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time" });
  assert.equal(context.strokeRectCalls.length, 0);

  context.reset();
  renderer.render(model, 1, { viewerMode: "time", showInvisibleNotes: true });
  assert.equal(context.strokeRectCalls.length, 1);
  assert.deepEqual(
    context.strokeRectCalls.map((call) => ({ strokeStyle: call.strokeStyle, lineWidth: call.lineWidth })),
    [{ strokeStyle: "#FFFF00", lineWidth: 1 }],
  );
});

test("renderer draws invisible notes in editor mode only when enabled", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "editor" });
  assert.equal(context.strokeRectCalls.length, 0);

  context.reset();
  renderer.render(model, 1, { viewerMode: "editor", showInvisibleNotes: true });
  assert.equal(context.strokeRectCalls.length, 1);
  assert.deepEqual(
    context.strokeRectCalls.map((call) => ({ strokeStyle: call.strokeStyle, lineWidth: call.lineWidth })),
    [{ strokeStyle: "#FFFF00", lineWidth: 1 }],
  );
});

test("renderer draws invisible note outlines inset within lane separators", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 2, { viewerMode: "time", showInvisibleNotes: true });

  assert.deepEqual(
    context.strokeRectCalls.map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 89.5, y: 156.5, width: 14, height: 3 }],
  );
});

test("renderer game projection stops before drawing reentry notes that come back after leaving the viewport", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameProjectionReentryScore());

  const projection = collectGameProjection(model, 2, 320, 64);
  assert.equal(projection.exitPoint?.point.beat, 4.5);
  assert.deepEqual(
    projection.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [4.25],
  );

  renderer.resize(240, 320);
  renderer.render(model, 2, { viewerMode: "game", pixelsPerBeat: 64, showInvisibleNotes: true });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.width === 16 && call.height === 4 && call.fillStyle !== "#000000")
      .map(({ x, y, fillStyle }) => ({ x, y, fillStyle })),
    [
      { x: 72, y: 156, fillStyle: "#bebebe" },
    ],
  );
});

test("renderer skips game-mode long bodies when scroll reversal makes net displacement negative", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createReverseLongNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 2, { viewerMode: "game", pixelsPerBeat: 64 });

  assert.equal(
    context.fillRectCalls.some((call) => call.width === 16 && call.height > 4 && String(call.fillStyle).startsWith("rgb(")),
    false,
  );
  assert.equal(
    context.fillRectCalls.filter((call) => call.width === 16 && call.height === 4 && call.fillStyle !== "#000000").length,
    2,
  );
});

test("renderer keeps game-mode projection frozen while playback remains inside a STOP", () => {
  const model = createScoreViewerModel(createGameStopProjectionScore());

  const left = collectGameProjection(model, 2.25, 320, 64);
  const right = collectGameProjection(model, 2.75, 320, 64);
  const leftNote = left.points.find((projected) => projected.point.notes.some((note) => note.beat === 6));
  const rightNote = right.points.find((projected) => projected.point.notes.some((note) => note.beat === 6));

  assert.ok(leftNote);
  assert.ok(rightNote);
  assert.equal(leftNote.y, rightNote.y);
  assert.equal(left.selectedTrackPosition, right.selectedTrackPosition);
});

test("renderer game projection stops drawing notes after they become past objects", () => {
  const model = createScoreViewerModel(createGameProjectionReentryScore());
  const before = collectGameProjection(model, 2, 320, 64);
  const after = collectGameProjection(model, 2.13, 320, 64);

  assert.deepEqual(
    before.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [4.25],
  );
  assert.deepEqual(
    after.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [],
  );
});

function createInvisibleNoteScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 1, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 2, beat: 4, timeSec: 2, kind: "invisible" },
    ],
    comboEvents: [{ lane: 1, beat: 2, timeSec: 1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createGameProjectionReentryScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 2, normal: 2, long: 0, invisible: 0, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 4.25, timeSec: 2.125, kind: "normal" },
      { lane: 2, beat: 4.75, timeSec: 2.375, kind: "normal" },
    ],
    comboEvents: [
      { lane: 1, beat: 4.25, timeSec: 2.125, kind: "normal" },
      { lane: 2, beat: 4.75, timeSec: 2.375, kind: "normal" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 0 },
      { beat: 4.25, timeSec: 2.125, rate: 20 },
      { beat: 4.5, timeSec: 2.25, rate: -20 },
      { beat: 4.75, timeSec: 2.375, rate: 0 },
    ],
    warnings: [],
  };
}

function createReverseLongNoteScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 0, long: 1, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 4, endBeat: 6, timeSec: 2, endTimeSec: 3, kind: "long" },
    ],
    comboEvents: [
      { lane: 1, beat: 4, timeSec: 2, kind: "long-start" },
      { lane: 1, beat: 6, timeSec: 3, kind: "long-end" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: -1 },
    ],
    warnings: [],
  };
}

function createGameStopProjectionScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 5,
    lastPlayableTimeSec: 5,
    lastTimelineTimeSec: 5,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 6, timeSec: 4, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 6, timeSec: 4, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 5 }],
    bpmChanges: [],
    stops: [{ beat: 4, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [],
    warnings: [],
  };
}

function createMockCanvas() {
  const context = new MockRenderingContext2D();
  return {
    canvas: {
      width: 0,
      height: 0,
      style: {},
      getContext() {
        return context;
      },
    },
    context,
  };
}

class MockRenderingContext2D {
  constructor() {
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.lineWidth = 1;
    this.font = "";
    this.textBaseline = "alphabetic";
    this.textAlign = "start";
    this.fillRectCalls = [];
    this.strokeRectCalls = [];
    this.fillTextCalls = [];
    this._stateStack = [];
  }

  reset() {
    this.fillRectCalls = [];
    this.strokeRectCalls = [];
    this.fillTextCalls = [];
    this._stateStack = [];
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.lineWidth = 1;
    this.font = "";
    this.textBaseline = "alphabetic";
    this.textAlign = "start";
  }

  clearRect() {}

  fillRect(x, y, width, height) {
    this.fillRectCalls.push({ x, y, width, height, fillStyle: this.fillStyle });
  }

  strokeRect(x, y, width, height) {
    this.strokeRectCalls.push({ x, y, width, height, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
  }

  fillText(text, x, y) {
    this.fillTextCalls.push({
      text,
      x,
      y,
      fillStyle: this.fillStyle,
      font: this.font,
      textBaseline: this.textBaseline,
      textAlign: this.textAlign,
    });
  }

  setTransform() {}

  beginPath() {}

  moveTo() {}

  lineTo() {}

  stroke() {}

  save() {
    this._stateStack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      font: this.font,
      textBaseline: this.textBaseline,
      textAlign: this.textAlign,
    });
  }

  restore() {
    const snapshot = this._stateStack.pop();
    if (!snapshot) {
      return;
    }
    this.fillStyle = snapshot.fillStyle;
    this.strokeStyle = snapshot.strokeStyle;
    this.lineWidth = snapshot.lineWidth;
    this.font = snapshot.font;
    this.textBaseline = snapshot.textBaseline;
    this.textAlign = snapshot.textAlign;
  }
}
