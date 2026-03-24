import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWheelDeltaY, shouldSyncPlaybackScrollPosition } from "./score-viewer-controller.js";

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
