import assert from "node:assert/strict";
import test from "node:test";

import {
  BEAT_SELECTION_EPSILON,
  createDefaultGameTimingConfig,
  DEFAULT_EDITOR_PIXELS_PER_BEAT,
  DEFAULT_GAME_HS_FIX_FALLBACK_BPM,
  DEFAULT_JUDGE_LINE_POSITION_RATIO,
  DEFAULT_VIEWER_PIXELS_PER_SECOND,
  createEditorMeasureRanges,
  createScoreViewerModel,
  getBeatAtTimeSec,
  getClampedSelectedTimeSec,
  getComboCountAtTime,
  getContentHeightPx,
  getEditorFrameState,
  getEditorFrameStateForBeat,
  getEditorContentHeightPx,
  getEditorScrollTopForBeat,
  getEditorScrollTopForTimeSec,
  getGameVisibleTrackRange,
  getGameTrackPositionAtTimeSec,
  getGameTrackPositionForBeat,
  getGameCurrentDurationMs,
  getGameCurrentGreenNumber,
  getGameGreenNumberRange,
  getGameHsFixBaseBpm,
  getGameLaneCoverBounds,
  getGameJudgeDistancePx,
  getGameJudgeLinePositionRatioFromPointer,
  getGameJudgeLineY,
  getGameLaneCoverHeightPx,
  getGameLaneGeometry,
  getGameTimingDerivedMetrics,
  getJudgeLineY,
  getLongBodyTrackWindow,
  getTrackWindowIndices,
  getVisibleBeatRange,
  hasViewerSelectionChanged,
  getMeasureIndexAtTime,
  getScrollTopForTimeSec,
  getTimeSecForBeat,
  getTimeSecForEditorScrollTop,
  getTimeSecForScrollTop,
  getVisibleTimeRange,
  getViewerCursor,
  resolveViewerModeForModel,
} from "./score-viewer-model.js";

test("viewer model resolves measure and combo positions from comboEvents and bar lines", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 10,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 3, normal: 2, long: 1, invisible: 0, mine: 0, all: 3 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 2, beat: 4, endBeat: 6, endTimeSec: 3, timeSec: 2, kind: "long" },
    ],
    comboEvents: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 2, beat: 4, timeSec: 2, kind: "long-start" },
      { lane: 2, beat: 6, timeSec: 3, kind: "long-end" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(getMeasureIndexAtTime(model, 0), 0);
  assert.equal(getMeasureIndexAtTime(model, 1.99), 0);
  assert.equal(getMeasureIndexAtTime(model, 2), 1);
  assert.equal(getComboCountAtTime(model, 0.99), 0);
  assert.equal(getComboCountAtTime(model, 2.5), 2);
  assert.equal(getComboCountAtTime(model, 3), 3);

  const cursor = getViewerCursor(model, 3, "editor");
  assert.equal(cursor.beat, 6);
  assert.equal(cursor.measureIndex, 1);
  assert.equal(cursor.totalMeasureIndex, 1);
  assert.equal(cursor.comboCount, 3);
  assert.equal(cursor.totalCombo, 3);

  const totalDurationCursor = getViewerCursor(model, 11.75);
  assert.equal(totalDurationCursor.timeSec, 11.75);
  assert.equal(totalDurationCursor.measureIndex, 1);
  assert.equal(totalDurationCursor.comboCount, 3);
  assert.equal(getClampedSelectedTimeSec(model, 20), 12);
  assert.equal(getVisibleTimeRange(model, 11.8, 480).endTimeSec, 12);
  assert.equal(getContentHeightPx(model, 480, DEFAULT_VIEWER_PIXELS_PER_SECOND), 12 * DEFAULT_VIEWER_PIXELS_PER_SECOND + 480);
  assert.equal(getScrollTopForTimeSec(model, 20, 480, DEFAULT_VIEWER_PIXELS_PER_SECOND), 12 * DEFAULT_VIEWER_PIXELS_PER_SECOND);
});

test("viewer model expands visible ranges asymmetrically around a moved judge line", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 12,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(DEFAULT_JUDGE_LINE_POSITION_RATIO, 0.5);
  assert.equal(getJudgeLineY(320), 160);

  const raisedTimeRange = getVisibleTimeRange(model, 4, 320, 160, 80);
  assert.deepEqual(raisedTimeRange, {
    startTimeSec: 1.75,
    endTimeSec: 5.25,
  });

  const loweredTimeRange = getVisibleTimeRange(model, 4, 320, 160, 240);
  assert.deepEqual(loweredTimeRange, {
    startTimeSec: 2.75,
    endTimeSec: 6.25,
  });

  const raisedEditorRange = getEditorFrameStateForBeat(model, 8, 320, 64, 80);
  assert.deepEqual(
    {
      startBeat: raisedEditorRange.startBeat,
      endBeat: raisedEditorRange.endBeat,
    },
    {
      startBeat: 2.9375,
      endBeat: 10.5625,
    },
  );

  const loweredEditorRange = getEditorFrameStateForBeat(model, 8, 320, 64, 240);
  assert.deepEqual(
    {
      startBeat: loweredEditorRange.startBeat,
      endBeat: loweredEditorRange.endBeat,
    },
    {
      startBeat: 5.4375,
      endBeat: 12,
    },
  );

  assert.deepEqual(
    getVisibleBeatRange(model, 4, 320, 64, 240),
    loweredEditorRange,
  );
});

test("viewer model derives game lane geometry and judge line ratios within the active lane region", () => {
  assert.deepEqual(
    getGameLaneGeometry(500, 0.5, 50),
    {
      viewportHeight: 500,
      laneTopY: 200,
      laneBottomY: 500,
      laneHeightPx: 50,
      configuredLaneHeightPx: 50,
      judgeLineY: 250,
      judgeDistancePx: 50,
    },
  );
  assert.equal(getGameJudgeLineY(500, 0.5), 250);
  assert.equal(getGameJudgeDistancePx(500, 0.5, 50), 50);
  assert.equal(getGameLaneCoverHeightPx(500, 0.5, 50, 500), 25);
  assert.deepEqual(
    getGameLaneCoverBounds(500, 0.5, 50, 500),
    {
      topY: 200,
      bottomY: 225,
      heightPx: 25,
      rawBottomY: 225,
    },
  );
  assert.equal(getGameJudgeLinePositionRatioFromPointer(250, 500), 0.5);
  assert.equal(getGameJudgeLinePositionRatioFromPointer(375, 500), 0.75);
  assert.equal(getGameJudgeLinePositionRatioFromPointer(500, 500, 50), 1);
});

test("viewer model clips actual lane height to the space above the judge line", () => {
  const geometry = getGameLaneGeometry(321, 0.5, 300);

  assert.deepEqual(geometry, {
    viewportHeight: 321,
    laneTopY: 0,
    laneBottomY: 321,
    laneHeightPx: 160.5,
    configuredLaneHeightPx: 300,
    judgeLineY: 160.5,
    judgeDistancePx: 160.5,
  });
  assert.equal(geometry.laneTopY, 0);
  assert.equal(geometry.judgeLineY - geometry.laneTopY, geometry.laneHeightPx);
});

test("viewer model snaps the active game lane top to an integer pixel", () => {
  const geometry = getGameLaneGeometry(321, 0.5, 50);

  assert.deepEqual(geometry, {
    viewportHeight: 321,
    laneTopY: 110,
    laneBottomY: 321,
    laneHeightPx: 50.5,
    configuredLaneHeightPx: 50,
    judgeLineY: 160.5,
    judgeDistancePx: 50.5,
  });
  assert.equal(Number.isInteger(geometry.laneTopY), true);
  assert.deepEqual(
    getGameLaneCoverBounds(321, 0.5, 50, 500),
    {
      topY: 110,
      bottomY: 135,
      heightPx: 25,
      rawBottomY: 135.25,
    },
  );
});

test("viewer model resolves HS-FIX BPMs from record summary and parsed score fallbacks", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 12,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 180 }],
    stops: [],
    scrollChanges: [],
    warnings: [],
  }, {
    bpmSummary: {
      mainBpm: 150,
      maxBpm: 200,
      minBpm: 90,
    },
  });

  assert.equal(getGameHsFixBaseBpm(model, "start"), 120);
  assert.equal(getGameHsFixBaseBpm(model, "main"), 150);
  assert.equal(getGameHsFixBaseBpm(model, "max"), 200);
  assert.equal(getGameHsFixBaseBpm(model, "min"), 90);

  const fallbackModel = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: null,
    totalDurationSec: 12,
    lastPlayableTimeSec: 12,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(getGameHsFixBaseBpm(fallbackModel, "main"), DEFAULT_GAME_HS_FIX_FALLBACK_BPM);
});

test("viewer model calculates current green numbers and range with lane cover and zero-scroll sections", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 12,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }],
    bpmChanges: [{ beat: 8, timeSec: 4, bpm: 240 }],
    stops: [],
    scrollChanges: [{ beat: 4, timeSec: 2, rate: 0 }, { beat: 8, timeSec: 4, rate: 2 }],
    warnings: [],
  }, {
    bpmSummary: {
      mainBpm: 120,
      maxBpm: 240,
      minBpm: 120,
    },
  });

  const gameTimingConfig = createDefaultGameTimingConfig();
  assert.equal(getGameCurrentDurationMs(model, 1, gameTimingConfig), 500);
  assert.equal(getGameCurrentGreenNumber(model, 1, gameTimingConfig), 300);
  assert.equal(getGameCurrentGreenNumber(model, 2.5, gameTimingConfig), 0);
  assert.equal(getGameCurrentGreenNumber(model, 4.5, gameTimingConfig), 75);
  assert.deepEqual(getGameGreenNumberRange(model, gameTimingConfig), {
    maxGreenNumber: 300,
    minGreenNumber: 0,
  });
});

test("viewer model compresses game timing state points to BPM and SCROLL changes only", () => {
  const sparseModel = createScoreViewerModel(createGameTimingDensityScore({ dense: false }));
  const denseModel = createScoreViewerModel(createGameTimingDensityScore({ dense: true }));

  assert.equal(sparseModel.gameTimingStatePoints.length, 3);
  assert.equal(denseModel.gameTimingStatePoints.length, 3);
  assert.deepEqual(
    denseModel.gameTimingStatePoints.map(({ beat, bpm, scrollRate }) => ({ beat, bpm, scrollRate })),
    [
      { beat: 0, bpm: 120, scrollRate: 1 },
      { beat: 8, bpm: 180, scrollRate: 1 },
      { beat: 12, bpm: 180, scrollRate: 0.5 },
    ],
  );
  assert.deepEqual(
    getGameGreenNumberRange(denseModel, createDefaultGameTimingConfig()),
    getGameGreenNumberRange(sparseModel, createDefaultGameTimingConfig()),
  );
});

test("viewer model caches game timing derived metrics by normalized config", () => {
  const model = createScoreViewerModel(createGameTimingDensityScore({ dense: true }));
  const first = getGameTimingDerivedMetrics(model, {
    durationMs: 500,
    laneHeightPx: 300,
    laneCoverPermille: 0,
    laneCoverVisible: true,
    hsFixMode: "main",
  });
  const second = getGameTimingDerivedMetrics(model, createDefaultGameTimingConfig());
  const third = getGameTimingDerivedMetrics(model, {
    durationMs: 750,
    laneHeightPx: 300,
    laneCoverPermille: 0,
    laneCoverVisible: true,
    hsFixMode: "main",
  });

  assert.strictEqual(first, second);
  assert.notStrictEqual(first, third);
  assert.equal(first.greenNumberRange, undefined);
  assert.deepEqual(
    getGameTimingDerivedMetrics(model, createDefaultGameTimingConfig(), { includeGreenNumberRange: true }).greenNumberRange,
    { maxGreenNumber: 400, minGreenNumber: 200 },
  );
});

test("viewer model keeps duration and green number semantics when lane cover visibility is disabled", () => {
  const model = createScoreViewerModel(createGameTimingDensityScore({ dense: true }));
  const visibleConfig = {
    durationMs: 500,
    laneHeightPx: 300,
    laneCoverPermille: 250,
    laneCoverVisible: true,
    hsFixMode: "main",
  };
  const hiddenConfig = {
    ...visibleConfig,
    laneCoverVisible: false,
  };

  assert.equal(getGameCurrentDurationMs(model, 1, hiddenConfig), getGameCurrentDurationMs(model, 1, visibleConfig));
  assert.equal(getGameCurrentDurationMs(model, 5, hiddenConfig), getGameCurrentDurationMs(model, 5, visibleConfig));
  assert.equal(getGameCurrentGreenNumber(model, 1, hiddenConfig), getGameCurrentGreenNumber(model, 1, visibleConfig));
  assert.equal(getGameCurrentGreenNumber(model, 5, hiddenConfig), getGameCurrentGreenNumber(model, 5, visibleConfig));
  assert.deepEqual(getGameGreenNumberRange(model, hiddenConfig), getGameGreenNumberRange(model, visibleConfig));
});

test("viewer model converts between seconds and beats across BPM changes and STOPs", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 6,
    lastPlayableTimeSec: 6,
    lastTimelineTimeSec: 6,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 3 }, { beat: 12, timeSec: 5 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 240 }],
    stops: [{ beat: 8, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(getBeatAtTimeSec(model, 1.5), 3);
  assert.equal(getBeatAtTimeSec(model, 2.5), 6);
  assert.equal(getBeatAtTimeSec(model, 3.25), 8);
  assert.equal(getBeatAtTimeSec(model, 3.75), 8);
  assert.equal(getBeatAtTimeSec(model, 4.5), 10);
  assert.equal(getTimeSecForBeat(model, 10), 4.5);
});

test("viewer model prefers parser timingActions over lossy bpmChanges", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 5.75,
    lastPlayableTimeSec: 5.75,
    lastTimelineTimeSec: 5.75,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 3.75 }, { beat: 12, timeSec: 5.75 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 240 }],
    stops: [],
    scrollChanges: [],
    timingActions: [
      { type: "bpm", beat: 4, timeSec: 2, bpm: 240 },
      { type: "bpm", beat: 5, timeSec: 2.25, bpm: 120 },
    ],
    warnings: [],
  });

  assert.equal(getBeatAtTimeSec(model, 3), 6.5);
  assert.equal(getTimeSecForBeat(model, 6.5), 3);
});

test("viewer model excludes malformed beatless notes from editor indexes", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 12,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 2, normal: 2, long: 0, invisible: 0, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 4, timeSec: 2, kind: "normal" },
      { lane: 7, timeSec: 10, kind: "normal" },
    ],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(model.notes.length, 2);
  assert.equal(model.notesByBeat.length, 1);
  assert.deepEqual(model.notesByBeat.map((note) => ({ lane: note.lane, beat: note.beat, timeSec: note.timeSec })), [
    { lane: 1, beat: 4, timeSec: 2 },
  ]);
});

test("viewer model keeps invisible notes separate from visible note indexes", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 12,
    lastPlayableTimeSec: 12,
    lastTimelineTimeSec: 12,
    noteCounts: { visible: 2, normal: 1, long: 1, invisible: 2, mine: 0, all: 4 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 2, beat: 4, endBeat: 6, endTimeSec: 3, timeSec: 2, kind: "long" },
      { lane: 3, beat: 5, timeSec: 2.5, kind: "invisible" },
      { lane: 4, timeSec: 3.5, kind: "invisible" },
    ],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(model.notes.length, 2);
  assert.equal(model.invisibleNotes.length, 2);
  assert.deepEqual(model.notes.map((note) => note.kind), ["normal", "long"]);
  assert.deepEqual(model.invisibleNotes.map((note) => note.kind), ["invisible", "invisible"]);
  assert.deepEqual(model.invisibleNotesByBeat.map((note) => ({ lane: note.lane, beat: note.beat, timeSec: note.timeSec })), [
    { lane: 3, beat: 5, timeSec: 2.5 },
  ]);
});

test("viewer model builds a signed game displacement index across positive, zero, and negative scroll segments", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }, { beat: 16, timeSec: 8 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 0 },
      { beat: 8, timeSec: 4, rate: -1 },
      { beat: 12, timeSec: 6, rate: 2 },
    ],
    warnings: [],
  });

  assert.equal(model.supportsGameMode, true);
  assert.equal(resolveViewerModeForModel(model, "game"), "game");
  assert.equal(getGameTrackPositionForBeat(model, 2), 2);
  assert.equal(getGameTrackPositionForBeat(model, 6), 4);
  assert.equal(getGameTrackPositionForBeat(model, 10), 2);
  assert.equal(getGameTrackPositionForBeat(model, 14), 4);
});

test("viewer model keeps raw game displacement even when a measure spans many beats", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 24, timeSec: 2 }, { beat: 48, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 24, timeSec: 2, rate: -1 },
      { beat: 48, timeSec: 4, rate: 1 },
    ],
    warnings: [],
  });

  assert.equal(getGameTrackPositionForBeat(model, 12), 12);
  assert.equal(getGameTrackPositionForBeat(model, 24), 24);
  assert.equal(getGameTrackPositionForBeat(model, 36), 12);
});

test("viewer model keeps game displacement fixed while playback is inside a STOP", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 6,
    lastPlayableTimeSec: 6,
    lastTimelineTimeSec: 6,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 5 }],
    bpmChanges: [],
    stops: [{ beat: 4, timeSec: 2, stopBeats: 4, durationSec: 2 }],
    scrollChanges: [],
    warnings: [],
  });

  assert.equal(getBeatAtTimeSec(model, 2.5), 4);
  assert.equal(getBeatAtTimeSec(model, 3.5), 4);
  assert.equal(getGameTrackPositionAtTimeSec(model, 2.5), 4);
  assert.equal(getGameTrackPositionAtTimeSec(model, 3.5), 4);
});

test("viewer model builds a Lunatic profile that keeps beats and shortens time through warp STOPs", () => {
  const score = {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 2, normal: 2, long: 0, invisible: 0, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 4 + 1 / 96, timeSec: 2 + (0.5 / 96), kind: "normal" },
      { lane: 1, beat: 8, timeSec: 4, kind: "normal" },
    ],
    comboEvents: [
      { lane: 1, beat: 4 + 1 / 96, timeSec: 2 + (0.5 / 96), kind: "normal" },
      { lane: 1, beat: 8, timeSec: 4, kind: "normal" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [{ beat: 4, timeSec: 2, rate: 0 }],
    timingActions: [
      {
        type: "stop",
        beat: 4,
        timeSec: 2,
        stopBeats: 1,
        durationSec: 0.5,
        stopResolution: "resolved",
        stopLunaticBehavior: "warp",
      },
    ],
    warnings: [],
  };

  const gameModel = createScoreViewerModel(score);
  const lunaticModel = createScoreViewerModel(score, { gameProfile: "lunatic" });

  assert.equal(resolveViewerModeForModel(lunaticModel, "lunatic"), "lunatic");
  assert.deepEqual(lunaticModel.score.scrollChanges, []);
  assert.equal(lunaticModel.gameScrollIndex.actions.length, 0);
  assert.ok(lunaticModel.score.totalDurationSec < gameModel.score.totalDurationSec);
  assert.equal(gameModel.warps.length, 0);
  assert.equal(gameModel.gameTimeline.some((point) => point.stops.length === 1), true);
  assert.equal(lunaticModel.warps.length, 1);
  assert.equal(lunaticModel.stops.length, 0);
  assert.ok(Math.abs(lunaticModel.notes[0].beat - (4 + 1 / 96)) < 0.000001);
  assert.ok(Math.abs(lunaticModel.notes[0].timeSec - 2) < 0.000001);
  assert.ok(Math.abs(lunaticModel.notes[1].beat - 8) < 0.000001);
  assert.ok(Math.abs(lunaticModel.notes[1].timeSec - (4 - (0.5 / 48))) < 0.000001);
});

test("viewer model applies the last same-beat scroll change to subsequent game displacement", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 0 },
      { beat: 4, timeSec: 2, rate: -2 },
    ],
    warnings: [],
  });

  assert.equal(getGameTrackPositionForBeat(model, 4), 4);
  assert.equal(getGameTrackPositionForBeat(model, 5), 2);
});

test("viewer model builds a grouped game timeline with canonical STOP start times and long-note endpoint metadata", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 5,
    lastPlayableTimeSec: 5,
    lastTimelineTimeSec: 5,
    noteCounts: { visible: 2, normal: 1, long: 1, invisible: 1, mine: 0, all: 3 },
    notes: [
      { lane: 1, beat: 4, endBeat: 8, timeSec: 2, endTimeSec: 5, kind: "long" },
      { lane: 2, beat: 4, timeSec: 2, kind: "invisible" },
      { lane: 3, beat: 8, timeSec: 5, kind: "normal" },
    ],
    comboEvents: [
      { lane: 1, beat: 4, timeSec: 2, kind: "long-start" },
      { lane: 1, beat: 8, timeSec: 5, kind: "long-end" },
      { lane: 3, beat: 8, timeSec: 5, kind: "normal" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 5 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 240 }],
    stops: [{ beat: 4, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    timingActions: [
      { type: "bpm", beat: 4, timeSec: 2, bpm: 240 },
      { type: "stop", beat: 4, timeSec: 2, stopBeats: 4, durationSec: 1 },
    ],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 0 },
      { beat: 4, timeSec: 2, rate: -2 },
    ],
    warnings: [],
  });

  const pointAtFour = model.gameTimeline.find((point) => point.beat === 4 && point.timeSec === 2);
  const pointAtEight = model.gameTimeline.find((point) => point.beat === 8 && point.timeSec === 5);
  const longNote = model.notes.find((note) => note.kind === "long");

  assert.ok(pointAtFour);
  assert.ok(pointAtEight);
  assert.ok(longNote);
  assert.deepEqual(pointAtFour.scrollChanges.map((change) => change.rate), [0, -2]);
  assert.equal(pointAtFour.barLines.length, 1);
  assert.equal(pointAtFour.bpmChanges.length, 1);
  assert.equal(pointAtFour.stops.length, 1);
  assert.equal(pointAtFour.stops[0].timeSec, 2);
  assert.equal(pointAtFour.notes.length, 2);
  assert.equal(pointAtFour.stopDurationSec, 1);
  assert.equal(pointAtFour.outgoingScrollRate, -2);
  assert.equal(model.stops[0].timeSec, 3);
  assert.equal(longNote.gameTimelineIndex, pointAtFour.index);
  assert.equal(longNote.gameTimelineEndIndex, pointAtEight.index);
  assert.deepEqual(pointAtEight.longEndNotes, [longNote]);
});

test("viewer model creates a game STOP point at the stop start even without canonical timingActions", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 5,
    lastPlayableTimeSec: 5,
    lastTimelineTimeSec: 5,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 6, timeSec: 4, kind: "normal" },
    ],
    comboEvents: [
      { lane: 1, beat: 6, timeSec: 4, kind: "normal" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 8, timeSec: 5 }],
    bpmChanges: [],
    stops: [{ beat: 4, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [],
    warnings: [],
  });

  const stopPoint = model.gameTimeline.find((point) => point.beat === 4 && point.timeSec === 2);
  const stopEndPoint = model.gameTimeline.find((point) => point.beat === 4 && point.timeSec === 3);

  assert.ok(stopPoint);
  assert.equal(stopPoint.stops.length, 1);
  assert.equal(stopPoint.stopDurationSec, 1);
  assert.equal(stopPoint.stops[0].timeSec, 2);
  assert.equal(stopEndPoint, undefined);
  assert.equal(model.stops[0].timeSec, 3);
});

test("viewer model exposes game-mode visible slices by track position", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 3, normal: 2, long: 1, invisible: 1, mine: 0, all: 4 },
    notes: [
      { lane: 1, beat: 4, timeSec: 2, kind: "normal" },
      { lane: 2, beat: 6, endBeat: 10, timeSec: 3, endTimeSec: 5, kind: "long" },
      { lane: 3, beat: 7, timeSec: 3.5, kind: "normal" },
      { lane: 4, beat: 9, timeSec: 4.5, kind: "invisible" },
    ],
    comboEvents: [
      { lane: 1, beat: 4, timeSec: 2, kind: "normal" },
      { lane: 2, beat: 6, timeSec: 3, kind: "long-start" },
      { lane: 2, beat: 10, timeSec: 5, kind: "long-end" },
      { lane: 3, beat: 7, timeSec: 3.5, kind: "normal" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 0 },
      { beat: 8, timeSec: 4, rate: 2 },
    ],
    warnings: [],
  });

  const visibleTrackRange = getGameVisibleTrackRange(4, 320, 64);
  const noteWindow = getTrackWindowIndices(
    model.gameNotesByTrack,
    visibleTrackRange.startTrackPosition,
    visibleTrackRange.endTrackPosition,
  );
  assert.deepEqual(
    model.gameNotesByTrack.slice(noteWindow.startIndex, noteWindow.endIndex).map((note) => ({
      lane: note.lane,
      trackPosition: note.trackPosition,
    })),
    [
      { lane: 1, trackPosition: 4 },
      { lane: 2, trackPosition: 4 },
      { lane: 3, trackPosition: 4 },
    ],
  );

  const invisibleWindow = getTrackWindowIndices(
    model.gameInvisibleNotesByTrack,
    visibleTrackRange.startTrackPosition,
    visibleTrackRange.endTrackPosition,
  );
  assert.deepEqual(
    model.gameInvisibleNotesByTrack.slice(invisibleWindow.startIndex, invisibleWindow.endIndex).map((note) => note.lane),
    [4],
  );

  const longBodyWindow = getLongBodyTrackWindow(
    model,
    visibleTrackRange.startTrackPosition,
    visibleTrackRange.endTrackPosition,
  );
  assert.deepEqual(
    longBodyWindow.items.slice(longBodyWindow.startIndex, longBodyWindow.endIndex).map((note) => ({
      lane: note.lane,
      startTrackPosition: note.trackPosition,
      endTrackPosition: note.endTrackPosition,
    })),
    [{ lane: 2, startTrackPosition: 4, endTrackPosition: 8 }],
  );

  assert.deepEqual(
    getGameVisibleTrackRange(4, 320, 64, 240),
    {
      startTrackPosition: 1.4375,
      endTrackPosition: 9.0625,
    },
  );
});

test("viewer model editor scroll mapping uses beat axis", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "popn-9k",
    laneCount: 9,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  const viewportHeight = 480;
  const scrollTop = getEditorScrollTopForTimeSec(model, 1, viewportHeight, DEFAULT_EDITOR_PIXELS_PER_BEAT);
  assert.equal(scrollTop, 2 * DEFAULT_EDITOR_PIXELS_PER_BEAT);
  assert.equal(getEditorScrollTopForBeat(model, 2, viewportHeight, DEFAULT_EDITOR_PIXELS_PER_BEAT), scrollTop);
  assert.equal(getTimeSecForEditorScrollTop(model, scrollTop, DEFAULT_EDITOR_PIXELS_PER_BEAT), 1);
  assert.equal(getEditorContentHeightPx(model, viewportHeight, DEFAULT_EDITOR_PIXELS_PER_BEAT), 8 * DEFAULT_EDITOR_PIXELS_PER_BEAT + viewportHeight);
  assert.equal(getTimeSecForScrollTop(model, getScrollTopForTimeSec(model, 1, viewportHeight, DEFAULT_VIEWER_PIXELS_PER_SECOND), DEFAULT_VIEWER_PIXELS_PER_SECOND), 1);
});

test("viewer model reuses editor frame state semantics around BPM and STOP transitions", () => {
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 6,
    lastPlayableTimeSec: 6,
    lastTimelineTimeSec: 6,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 3 }, { beat: 12, timeSec: 5 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 240 }],
    stops: [{ beat: 8, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [],
    warnings: [],
  });

  const frameState = getEditorFrameState(model, 3.75, 480, DEFAULT_EDITOR_PIXELS_PER_BEAT);
  assert.equal(frameState.selectedBeat, 8);
  assert.equal(frameState.viewportHeight, 480);
  assert.equal(frameState.startBeat < frameState.selectedBeat, true);
  assert.equal(frameState.endBeat > frameState.selectedBeat, true);
});

test("viewer model builds editor measure ranges including trailing beats after the last bar line", () => {
  const measureRanges = createEditorMeasureRanges(
    [
      { beat: 0, timeSec: 0 },
      { beat: 3, timeSec: 1.5 },
      { beat: 7.5, timeSec: 4 },
    ],
    10,
  );

  assert.deepEqual(measureRanges, [
    { startBeat: 0, endBeat: 3 },
    { startBeat: 3, endBeat: 7.5 },
    { startBeat: 7.5, endBeat: 10 },
  ]);
});

test("viewer selection change in editor mode is beat-based for extremely high BPM", () => {
  const initialBpm = 14500145;
  const totalBeat = 8;
  const totalDurationSec = (totalBeat * 60) / initialBpm;
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm,
    totalDurationSec,
    lastPlayableTimeSec: totalDurationSec,
    lastTimelineTimeSec: totalDurationSec,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: (4 * 60) / initialBpm }, { beat: totalBeat, timeSec: totalDurationSec }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  const nextBeat = 1 / DEFAULT_EDITOR_PIXELS_PER_BEAT;
  const nextTimeSec = getTimeSecForBeat(model, nextBeat);

  assert.equal(nextTimeSec < 0.0005, true);
  assert.equal(hasViewerSelectionChanged(model, "editor", 0, nextTimeSec, 0, nextBeat), true);
  assert.equal(nextBeat > BEAT_SELECTION_EPSILON, true);
});

test("viewer selection change in editor mode stays monotonic for BPM below one", () => {
  const initialBpm = 0.5;
  const model = createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm,
    totalDurationSec: 960,
    lastPlayableTimeSec: 960,
    lastTimelineTimeSec: 960,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 0, mine: 0, all: 0 },
    notes: [],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 480 }, { beat: 8, timeSec: 960 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  });

  const nextBeat = 1 / DEFAULT_EDITOR_PIXELS_PER_BEAT;
  const nextTimeSec = getTimeSecForBeat(model, nextBeat);

  assert.equal(nextTimeSec > 0, true);
  assert.equal(getBeatAtTimeSec(model, nextTimeSec), nextBeat);
  assert.equal(hasViewerSelectionChanged(model, "editor", 0, nextTimeSec, 0, nextBeat), true);
});

function createGameTimingDensityScore({ dense }) {
  const timeForBeat = (beat) => (beat <= 8 ? beat / 2 : 4 + ((beat - 8) / 3));
  const notes = dense
    ? Array.from({ length: 128 }, (_, index) => {
      const beat = 4 + index * 0.125;
      return {
        lane: index % 8,
        beat,
        timeSec: timeForBeat(beat),
        kind: "normal",
      };
    })
    : [];
  const comboEvents = notes.map((note) => ({
    lane: note.lane,
    beat: note.beat,
    timeSec: note.timeSec,
    kind: "normal",
  }));
  const barLines = dense
    ? [
      { beat: 0, timeSec: 0 },
      ...Array.from({ length: 16 }, (_, index) => ({
        beat: (index + 1) * 2,
        timeSec: timeForBeat((index + 1) * 2),
      })),
    ]
    : [
      { beat: 0, timeSec: 0 },
      { beat: 8, timeSec: timeForBeat(8) },
      { beat: 12, timeSec: timeForBeat(12) },
      { beat: 16, timeSec: timeForBeat(16) },
    ];
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: timeForBeat(16),
    lastPlayableTimeSec: timeForBeat(16),
    lastTimelineTimeSec: timeForBeat(16),
    noteCounts: {
      visible: notes.length,
      normal: notes.length,
      long: 0,
      invisible: 0,
      mine: 0,
      all: notes.length,
    },
    notes,
    comboEvents,
    barLines,
    bpmChanges: [{ beat: 8, timeSec: timeForBeat(8), bpm: 180 }],
    stops: [],
    scrollChanges: [{ beat: 12, timeSec: timeForBeat(12), rate: 0.5 }],
    warnings: [],
  };
}
