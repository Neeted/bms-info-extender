import assert from "node:assert/strict";
import test from "node:test";

import { getLaneChipKey, normalizeBmsInfoRecord } from "./bms-info-data.js";

function makeRawRecord(overrides = {}) {
  return {
    md5: "0".repeat(32),
    sha256: "1".repeat(64),
    maxbpm: "180",
    minbpm: "120",
    length: "120000",
    mode: "7",
    judge: "3",
    feature: "0",
    notes: "1000",
    n: "900",
    ln: "50",
    s: "40",
    ls: "10",
    total: "300",
    density: "1.5",
    peakdensity: "4",
    enddensity: "1.25",
    mainbpm: "150",
    distribution: "",
    speedchange: "",
    lanenotes: "",
    tables: "[]",
    stella: "",
    bmsid: "",
    ...overrides,
  };
}

test("metadata number display keeps integers and short decimals but truncates long decimals with title", () => {
  const record = normalizeBmsInfoRecord(makeRawRecord({
    mainbpm: "170",
    maxbpm: "212.5",
    minbpm: "123.4567",
    total: "500.1234",
  }));

  assert.equal(record.mainbpmDisplay, "170");
  assert.equal(record.mainbpmTitle, "");
  assert.equal(record.maxbpmDisplay, "212.5");
  assert.equal(record.maxbpmTitle, "");
  assert.equal(record.minbpmDisplay, "123.45...");
  assert.equal(record.minbpmTitle, "123.4567");
  assert.equal(record.totalDisplay, "500.12... (0.500 T/N)");
  assert.equal(record.totalTitle, "500.1234");
});

test("blank total normalizes to undefined display with equivalent value title", () => {
  const record = normalizeBmsInfoRecord(makeRawRecord({ notes: "345", total: "" }));

  assert.equal(record.total, null);
  assert.equal(record.totalDisplay, "undefined");
  assert.equal(record.totalStr, "undefined");
  assert.match(record.totalTitle, /^beatoraja: 263\.69 \(0\.764 T\/N\), LR2: 215\.20 \(0\.624 T\/N\)$/);
});

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
