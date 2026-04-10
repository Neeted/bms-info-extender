import assert from "node:assert/strict";
import test from "node:test";

import { createScoreViewerModel } from "./score-viewer-model.js";
import {
  collectGameProjection,
  collectVisibleEditorGridLines,
  createScoreViewerRenderer,
  estimateViewerWidth,
} from "./score-viewer-renderer.js";

test("collectVisibleEditorGridLines emits quarter and sixteenth lines without duplicating bar lines", () => {
  const gridLines = collectVisibleEditorGridLines(
    [
      { startBeat: 0, endBeat: 4 },
      { startBeat: 4, endBeat: 7.5 },
    ],
    0,
    8,
  );

  assert.deepEqual(gridLines.beatBeats, [1, 2, 3, 5, 6, 7]);
  assert.deepEqual(
    gridLines.sixteenthBeats,
    [
      0.25, 0.5, 0.75,
      1.25, 1.5, 1.75,
      2.25, 2.5, 2.75,
      3.25, 3.5, 3.75,
      4.25, 4.5, 4.75,
      5.25, 5.5, 5.75,
      6.25, 6.5, 6.75,
      7.25,
    ],
  );
});

test("renderer hides invisible notes by default in time mode and draws yellow outlines when enabled", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time" });
  assert.equal(context.strokeRectCalls.length, 0);

  context.reset();
  renderer.render(model, 1, { viewerMode: "time", showInvisibleNotes: true });
  assert.equal(context.strokeRectCalls.length, 1);
  assert.deepEqual(
    context.strokeRectCalls.map((call) => ({ strokeStyle: call.strokeStyle, lineWidth: call.lineWidth })),
    [{ strokeStyle: "#FFFF00", lineWidth: 1 }],
  );
});

test("renderer draws invisible notes in editor mode only when enabled", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "editor" });
  assert.equal(context.strokeRectCalls.length, 0);

  context.reset();
  renderer.render(model, 1, { viewerMode: "editor", showInvisibleNotes: true });
  assert.equal(context.strokeRectCalls.length, 1);
  assert.deepEqual(
    context.strokeRectCalls.map((call) => ({ strokeStyle: call.strokeStyle, lineWidth: call.lineWidth })),
    [{ strokeStyle: "#FFFF00", lineWidth: 1 }],
  );
});

test("renderer draws invisible note outlines inset within lane separators", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 2, { viewerMode: "time", showInvisibleNotes: true });

  assert.deepEqual(
    context.strokeRectCalls.map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 96.5, y: 156.5, width: 14, height: 3 }],
  );
});

test("renderer keeps existing default geometry when rendererConfig is omitted", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time" });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#bebebe")
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 80, y: 156, width: 15, height: 4 }],
  );
  assert.equal(estimateViewerWidth("7k", 8), 240);
  assert.equal(estimateViewerWidth("7k", 8), estimateViewerWidth("7k", 8, {}));
});

test("estimateViewerWidth scales by column count while keeping single-column calls unchanged", () => {
  assert.equal(estimateViewerWidth("7k", 8), 240);
  assert.equal(estimateViewerWidth("7k", 8, undefined, 2), 480);
  assert.equal(estimateViewerWidth("7k", 8, { noteWidth: 20, separatorWidth: 2 }, 2), 568);
});

test("renderer wraps time-mode notes into the next column from the bottom", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createWrappedColumnScore());

  renderer.resize(480, 320);
  renderer.render(model, 1, { viewerMode: "time", columnCount: 2 });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#bebebe" && call.x === 80 && call.y === 156 && call.width === 15 && call.height === 4),
    false,
  );
  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#bebebe" && call.x === 320 && call.y === 156 && call.width === 15 && call.height === 4),
    true,
  );
});

test("renderer wraps editor-mode notes into the next column from the bottom", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createWrappedColumnScore());

  renderer.resize(480, 320);
  renderer.render(model, 1, { viewerMode: "editor", columnCount: 2 });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#bebebe" && call.x === 320 && call.y === 220 && call.width === 15 && call.height === 4),
    true,
  );
});

test("renderer draws the time-mode judge line only in the first column", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(480, 320);
  renderer.render(model, 1, { viewerMode: "time", columnCount: 2 });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#ff0000")
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 48, y: 158, width: 144, height: 2 }],
  );
});

test("rendererConfig reflects custom note, separator, note head, bar line, and marker sizes", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createTempoMarkerAlignmentScore());
  const rendererConfig = {
    noteWidth: 20,
    separatorWidth: 2,
    noteHeight: 6,
    barLineHeight: 3,
    markerHeight: 2,
    judgeLineHeight: 5,
  };

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time", rendererConfig });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#bebebe")
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 60, y: 154, width: 20, height: 6 }],
  );
  assert.equal(
    context.strokeCalls.some((call) => call.strokeStyle === "#ffffff" && call.lineWidth === 3),
    true,
  );
  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#00ff00" && call.width === 8 && call.height === 2),
    true,
  );
  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#ff0000" && call.height === 5),
    true,
  );
  assert.equal(estimateViewerWidth("7k", 8, rendererConfig), 284);
});

test("rendererConfig normalizes zero values safely", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createTempoMarkerAlignmentScore());
  const rendererConfig = {
    noteWidth: 0,
    separatorWidth: 0,
    noteHeight: 0,
    barLineHeight: 0,
    markerHeight: 0,
    judgeLineHeight: 0,
  };

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time", rendererConfig });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle !== "#000000" && call.width > 0 && call.height > 0),
    false,
  );
  assert.equal(
    context.strokeRectCalls.length,
    0,
  );
  assert.equal(
    estimateViewerWidth("7k", 8, rendererConfig),
    126,
  );
});

test("renderer uses scratchWidth for scratch lanes independently from normal noteWidth", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createScratchLaneScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, {
    viewerMode: "time",
    rendererConfig: {
      noteWidth: 12,
      scratchWidth: 34,
    },
  });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#e04a4a")
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 57, y: 156, width: 34, height: 4 }],
  );
});

test("renderer draws the judge line on an integer bottom edge", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 321);
  renderer.render(model, 1, {
    viewerMode: "time",
    judgeLineY: 160.5,
    rendererConfig: { judgeLineHeight: 3 },
  });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#ff0000")
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 48, y: 158, width: 144, height: 3 }],
  );
});

test("renderer skips judge line drawing when the configured height is zero", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, {
    viewerMode: "time",
    rendererConfig: { judgeLineHeight: 0 },
  });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#ff0000"),
    false,
  );
});

test("renderer draws the judge line after markers and before notes", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createTempoMarkerAlignmentScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, {
    viewerMode: "time",
    rendererConfig: { judgeLineHeight: 2 },
  });

  const orderedFillStyles = context.operations
    .filter((operation) => operation.type === "fillRect")
    .map((operation) => operation.fillStyle);
  const markerIndex = orderedFillStyles.indexOf("#00ff00");
  const judgeLineIndex = orderedFillStyles.indexOf("#ff0000");
  const noteIndex = orderedFillStyles.indexOf("#bebebe");

  assert.ok(markerIndex >= 0);
  assert.ok(judgeLineIndex > markerIndex);
  assert.ok(noteIndex > judgeLineIndex);
});

test("renderer draws the game judge line only across the active lane area", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameZeroScrollFreezeScore());

  renderer.resize(240, 320);
  renderer.render(model, 2.25, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: false,
      hsFixMode: "main",
    },
    rendererConfig: { judgeLineHeight: 3 },
  });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#ff0000")
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 48, y: 237, width: 144, height: 3 }],
  );
});

test("renderer treats configured scratch lanes as wide lanes across beat modes", () => {
  for (const { mode, laneCount, lane } of [
    { mode: "5k", laneCount: 6, lane: 0 },
    { mode: "7k", laneCount: 8, lane: 0 },
    { mode: "10k", laneCount: 12, lane: 6 },
    { mode: "14k", laneCount: 16, lane: 8 },
  ]) {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createSingleLaneScore(mode, laneCount, lane));

    renderer.resize(320, 320);
    renderer.render(model, 1, { viewerMode: "time" });

    assert.equal(
      context.fillRectCalls.some((call) => call.fillStyle === "#e04a4a" && call.width === 30 && call.height === 4),
      true,
      `${mode} scratch lane should use scratchWidth`,
    );
  }
});

test("renderer applies scratchWidth to invisible scratch notes and scratch long bodies", () => {
  {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createScratchInvisibleNoteScore());

    renderer.resize(240, 320);
    renderer.render(model, 2, { viewerMode: "time", showInvisibleNotes: true });

    assert.deepEqual(
      context.strokeRectCalls.map(({ x, y, width, height }) => ({ x, y, width, height })),
      [{ x: 49.5, y: 156.5, width: 29, height: 3 }],
    );
  }

  {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createScratchLongNoteScore());

    renderer.resize(240, 320);
    renderer.render(model, 1, { viewerMode: "time" });

    assert.equal(
      context.fillRectCalls.some((call) => String(call.fillStyle).startsWith("rgb(") && call.width === 30 && call.height > 4),
      true,
    );
    assert.equal(
      context.fillRectCalls.filter((call) => call.fillStyle === "#e04a4a" && call.width === 30 && call.height === 4).length,
      2,
    );
  }
});

test("renderer adapts note and invisible note geometry when separator width changes", () => {
  const renderWithSeparatorWidth = (separatorWidth) => {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createInvisibleNoteScore());

    renderer.resize(240, 320);
    renderer.render(model, 1, { viewerMode: "time", rendererConfig: { separatorWidth } });

    return { renderer, context, model };
  };

  const zeroSeparator = renderWithSeparatorWidth(0);
  assert.deepEqual(
    zeroSeparator.context.fillRectCalls
      .filter((call) => call.width === 15 && call.height === 4 && call.fillStyle !== "#000000")
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 82, y: 156, width: 15, height: 4 }],
  );

  zeroSeparator.context.reset();
  zeroSeparator.renderer.render(zeroSeparator.model, 2, { viewerMode: "time", showInvisibleNotes: true, rendererConfig: { separatorWidth: 0 } });
  assert.deepEqual(
    zeroSeparator.context.strokeRectCalls.map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 97.5, y: 156.5, width: 14, height: 3 }],
  );

  const widerSeparator = renderWithSeparatorWidth(2);
  assert.deepEqual(
    widerSeparator.context.fillRectCalls
      .filter((call) => call.width === 15 && call.height === 4 && call.fillStyle !== "#000000")
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 77, y: 156, width: 15, height: 4 }],
  );

  widerSeparator.context.reset();
  widerSeparator.renderer.render(widerSeparator.model, 2, { viewerMode: "time", showInvisibleNotes: true, rendererConfig: { separatorWidth: 2 } });
  assert.deepEqual(
    widerSeparator.context.strokeRectCalls.map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 94.5, y: 156.5, width: 14, height: 3 }],
  );
});

test("renderer moves the time-mode note head with a custom judge line Y", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time", judgeLineY: 96 });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.width === 15 && call.height === 4 && call.fillStyle !== "#000000")
      .map(({ x, y, fillStyle }) => ({ x, y, fillStyle })),
    [
      { x: 80, y: 92, fillStyle: "#bebebe" },
    ],
  );
});

test("renderer moves editor-mode note heads and bar lines with a custom judge line Y", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "editor", judgeLineY: 96 });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.width === 15 && call.height === 4 && call.fillStyle !== "#000000")
      .map(({ x, y, fillStyle }) => ({ x, y, fillStyle })),
    [
      { x: 80, y: 92, fillStyle: "#bebebe" },
    ],
  );
  assert.equal(
    context.lineToCalls.some((call) => call.y === 223.5),
    true,
  );
});

test("renderer extends time-mode future culling when the judge line is lowered", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createFutureVisibilityScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time", judgeLineY: 96 });
  assert.equal(
    context.fillRectCalls.some((call) => call.width === 15 && call.height === 4 && call.fillStyle === "#bebebe"),
    false,
  );

  context.reset();
  renderer.render(model, 1, { viewerMode: "time", judgeLineY: 224 });
  assert.equal(
    context.fillRectCalls.some((call) => call.width === 15 && call.height === 4 && call.fillStyle === "#bebebe"),
    true,
  );
});

test("renderer extends editor-mode future culling when the judge line is lowered", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createFutureVisibilityScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "editor", judgeLineY: 96 });
  assert.equal(
    context.fillRectCalls.some((call) => call.width === 15 && call.height === 4 && call.fillStyle === "#bebebe"),
    false,
  );

  context.reset();
  renderer.render(model, 1, { viewerMode: "editor", judgeLineY: 224 });
  assert.equal(
    context.fillRectCalls.some((call) => call.width === 15 && call.height === 4 && call.fillStyle === "#bebebe"),
    true,
  );
});

test("renderer fills the center gutter in 10k and 14k layouts", () => {
  for (const mode of ["10k", "14k"]) {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createDpGutterScore(mode));

    renderer.resize(320, 320);
    renderer.render(model, 1, { viewerMode: "time" });

    assert.equal(
      context.fillRectCalls.some((call) => call.fillStyle === "#808080" && call.y === 0 && call.height === 320 && call.width === 18),
      true,
      `${mode} should draw a gutter fill`,
    );
  }
});

test("renderer does not draw a center gutter fill for single-play layouts", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(320, 320);
  renderer.render(model, 1, { viewerMode: "time" });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#808080"),
    false,
  );
});

test("renderer draws time-mode measure labels as zero-padded white labels with marker font", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time" });

  assert.deepEqual(
    context.fillTextCalls.map((call) => ({
      text: call.text,
      fillStyle: call.fillStyle,
      font: call.font,
    })),
    [
      { text: "#001", fillStyle: "#FFFFFF", font: '12px "Inconsolata", "Noto Sans JP"' },
      { text: "#000", fillStyle: "#FFFFFF", font: '12px "Inconsolata", "Noto Sans JP"' },
    ],
  );
});

test("renderer aligns editor-mode measure labels to the bar line with a bottom baseline", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createInvisibleNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "editor" });

  assert.deepEqual(
    context.fillTextCalls.map((call) => ({
      text: call.text,
      y: call.y,
      textBaseline: call.textBaseline,
      textAlign: call.textAlign,
    })),
    [
      { text: "#001", y: 32, textBaseline: "bottom", textAlign: "right" },
      { text: "#000", y: 288, textBaseline: "bottom", textAlign: "right" },
    ],
  );
});

test("renderer adapts editor horizontal line extents when separator width changes", () => {
  {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createInvisibleNoteScore());

    renderer.resize(240, 320);
    renderer.render(model, 1, { viewerMode: "editor", rendererConfig: { separatorWidth: 0 } });

    assert.equal(
      Math.max(...context.lineToCalls.map((call) => call.x)),
      187,
    );
  }

  {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createInvisibleNoteScore());

    renderer.resize(240, 320);
    renderer.render(model, 1, { viewerMode: "editor", rendererConfig: { separatorWidth: 2 } });

    assert.equal(
      Math.max(...context.lineToCalls.map((call) => call.x)),
      196,
    );
  }
});

test("renderer draws game-mode measure labels for visible bar lines", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameZeroScrollFreezeScore());

  renderer.resize(240, 320);
  renderer.render(model, 2.25, { viewerMode: "game", pixelsPerBeat: 64 });

  assert.deepEqual(
    context.fillTextCalls.filter((call) => call.fillStyle === "#FFFFFF").map((call) => call.text),
    ["#002"],
  );
});

test("renderer skips densely packed measure labels using the same spacing threshold as marker labels", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createDenseBarLineScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time" });

  assert.deepEqual(
    context.fillTextCalls.map((call) => call.text),
    ["#002", "#000"],
  );
});

test("renderer draws left-side tempo marker labels after measure labels so markers stay in front", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createLeftMarkerMeasureOverlapScore());

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time" });

  assert.deepEqual(
    context.fillTextCalls.map((call) => ({
      text: call.text,
      fillStyle: call.fillStyle,
    })),
    [
      { text: "#001", fillStyle: "#FFFFFF" },
      { text: "#000", fillStyle: "#FFFFFF" },
      { text: "1s", fillStyle: "#ff00ff" },
      { text: "2", fillStyle: "#ff0" },
    ],
  );
});

test("renderer adapts tempo marker positions when separator width changes", () => {
  {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createTempoMarkerAlignmentScore());

    renderer.resize(240, 320);
    renderer.render(model, 2, { viewerMode: "time", rendererConfig: { separatorWidth: 0 } });

    const markerRects = context.fillRectCalls.filter((call) => call.height === 1 && call.width === 8);
    assert.equal(markerRects.some((call) => call.fillStyle === "#00ff00" && call.x === 187), true);
    assert.equal(markerRects.some((call) => call.fillStyle === "#ff00ff" && call.x === 44), true);
    assert.equal(markerRects.some((call) => call.fillStyle === "#ff0" && call.x === 44), true);
  }

  {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createTempoMarkerAlignmentScore());

    renderer.resize(240, 320);
    renderer.render(model, 2, { viewerMode: "time", rendererConfig: { separatorWidth: 2 } });

    const markerRects = context.fillRectCalls.filter((call) => call.height === 1 && call.width === 8);
    assert.equal(markerRects.some((call) => call.fillStyle === "#00ff00" && call.x === 194), true);
    assert.equal(markerRects.some((call) => call.fillStyle === "#ff00ff" && call.x === 37), true);
    assert.equal(markerRects.some((call) => call.fillStyle === "#ff0" && call.x === 37), true);
  }
});

test("renderer draws Lunatic warp markers with a WARP label in time mode", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createLunaticWarpProjectionScore(), { gameProfile: "lunatic" });

  renderer.resize(240, 320);
  renderer.render(model, 1, { viewerMode: "time" });

  assert.equal(
    context.fillTextCalls.some((call) => call.text === "WARP" && call.fillStyle === "#ff00ff"),
    true,
  );
});

test("renderer draws Lunatic warp markers with a WARP label in game mode", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createLunaticWarpProjectionScore(), { gameProfile: "lunatic" });

  renderer.resize(240, 320);
  renderer.render(model, 2, { viewerMode: "lunatic" });

  assert.equal(
    context.fillTextCalls.some((call) => call.text === "WARP" && call.fillStyle === "#ff00ff"),
    true,
  );
});

test("renderer draws later game timeline mine notes over earlier invisible notes when SCROLL overlaps their Y", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameSweepOverlapScore());

  const projection = collectGameProjection(model, 2, 320, {
    gameTimingConfig: {
      durationMs: 2000,
      laneHeightPx: 160,
      laneCoverPermille: 0,
      laneCoverVisible: false,
      hsFixMode: "main",
    },
    judgeLineY: 240,
  });
  const invisiblePoint = projection.points.find((projected) => projected.point.notes.some((note) => note.kind === "invisible"));
  const minePoint = projection.points.find((projected) => projected.point.notes.some((note) => note.kind === "mine"));
  assert.ok(invisiblePoint);
  assert.ok(minePoint);
  assert.equal(invisiblePoint.y, minePoint.y);

  renderer.resize(240, 320);
  renderer.render(model, 2, {
    viewerMode: "game",
    showInvisibleNotes: false,
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 2000,
      laneHeightPx: 160,
      laneCoverPermille: 0,
      laneCoverVisible: false,
      hsFixMode: "main",
    },
  });
  assert.equal(
    context.strokeRectCalls.some((call) => call.strokeStyle === "#FFFF00"),
    false,
  );

  context.reset();
  renderer.render(model, 2, {
    viewerMode: "game",
    showInvisibleNotes: true,
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 2000,
      laneHeightPx: 160,
      laneCoverPermille: 0,
      laneCoverVisible: false,
      hsFixMode: "main",
    },
  });

  assert.deepEqual(
    getMineAndInvisibleOperations(context).map((operation) => operation.type),
    ["fillRect", "strokeRect"],
  );
});

test("renderer draws invisible notes after visible or mine notes on the same game timeline point", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameSamePointMineAndInvisibleScore());

  renderer.resize(240, 320);
  renderer.render(model, 2, {
    viewerMode: "game",
    showInvisibleNotes: true,
  });

  assert.deepEqual(
    getMineAndInvisibleOperations(context).map((operation) => operation.type),
    ["fillRect", "strokeRect"],
  );
});

test("renderer uses the same invisible-after-visible sweep order in Lunatic mode", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameSamePointMineAndInvisibleScore(), { gameProfile: "lunatic" });

  renderer.resize(240, 320);
  renderer.render(model, 2, {
    viewerMode: "lunatic",
    showInvisibleNotes: true,
  });

  assert.deepEqual(
    getMineAndInvisibleOperations(context).map((operation) => operation.type),
    ["fillRect", "strokeRect"],
  );
});

test("renderer keeps near-simultaneous scroll spikes and nearby section lines visible in game mode", () => {
  const model = createScoreViewerModel(createGameProjectionSpikeScore());
  const projection = collectGameProjection(model, 1.9, 320, 64);

  assert.deepEqual(
    projection.points
      .filter((projected) => projected.point.barLines.length > 0 || projected.point.notes.length > 0)
      .map((projected) => ({
        beat: projected.point.beat,
        hasNote: projected.point.notes.length > 0,
        hasBarLine: projected.point.barLines.length > 0,
      })),
    [
      { beat: 4.003, hasNote: true, hasBarLine: true },
      { beat: 4.253, hasNote: false, hasBarLine: true },
    ],
  );
});

test("renderer game projection stops before drawing reentry notes that come back after leaving the top of the viewport", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameProjectionReentryScore());

  const projection = collectGameProjection(model, 2, 320, 64);
  assert.equal(projection.exitPoint?.point.beat, 4.5);
  assert.deepEqual(
    projection.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [4.25],
  );

  renderer.resize(240, 320);
  renderer.render(model, 2, { viewerMode: "game", pixelsPerBeat: 64, showInvisibleNotes: true });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.width === 15 && call.height === 4 && call.fillStyle !== "#000000")
      .map(({ x, y, fillStyle }) => ({ x, y, fillStyle })),
    [
      { x: 80, y: 156, fillStyle: "#bebebe" },
    ],
  );
});

test("renderer game projection keeps scanning after notes fall below the viewport and later reenter", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameProjectionBottomReentryScore());

  const projection = collectGameProjection(model, 2, 320, 64);
  assert.equal(projection.exitPoint, null);
  assert.deepEqual(
    projection.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [4.25, 4.75],
  );

  renderer.resize(240, 320);
  renderer.render(model, 2, { viewerMode: "game", pixelsPerBeat: 64 });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.width === 15 && call.height === 4 && call.fillStyle !== "#000000")
      .map(({ x, y, fillStyle }) => ({ x, y, fillStyle })),
    [
      { x: 80, y: 156, fillStyle: "#bebebe" },
      { x: 96, y: 156, fillStyle: "#5074fe" },
    ],
  );
});

test("renderer skips game-mode long bodies when scroll reversal makes net displacement negative", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createReverseLongNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 2, { viewerMode: "game", pixelsPerBeat: 64 });

  assert.equal(
    context.fillRectCalls.some((call) => call.width === 15 && call.height > 4 && String(call.fillStyle).startsWith("rgb(")),
    false,
  );
  assert.equal(
    context.fillRectCalls.filter((call) => call.width === 15 && call.height === 4 && call.fillStyle !== "#000000").length >= 1,
    true,
  );
});

test("renderer keeps game-mode projection frozen while playback remains inside a STOP", () => {
  const model = createScoreViewerModel(createGameStopProjectionScore());

  const projectionOptions = {
    gameTimingConfig: { durationMs: 2000 },
  };
  const left = collectGameProjection(model, 2.25, 320, projectionOptions);
  const right = collectGameProjection(model, 2.75, 320, projectionOptions);
  const leftNote = left.points.find((projected) => projected.point.notes.some((note) => note.beat === 6));
  const rightNote = right.points.find((projected) => projected.point.notes.some((note) => note.beat === 6));

  assert.ok(leftNote);
  assert.ok(rightNote);
  assert.equal(leftNote.y, rightNote.y);
  assert.equal(left.selectedTrackPosition, right.selectedTrackPosition);
});

test("renderer keeps game-mode projection frozen while playback remains inside a STOP that starts on an otherwise empty point", () => {
  const model = createScoreViewerModel(createGameDetachedStopProjectionScore());

  const projectionOptions = {
    gameTimingConfig: { durationMs: 2000 },
  };
  const left = collectGameProjection(model, 2.25, 320, projectionOptions);
  const right = collectGameProjection(model, 2.75, 320, projectionOptions);
  const leftNote = left.points.find((projected) => projected.point.notes.some((note) => note.beat === 6));
  const rightNote = right.points.find((projected) => projected.point.notes.some((note) => note.beat === 6));

  assert.ok(leftNote);
  assert.ok(rightNote);
  assert.equal(leftNote.y, rightNote.y);
});

test("renderer offsets game-mode projection from a custom judge line Y", () => {
  const model = createScoreViewerModel(createGameZeroScrollFreezeScore());

  const centered = collectGameProjection(model, 2.25, 320);
  const lowered = collectGameProjection(model, 2.25, 320, 64, 96);
  const centeredBarLine = centered.points.find((projected) => projected.point.beat === 8);
  const loweredBarLine = lowered.points.find((projected) => projected.point.beat === 8);

  assert.ok(centeredBarLine);
  assert.ok(loweredBarLine);
  assert.equal(loweredBarLine.y - centeredBarLine.y, -64);
});

test("renderer keeps game-mode projection frozen while playback remains inside a SCROLL 0 segment", () => {
  const model = createScoreViewerModel(createGameZeroScrollFreezeScore());

  const projectionOptions = {
    gameTimingConfig: { durationMs: 2000 },
  };
  const left = collectGameProjection(model, 2.25, 320, projectionOptions);
  const right = collectGameProjection(model, 3.75, 320, projectionOptions);
  const leftBarLine = left.points.find((projected) => projected.point.beat === 8);
  const rightBarLine = right.points.find((projected) => projected.point.beat === 8);
  const leftNote = left.points.find((projected) => projected.point.notes.some((note) => note.beat === 10));
  const rightNote = right.points.find((projected) => projected.point.notes.some((note) => note.beat === 10));

  assert.ok(leftBarLine);
  assert.ok(rightBarLine);
  assert.ok(leftNote);
  assert.ok(rightNote);
  assert.equal(leftBarLine.y, rightBarLine.y);
  assert.equal(leftNote.y, rightNote.y);
});

test("renderer clips game-mode lanes by lane height and draws lane cover labels", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameZeroScrollFreezeScore(), {
    bpmSummary: {
      mainBpm: 150,
      minBpm: 120,
      maxBpm: 180,
    },
  });

  renderer.resize(240, 320);
  renderer.render(model, 2.25, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 500,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#2A2A2A"),
    true,
  );
  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#2A2A2A" && call.width === 144),
    true,
  );
  assert.equal(
    context.moveToCalls.some((call) => call.y === 160),
    true,
  );
  assert.equal(
    context.fillTextCalls.some((call) => call.fillStyle === "#00FF00"),
    true,
  );
  assert.equal(
    context.fillTextCalls.some((call) => call.fillStyle === "#FFFFFF" && String(call.text).includes("～")),
    true,
  );
  assert.deepEqual(context.clipCalls, [
    { x: 0, y: 160, width: 240, height: 160 },
  ]);
});

test("renderer snaps game lane cover bounds to integer pixels before drawing", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameZeroScrollFreezeScore(), {
    bpmSummary: {
      mainBpm: 150,
      minBpm: 120,
      maxBpm: 180,
    },
  });

  renderer.resize(241, 321);
  renderer.render(model, 2.25, {
    viewerMode: "game",
    judgeLineY: 241,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 81,
      laneCoverPermille: 500,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#2A2A2A")
      .map(({ y, height }) => ({ y, height })),
    [
      { y: 160, height: 41 },
    ],
  );
});

test("renderer snaps the game lane cover top to the same integer lane top", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameZeroScrollFreezeScore(), {
    bpmSummary: {
      mainBpm: 150,
      minBpm: 120,
      maxBpm: 180,
    },
  });

  renderer.resize(241, 321);
  renderer.render(model, 2.25, {
    viewerMode: "game",
    judgeLineY: 160.5,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 50,
      laneCoverPermille: 500,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#2A2A2A")
      .map(({ y, height }) => ({ y, height })),
    [
      { y: 110, height: 25 },
    ],
  );
});

test("renderer adapts game lane cover width when separator width changes", () => {
  const renderCoverWidth = (separatorWidth) => {
    const { canvas, context } = createMockCanvas();
    const renderer = createScoreViewerRenderer(canvas);
    const model = createScoreViewerModel(createGameZeroScrollFreezeScore(), {
      bpmSummary: {
        mainBpm: 150,
        minBpm: 120,
        maxBpm: 180,
      },
    });

    renderer.resize(240, 320);
    renderer.render(model, 2.25, {
      viewerMode: "game",
      judgeLineY: 240,
      gameTimingConfig: {
        durationMs: 500,
        laneHeightPx: 80,
        laneCoverPermille: 500,
        laneCoverVisible: true,
        hsFixMode: "main",
      },
      rendererConfig: { separatorWidth },
    });

    return context.fillRectCalls.find((call) => call.fillStyle === "#2A2A2A")?.width ?? 0;
  };

  assert.equal(renderCoverWidth(0), 135);
  assert.equal(renderCoverWidth(2), 153);
});

test("renderer skips lane cover drawing and label calculations when cover is hidden", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameZeroScrollFreezeScore(), {
    bpmSummary: {
      mainBpm: 150,
      minBpm: 120,
      maxBpm: 180,
    },
  });
  const projection = collectGameProjection(model, 2.25, 320, {
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 500,
      laneCoverVisible: false,
      hsFixMode: "main",
    },
  });

  assert.equal(projection.currentGreenNumber, null);
  assert.equal(projection.greenNumberRange, null);

  renderer.resize(240, 320);
  renderer.render(model, 2.25, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 500,
      laneCoverVisible: false,
      hsFixMode: "main",
    },
  });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#2A2A2A"),
    false,
  );
  assert.equal(
    context.fillTextCalls.some((call) => call.fillStyle === "#00FF00"),
    false,
  );
  assert.equal(
    context.fillTextCalls.some((call) => String(call.text).includes("～")),
    false,
  );
});

test("renderer hides game-mode note heads once they are above the active lane top", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameTopClippedNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 2, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.width === 15 && call.height === 4 && call.fillStyle !== "#000000"),
    [],
  );
});

test("renderer clamps visible game-mode long bodies to the active lane top", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameTopClippedLongNoteScore());

  renderer.resize(240, 320);
  renderer.render(model, 2, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.width === 15 && call.height > 4 && String(call.fillStyle).startsWith("rgb("))
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [
      { x: 80, y: 160, width: 15, height: 40 },
    ],
  );
});

test("renderer keeps a game-mode long-note head at the judge line after the start passes", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameHeldLongHeadScore());

  renderer.resize(240, 320);
  renderer.render(model, 2.5, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#bebebe" && call.x === 80 && call.y === 236 && call.width === 15 && call.height === 4),
    true,
  );
});

test("renderer draws a held game-mode long-note head after the body and end cap", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameHeldLongHeadScore());

  renderer.resize(240, 320);
  renderer.render(model, 2.5, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.deepEqual(
    getNonBackgroundLaneFillOperations(context)
      .filter((operation) => operation.x === 80)
      .map((operation) => ({ y: operation.y, height: operation.height })),
    [
      { y: 200, height: 40 },
      { y: 196, height: 4 },
      { y: 236, height: 4 },
    ],
  );
});

test("renderer removes the held game-mode long-note head once the end is reached", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameHeldLongHeadScore());

  renderer.resize(240, 320);
  renderer.render(model, 2.76, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#bebebe" && call.x === 80 && call.y === 236 && call.width === 15 && call.height === 4),
    false,
  );
});

test("renderer does not double-draw a game-mode long-note head before the start passes", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameHeldLongHeadScore());

  renderer.resize(240, 320);
  renderer.render(model, 2.2, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.deepEqual(
    context.fillRectCalls
      .filter((call) => call.fillStyle === "#bebebe" && call.x === 80 && call.width === 15 && call.height === 4)
      .map(({ y }) => y),
    [228],
  );
});

test("renderer keeps a Lunatic long-note head at the judge line after the start passes", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameHeldLongHeadScore(), { gameProfile: "lunatic" });

  renderer.resize(240, 320);
  renderer.render(model, 2.5, {
    viewerMode: "lunatic",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#bebebe" && call.x === 80 && call.y === 236 && call.width === 15 && call.height === 4),
    true,
  );
});

test("renderer suppresses out-of-lane game-mode BPM markers and measure labels", () => {
  const { canvas, context } = createMockCanvas();
  const renderer = createScoreViewerRenderer(canvas);
  const model = createScoreViewerModel(createGameTopClippedMarkerScore());

  renderer.resize(240, 320);
  renderer.render(model, 2, {
    viewerMode: "game",
    judgeLineY: 240,
    gameTimingConfig: {
      durationMs: 500,
      laneHeightPx: 80,
      laneCoverPermille: 0,
      laneCoverVisible: true,
      hsFixMode: "main",
    },
  });

  assert.equal(
    context.fillRectCalls.some((call) => call.fillStyle === "#00ff00"),
    false,
  );
  assert.equal(
    context.fillTextCalls.some((call) => call.text === "#001"),
    false,
  );
  assert.equal(
    context.fillTextCalls.some((call) => call.text === "180"),
    false,
  );
});

test("renderer game projection stops drawing notes after they become past objects", () => {
  const model = createScoreViewerModel(createGameProjectionReentryScore());
  const before = collectGameProjection(model, 2, 320, 64);
  const after = collectGameProjection(model, 2.13, 320, 64);

  assert.deepEqual(
    before.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [4.25],
  );
  assert.deepEqual(
    after.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [],
  );
});

test("renderer Lunatic projection keeps skipped-region notes visible before warp and drops them after the instant jump", () => {
  const model = createScoreViewerModel(createLunaticWarpProjectionScore(), { gameProfile: "lunatic" });
  const beforeWarp = collectGameProjection(model, 1.999, 320, 64);
  const afterWarp = collectGameProjection(model, 2.001, 320, 64);

  assert.deepEqual(
    beforeWarp.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [4 + 1 / 96, 4.25],
  );
  assert.deepEqual(
    afterWarp.points.flatMap((projected) => projected.point.notes.map((note) => note.beat)),
    [4.25],
  );
});

function createInvisibleNoteScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 1, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 2, beat: 4, timeSec: 2, kind: "invisible" },
    ],
    comboEvents: [{ lane: 1, beat: 2, timeSec: 1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createWrappedColumnScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 6, timeSec: 3, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 6, timeSec: 3, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createSingleLaneScore(mode, laneCount, lane) {
  return {
    format: "bms",
    mode,
    laneCount,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane, beat: 2, timeSec: 1, kind: "normal" },
    ],
    comboEvents: [{ lane, beat: 2, timeSec: 1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createScratchLaneScore() {
  return createSingleLaneScore("7k", 8, 0);
}

function createScratchInvisibleNoteScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 1, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
      { lane: 0, beat: 4, timeSec: 2, kind: "invisible" },
    ],
    comboEvents: [{ lane: 1, beat: 2, timeSec: 1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createScratchLongNoteScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 0, long: 1, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 0, beat: 2, endBeat: 4, timeSec: 1, endTimeSec: 2, kind: "long" },
    ],
    comboEvents: [
      { lane: 0, beat: 2, timeSec: 1, kind: "long-start" },
      { lane: 0, beat: 4, timeSec: 2, kind: "long-end" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createLunaticWarpProjectionScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 3,
    lastPlayableTimeSec: 3,
    lastTimelineTimeSec: 3,
    noteCounts: { visible: 2, normal: 2, long: 0, invisible: 0, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 4 + 1 / 96, timeSec: 2 + (0.5 / 96), kind: "normal" },
      { lane: 1, beat: 4.25, timeSec: 2.125, kind: "normal" },
    ],
    comboEvents: [
      { lane: 1, beat: 4 + 1 / 96, timeSec: 2 + (0.5 / 96), kind: "normal" },
      { lane: 1, beat: 4.25, timeSec: 2.125, kind: "normal" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    timingActions: [{
      type: "stop",
      beat: 4,
      timeSec: 2,
      stopBeats: 1,
      durationSec: 0.5,
      stopResolution: "resolved",
      stopLunaticBehavior: "warp",
    }],
    warnings: [],
  };
}

function createFutureVisibilityScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 5.6, timeSec: 2.8, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 5.6, timeSec: 2.8, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createDpGutterScore(mode) {
  const laneCount = mode === "10k" ? 12 : 16;
  return {
    format: "bms",
    mode,
    laneCount,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 2, timeSec: 1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createDenseBarLineScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 2, timeSec: 1, kind: "normal" }],
    barLines: [
      { beat: 0, timeSec: 0 },
      { beat: 3.98, timeSec: 1.99 },
      { beat: 4, timeSec: 2 },
    ],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createLeftMarkerMeasureOverlapScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 2, timeSec: 1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }],
    bpmChanges: [],
    stops: [{ beat: 4, timeSec: 2, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [{ beat: 4, timeSec: 2, rate: 2 }],
    warnings: [],
  };
}

function createTempoMarkerAlignmentScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 2, timeSec: 1, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 2, timeSec: 1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [{ beat: 4, timeSec: 2, bpm: 180 }],
    stops: [{ beat: 4, timeSec: 2, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [{ beat: 4, timeSec: 2, rate: 2 }],
    warnings: [],
  };
}

function createGameProjectionReentryScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 2, normal: 2, long: 0, invisible: 0, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 4.25, timeSec: 2.125, kind: "normal" },
      { lane: 2, beat: 4.75, timeSec: 2.375, kind: "normal" },
    ],
    comboEvents: [
      { lane: 1, beat: 4.25, timeSec: 2.125, kind: "normal" },
      { lane: 2, beat: 4.75, timeSec: 2.375, kind: "normal" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 0 },
      { beat: 4.25, timeSec: 2.125, rate: 20 },
      { beat: 4.5, timeSec: 2.25, rate: -20 },
      { beat: 4.75, timeSec: 2.375, rate: 0 },
    ],
    warnings: [],
  };
}

function createGameProjectionSpikeScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 3,
    lastPlayableTimeSec: 3,
    lastTimelineTimeSec: 3,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 4.003, timeSec: 2.0015, kind: "normal" },
    ],
    comboEvents: [
      { lane: 1, beat: 4.003, timeSec: 2.0015, kind: "normal" },
    ],
    barLines: [
      { beat: 0, timeSec: 0 },
      { beat: 4.003, timeSec: 2.0015 },
      { beat: 4.253, timeSec: 2.1265 },
    ],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4.001, timeSec: 2.0005, rate: 721 },
      { beat: 4.002, timeSec: 2.001, rate: -481 },
      { beat: 4.003, timeSec: 2.0015, rate: -240 },
      { beat: 4.004, timeSec: 2.002, rate: 0 },
      { beat: 4.251, timeSec: 2.1255, rate: 721 },
      { beat: 4.252, timeSec: 2.126, rate: -401 },
      { beat: 4.253, timeSec: 2.1265, rate: -320 },
      { beat: 4.254, timeSec: 2.127, rate: 0 },
    ],
    warnings: [],
  };
}

function createGameSweepOverlapScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 3,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 1, mine: 1, all: 2 },
    notes: [
      { lane: 1, beat: 4, timeSec: 2, kind: "invisible" },
      { lane: 1, beat: 6, timeSec: 3, kind: "mine" },
    ],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 1 },
      { beat: 5, timeSec: 2.5, rate: -1 },
      { beat: 6, timeSec: 3, rate: 1 },
    ],
    warnings: [],
  };
}

function createGameSamePointMineAndInvisibleScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 2,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 0, normal: 0, long: 0, invisible: 1, mine: 1, all: 2 },
    notes: [
      { lane: 1, beat: 4, timeSec: 2, kind: "mine" },
      { lane: 1, beat: 4, timeSec: 2, kind: "invisible" },
    ],
    comboEvents: [],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createReverseLongNoteScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 8,
    lastPlayableTimeSec: 8,
    lastTimelineTimeSec: 8,
    noteCounts: { visible: 1, normal: 0, long: 1, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 4, endBeat: 6, timeSec: 2, endTimeSec: 3, kind: "long" },
    ],
    comboEvents: [
      { lane: 1, beat: 4, timeSec: 2, kind: "long-start" },
      { lane: 1, beat: 6, timeSec: 3, kind: "long-end" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: -1 },
    ],
    warnings: [],
  };
}

function createGameProjectionBottomReentryScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 2, normal: 2, long: 0, invisible: 0, mine: 0, all: 2 },
    notes: [
      { lane: 1, beat: 4.25, timeSec: 2.125, kind: "normal" },
      { lane: 2, beat: 4.75, timeSec: 2.375, kind: "normal" },
    ],
    comboEvents: [
      { lane: 1, beat: 4.25, timeSec: 2.125, kind: "normal" },
      { lane: 2, beat: 4.75, timeSec: 2.375, kind: "normal" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 0 },
      { beat: 4.25, timeSec: 2.125, rate: -20 },
      { beat: 4.5, timeSec: 2.25, rate: 20 },
      { beat: 4.75, timeSec: 2.375, rate: 0 },
    ],
    warnings: [],
  };
}

function createGameStopProjectionScore() {
  return {
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
    comboEvents: [{ lane: 1, beat: 6, timeSec: 4, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 5 }],
    bpmChanges: [],
    stops: [{ beat: 4, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [],
    warnings: [],
  };
}

function createGameDetachedStopProjectionScore() {
  return {
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
    comboEvents: [{ lane: 1, beat: 6, timeSec: 4, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 8, timeSec: 5 }],
    bpmChanges: [],
    stops: [{ beat: 4, timeSec: 3, stopBeats: 4, durationSec: 1 }],
    scrollChanges: [],
    warnings: [],
  };
}

function createGameZeroScrollFreezeScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 6,
    lastPlayableTimeSec: 6,
    lastTimelineTimeSec: 6,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 10, timeSec: 5, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 10, timeSec: 5, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }, { beat: 12, timeSec: 6 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [
      { beat: 4, timeSec: 2, rate: 0 },
      { beat: 8, timeSec: 4, rate: 1 },
    ],
    warnings: [],
  };
}

function createGameTopClippedNoteScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 1, normal: 1, long: 0, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 5, timeSec: 2.5, kind: "normal" },
    ],
    comboEvents: [{ lane: 1, beat: 5, timeSec: 2.5, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createGameTopClippedLongNoteScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 1, normal: 0, long: 1, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 4.5, endBeat: 5.5, timeSec: 2.25, endTimeSec: 2.75, kind: "long" },
    ],
    comboEvents: [
      { lane: 1, beat: 4.5, timeSec: 2.25, kind: "long-start" },
      { lane: 1, beat: 5.5, timeSec: 2.75, kind: "long-end" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createGameHeldLongHeadScore() {
  return {
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    totalDurationSec: 4,
    lastPlayableTimeSec: 4,
    lastTimelineTimeSec: 4,
    noteCounts: { visible: 1, normal: 0, long: 1, invisible: 0, mine: 0, all: 1 },
    notes: [
      { lane: 1, beat: 4.5, endBeat: 5.5, timeSec: 2.25, endTimeSec: 2.75, kind: "long" },
    ],
    comboEvents: [
      { lane: 1, beat: 4.5, timeSec: 2.25, kind: "long-start" },
      { lane: 1, beat: 5.5, timeSec: 2.75, kind: "long-end" },
    ],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 2 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createGameTopClippedMarkerScore() {
  return {
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
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 5.25, timeSec: 2.625 }, { beat: 8, timeSec: 4 }],
    bpmChanges: [{ beat: 5.25, timeSec: 2.625, bpm: 180 }],
    stops: [],
    scrollChanges: [],
    warnings: [],
  };
}

function createMockCanvas() {
  const context = new MockRenderingContext2D();
  return {
    canvas: {
      width: 0,
      height: 0,
      style: {},
      getContext() {
        return context;
      },
    },
    context,
  };
}

class MockRenderingContext2D {
  constructor() {
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.lineWidth = 1;
    this.font = "";
    this.textBaseline = "alphabetic";
    this.textAlign = "start";
    this.operations = [];
    this.fillRectCalls = [];
    this.strokeRectCalls = [];
    this.strokeCalls = [];
    this.fillTextCalls = [];
    this.moveToCalls = [];
    this.lineToCalls = [];
    this.rectCalls = [];
    this.clipCalls = [];
    this._stateStack = [];
    this._currentPathRect = null;
    this._clipRect = null;
  }

  reset() {
    this.operations = [];
    this.fillRectCalls = [];
    this.strokeRectCalls = [];
    this.strokeCalls = [];
    this.fillTextCalls = [];
    this.moveToCalls = [];
    this.lineToCalls = [];
    this.rectCalls = [];
    this.clipCalls = [];
    this._stateStack = [];
    this._currentPathRect = null;
    this._clipRect = null;
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.lineWidth = 1;
    this.font = "";
    this.textBaseline = "alphabetic";
    this.textAlign = "start";
  }

  clearRect() {}

  fillRect(x, y, width, height) {
    const clippedRect = intersectRectWithClip({ x, y, width, height }, this._clipRect);
    if (!clippedRect) {
      return;
    }
    const operation = { ...clippedRect, fillStyle: this.fillStyle };
    this.fillRectCalls.push(operation);
    this.operations.push({ type: "fillRect", ...operation });
  }

  strokeRect(x, y, width, height) {
    const clippedRect = intersectRectWithClip({ x, y, width, height }, this._clipRect);
    if (!clippedRect) {
      return;
    }
    const operation = { ...clippedRect, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth };
    this.strokeRectCalls.push(operation);
    this.operations.push({ type: "strokeRect", ...operation });
  }

  fillText(text, x, y) {
    if (!isPointInsideClip(x, y, this._clipRect)) {
      return;
    }
    const operation = {
      text,
      x,
      y,
      fillStyle: this.fillStyle,
      font: this.font,
      textBaseline: this.textBaseline,
      textAlign: this.textAlign,
    };
    this.fillTextCalls.push(operation);
    this.operations.push({ type: "fillText", ...operation });
  }

  setTransform() {}

  beginPath() {
    this._currentPathRect = null;
  }

  moveTo(x, y) {
    this.moveToCalls.push({ x, y });
  }

  lineTo(x, y) {
    this.lineToCalls.push({ x, y });
  }

  stroke() {
    const operation = { strokeStyle: this.strokeStyle, lineWidth: this.lineWidth };
    this.strokeCalls.push(operation);
    this.operations.push({ type: "stroke", ...operation });
  }

  rect(x, y, width, height) {
    const rect = normalizeRect({ x, y, width, height });
    this._currentPathRect = rect;
    this.rectCalls.push(rect);
  }

  clip() {
    if (!this._currentPathRect) {
      return;
    }
    this._clipRect = intersectRectangles(this._clipRect, this._currentPathRect);
    this.clipCalls.push({ ...this._clipRect });
  }

  save() {
    this._stateStack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      font: this.font,
      textBaseline: this.textBaseline,
      textAlign: this.textAlign,
      currentPathRect: this._currentPathRect ? { ...this._currentPathRect } : null,
      clipRect: this._clipRect ? { ...this._clipRect } : null,
    });
  }

  restore() {
    const snapshot = this._stateStack.pop();
    if (!snapshot) {
      return;
    }
    this.fillStyle = snapshot.fillStyle;
    this.strokeStyle = snapshot.strokeStyle;
    this.lineWidth = snapshot.lineWidth;
    this.font = snapshot.font;
    this.textBaseline = snapshot.textBaseline;
    this.textAlign = snapshot.textAlign;
    this._currentPathRect = snapshot.currentPathRect;
    this._clipRect = snapshot.clipRect;
  }
}

function getMineAndInvisibleOperations(context) {
  return context.operations.filter((operation) => (
    (operation.type === "fillRect" && operation.fillStyle === "#880000")
    || (operation.type === "strokeRect" && operation.strokeStyle === "#FFFF00")
  ));
}

function getNonBackgroundLaneFillOperations(context) {
  return context.operations.filter((operation) => (
    operation.type === "fillRect"
    && operation.fillStyle !== "#000000"
    && operation.fillStyle !== "#808080"
    && operation.fillStyle !== "#ff0000"
    && operation.fillStyle !== "#2A2A2A"
  ));
}

function intersectRectWithClip(rect, clipRect) {
  const normalizedRect = normalizeRect(rect);
  if (!clipRect) {
    return normalizedRect.width > 0 && normalizedRect.height > 0 ? normalizedRect : null;
  }
  const intersection = intersectRectangles(normalizedRect, clipRect);
  if (!intersection || !(intersection.width > 0) || !(intersection.height > 0)) {
    return null;
  }
  return intersection;
}

function intersectRectangles(left, right) {
  if (!left) {
    return right ? { ...right } : null;
  }
  if (!right) {
    return { ...left };
  }
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    x,
    y,
    width: Math.max(rightEdge - x, 0),
    height: Math.max(bottomEdge - y, 0),
  };
}

function normalizeRect({ x, y, width, height }) {
  const normalizedX = width >= 0 ? x : x + width;
  const normalizedY = height >= 0 ? y : y + height;
  return {
    x: normalizedX,
    y: normalizedY,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function isPointInsideClip(x, y, clipRect) {
  if (!clipRect) {
    return true;
  }
  return x >= clipRect.x
    && x <= clipRect.x + clipRect.width
    && y >= clipRect.y
    && y <= clipRect.y + clipRect.height;
}
