import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_INVISIBLE_NOTE_VISIBILITY,
  INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY,
  getInitialInvisibleNoteVisibility,
} from "./index.js";

test("invisible note visibility defaults to hide and restores persisted show values", () => {
  assert.equal(DEFAULT_INVISIBLE_NOTE_VISIBILITY, "hide");
  assert.equal(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, "bms-info-extender.invisibleNoteVisibility");
  assert.equal(getInitialInvisibleNoteVisibility(() => null), "hide");
  assert.equal(getInitialInvisibleNoteVisibility(() => "show"), "show");
  assert.equal(getInitialInvisibleNoteVisibility(() => "invalid"), "hide");
});

