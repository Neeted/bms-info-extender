import assert from "node:assert/strict";
import test from "node:test";

import {
  JUDGE_LINE_DRAG_HIT_MARGIN_PX,
  getJudgeLinePositionRatioFromPointer,
  isJudgeLineHit,
  normalizeWheelDeltaY,
  resolvePointerDragIntent,
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
