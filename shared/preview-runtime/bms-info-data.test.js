import assert from "node:assert/strict";
import test from "node:test";

import {
  getLaneChipColor,
  getLaneChipKey,
  getLaneChipTextColor,
} from "./bms-info-data.js";

test("lane chip keys only use specialized mappings for supported modes", () => {
  assert.equal(getLaneChipKey(7, 0), "0");
  assert.equal(getLaneChipKey(14, 15), "15");
  assert.equal(getLaneChipKey(5, 0), "g0");
  assert.equal(getLaneChipKey(10, 11), "g11");
  assert.equal(getLaneChipKey(9, 8), "p8");
});

test("unsupported modes fall back to white lane chip keys for every lane", () => {
  for (const laneIndex of [0, 1, 7, 12, 24, 49]) {
    assert.equal(getLaneChipKey(25, laneIndex), "1");
    assert.equal(getLaneChipKey(50, laneIndex), "1");
  }
});

test("unsupported mode colors reuse the white-key fallback", () => {
  assert.equal(getLaneChipColor(25, 0), "#bebebe");
  assert.equal(getLaneChipColor(50, 49), "#bebebe");
  assert.equal(getLaneChipTextColor(25, 0), "#000000");
  assert.equal(getLaneChipTextColor(50, 49), "#000000");
});
