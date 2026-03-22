import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { parseScoreBytes } from "../src/score_parser_runtime.js";

const FIXTURE_DIR = new URL("../fixtures/oracle/", import.meta.url);
const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));

test("BMS respects measure length when converting to seconds", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#00102:1.5",
    "#00111:01",
    "#00211:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "0".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.notes[0].timeSec, 2);
  assert.equal(result.score.notes[1].timeSec, 5);
});

test("BMS applies extended BPM changes", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#BPM01 240",
    "#00108:01",
    "#00211:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "1".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.bpmChanges.length, 1);
  assert.equal(result.score.notes[0].timeSec, 3);
});

test("BMS applies STOP timing", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#STOP01 48",
    "#00109:01",
    "#00211:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "2".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.stops.length, 1);
  assert.equal(result.score.notes[0].timeSec, 4.5);
});

test("BMS ignores 00 tokens in direct BPM lanes", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 160",
    "#00103:00AC",
    "#00211:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "3".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.bpmChanges.length, 1);
  assert.ok(Number.isFinite(result.score.totalDurationSec));
});

test("BMS RANDOM selection is deterministic for the same sha256", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#RANDOM 2",
    "#IF 1",
    "#00111:01",
    "#ELSE",
    "#00112:01",
    "#ENDIF",
  ].join("\n");
  const options = {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "4".repeat(64),
  };
  const left = parseScoreBytes(new TextEncoder().encode(chart), options);
  const right = parseScoreBytes(new TextEncoder().encode(chart), options);
  assert.equal(left.ok, true);
  assert.deepEqual(left, right);
});

test("BMSON exposes separate playable and timeline durations", () => {
  const bmson = {
    version: "1.0.0",
    info: {
      title: "test",
      artist: "test",
      genre: "test",
      chart_name: "test",
      level: 1,
      init_bpm: 120,
      resolution: 240,
      mode_hint: "beat-7k",
    },
    lines: [{ y: 0 }, { y: 960 }],
    bpm_events: [{ y: 480, bpm: 180 }],
    stop_events: [{ y: 720, duration: 120 }],
    sound_channels: [
      { name: "a.wav", notes: [{ x: 1, y: 240, l: 0, c: false }] },
      { name: "b.wav", notes: [{ x: 8, y: 960, l: 240, c: false }] },
    ],
    bga: {
      bga_header: [],
      bga_events: [{ y: 1800, id: 1 }],
      layer_events: [],
      poor_events: [],
    },
  };
  const result = parseScoreBytes(new TextEncoder().encode(JSON.stringify(bmson)), {
    formatHint: "bmson",
    textEncoding: "utf-8",
    sha256: "5".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.mode, "7k");
  assert.ok(result.score.lastTimelineTimeSec > result.score.lastPlayableTimeSec);
  assert.equal(result.score.totalDurationSec, result.score.lastTimelineTimeSec);
  assert.equal(result.score.noteCounts.visible, 2);
  assert.equal(result.score.noteCounts.long, 1);
  assert.equal(result.score.noteCounts.invisible, 0);
  assert.equal(result.score.noteCounts.mine, 0);
});

test("oracle regression: invisible notes are excluded from visible note count", { skip: !scoreFileExists("9984e8e84895de265c025ce257900e04397e66ac701a4b3a151638a384fbe462") }, () => {
  const sha256 = "9984e8e84895de265c025ce257900e04397e66ac701a4b3a151638a384fbe462";
  const gzipPath = path.join(REPO_ROOT, "site", "score", sha256.slice(0, 2), `${sha256}.gz`);
  const result = parseScoreBytes(gunzipSync(readFileSync(gzipPath)), {
    formatHint: "bms",
    sha256,
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.noteCounts.visible, 1234);
  assert.equal(result.score.noteCounts.invisible, 16);
  assert.equal(result.score.noteCounts.mine, 0);
  assert.equal(result.score.noteCounts.all, 1250);
});

test("oracle regression: mine notes are excluded from visible note count", { skip: !scoreFileExists("6651eb466eb24a1155a3b4f45c38dae0dc019540632c58e372201f3619ddece1") }, () => {
  const sha256 = "6651eb466eb24a1155a3b4f45c38dae0dc019540632c58e372201f3619ddece1";
  const gzipPath = path.join(REPO_ROOT, "site", "score", sha256.slice(0, 2), `${sha256}.gz`);
  const result = parseScoreBytes(gunzipSync(readFileSync(gzipPath)), {
    formatHint: "bms",
    sha256,
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.noteCounts.visible, 1799);
  assert.equal(result.score.noteCounts.invisible, 0);
  assert.equal(result.score.noteCounts.mine, 427);
  assert.equal(result.score.noteCounts.all, 2226);
});

for (const fileName of readdirSync(FIXTURE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => entry.name)) {
  test(`oracle fixture matches ${fileName}`, { skip: !scoreFileExists(fileName.replace(/\.json$/, "")) }, () => {
    const fixture = JSON.parse(readFileSync(new URL(fileName, FIXTURE_DIR), "utf8"));
    const gzipPath = path.join(REPO_ROOT, "site", "score", fixture.sha256.slice(0, 2), `${fixture.sha256}.gz`);
    const result = parseScoreBytes(gunzipSync(readFileSync(gzipPath)), {
      formatHint: fixture.format,
      sha256: fixture.sha256,
    });
    assert.equal(result.ok, true);
    assert.equal(result.score.mode, fixture.mode);
    assert.equal(result.score.laneCount, fixture.laneCount);
    assert.equal(result.score.noteCounts.visible, fixture.noteCount);
    assert.equal(result.score.bpmChanges.length, fixture.bpmChangesCount);
    assert.equal(result.score.stops.length, fixture.stopsCount);
    assertApprox(result.score.lastPlayableTimeSec, fixture.lastPlayableTimeSec.approx, fixture.lastPlayableTimeSec.toleranceSec);
    assertApprox(result.score.lastTimelineTimeSec, fixture.lastTimelineTimeSec.approx, fixture.lastTimelineTimeSec.toleranceSec);
    fixture.sampleNotes.forEach((expectedNote, index) => {
      const actualNote = result.score.notes[index];
      assert.equal(actualNote.lane, expectedNote.lane);
      assert.equal(actualNote.kind, expectedNote.kind);
      assertApprox(actualNote.timeSec, expectedNote.timeSec, 0.000001);
    });
  });
}

function scoreFileExists(sha256) {
  const gzipPath = path.join(REPO_ROOT, "site", "score", sha256.slice(0, 2), `${sha256}.gz`);
  return existsSync(gzipPath);
}

function assertApprox(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}
