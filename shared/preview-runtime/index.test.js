import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_RENDER_DIRTY,
  createBmsInfoPreview,
  createPreviewPreferenceStorage,
  DEFAULT_VIEWER_MODE,
  DEFAULT_INVISIBLE_NOTE_VISIBILITY,
  DEFAULT_GAME_DURATION_MS,
  DEFAULT_GAME_HS_FIX_MODE,
  DEFAULT_GAME_LANE_COVER_PERMILLE,
  DEFAULT_GAME_LANE_COVER_VISIBLE,
  DEFAULT_GAME_LANE_HEIGHT_PERCENT,
  DEFAULT_JUDGE_LINE_POSITION_RATIO,
  DEFAULT_SPACING_SCALE,
  DEFAULT_GRAPH_INTERACTION_MODE,
  PREVIEW_OVERLAY_HOST_ID,
  GAME_DURATION_MS_STORAGE_KEY,
  GAME_HS_FIX_MODE_STORAGE_KEY,
  GAME_LANE_COVER_PERMILLE_STORAGE_KEY,
  GAME_LANE_COVER_VISIBLE_STORAGE_KEY,
  GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY,
  GRAPH_INTERACTION_MODE_STORAGE_KEY,
  VIEWER_NOTE_WIDTH_STORAGE_KEY,
  VIEWER_SCRATCH_WIDTH_STORAGE_KEY,
  VIEWER_NOTE_HEIGHT_STORAGE_KEY,
  VIEWER_BAR_LINE_HEIGHT_STORAGE_KEY,
  VIEWER_MARKER_HEIGHT_STORAGE_KEY,
  VIEWER_SEPARATOR_WIDTH_STORAGE_KEY,
  INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY,
  JUDGE_LINE_POSITION_RATIO_STORAGE_KEY,
  SPACING_SCALE_STORAGE_KEYS,
  VIEWER_MODE_STORAGE_KEY,
  expandPreviewRenderMask,
  getInitialGraphInteractionMode,
  getInitialSpacingScale,
  getInitialSpacingScaleByMode,
  getInitialViewerMode,
  getInitialInvisibleNoteVisibility,
  getInitialJudgeLinePositionRatio,
  getInitialGameTimingConfig,
  getInitialRendererConfig,
} from "./index.js";

test("viewer mode defaults to time and keeps persisted game values", () => {
  assert.equal(DEFAULT_VIEWER_MODE, "time");
  assert.equal(VIEWER_MODE_STORAGE_KEY, "bms-info-extender.viewerMode");
  assert.equal(getInitialViewerMode(() => null), "time");
  assert.equal(getInitialViewerMode(() => "game"), "game");
  assert.equal(getInitialViewerMode(() => "lunatic"), "lunatic");
  assert.equal(getInitialViewerMode(() => "invalid"), "time");
});

test("invisible note visibility defaults to hide and restores persisted show values", () => {
  assert.equal(DEFAULT_INVISIBLE_NOTE_VISIBILITY, "hide");
  assert.equal(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, "bms-info-extender.invisibleNoteVisibility");
  assert.equal(getInitialInvisibleNoteVisibility(() => null), "hide");
  assert.equal(getInitialInvisibleNoteVisibility(() => "show"), "show");
  assert.equal(getInitialInvisibleNoteVisibility(() => "invalid"), "hide");
});

test("judge line position ratio defaults to center and restores valid persisted ratios", () => {
  assert.equal(DEFAULT_JUDGE_LINE_POSITION_RATIO, 0.5);
  assert.equal(JUDGE_LINE_POSITION_RATIO_STORAGE_KEY, "bms-info-extender.judgeLinePositionRatio");
  assert.equal(getInitialJudgeLinePositionRatio(() => null), 0.5);
  assert.equal(getInitialJudgeLinePositionRatio(() => 0.2), 0.2);
  assert.equal(getInitialJudgeLinePositionRatio(() => "0.8"), 0.8);
  assert.equal(getInitialJudgeLinePositionRatio(() => -1), 0.5);
  assert.equal(getInitialJudgeLinePositionRatio(() => "invalid"), 0.5);
});

test("spacing scale defaults to 1.0 and restores valid persisted values per mode", () => {
  assert.equal(DEFAULT_SPACING_SCALE, 1.0);
  assert.equal(SPACING_SCALE_STORAGE_KEYS.time, "bms-info-extender.spacingScale.time");
  assert.equal(SPACING_SCALE_STORAGE_KEYS.editor, "bms-info-extender.spacingScale.editor");
  assert.equal(SPACING_SCALE_STORAGE_KEYS.game, "bms-info-extender.spacingScale.game");
  assert.equal(getInitialSpacingScale("time", () => null), 1.0);
  assert.equal(getInitialSpacingScale("editor", () => 1.25), 1.25);
  assert.equal(getInitialSpacingScale("game", () => "1.75"), 1.75);
  assert.equal(getInitialSpacingScale("time", () => -1), 1.0);
  assert.equal(getInitialSpacingScale("time", () => "invalid"), 1.0);
  assert.deepEqual(getInitialSpacingScaleByMode((mode) => (
    mode === "time" ? 1.1 : mode === "editor" ? 1.2 : 1.3
  )), {
    time: 1.1,
    editor: 1.2,
    game: 1.3,
  });
});

test("game timing config defaults and restores valid persisted values", () => {
  assert.equal(DEFAULT_GAME_DURATION_MS, 500);
  assert.equal(DEFAULT_GAME_LANE_HEIGHT_PERCENT, 0);
  assert.equal(DEFAULT_GAME_LANE_COVER_PERMILLE, 0);
  assert.equal(DEFAULT_GAME_LANE_COVER_VISIBLE, true);
  assert.equal(DEFAULT_GAME_HS_FIX_MODE, "main");
  assert.equal(GAME_DURATION_MS_STORAGE_KEY, "bms-info-extender.game.durationMs");
  assert.equal(GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY, "bms-info-extender.game.laneHeightPercent");
  assert.equal(GAME_LANE_COVER_PERMILLE_STORAGE_KEY, "bms-info-extender.game.laneCoverPermille");
  assert.equal(GAME_LANE_COVER_VISIBLE_STORAGE_KEY, "bms-info-extender.game.laneCoverVisible");
  assert.equal(GAME_HS_FIX_MODE_STORAGE_KEY, "bms-info-extender.game.hsFixMode");
  assert.deepEqual(getInitialGameTimingConfig(), {
    durationMs: 500,
    laneHeightPercent: 0,
    laneCoverPermille: 0,
    laneCoverVisible: true,
    hsFixMode: "main",
  });
  assert.deepEqual(getInitialGameTimingConfig({
    getPersistedGameDurationMs: () => 640,
    getPersistedGameLaneHeightPercent: () => 12.5,
    getPersistedGameLaneCoverPermille: () => 350,
    getPersistedGameLaneCoverVisible: () => false,
    getPersistedGameHsFixMode: () => "max",
  }), {
    durationMs: 640,
    laneHeightPercent: 12.5,
    laneCoverPermille: 350,
    laneCoverVisible: false,
    hsFixMode: "max",
  });
});

test("graph interaction mode defaults to hover and restores valid persisted values", () => {
  assert.equal(DEFAULT_GRAPH_INTERACTION_MODE, "hover");
  assert.equal(GRAPH_INTERACTION_MODE_STORAGE_KEY, "bms-info-extender.graphInteractionMode");
  assert.equal(getInitialGraphInteractionMode(() => null), "hover");
  assert.equal(getInitialGraphInteractionMode(() => "drag"), "drag");
  assert.equal(getInitialGraphInteractionMode(() => "invalid"), "hover");
});

test("renderer config defaults and restores valid persisted values", () => {
  assert.equal(VIEWER_NOTE_WIDTH_STORAGE_KEY, "bms-info-extender.viewer.noteWidth");
  assert.equal(VIEWER_SCRATCH_WIDTH_STORAGE_KEY, "bms-info-extender.viewer.scratchWidth");
  assert.equal(VIEWER_NOTE_HEIGHT_STORAGE_KEY, "bms-info-extender.viewer.noteHeight");
  assert.equal(VIEWER_BAR_LINE_HEIGHT_STORAGE_KEY, "bms-info-extender.viewer.barLineHeight");
  assert.equal(VIEWER_MARKER_HEIGHT_STORAGE_KEY, "bms-info-extender.viewer.markerHeight");
  assert.equal(VIEWER_SEPARATOR_WIDTH_STORAGE_KEY, "bms-info-extender.viewer.separatorWidth");
  assert.deepEqual(getInitialRendererConfig(), {
    noteWidth: 15,
    scratchWidth: 30,
    noteHeight: 4,
    barLineHeight: 1,
    markerHeight: 1,
    separatorWidth: 1,
  });
  assert.deepEqual(getInitialRendererConfig({
    getPersistedViewerNoteWidth: () => 20,
    getPersistedViewerScratchWidth: () => 36,
    getPersistedViewerNoteHeight: () => 6,
    getPersistedViewerBarLineHeight: () => 3,
    getPersistedViewerMarkerHeight: () => 2,
    getPersistedViewerSeparatorWidth: () => 4,
  }), {
    noteWidth: 20,
    scratchWidth: 36,
    noteHeight: 6,
    barLineHeight: 3,
    markerHeight: 2,
    separatorWidth: 4,
  });
});

test("preview preference storage shares persistence wiring for viewer mode, invisible notes, judge line position, and per-mode spacing", () => {
  const store = new Map();
  const preferences = createPreviewPreferenceStorage({
    read: (key, fallbackValue) => store.has(key) ? store.get(key) : fallbackValue,
    write: (key, value) => store.set(key, value),
  });

  assert.equal(preferences.getPersistedViewerMode(), "time");
  assert.equal(preferences.getPersistedInvisibleNoteVisibility(), "hide");
  assert.equal(preferences.getPersistedJudgeLinePositionRatio(), 0.5);
  assert.equal(preferences.getPersistedSpacingScale("time"), 1.0);
  assert.equal(preferences.getPersistedSpacingScale("editor"), 1.0);
  assert.equal(preferences.getPersistedSpacingScale("game"), 1.0);
  assert.equal(preferences.getPersistedGameDurationMs(), 500);
  assert.equal(preferences.getPersistedGameLaneHeightPercent(), 0);
  assert.equal(preferences.getPersistedGameLaneCoverPermille(), 0);
  assert.equal(preferences.getPersistedGameLaneCoverVisible(), true);
  assert.equal(preferences.getPersistedGameHsFixMode(), "main");
  assert.equal(preferences.getPersistedGraphInteractionMode(), "hover");
  assert.equal(preferences.getPersistedViewerNoteWidth(), 15);
  assert.equal(preferences.getPersistedViewerScratchWidth(), 30);
  assert.equal(preferences.getPersistedViewerNoteHeight(), 4);
  assert.equal(preferences.getPersistedViewerBarLineHeight(), 1);
  assert.equal(preferences.getPersistedViewerMarkerHeight(), 1);
  assert.equal(preferences.getPersistedViewerSeparatorWidth(), 1);

  preferences.setPersistedViewerMode("lunatic");
  preferences.setPersistedInvisibleNoteVisibility("show");
  preferences.setPersistedJudgeLinePositionRatio(0.25);
  preferences.setPersistedSpacingScale("time", 1.1);
  preferences.setPersistedSpacingScale("editor", 1.25);
  preferences.setPersistedSpacingScale("game", 1.5);
  preferences.setPersistedGameDurationMs(640);
  preferences.setPersistedGameLaneHeightPercent(12.5);
  preferences.setPersistedGameLaneCoverPermille(350);
  preferences.setPersistedGameLaneCoverVisible(false);
  preferences.setPersistedGameHsFixMode("max");
  preferences.setPersistedGraphInteractionMode("drag");
  preferences.setPersistedViewerNoteWidth(20);
  preferences.setPersistedViewerScratchWidth(36);
  preferences.setPersistedViewerNoteHeight(6);
  preferences.setPersistedViewerBarLineHeight(3);
  preferences.setPersistedViewerMarkerHeight(2);
  preferences.setPersistedViewerSeparatorWidth(4);

  assert.equal(store.get(VIEWER_MODE_STORAGE_KEY), "lunatic");
  assert.equal(store.get(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY), "show");
  assert.equal(store.get(JUDGE_LINE_POSITION_RATIO_STORAGE_KEY), 0.25);
  assert.equal(store.get(SPACING_SCALE_STORAGE_KEYS.time), 1.1);
  assert.equal(store.get(SPACING_SCALE_STORAGE_KEYS.editor), 1.25);
  assert.equal(store.get(SPACING_SCALE_STORAGE_KEYS.game), 1.5);
  assert.equal(store.get(GAME_DURATION_MS_STORAGE_KEY), 640);
  assert.equal(store.get(GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY), 12.5);
  assert.equal(store.get(GAME_LANE_COVER_PERMILLE_STORAGE_KEY), 350);
  assert.equal(store.get(GAME_LANE_COVER_VISIBLE_STORAGE_KEY), false);
  assert.equal(store.get(GAME_HS_FIX_MODE_STORAGE_KEY), "max");
  assert.equal(store.get(GRAPH_INTERACTION_MODE_STORAGE_KEY), "drag");
  assert.equal(store.get(VIEWER_NOTE_WIDTH_STORAGE_KEY), 20);
  assert.equal(store.get(VIEWER_SCRATCH_WIDTH_STORAGE_KEY), 36);
  assert.equal(store.get(VIEWER_NOTE_HEIGHT_STORAGE_KEY), 6);
  assert.equal(store.get(VIEWER_BAR_LINE_HEIGHT_STORAGE_KEY), 3);
  assert.equal(store.get(VIEWER_MARKER_HEIGHT_STORAGE_KEY), 2);
  assert.equal(store.get(VIEWER_SEPARATOR_WIDTH_STORAGE_KEY), 4);
  assert.equal(preferences.getPersistedViewerMode(), "lunatic");
  assert.equal(preferences.getPersistedInvisibleNoteVisibility(), "show");
  assert.equal(preferences.getPersistedJudgeLinePositionRatio(), 0.25);
  assert.equal(preferences.getPersistedSpacingScale("time"), 1.1);
  assert.equal(preferences.getPersistedSpacingScale("editor"), 1.25);
  assert.equal(preferences.getPersistedSpacingScale("game"), 1.5);
  assert.equal(preferences.getPersistedGameDurationMs(), 640);
  assert.equal(preferences.getPersistedGameLaneHeightPercent(), 12.5);
  assert.equal(preferences.getPersistedGameLaneCoverPermille(), 350);
  assert.equal(preferences.getPersistedGameLaneCoverVisible(), false);
  assert.equal(preferences.getPersistedGameHsFixMode(), "max");
  assert.equal(preferences.getPersistedGraphInteractionMode(), "drag");
  assert.equal(preferences.getPersistedViewerNoteWidth(), 20);
  assert.equal(preferences.getPersistedViewerScratchWidth(), 36);
  assert.equal(preferences.getPersistedViewerNoteHeight(), 6);
  assert.equal(preferences.getPersistedViewerBarLineHeight(), 3);
  assert.equal(preferences.getPersistedViewerMarkerHeight(), 2);
  assert.equal(preferences.getPersistedViewerSeparatorWidth(), 4);

  store.set(JUDGE_LINE_POSITION_RATIO_STORAGE_KEY, "invalid");
  store.set(SPACING_SCALE_STORAGE_KEYS.editor, "invalid");
  store.set(GAME_DURATION_MS_STORAGE_KEY, "invalid");
  store.set(GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY, "invalid");
  store.set(GAME_LANE_COVER_PERMILLE_STORAGE_KEY, "invalid");
  store.set(GAME_LANE_COVER_VISIBLE_STORAGE_KEY, "invalid");
  store.set(GAME_HS_FIX_MODE_STORAGE_KEY, "invalid");
  store.set(GRAPH_INTERACTION_MODE_STORAGE_KEY, "invalid");
  store.set(VIEWER_NOTE_WIDTH_STORAGE_KEY, "invalid");
  store.set(VIEWER_SCRATCH_WIDTH_STORAGE_KEY, "invalid");
  store.set(VIEWER_NOTE_HEIGHT_STORAGE_KEY, "invalid");
  store.set(VIEWER_BAR_LINE_HEIGHT_STORAGE_KEY, "invalid");
  store.set(VIEWER_MARKER_HEIGHT_STORAGE_KEY, "invalid");
  store.set(VIEWER_SEPARATOR_WIDTH_STORAGE_KEY, "invalid");
  assert.equal(preferences.getPersistedJudgeLinePositionRatio(), 0.5);
  assert.equal(preferences.getPersistedSpacingScale("editor"), 1.0);
  assert.equal(preferences.getPersistedGameDurationMs(), 500);
  assert.equal(preferences.getPersistedGameLaneHeightPercent(), 0);
  assert.equal(preferences.getPersistedGameLaneCoverPermille(), 0);
  assert.equal(preferences.getPersistedGameLaneCoverVisible(), true);
  assert.equal(preferences.getPersistedGameHsFixMode(), "main");
  assert.equal(preferences.getPersistedGraphInteractionMode(), "hover");
  assert.equal(preferences.getPersistedViewerNoteWidth(), 15);
  assert.equal(preferences.getPersistedViewerScratchWidth(), 30);
  assert.equal(preferences.getPersistedViewerNoteHeight(), 4);
  assert.equal(preferences.getPersistedViewerBarLineHeight(), 1);
  assert.equal(preferences.getPersistedViewerMarkerHeight(), 1);
  assert.equal(preferences.getPersistedViewerSeparatorWidth(), 1);
});

test("viewer model dirty render also reapplies persisted viewer chrome", () => {
  const expandedMask = expandPreviewRenderMask(PREVIEW_RENDER_DIRTY.viewerModel);

  assert.notEqual(expandedMask & PREVIEW_RENDER_DIRTY.viewerMode, 0);
  assert.notEqual(expandedMask & PREVIEW_RENDER_DIRTY.invisible, 0);
  assert.notEqual(expandedMask & PREVIEW_RENDER_DIRTY.judgeLinePosition, 0);
  assert.notEqual(expandedMask & PREVIEW_RENDER_DIRTY.spacing, 0);
  assert.equal(
    expandPreviewRenderMask(PREVIEW_RENDER_DIRTY.selection),
    PREVIEW_RENDER_DIRTY.selection,
  );
});

test("graph hover mode opens the viewer and updates the selected time", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const { preview, elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
    });

    preview.setRecord(createNormalizedRecord("1".repeat(64)));
    await environment.settle();

    elements.graphCanvas.dispatchEvent({ type: "mousemove", clientX: 25, clientY: 0 });
    await environment.settle();

    const state = preview.getState();
    assert.equal(state.isViewerOpen, true);
    assert.equal(state.selectedTimeSec, 5);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("graph click syncs the selected time with the viewer", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const { preview, elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
      preferences: {
        getPersistedGraphInteractionMode: () => "drag",
      },
    });

    preview.setRecord(createNormalizedRecord("2".repeat(64)));
    await environment.settle();

    elements.graphCanvas.dispatchEvent({ type: "click", clientX: 25, clientY: 0 });
    await environment.settle();

    let state = preview.getState();
    assert.equal(state.isViewerOpen, true);
    assert.equal(state.isPinned, false);
    assert.equal(state.selectedTimeSec, 5);

    elements.graphCanvas.dispatchEvent({ type: "mouseleave" });
    await environment.settle();

    state = preview.getState();
    assert.equal(state.isViewerOpen, false);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("graph playback line drag updates the viewer selected time", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const { preview, elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
      preferences: {
        getPersistedGraphInteractionMode: () => "drag",
      },
    });

    preview.setRecord(createNormalizedRecord("3".repeat(64)));
    preview.setSelectedTimeSec(5);
    await environment.settle();

    elements.graphCanvas.dispatchEvent({ type: "pointerdown", pointerId: 1, button: 0, clientX: 25, clientY: 0 });
    elements.graphCanvas.dispatchEvent({ type: "pointermove", pointerId: 1, clientX: 36, clientY: 0 });
    elements.graphCanvas.dispatchEvent({ type: "pointerup", pointerId: 1, clientX: 36, clientY: 0 });
    await environment.settle();

    let state = preview.getState();
    assert.equal(state.isViewerOpen, true);
    assert.equal(state.isPinned, false);
    assert.ok(Math.abs(state.selectedTimeSec - 7.2) < 0.000001);

    elements.graphCanvas.dispatchEvent({ type: "mouseleave" });
    await environment.settle();

    state = preview.getState();
    assert.equal(state.isViewerOpen, false);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("graph right-click sticky drag updates the viewer and closes on mouseleave", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const { preview, elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
      preferences: {
        getPersistedGraphInteractionMode: () => "drag",
      },
    });

    preview.setRecord(createNormalizedRecord("4".repeat(64)));
    await environment.settle();

    elements.graphCanvas.dispatchEvent({ type: "contextmenu", clientX: 25, clientY: 0 });
    elements.graphCanvas.dispatchEvent({ type: "mousemove", clientX: 35, clientY: 0 });
    await environment.settle();

    let state = preview.getState();
    assert.equal(state.isViewerOpen, true);
    assert.equal(state.isPinned, false);
    assert.ok(Math.abs(state.selectedTimeSec - 7) < 0.000001);

    elements.graphCanvas.dispatchEvent({ type: "mouseleave" });
    await environment.settle();

    state = preview.getState();
    assert.equal(state.isViewerOpen, false);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("graph settings popup toggles and persists interaction mode", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const store = new Map([[GRAPH_INTERACTION_MODE_STORAGE_KEY, "drag"]]);
    const { preview, elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
      preferences: {
        getPersistedGraphInteractionMode: () => store.get(GRAPH_INTERACTION_MODE_STORAGE_KEY) ?? "hover",
        setPersistedGraphInteractionMode: (value) => store.set(GRAPH_INTERACTION_MODE_STORAGE_KEY, value),
      },
    });
    await environment.settle();

    assert.ok(elements.overlayHost);
    assert.ok(elements.container.querySelector("#bd-graph").shadowRoot);
    assert.ok(elements.overlayHost.shadowRoot);
    assert.equal(preview.getState().graphInteractionMode, "drag");
    assert.equal(elements.graphSettingsPopup.hidden, true);
    assert.equal(elements.graphInteractionSelect.value, "drag");
    assert.ok(String(elements.graphInteractionSelect.className).includes("bmsie-ui-select"));

    elements.graphSettingsToggle.dispatchEvent({ type: "click" });
    await environment.settle();
    assert.equal(elements.graphSettingsPopup.hidden, false);

    elements.graphInteractionSelect.value = "hover";
    elements.graphInteractionSelect.dispatchEvent({ type: "change" });
    await environment.settle();

    assert.equal(preview.getState().graphInteractionMode, "hover");
    assert.equal(store.get(GRAPH_INTERACTION_MODE_STORAGE_KEY), "hover");

    elements.graphSettingsClose.dispatchEvent({ type: "click" });
    await environment.settle();
    assert.equal(elements.graphSettingsPopup.hidden, true);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("viewer detail settings popup opens beside the status panel, reflects defaults, and closes on outside pointerdown or Escape", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const { preview } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
    });
    await environment.settle();

    const statusPanel = findElementByClass(environment.document.body, "score-viewer-status-panel");
    const detailSettingsPopup = findElementById(environment.document.body, "bd-viewer-detail-settings-popup");
    const detailSettingsToggle = findElementByClass(environment.document.body, "score-viewer-detail-settings-toggle");
    const detailSettingsClose = findElementByClass(environment.document.body, "score-viewer-detail-settings-close");

    assert.ok(statusPanel);
    assert.ok(detailSettingsPopup);
    assert.ok(detailSettingsToggle);
    assert.ok(detailSettingsClose);
    assert.equal(detailSettingsPopup.hidden, true);
    assert.equal(detailSettingsPopup.parentNode?.parentNode?.host?.id, PREVIEW_OVERLAY_HOST_ID);

    const noteWidthInput = findElementById(environment.document.body, "bd-viewer-note-width-input");
    const scratchWidthInput = findElementById(environment.document.body, "bd-viewer-scratch-width-input");
    const noteHeightInput = findElementById(environment.document.body, "bd-viewer-note-height-input");
    const barLineHeightInput = findElementById(environment.document.body, "bd-viewer-bar-line-height-input");
    const markerHeightInput = findElementById(environment.document.body, "bd-viewer-marker-height-input");
    const separatorWidthInput = findElementById(environment.document.body, "bd-viewer-separator-width-input");

    assert.equal(noteWidthInput?.value, "15");
    assert.equal(scratchWidthInput?.value, "30");
    assert.equal(noteHeightInput?.value, "4");
    assert.equal(barLineHeightInput?.value, "1");
    assert.equal(markerHeightInput?.value, "1");
    assert.equal(separatorWidthInput?.value, "1");
    assert.ok(String(noteWidthInput?.className ?? "").includes("bmsie-ui-input"));
    assert.ok(String(scratchWidthInput?.className ?? "").includes("bmsie-ui-input"));

    detailSettingsPopup.getBoundingClientRect = () => ({ width: 240, height: 180 });
    statusPanel.getBoundingClientRect = () => ({ left: 220, top: 96, bottom: 180 });

    detailSettingsToggle.dispatchEvent({ type: "click" });
    await environment.settle();

    assert.equal(detailSettingsPopup.hidden, false);
    assert.equal(
      detailSettingsPopup.children[1]?.children[0]?.className,
      "score-viewer-detail-settings-pair-row",
    );
    assert.equal(detailSettingsPopup.style.left, "12px");
    assert.equal(detailSettingsPopup.style.top, "12px");
    assert.equal(detailSettingsPopup.style.right, "auto");
    assert.equal(detailSettingsPopup.style.bottom, "auto");
    assert.equal(detailSettingsToggle.getAttribute("aria-expanded"), "true");

    detailSettingsClose.dispatchEvent({ type: "click" });
    await environment.settle();
    assert.equal(detailSettingsPopup.hidden, true);
    assert.equal(detailSettingsToggle.getAttribute("aria-expanded"), "false");

    detailSettingsToggle.dispatchEvent({ type: "click" });
    await environment.settle();
    assert.equal(detailSettingsPopup.hidden, false);

    environment.document.body.dispatchEvent({ type: "pointerdown" });
    await environment.settle();
    assert.equal(detailSettingsPopup.hidden, true);

    detailSettingsToggle.dispatchEvent({ type: "click" });
    await environment.settle();
    assert.equal(detailSettingsPopup.hidden, false);

    environment.document.body.dispatchEvent({ type: "keydown", key: "Escape" });
    await environment.settle();
    assert.equal(detailSettingsPopup.hidden, true);

    preview.destroy();
    await environment.settle();
    assert.equal(findElementById(environment.document.body, "bd-viewer-detail-settings-popup"), null);
  } finally {
    environment.restore();
  }
});

test("preview mounts interactive surfaces into shadow roots by default", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const { elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
    });
    await environment.settle();

    const graphHost = elements.container.querySelector("#bd-graph");
    assert.ok(graphHost.shadowRoot);
      assert.ok(elements.overlayHost?.shadowRoot);
      assert.ok(elements.graphCanvas);
      assert.ok(elements.graphTooltip);
      assert.ok(elements.graphSettingsToggle);
      assert.ok(elements.viewerDetailSettingsPopup);
      assert.equal(elements.graphTooltip?.parentNode?.parentNode?.host?.id, PREVIEW_OVERLAY_HOST_ID);
      assert.equal(elements.viewerDetailSettingsPopup?.parentNode?.parentNode?.host?.id, PREVIEW_OVERLAY_HOST_ID);
    } finally {
      environment.restore();
    }
  });

test("graph tooltip is rendered in the overlay surface and follows viewport pointer coordinates", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const { preview, elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
    });

    preview.setRecord(createNormalizedRecord("e".repeat(64)));
    await environment.settle();

    assert.ok(elements.graphTooltip);
    assert.equal(elements.graphTooltip.parentNode?.parentNode?.host?.id, PREVIEW_OVERLAY_HOST_ID);

    elements.graphCanvas.dispatchEvent({ type: "mousemove", clientX: 120, clientY: 34 });
    await environment.settle();

    assert.equal(elements.graphTooltip.style.left, "130px");
    assert.equal(elements.graphTooltip.style.top, "44px");
    assert.equal(elements.graphTooltip.style.display, "block");

    elements.graphCanvas.dispatchEvent({ type: "mouseleave" });
    await environment.settle();

    assert.equal(elements.graphTooltip.style.display, "none");

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("viewer detail settings popup adjusts renderer config by wheel with clamp and persistence", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const store = new Map();
    const { preview } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createParsedScore(),
      preferences: createPreviewPreferenceStorage({
        read: (key, fallbackValue) => store.has(key) ? store.get(key) : fallbackValue,
        write: (key, value) => store.set(key, value),
      }),
    });
    await environment.settle();

    const detailSettingsToggle = findElementByClass(environment.document.body, "score-viewer-detail-settings-toggle");
    const noteWidthInput = findElementById(environment.document.body, "bd-viewer-note-width-input");
    const scratchWidthInput = findElementById(environment.document.body, "bd-viewer-scratch-width-input");
    const separatorWidthInput = findElementById(environment.document.body, "bd-viewer-separator-width-input");

    assert.ok(detailSettingsToggle);
    assert.ok(noteWidthInput);
    assert.ok(scratchWidthInput);
    assert.ok(separatorWidthInput);

    detailSettingsToggle.dispatchEvent({ type: "click" });
    await environment.settle();

    noteWidthInput.dispatchEvent({ type: "wheel", deltaY: -1 });
    await environment.settle();
    assert.equal(noteWidthInput.value, "16");
    assert.equal(preview.getState().rendererConfig.noteWidth, 16);
    assert.equal(store.get(VIEWER_NOTE_WIDTH_STORAGE_KEY), 16);

    noteWidthInput.dispatchEvent({ type: "wheel", deltaY: 1 });
    await environment.settle();
    assert.equal(noteWidthInput.value, "15");
    assert.equal(preview.getState().rendererConfig.noteWidth, 15);
    assert.equal(store.get(VIEWER_NOTE_WIDTH_STORAGE_KEY), 15);

    scratchWidthInput.dispatchEvent({ type: "wheel", deltaY: -1 });
    await environment.settle();
    assert.equal(scratchWidthInput.value, "31");
    assert.equal(preview.getState().rendererConfig.scratchWidth, 31);
    assert.equal(store.get(VIEWER_SCRATCH_WIDTH_STORAGE_KEY), 31);

    scratchWidthInput.value = "64";
    scratchWidthInput.dispatchEvent({ type: "wheel", deltaY: -1 });
    await environment.settle();
    assert.equal(scratchWidthInput.value, "64");
    assert.equal(preview.getState().rendererConfig.scratchWidth, 64);
    assert.equal(store.get(VIEWER_SCRATCH_WIDTH_STORAGE_KEY), 64);

    separatorWidthInput.value = "0";
    separatorWidthInput.dispatchEvent({ type: "wheel", deltaY: 1 });
    await environment.settle();
    assert.equal(separatorWidthInput.value, "0");
    assert.equal(preview.getState().rendererConfig.separatorWidth, 0);
    assert.equal(store.get(VIEWER_SEPARATOR_WIDTH_STORAGE_KEY), 0);

    separatorWidthInput.value = "16";
    separatorWidthInput.dispatchEvent({ type: "wheel", deltaY: -1 });
    await environment.settle();
    assert.equal(separatorWidthInput.value, "16");
    assert.equal(preview.getState().rendererConfig.separatorWidth, 16);
    assert.equal(store.get(VIEWER_SEPARATOR_WIDTH_STORAGE_KEY), 16);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("preview playback stops at the Lunatic profile duration instead of the raw parser duration", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const { preview } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {},
      loadParsedScore: async () => createLunaticParsedScore(),
    });

    preview.setRecord(createNormalizedRecord("b".repeat(64)), { parsedScore: createLunaticParsedScore() });
    preview.setViewerMode("lunatic");
    preview.setSelectedTimeSec(0);
    preview.setPlaybackState(true);

    for (let index = 0; index < 8; index += 1) {
      await environment.settle();
    }

    const state = preview.getState();
    assert.equal(state.isPlaying, false);
    assert.equal(state.resolvedViewerMode, "lunatic");
    assert.ok(state.selectedTimeSec < state.parsedScore.totalDurationSec);
    assert.ok(Math.abs(state.selectedTimeSec - state.viewerModel.score.totalDurationSec) < 0.0005);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("preview prefetch starts one availability fetch and hover waits on the same pending attempt", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const prefetchDeferred = createDeferred();
    let prefetchCount = 0;
    let loadCount = 0;
    const { preview, elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {
        prefetchCount += 1;
        await prefetchDeferred.promise;
      },
      loadParsedScore: async () => {
        loadCount += 1;
        return createParsedScore();
      },
    });

    preview.setRecord(createNormalizedRecord("a".repeat(64)));
    await environment.settle();

    const prefetchPromise = preview.prefetch();
    elements.graphCanvas.dispatchEvent({ type: "mousemove", clientX: 5, clientY: 0 });
    elements.graphCanvas.dispatchEvent({ type: "mousemove", clientX: 25, clientY: 0 });
    await environment.settle();

    assert.equal(prefetchCount, 1);
    assert.equal(loadCount, 0);

    prefetchDeferred.resolve();
    await prefetchPromise;
    await environment.settle();

    assert.equal(prefetchCount, 1);
    assert.equal(loadCount, 1);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("failed availability prefetch does not retry on hover, click, or pin within the same runtime", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    let prefetchCount = 0;
    let loadCount = 0;
    const { preview, elements } = createPreviewHarness(environment.document, {
      prefetchParsedScore: async () => {
        prefetchCount += 1;
        throw new Error("404");
      },
      loadParsedScore: async () => {
        loadCount += 1;
        return createParsedScore();
      },
    });

    preview.setRecord(createNormalizedRecord("b".repeat(64)));
    await environment.settle();

    await preview.prefetch();
    await environment.settle();

    elements.graphCanvas.dispatchEvent({ type: "mousemove", clientX: 10, clientY: 0 });
    elements.graphCanvas.dispatchEvent({ type: "click", clientX: 15, clientY: 0 });
    preview.setPinned(true);
    await environment.settle();

    assert.equal(prefetchCount, 1);
    assert.equal(loadCount, 0);

    preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

test("a new sha256 or a new preview runtime gets a fresh availability attempt", async () => {
  const environment = installPreviewTestEnvironment();
  try {
    const prefetchCounts = new Map();
    const makePrefetchStub = () => async (record) => {
      const sha256 = record.sha256.toLowerCase();
      prefetchCounts.set(sha256, (prefetchCounts.get(sha256) ?? 0) + 1);
      throw new Error("404");
    };

    const firstHarness = createPreviewHarness(environment.document, {
      prefetchParsedScore: makePrefetchStub(),
      loadParsedScore: async () => createParsedScore(),
    });
    firstHarness.preview.setRecord(createNormalizedRecord("c".repeat(64)));
    await environment.settle();
    await firstHarness.preview.prefetch();
    await environment.settle();

    firstHarness.preview.setRecord(createNormalizedRecord("d".repeat(64)));
    await environment.settle();
    await firstHarness.preview.prefetch();
    await environment.settle();

    firstHarness.preview.destroy();
    await environment.settle();

    const secondHarness = createPreviewHarness(environment.document, {
      prefetchParsedScore: makePrefetchStub(),
      loadParsedScore: async () => createParsedScore(),
    });
    secondHarness.preview.setRecord(createNormalizedRecord("c".repeat(64)));
    await environment.settle();
    await secondHarness.preview.prefetch();
    await environment.settle();

    assert.equal(prefetchCounts.get("c".repeat(64)), 2);
    assert.equal(prefetchCounts.get("d".repeat(64)), 1);

    secondHarness.preview.destroy();
    await environment.settle();
  } finally {
    environment.restore();
  }
});

function createPreviewHarness(documentRef, {
  prefetchParsedScore = async () => {},
  loadParsedScore = async () => createParsedScore(),
  preferences = {},
} = {}) {
  const elements = createPreviewContainerElements(documentRef);
  const preview = createBmsInfoPreview({
    container: elements.container,
    documentRef,
    prefetchParsedScore,
    loadParsedScore,
    ...preferences,
  });
  elements.overlayHost = findElementById(documentRef.body, PREVIEW_OVERLAY_HOST_ID);
  elements.graphCanvas = findElementById(elements.container, "bd-graph-canvas");
  elements.graphTooltip = findElementById(documentRef.body, "bd-graph-tooltip");
  elements.graphSettingsToggle = findElementById(elements.container, "bd-graph-settings-toggle");
  elements.graphSettingsPopup = findElementById(documentRef.body, "bd-graph-settings-popup");
  elements.graphSettingsClose = findElementById(documentRef.body, "bd-graph-settings-close");
  elements.graphInteractionSelect = findElementById(documentRef.body, "bd-graph-interaction-select");
  elements.viewerDetailSettingsPopup = findElementById(documentRef.body, "bd-viewer-detail-settings-popup");
  elements.viewerDetailSettingsToggle = findElementByClass(documentRef.body, "score-viewer-detail-settings-toggle");
  elements.viewerDetailSettingsClose = findElementByClass(documentRef.body, "score-viewer-detail-settings-close");
  return { preview, elements };
}

function createPreviewContainerElements(documentRef) {
  const container = new MockContainerElement(documentRef);
  const ids = [
    "bd-lr2ir",
    "bd-minir",
    "bd-mocha",
    "bd-viewer",
    "bd-bmssearch",
    "bd-bokutachi",
    "bd-stellaverse",
    "bd-sha256",
    "bd-md5",
    "bd-bmsid",
    "bd-mainbpm",
    "bd-maxbpm",
    "bd-minbpm",
    "bd-mode",
    "bd-feature",
    "bd-judgerank",
    "bd-notes",
    "bd-total",
    "bd-avgdensity",
    "bd-peakdensity",
    "bd-enddensity",
    "bd-duration",
    "bd-lanenotes-div",
    "bd-tables-ul",
    "bd-graph",
  ];
  for (const id of ids) {
    let element;
    element = documentRef.createElement("div");
    element.id = id;
    container.registerElement(id, element);
  }
  container.querySelector("#bd-graph").clientWidth = 320;
  container.querySelector("#bd-graph").clientHeight = 180;
  container.querySelector("#bd-graph").scrollWidth = 900;
  return {
    container,
  };
}

function findElementById(root, id) {
  if (!root) {
    return null;
  }
  if (root.id === id) {
    return root;
  }
  const shadowMatch = findElementById(root.shadowRoot ?? null, id);
  if (shadowMatch) {
    return shadowMatch;
  }
  for (const child of root.children ?? []) {
    const match = findElementById(child, id);
    if (match) {
      return match;
    }
  }
  return null;
}

function findElementByClass(root, className) {
  if (!root) {
    return null;
  }
  const classNames = String(root.className ?? "").split(/\s+/).filter(Boolean);
  if (root.classList?.contains?.(className) || classNames.includes(className)) {
    return root;
  }
  const shadowMatch = findElementByClass(root.shadowRoot ?? null, className);
  if (shadowMatch) {
    return shadowMatch;
  }
  for (const child of root.children ?? []) {
    const match = findElementByClass(child, className);
    if (match) {
      return match;
    }
  }
  return null;
}

function createNormalizedRecord(sha256) {
  return {
    md5: "0".repeat(32),
    sha256,
    maxbpm: 180,
    minbpm: 120,
    mainbpm: 150,
    mode: 7,
    judge: 3,
    featureNames: [],
    notesStr: "100 (N:100, LN:0, SCR:0, LNSCR:0)",
    totalStr: "300 (3.000 T/N)",
    density: 1.5,
    peakdensity: 4,
    enddensity: 1.25,
    durationStr: "120.00 s",
    lanenotesArr: Array.from({ length: 8 }, () => [0, 0, 0, 0]),
    tables: [],
    stella: 0,
    bmsid: 0,
    distributionSegments: Array.from({ length: 32 }, () => [0, 0, 0, 0, 0, 0, 0]),
    speedChangePoints: [[150, 0]],
    durationSec: 120,
  };
}

function createParsedScore() {
  return {
    mode: "7k",
    laneCount: 8,
    initialBpm: 150,
    notes: [],
    barLines: [],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    comboEvents: [],
    timingActions: [],
    totalDurationSec: 120,
    lastTimelineTimeSec: 120,
    lastPlayableTimeSec: 120,
  };
}

function createLunaticParsedScore() {
  return {
    mode: "7k",
    laneCount: 8,
    initialBpm: 120,
    notes: [{ lane: 1, beat: 0.2, timeSec: 0.1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 1, timeSec: 0.5 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [{ beat: 0.1, timeSec: 0.05, rate: 0 }],
    comboEvents: [{ lane: 1, beat: 0.2, timeSec: 0.1, kind: "normal" }],
    timingActions: [{
      type: "stop",
      beat: 0.1,
      timeSec: 0.05,
      stopBeats: 1,
      durationSec: 0.5,
      stopResolution: "resolved",
      stopLunaticBehavior: "warp",
    }],
    totalDurationSec: 0.5,
    lastTimelineTimeSec: 0.5,
    lastPlayableTimeSec: 0.1,
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function installPreviewTestEnvironment() {
  const previousGlobals = {
    document: globalThis.document,
    window: globalThis.window,
    fetch: globalThis.fetch,
    consoleWarn: console.warn,
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const documentRef = new MockDocument();
  const frameQueue = new Map();
  let nextFrameId = 1;
  let frameTimeMs = 0;

  globalThis.document = documentRef;
  globalThis.window = {
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 768,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.fetch = async () => ({ ok: false });
  console.warn = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (callback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    frameQueue.set(frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = (frameId) => {
    frameQueue.delete(frameId);
  };

  return {
    document: documentRef,
    async settle() {
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
        if (frameQueue.size === 0) {
          continue;
        }
        const pendingFrames = [...frameQueue.entries()];
        frameQueue.clear();
        for (const [, callback] of pendingFrames) {
          frameTimeMs += 16;
          callback(frameTimeMs);
        }
      }
    },
    restore() {
      globalThis.document = previousGlobals.document;
      globalThis.window = previousGlobals.window;
      globalThis.fetch = previousGlobals.fetch;
      console.warn = previousGlobals.consoleWarn;
      globalThis.ResizeObserver = previousGlobals.ResizeObserver;
      globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
      globalThis.cancelAnimationFrame = previousGlobals.cancelAnimationFrame;
    },
  };
}

class MockDocument {
  constructor() {
    this.documentElement = new MockElement("html", this);
    this.documentElement.clientWidth = 800;
    this.documentElement.clientHeight = 768;
    this.body = new MockElement("body", this);
    this.head = new MockElement("head", this);
  }

  createElement(tagName) {
    if (tagName === "canvas") {
      return new MockCanvasElement(this);
    }
    return new MockElement(tagName, this);
  }
}

class MockElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = createMockStyle();
    this.classList = new MockClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.checked = false;
    this.href = "";
    this.id = "";
    this.shadowRoot = null;
    this.clientWidth = 640;
    this.clientHeight = 360;
    this.scrollWidth = 640;
    this.scrollHeight = 360;
    this.scrollTop = 0;
    this.scrollLeft = 0;
  }

  get isConnected() {
    return this._isConnected ?? this.parentNode !== null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    for (const child of children) {
      this.appendChild(child);
    }
  }

  remove() {
    if (!this.parentNode) {
      return;
    }
    const nextChildren = this.parentNode.children.filter((child) => child !== this);
    this.parentNode.children = nextChildren;
    this.parentNode = null;
  }

  attachShadow() {
    this.shadowRoot = new MockShadowRoot(this.ownerDocument, this);
    return this.shadowRoot;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((listener) => listener !== callback));
  }

  dispatchEvent(event) {
    const normalizedEvent = {
      preventDefault() {},
      stopPropagation() {},
      currentTarget: this,
      target: this,
      ...event,
    };
    const listeners = this.listeners.get(normalizedEvent.type) ?? [];
    for (const listener of listeners) {
      listener(normalizedEvent);
    }
    return true;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
}

class MockShadowRoot {
  constructor(ownerDocument, host) {
    this.ownerDocument = ownerDocument;
    this.host = host;
    this.children = [];
    this.parentNode = host;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    for (const child of children) {
      this.appendChild(child);
    }
  }
}

class MockContainerElement extends MockElement {
  constructor(ownerDocument) {
    super("div", ownerDocument);
    this._elementsById = new Map();
    this._isConnected = true;
  }

  registerElement(id, element) {
    element.id = id;
    element.parentNode = this;
    this.children.push(element);
    this._elementsById.set(id, element);
  }

  querySelector(selector) {
    if (!selector.startsWith("#")) {
      return null;
    }
    return this._elementsById.get(selector.slice(1)) ?? null;
  }
}

class MockCanvasElement extends MockElement {
  constructor(ownerDocument) {
    super("canvas", ownerDocument);
    this.width = 0;
    this.height = 0;
    this.context = new MockRenderingContext2D();
    this.capturedPointerIds = new Set();
  }

  getContext() {
    return this.context;
  }

  setPointerCapture(pointerId) {
    this.capturedPointerIds.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.capturedPointerIds.delete(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this.capturedPointerIds.has(pointerId);
  }
}

class MockRenderingContext2D {
  constructor() {
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.lineWidth = 1;
    this.font = "";
    this.textBaseline = "alphabetic";
    this.textAlign = "left";
  }

  clearRect() {}
  fillRect() {}
  drawImage() {}
  beginPath() {}
  rect() {}
  clip() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  save() {}
  restore() {}
  setTransform() {}
  strokeRect() {}
  fillText() {}
}

class MockClassList {
  constructor() {
    this.values = new Set();
  }

  add(...tokens) {
    for (const token of tokens) {
      this.values.add(token);
    }
  }

  remove(...tokens) {
    for (const token of tokens) {
      this.values.delete(token);
    }
  }

  toggle(token, force = undefined) {
    if (force === true) {
      this.values.add(token);
      return true;
    }
    if (force === false) {
      this.values.delete(token);
      return false;
    }
    if (this.values.has(token)) {
      this.values.delete(token);
      return false;
    }
    this.values.add(token);
    return true;
  }
}

function createMockStyle() {
  return {
    setProperty(name, value) {
      this[name] = value;
    },
    getPropertyValue(name) {
      return this[name] ?? "";
    },
    removeProperty(name) {
      delete this[name];
    },
  };
}
