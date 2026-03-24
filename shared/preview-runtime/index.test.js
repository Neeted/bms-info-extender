import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_RENDER_DIRTY,
  createPreviewPreferenceStorage,
  DEFAULT_VIEWER_MODE,
  DEFAULT_INVISIBLE_NOTE_VISIBILITY,
  INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY,
  VIEWER_MODE_STORAGE_KEY,
  expandPreviewRenderMask,
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

test("preview preference storage shares persistence wiring for both viewer mode and invisible note visibility", () => {
  const store = new Map();
  const preferences = createPreviewPreferenceStorage({
    read: (key, fallbackValue) => store.has(key) ? store.get(key) : fallbackValue,
    write: (key, value) => store.set(key, value),
  });

  assert.equal(preferences.getPersistedViewerMode(), "time");
  assert.equal(preferences.getPersistedInvisibleNoteVisibility(), "hide");

  preferences.setPersistedViewerMode("game");
  preferences.setPersistedInvisibleNoteVisibility("show");

  assert.equal(store.get(VIEWER_MODE_STORAGE_KEY), "game");
  assert.equal(store.get(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY), "show");
  assert.equal(preferences.getPersistedViewerMode(), "game");
  assert.equal(preferences.getPersistedInvisibleNoteVisibility(), "show");
});

test("viewer model dirty render also reapplies persisted viewer chrome", () => {
  const expandedMask = expandPreviewRenderMask(PREVIEW_RENDER_DIRTY.viewerModel);

  assert.notEqual(expandedMask & PREVIEW_RENDER_DIRTY.viewerMode, 0);
  assert.notEqual(expandedMask & PREVIEW_RENDER_DIRTY.invisible, 0);
  assert.equal(
    expandPreviewRenderMask(PREVIEW_RENDER_DIRTY.selection),
    PREVIEW_RENDER_DIRTY.selection,
  );
});
