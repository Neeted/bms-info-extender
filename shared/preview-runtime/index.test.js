import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VIEWER_MODE,
  DEFAULT_INVISIBLE_NOTE_VISIBILITY,
  INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY,
  VIEWER_MODE_STORAGE_KEY,
  getInitialViewerMode,
  getInitialInvisibleNoteVisibility,
} from "./index.js";

test("viewer mode defaults to time and keeps persisted game values", () => {
  assert.equal(DEFAULT_VIEWER_MODE, "time");
  assert.equal(VIEWER_MODE_STORAGE_KEY, "bms-info-extender.viewerMode");
  assert.equal(getInitialViewerMode(() => null), "time");
  assert.equal(getInitialViewerMode(() => "game"), "game");
  assert.equal(getInitialViewerMode(() => "invalid"), "time");
});

test("invisible note visibility defaults to hide and restores persisted show values", () => {
  assert.equal(DEFAULT_INVISIBLE_NOTE_VISIBILITY, "hide");
  assert.equal(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, "bms-info-extender.invisibleNoteVisibility");
  assert.equal(getInitialInvisibleNoteVisibility(() => null), "hide");
  assert.equal(getInitialInvisibleNoteVisibility(() => "show"), "show");
  assert.equal(getInitialInvisibleNoteVisibility(() => "invalid"), "hide");
});
