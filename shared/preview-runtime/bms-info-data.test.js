import assert from "node:assert/strict";
import test from "node:test";

import { getLaneChipKey } from "./bms-info-data.js";

test("lane chip keys only use specialized mappings for supported modes", () => {
  assert.equal(getLaneChipKey(7, 0), "0");
  assert.equal(getLaneChipKey(14, 15), "15");
  assert.equal(getLaneChipKey(5, 0), "g0");
  assert.equal(getLaneChipKey(10, 11), "g11");
  assert.equal(getLaneChipKey(9, 8), "p8");
  assert.equal(getLaneChipKey(25, 0), "k0");
  assert.equal(getLaneChipKey(25, 24), "k24");
  assert.equal(getLaneChipKey(50, 25), "k25");
  assert.equal(getLaneChipKey(50, 49), "k49");
});

test("unsupported modes fall back to white lane chip keys for every lane", () => {
  for (const laneIndex of [0, 1, 7, 12, 24, 49]) {
    assert.equal(getLaneChipKey(24, laneIndex), "1");
    assert.equal(getLaneChipKey(48, laneIndex), "1");
  }
});
