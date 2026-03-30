import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSpacingScaleDisplay,
  JUDGE_LINE_DRAG_HIT_MARGIN_PX,
  getJudgeLinePositionRatioFromPointer,
  isJudgeLineHit,
  normalizeWheelDeltaY,
  normalizeSliderSpacingScale,
  roundSpacingScaleToHundredths,
  resolvePointerDragIntent,
  SPACING_STEP,
  SPACING_WHEEL_STEP,
  shouldSyncPlaybackScrollPosition,
} from "./score-viewer-controller.js";

test("normalizeWheelDeltaY keeps pixel deltas unchanged and normalizes line/page modes", () => {
  assert.equal(normalizeWheelDeltaY(24, 0, 480), 24);
  assert.equal(normalizeWheelDeltaY(3, 1, 480), 48);
  assert.equal(normalizeWheelDeltaY(1, 2, 480), 480);
});

test("shouldSyncPlaybackScrollPosition throttles game-mode playback scroll writes only within threshold", () => {
  assert.equal(shouldSyncPlaybackScrollPosition({
    viewerMode: "time",
    isPlaying: true,
    currentScrollTop: 100,
    desiredScrollTop: 160,
    viewportHeight: 400,
  }), true);
  assert.equal(shouldSyncPlaybackScrollPosition({
    viewerMode: "game",
    isPlaying: false,
    currentScrollTop: 100,
    desiredScrollTop: 160,
    viewportHeight: 400,
  }), true);
  assert.equal(shouldSyncPlaybackScrollPosition({
    viewerMode: "game",
    isPlaying: true,
    currentScrollTop: 100,
    desiredScrollTop: 180,
    viewportHeight: 400,
  }), false);
  assert.equal(shouldSyncPlaybackScrollPosition({
    viewerMode: "game",
    isPlaying: true,
    currentScrollTop: 100,
    desiredScrollTop: 280,
    viewportHeight: 400,
  }), true);
});

test("judge line hit testing uses the configured 10px drag band", () => {
  assert.equal(JUDGE_LINE_DRAG_HIT_MARGIN_PX, 10);
  assert.equal(isJudgeLineHit({
    pointerClientY: 205,
    rootTop: 100,
    judgeLineY: 96,
  }), true);
  assert.equal(isJudgeLineHit({
    pointerClientY: 207,
    rootTop: 100,
    judgeLineY: 96,
  }), false);
});

test("pointer drag intent prioritizes the judge line over score scrolling within the hit band", () => {
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: true,
    canDragScroll: true,
    isJudgeLineHit: true,
  }), "judge-line");
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: false,
    canDragScroll: true,
    isJudgeLineHit: false,
  }), "scroll");
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: true,
    canDragScroll: false,
    isJudgeLineHit: false,
  }), null);
});

test("judge line pointer ratios clamp to the viewport and default to center for invalid heights", () => {
  assert.equal(getJudgeLinePositionRatioFromPointer({
    pointerClientY: 180,
    rootTop: 100,
    rootHeight: 320,
  }), 0.25);
  assert.equal(getJudgeLinePositionRatioFromPointer({
    pointerClientY: 20,
    rootTop: 100,
    rootHeight: 320,
  }), 0);
  assert.equal(getJudgeLinePositionRatioFromPointer({
    pointerClientY: 500,
    rootTop: 100,
    rootHeight: 320,
  }), 1);
  assert.equal(getJudgeLinePositionRatioFromPointer({
    pointerClientY: 180,
    rootTop: 100,
    rootHeight: 0,
  }), 0.5);
});

test("spacing slider input snaps to 0.05x and wheel adjustments snap to 0.01x", () => {
  assert.equal(SPACING_STEP, 0.05);
  assert.equal(SPACING_WHEEL_STEP, 0.01);
  assert.equal(normalizeSliderSpacingScale(1.02), 1.0);
  assert.equal(normalizeSliderSpacingScale(1.03), 1.05);
  assert.equal(normalizeSliderSpacingScale(0.11), 0.5);
  assert.equal(roundSpacingScaleToHundredths(1.234), 1.23);
  assert.equal(roundSpacingScaleToHundredths(1.235), 1.24);
  assert.equal(roundSpacingScaleToHundredths(9), 8.0);
});

test("spacing display text includes mode-specific units for time and editor", () => {
  assert.equal(formatSpacingScaleDisplay("time", 1.0), "Time: 1.00x(160px/s)");
  assert.equal(formatSpacingScaleDisplay("editor", 1.0), "Editor: 1.00x(64px/beat)");
  assert.equal(formatSpacingScaleDisplay("game", 1.0), "Game: 1.00x");
  assert.equal(formatSpacingScaleDisplay("time", 1.25), "Time: 1.25x(200px/s)");
  assert.equal(formatSpacingScaleDisplay("editor", 1.5), "Editor: 1.50x(96px/beat)");
});
