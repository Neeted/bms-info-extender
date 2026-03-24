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
  assert.equal(result.score.initialBpm, 120);
  assert.equal(result.score.notes[0].beat, 4);
  assert.equal(result.score.notes[0].timeSec, 2);
  assert.equal(result.score.notes[1].beat, 10);
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
  assert.deepEqual(result.score.bpmChanges[0], { beat: 4, timeSec: 2, bpm: 240 });
  assert.equal(result.score.notes[0].timeSec, 3);
});

test("BMS exposes canonical timingActions and preserves reset BPM changes across source order", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#BPM01 240",
    "#00103:0078",
    "#00108:0100",
    "#00211:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "12".repeat(32),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.timingActions, [
    { type: "bpm", beat: 4, timeSec: 2, bpm: 240 },
    { type: "bpm", beat: 6, timeSec: 2.5, bpm: 120 },
  ]);
  assert.deepEqual(result.score.bpmChanges, [
    { beat: 4, timeSec: 2, bpm: 240 },
    { beat: 6, timeSec: 2.5, bpm: 120 },
  ]);
  assert.equal(result.score.notes[0].beat, 8);
  assert.equal(result.score.notes[0].timeSec, 3.5);
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
  assert.deepEqual(result.score.stops[0], { beat: 4, timeSec: 2.5, stopBeats: 1, durationSec: 0.5 });
  assert.deepEqual(result.score.timingActions, [
    { type: "stop", beat: 4, timeSec: 2, stopBeats: 1, durationSec: 0.5 },
  ]);
  assert.equal(result.score.notes[0].timeSec, 4.5);
});

test("BMS resolves SCROLL changes via SC channel references", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#SCROLL01 0.5",
    "#00111:01",
    "#003SC:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "a".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.scrollChanges, [{ beat: 12, timeSec: 6, rate: 0.5 }]);
  assert.ok(result.score.lastTimelineTimeSec > result.score.lastPlayableTimeSec);
});

test("BMS keeps explicit beat-0 SCROLL events", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#SCROLL01 1",
    "#000SC:01",
    "#00111:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "f".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.scrollChanges, [{ beat: 0, timeSec: 0, rate: 1 }]);
});

test("BMS accepts zero and negative SCROLL rates", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#SCROLL01 0",
    "#SCROLL02 -1",
    "#001SC:01",
    "#002SC:02",
    "#00311:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "3".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.scrollChanges.map((change) => change.rate), [0, -1]);
  assert.deepEqual(result.score.scrollChanges.map((change) => change.beat), [4, 8]);
  assert.equal(result.score.warnings.length, 0);
});

test("BMS warns on missing SCROLL references", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#001SC:01",
    "#00211:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "6".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.scrollChanges, []);
  assert.match(result.score.warnings[0]?.message ?? "", /SCROLL01/);
});

test("BMS auto detects UTF-8 BOM charts", () => {
  const chart = `\uFEFF#PLAYER 1\n#BPM 120\n#TITLE てすと\n#00111:01`;
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "auto",
    sha256: "c".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.notes.length, 1);
});

test("BMS auto detects UTF-8 charts without BOM", () => {
  const chart = "#PLAYER 1\n#BPM 120\n#TITLE てすと\n#00111:01";
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "auto",
    sha256: "d".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.notes.length, 1);
});

test("BMS auto keeps Shift_JIS fallback", () => {
  const chart = [
    0x23, 0x50, 0x4c, 0x41, 0x59, 0x45, 0x52, 0x20, 0x31, 0x0a,
    0x23, 0x42, 0x50, 0x4d, 0x20, 0x31, 0x32, 0x30, 0x0a,
    0x23, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x20, 0x82, 0xa0, 0x0a,
    0x23, 0x30, 0x30, 0x31, 0x31, 0x31, 0x3a, 0x30, 0x31,
  ];
  const result = parseScoreBytes(new Uint8Array(chart), {
    formatHint: "bms",
    textEncoding: "auto",
    sha256: "e".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.notes.length, 1);
});

test("BMS shift_jis explicit mode does not rescue UTF-8 BOM charts", () => {
  const chart = `\uFEFF#PLAYER 1\n#BPM 120\n#00111:01`;
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "shift_jis",
    sha256: "1".repeat(64),
  });
  assert.equal(result.ok, false);
});

test("BMS utf-8 explicit mode reads UTF-8 BOM charts", () => {
  const chart = `\uFEFF#PLAYER 1\n#BPM 120\n#00111:01`;
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "2".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.notes.length, 1);
});

test("BMS parses dense repeated STOP objects without exploding timing cost", () => {
  const stopPayload = "01".repeat(192);
  const stopMeasures = Array.from(
    { length: 48 },
    (_, index) => `#${String(index + 1).padStart(3, "0")}09:${stopPayload}`,
  );
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#STOP01 24",
    ...stopMeasures,
    "#04911:01",
  ].join("\n");

  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "b".repeat(64),
  });

  assert.equal(result.ok, true);
  assert.equal(result.score.stops.length, 48 * 192);
  assert.equal(result.score.notes.length, 1);
  assert.ok(result.score.notes[0].timeSec > 0);
});

test("BMS long note combo events count only the start for LNMODE 1", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#LNMODE 1",
    "#00151:01",
    "#00251:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "8".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.comboEvents.map((event) => event.kind), ["long-start"]);
});

test("BMS long note combo events count the end for LNMODE 2", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#LNMODE 2",
    "#00151:01",
    "#00251:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "9".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.comboEvents.map((event) => event.kind), ["long-start", "long-end"]);
  assert.ok(result.score.comboEvents[1].timeSec > result.score.comboEvents[0].timeSec);
});

test("BMS LNOBJ long notes inherit combo behavior from LNMODE", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#LNMODE 3",
    "#LNOBJ AA",
    "#00111:01AA",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "f".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.notes[0].kind, "long");
  assert.deepEqual(result.score.comboEvents.map((event) => event.kind), ["long-start", "long-end"]);
});

test("BMS LNOBJ normal notes keep beat positions", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#LNOBJ AA",
    "#00111:0102",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "ab".repeat(32),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.score.notes.map((note) => ({
      kind: note.kind,
      beat: note.beat,
      timeSec: note.timeSec,
    })),
    [
      { kind: "normal", beat: 4, timeSec: 2 },
      { kind: "normal", beat: 6, timeSec: 3 },
    ],
  );
  assert.ok(result.score.notes.every((note) => note.kind !== "normal" || Number.isFinite(note.beat)));
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

test("BMS auto-detects popn-9k and normalizes PMS lanes", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#00111:01",
    "#00115:01",
    "#00122:01",
    "#00125:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "6".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.mode, "popn-9k");
  assert.equal(result.score.laneCount, 9);
  assert.deepEqual(
    result.score.notes.map((note) => note.lane),
    [0, 4, 5, 8],
  );
  assert.ok(result.score.notes.every((note) => note.side === undefined));
});

test("BMS does not auto-detect popn-9k when scratch, p2 key1, or key6/7 are present", () => {
  const cases = [
    {
      chart: [
        "#PLAYER 1",
        "#BPM 120",
        "#00111:01",
        "#00116:01",
        "#00122:01",
      ].join("\n"),
      expectedMode: "10k",
    },
    {
      chart: [
        "#PLAYER 1",
        "#BPM 120",
        "#00111:01",
        "#00121:01",
        "#00122:01",
      ].join("\n"),
      expectedMode: "10k",
    },
    {
      chart: [
        "#PLAYER 1",
        "#BPM 120",
        "#00111:01",
        "#00118:01",
        "#00122:01",
      ].join("\n"),
      expectedMode: "14k",
    },
  ];

  cases.forEach(({ chart, expectedMode }, index) => {
    const result = parseScoreBytes(new TextEncoder().encode(chart), {
      formatHint: "bms",
      textEncoding: "utf-8",
      sha256: `${7 + index}`.repeat(64),
    });
    assert.equal(result.ok, true);
    assert.equal(result.score.mode, expectedMode);
  });
});

test("BMS popn-9k keeps invisible and mine notes separate from visible note count", () => {
  const chart = [
    "#PLAYER 1",
    "#BPM 120",
    "#00112:01",
    "#00122:01",
    "#00131:01",
    "#001D1:01",
    "#00151:01",
    "#00251:01",
  ].join("\n");
  const result = parseScoreBytes(new TextEncoder().encode(chart), {
    formatHint: "bms",
    textEncoding: "utf-8",
    sha256: "a".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.equal(result.score.mode, "popn-9k");
  assert.equal(result.score.noteCounts.visible, 3);
  assert.equal(result.score.noteCounts.normal, 2);
  assert.equal(result.score.noteCounts.long, 1);
  assert.equal(result.score.noteCounts.invisible, 1);
  assert.equal(result.score.noteCounts.mine, 1);
  assert.equal(result.score.noteCounts.all, 5);
  const longNote = result.score.notes.find((note) => note.kind === "long");
  assert.ok(longNote);
  assert.ok(longNote.endTimeSec > longNote.timeSec);
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
  assert.equal(result.score.initialBpm, 120);
  assert.ok(result.score.lastTimelineTimeSec > result.score.lastPlayableTimeSec);
  assert.equal(result.score.totalDurationSec, result.score.lastTimelineTimeSec);
  assert.equal(result.score.noteCounts.visible, 2);
  assert.equal(result.score.noteCounts.long, 1);
  assert.equal(result.score.noteCounts.invisible, 0);
  assert.equal(result.score.noteCounts.mine, 0);
  assert.equal(result.score.notes[0].beat, 1);
  assert.equal(result.score.notes[1].beat, 4);
  assert.equal(result.score.notes[1].endBeat, 5);
  assert.deepEqual(result.score.bpmChanges[0], { beat: 2, timeSec: 1, bpm: 180 });
  assert.deepEqual(result.score.stops[0], { beat: 3, timeSec: 1.5, stopBeats: 0.5, durationSec: 1 / 6 });
  assert.deepEqual(result.score.timingActions, [
    { type: "bpm", beat: 2, timeSec: 1, bpm: 180 },
    { type: "stop", beat: 3, timeSec: 4 / 3, stopBeats: 0.5, durationSec: 1 / 6 },
  ]);
  assert.deepEqual(result.score.barLines[0], { beat: 0, timeSec: 0 });
  assert.deepEqual(result.score.barLines[1], { beat: 4, timeSec: 11 / 6 });
  assert.deepEqual(result.score.comboEvents.map((event) => event.kind), ["normal", "long-start"]);
});

test("BMSON exposes scroll_events as scrollChanges", () => {
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
    scroll_events: [
      { y: 0, rate: 1 },
      { y: 720, rate: 0.5 },
      { y: 960, rate: -1 },
    ],
    sound_channels: [
      { name: "a.wav", notes: [{ x: 1, y: 240, l: 0, c: false }] },
    ],
    bga: { bga_header: [], bga_events: [], layer_events: [], poor_events: [] },
  };
  const result = parseScoreBytes(new TextEncoder().encode(JSON.stringify(bmson)), {
    formatHint: "bmson",
    textEncoding: "utf-8",
    sha256: "7".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.scrollChanges, [
    { beat: 0, timeSec: 0, rate: 1 },
    { beat: 3, timeSec: 1.5, rate: 0.5 },
    { beat: 4, timeSec: 2, rate: -1 },
  ]);
  assert.ok(result.score.lastTimelineTimeSec > result.score.lastPlayableTimeSec);
});

test("BMSON supports explicit popn mode hints and keeps generic 9 lanes distinct", () => {
  const popn9k = {
    version: "1.0.0",
    info: {
      title: "test",
      artist: "test",
      genre: "test",
      chart_name: "test",
      level: 1,
      init_bpm: 120,
      resolution: 240,
      mode_hint: "popn-9k",
    },
    sound_channels: [
      { name: "a.wav", notes: [{ x: 1, y: 0, l: 0, c: false }, { x: 9, y: 240, l: 0, c: false }] },
    ],
    bga: { bga_header: [], bga_events: [], layer_events: [], poor_events: [] },
  };
  const popn5k = {
    version: "1.0.0",
    info: {
      title: "test",
      artist: "test",
      genre: "test",
      chart_name: "test",
      level: 1,
      init_bpm: 120,
      resolution: 240,
      mode_hint: "popn-5k",
    },
    sound_channels: [
      { name: "a.wav", notes: [{ x: 1, y: 0, l: 0, c: false }, { x: 5, y: 240, l: 0, c: false }] },
    ],
    bga: { bga_header: [], bga_events: [], layer_events: [], poor_events: [] },
  };
  const generic9k = {
    version: "1.0.0",
    info: {
      title: "test",
      artist: "test",
      genre: "test",
      chart_name: "test",
      level: 1,
      init_bpm: 120,
      resolution: 240,
    },
    sound_channels: [
      { name: "a.wav", notes: [{ x: 1, y: 0, l: 0, c: false }, { x: 9, y: 240, l: 0, c: false }] },
    ],
    bga: { bga_header: [], bga_events: [], layer_events: [], poor_events: [] },
  };

  const popn9kResult = parseScoreBytes(new TextEncoder().encode(JSON.stringify(popn9k)), {
    formatHint: "bmson",
    textEncoding: "utf-8",
    sha256: "b".repeat(64),
  });
  assert.equal(popn9kResult.ok, true);
  assert.equal(popn9kResult.score.mode, "popn-9k");
  assert.equal(popn9kResult.score.laneCount, 9);
  assert.ok(popn9kResult.score.notes.every((note) => note.side === undefined));

  const popn5kResult = parseScoreBytes(new TextEncoder().encode(JSON.stringify(popn5k)), {
    formatHint: "bmson",
    textEncoding: "utf-8",
    sha256: "c".repeat(64),
  });
  assert.equal(popn5kResult.ok, true);
  assert.equal(popn5kResult.score.mode, "popn-5k");
  assert.equal(popn5kResult.score.laneCount, 5);

  const generic9kResult = parseScoreBytes(new TextEncoder().encode(JSON.stringify(generic9k)), {
    formatHint: "bmson",
    textEncoding: "utf-8",
    sha256: "d".repeat(64),
  });
  assert.equal(generic9kResult.ok, true);
  assert.equal(generic9kResult.score.mode, "9k");
  assert.equal(generic9kResult.score.laneCount, 9);
});

test("BMSON charge notes add a long-end combo event", () => {
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
    sound_channels: [
      { name: "a.wav", notes: [{ x: 1, y: 240, l: 240, c: false, t: 2 }] },
    ],
    bga: { bga_header: [], bga_events: [], layer_events: [], poor_events: [] },
  };
  const result = parseScoreBytes(new TextEncoder().encode(JSON.stringify(bmson)), {
    formatHint: "bmson",
    textEncoding: "utf-8",
    sha256: "e".repeat(64),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.score.comboEvents.map((event) => event.kind), ["long-start", "long-end"]);
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
    if (fixture.noteCounts) {
      assert.deepEqual(result.score.noteCounts, fixture.noteCounts);
    }
    assert.equal(result.score.bpmChanges.length, fixture.bpmChangesCount);
    assert.equal(result.score.stops.length, fixture.stopsCount);
    assertApprox(result.score.lastPlayableTimeSec, fixture.lastPlayableTimeSec.approx, fixture.lastPlayableTimeSec.toleranceSec);
    assertApprox(result.score.lastTimelineTimeSec, fixture.lastTimelineTimeSec.approx, fixture.lastTimelineTimeSec.toleranceSec);
    const visibleNotes = result.score.notes.filter((note) => note.kind === "normal" || note.kind === "long");
    fixture.sampleNotes.forEach((expectedNote, index) => {
      const actualNote = visibleNotes[index];
      assert.equal(actualNote.lane, expectedNote.lane);
      assert.equal(actualNote.kind, expectedNote.kind);
      assertApprox(actualNote.timeSec, expectedNote.timeSec, 0.001);
      if ("endTimeSec" in expectedNote) {
        assertApprox(actualNote.endTimeSec, expectedNote.endTimeSec, 0.001);
      }
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
