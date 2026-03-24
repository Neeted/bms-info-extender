import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWheelDeltaY } from "./score-viewer-controller.js";

test("normalizeWheelDeltaY keeps pixel deltas unchanged and normalizes line/page modes", () => {
  assert.equal(normalizeWheelDeltaY(24, 0, 480), 24);
  assert.equal(normalizeWheelDeltaY(3, 1, 480), 48);
  assert.equal(normalizeWheelDeltaY(1, 2, 480), 480);
});
