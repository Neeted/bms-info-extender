import assert from "node:assert/strict";
import test from "node:test";

import { collectVisibleEditorGridLines } from "./score-viewer-renderer.js";

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
