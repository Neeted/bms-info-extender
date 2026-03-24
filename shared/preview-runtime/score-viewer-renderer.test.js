import assert from "node:assert/strict";
import test from "node:test";

import { createScoreViewerModel } from "./score-viewer-model.js";
import {
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
    this.fillRectCalls = [];
    this.strokeRectCalls = [];
    this._stateStack = [];
  }

  reset() {
    this.fillRectCalls = [];
    this.strokeRectCalls = [];
    this._stateStack = [];
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.lineWidth = 1;
  }

  clearRect() {}

  fillRect(x, y, width, height) {
    this.fillRectCalls.push({ x, y, width, height, fillStyle: this.fillStyle });
  }

  strokeRect(x, y, width, height) {
    this.strokeRectCalls.push({ x, y, width, height, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
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
  }
}
