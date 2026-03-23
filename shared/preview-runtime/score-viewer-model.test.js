import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VIEWER_PIXELS_PER_SECOND,
  createScoreViewerModel,
  getClampedSelectedTimeSec,
  getComboCountAtTime,
  getContentHeightPx,
  getMeasureIndexAtTime,
  getScrollTopForTimeSec,
  getTimeSecForScrollTop,
  getVisibleTimeRange,
  getViewerCursor,
} from "./score-viewer-model.js";

test("viewer model resolves measure and combo positions from comboEvents and bar lines", () => {
  const model = createScoreViewerModel({
    mode: "7k",
    laneCount: 8,
    totalDurationSec: 12,
    lastPlayableTimeSec: 10,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 3, normal: 2, long: 1, invisible: 0, mine: 0, all: 3 },
    notes: [
      { lane: 1, timeSec: 1, kind: "normal" },
      { lane: 2, timeSec: 2, endTimeSec: 3, kind: "long" },
    ],
    comboEvents: [
      { lane: 1, timeSec: 1, kind: "normal" },
      { lane: 2, timeSec: 2, kind: "long-start" },
      { lane: 2, timeSec: 3, kind: "long-end" },
    ],
    barLines: [{ timeSec: 0 }, { timeSec: 2.5 }, { timeSec: 5 }],
    bpmChanges: [],
    stops: [],
    warnings: [],
  });

  assert.equal(getMeasureIndexAtTime(model, 0), 0);
  assert.equal(getMeasureIndexAtTime(model, 2.49), 0);
  assert.equal(getMeasureIndexAtTime(model, 2.5), 1);
  assert.equal(getComboCountAtTime(model, 0.99), 0);
  assert.equal(getComboCountAtTime(model, 2.5), 2);
  assert.equal(getComboCountAtTime(model, 3), 3);

  const cursor = getViewerCursor(model, 3);
  assert.equal(cursor.measureIndex, 1);
  assert.equal(cursor.totalMeasureIndex, 1);
  assert.equal(cursor.comboCount, 3);
  assert.equal(cursor.totalCombo, 3);

  const endCursor = getViewerCursor(model, 10);
  assert.equal(endCursor.measureIndex, 1);
  assert.equal(endCursor.totalMeasureIndex, 1);

  const totalDurationCursor = getViewerCursor(model, 11.75);
  assert.equal(totalDurationCursor.timeSec, 11.75);
  assert.equal(totalDurationCursor.measureIndex, 1);
  assert.equal(totalDurationCursor.comboCount, 3);
  assert.equal(getClampedSelectedTimeSec(model, 20), 12);
  assert.equal(getVisibleTimeRange(model, 11.8, 480).endTimeSec, 12);
  assert.equal(getContentHeightPx(model, 480, DEFAULT_VIEWER_PIXELS_PER_SECOND), 12 * DEFAULT_VIEWER_PIXELS_PER_SECOND + 480);
  assert.equal(getScrollTopForTimeSec(model, 20, 480, DEFAULT_VIEWER_PIXELS_PER_SECOND), 12 * DEFAULT_VIEWER_PIXELS_PER_SECOND);
});

test("viewer model scroll mapping keeps selectedTimeSec centered", () => {
  const model = createScoreViewerModel({
    mode: "popn-9k",
    laneCount: 9,
    totalDurationSec: 20,
    lastPlayableTimeSec: 20,
    lastTimelineTimeSec: 20,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ timeSec: 0 }],
    bpmChanges: [],
    stops: [],
    warnings: [],
  });

  const viewportHeight = 480;
  const scrollTop = getScrollTopForTimeSec(model, 4.25, viewportHeight, DEFAULT_VIEWER_PIXELS_PER_SECOND);
  assert.equal(scrollTop, 4.25 * DEFAULT_VIEWER_PIXELS_PER_SECOND);
  assert.equal(getTimeSecForScrollTop(model, scrollTop, DEFAULT_VIEWER_PIXELS_PER_SECOND), 4.25);
  assert.ok(getContentHeightPx(model, viewportHeight, DEFAULT_VIEWER_PIXELS_PER_SECOND) >= viewportHeight);
});

test("viewer model scroll mapping respects custom pixelsPerSecond", () => {
  const model = createScoreViewerModel({
    mode: "7k",
    laneCount: 8,
    totalDurationSec: 20,
    lastPlayableTimeSec: 20,
    lastTimelineTimeSec: 20,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ timeSec: 0 }],
    bpmChanges: [],
    stops: [],
    warnings: [],
  });

  const pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND * 3;
  const viewportHeight = 320;
  const scrollTop = getScrollTopForTimeSec(model, 2, viewportHeight, pixelsPerSecond);
  assert.equal(scrollTop, 2 * pixelsPerSecond);
  assert.equal(getTimeSecForScrollTop(model, scrollTop, pixelsPerSecond), 2);
  assert.ok(getContentHeightPx(model, viewportHeight, pixelsPerSecond) >= viewportHeight);
});
