import assert from "node:assert/strict";
import test from "node:test";

import {
  createScoreViewerController,
  formatSpacingScaleDisplay,
  GAME_DURATION_SLIDER_STEP,
  GAME_DURATION_WHEEL_STEP,
  GAME_LANE_COVER_SLIDER_STEP,
  GAME_LANE_COVER_WHEEL_STEP,
  GAME_LANE_HEIGHT_SLIDER_STEP,
  GAME_LANE_HEIGHT_WHEEL_STEP,
  JUDGE_LINE_DRAG_HIT_MARGIN_PX,
  getJudgeLinePositionRatioFromPointer,
  isJudgeLineHit,
  normalizeWheelDeltaY,
  normalizeSliderSpacingScale,
  roundSpacingScaleToHundredths,
  resolvePointerDragIntent,
  SPACING_STEP,
  SPACING_WHEEL_STEP,
  shouldSyncPlaybackScrollPosition,
} from "./score-viewer-controller.js";
import { createScoreViewerModel } from "./score-viewer-model.js";
import { GRAPH_SURFACE_CSS, OVERLAY_SURFACE_CSS } from "./index.js";

test("normalizeWheelDeltaY keeps pixel deltas unchanged and normalizes line/page modes", () => {
  assert.equal(normalizeWheelDeltaY(24, 0, 480), 24);
  assert.equal(normalizeWheelDeltaY(3, 1, 480), 48);
  assert.equal(normalizeWheelDeltaY(1, 2, 480), 480);
});

test("shouldSyncPlaybackScrollPosition throttles game-mode playback scroll writes only within threshold", () => {
  assert.equal(shouldSyncPlaybackScrollPosition({
    viewerMode: "time",
    isPlaying: true,
    currentScrollTop: 100,
    desiredScrollTop: 160,
    viewportHeight: 400,
  }), true);
  assert.equal(shouldSyncPlaybackScrollPosition({
    viewerMode: "game",
    isPlaying: false,
    currentScrollTop: 100,
    desiredScrollTop: 160,
    viewportHeight: 400,
  }), true);
  assert.equal(shouldSyncPlaybackScrollPosition({
    viewerMode: "game",
    isPlaying: true,
    currentScrollTop: 100,
    desiredScrollTop: 180,
    viewportHeight: 400,
  }), false);
  assert.equal(shouldSyncPlaybackScrollPosition({
    viewerMode: "game",
    isPlaying: true,
    currentScrollTop: 100,
    desiredScrollTop: 280,
    viewportHeight: 400,
  }), true);
});

test("judge line hit testing uses the configured 10px drag band", () => {
  assert.equal(JUDGE_LINE_DRAG_HIT_MARGIN_PX, 10);
  assert.equal(isJudgeLineHit({
    pointerClientY: 205,
    rootTop: 100,
    judgeLineY: 96,
  }), true);
  assert.equal(isJudgeLineHit({
    pointerClientY: 207,
    rootTop: 100,
    judgeLineY: 96,
  }), false);
});

test("pointer drag intent prioritizes the judge line over score scrolling within the hit band", () => {
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: true,
    canDragLaneHeight: true,
    canDragLaneCover: true,
    canDragScroll: true,
    isJudgeLineHit: true,
    isLaneHeightHit: true,
    isLaneCoverHit: true,
  }), "judge-line");
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: true,
    canDragLaneHeight: true,
    canDragLaneCover: true,
    canDragScroll: true,
    isJudgeLineHit: false,
    isLaneHeightHit: true,
    isLaneCoverHit: true,
  }), "lane-height");
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: true,
    canDragLaneHeight: true,
    canDragLaneCover: true,
    canDragScroll: true,
    isJudgeLineHit: false,
    isLaneHeightHit: false,
    isLaneCoverHit: true,
  }), "lane-cover");
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: false,
    canDragLaneHeight: false,
    canDragLaneCover: false,
    canDragScroll: true,
    isJudgeLineHit: false,
    isLaneHeightHit: false,
    isLaneCoverHit: false,
  }), "scroll");
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: true,
    canDragLaneHeight: false,
    canDragLaneCover: false,
    canDragScroll: false,
    isJudgeLineHit: false,
    isLaneHeightHit: false,
    isLaneCoverHit: false,
  }), null);
});

test("judge line pointer ratios clamp to the viewport and default to center for invalid heights", () => {
  assert.equal(getJudgeLinePositionRatioFromPointer({
    pointerClientY: 180,
    rootTop: 100,
    rootHeight: 320,
  }), 0.25);
  assert.equal(getJudgeLinePositionRatioFromPointer({
    pointerClientY: 20,
    rootTop: 100,
    rootHeight: 320,
  }), 0);
  assert.equal(getJudgeLinePositionRatioFromPointer({
    pointerClientY: 500,
    rootTop: 100,
    rootHeight: 320,
  }), 1);
  assert.equal(getJudgeLinePositionRatioFromPointer({
    pointerClientY: 180,
    rootTop: 100,
    rootHeight: 0,
  }), 0.5);
});

test("spacing slider input snaps to 0.05x and wheel adjustments snap to 0.01x", () => {
  assert.equal(SPACING_STEP, 0.05);
  assert.equal(SPACING_WHEEL_STEP, 0.01);
  assert.equal(normalizeSliderSpacingScale(1.02), 1.0);
  assert.equal(normalizeSliderSpacingScale(1.03), 1.05);
  assert.equal(normalizeSliderSpacingScale(0.11), 0.5);
  assert.equal(roundSpacingScaleToHundredths(1.234), 1.23);
  assert.equal(roundSpacingScaleToHundredths(1.235), 1.24);
  assert.equal(roundSpacingScaleToHundredths(9), 8.0);
});

test("spacing display text includes mode-specific units for time and editor", () => {
  assert.equal(formatSpacingScaleDisplay("time", 1.0), "1.00x(160px/s)");
  assert.equal(formatSpacingScaleDisplay("editor", 1.0), "1.00x(64px/beat)");
  assert.equal(formatSpacingScaleDisplay("game", 1.0), "1.00x");
  assert.equal(formatSpacingScaleDisplay("time", 1.25), "1.25x(200px/s)");
  assert.equal(formatSpacingScaleDisplay("editor", 1.5), "1.50x(96px/beat)");
});

test("controller groups spacing and mode controls into a settings panel", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    const statusPanel = findElementByClass(root, "score-viewer-status-panel");
    const settingsPanel = findElementByClass(root, "score-viewer-settings-panel");

    assert.ok(statusPanel);
    assert.ok(settingsPanel);
    assert.equal(statusPanel.children.length, 4);
    assert.ok(findElementByClass(statusPanel, "score-viewer-metrics-row"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-spacing-section"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-game-settings-section"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-mode-section"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-spacing-row"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-spacing-input"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-lane-height-row"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-lane-cover-row"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-lane-cover-visible-row"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-hs-fix-row"));
    assert.ok(findElementByClass(settingsPanel, "score-viewer-mode-row"));

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller adds a gear button next to the playback row for detail settings", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    const playbackRow = findElementByClass(root, "score-viewer-status-row");
    const detailSettingsToggle = findElementByClass(root, "score-viewer-detail-settings-toggle");

    assert.ok(playbackRow);
    assert.ok(detailSettingsToggle);
    assert.equal(detailSettingsToggle.textContent, "⚙");
    assert.equal(detailSettingsToggle["aria-label"], "Open viewer detail settings");
    assert.equal(detailSettingsToggle.parentNode, findElementByClass(root, "score-viewer-status-panel"));

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller renders MODE and INVISIBLE NOTES as labeled side-by-side cells", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    const modeControls = findElementByClass(root, "score-viewer-mode-controls");
    const modeCells = findElementsByClass(root, "score-viewer-mode-cell");
    const invisibleSelect = findElementByClass(root, "score-viewer-invisible-note-select");

    assert.ok(modeControls);
    assert.equal(modeCells.length, 2);
    assert.equal(modeCells[0].children[0]?.textContent, "Mode");
    assert.equal(modeCells[1].children[0]?.textContent, "Invisible Notes");
    assert.ok(invisibleSelect);
    assert.equal(invisibleSelect.children[0]?.textContent, "Hide");
    assert.equal(invisibleSelect.children[1]?.textContent, "Show");

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("embedded CSS hides settings panel until hover or focus-within", () => {
  assert.match(OVERLAY_SURFACE_CSS, /\.bd-graph-settings-group,\s*\.score-viewer-settings-group,\s*\.score-viewer-detail-settings-pair-cell \{[^}]*display: grid;[^}]*gap: 4px;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-settings-panel \{[^}]*max-height: 0;[^}]*opacity: 0;[^}]*pointer-events: none;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-status-panel:hover \.score-viewer-settings-panel,\s*\.score-viewer-status-panel:focus-within \.score-viewer-settings-panel \{[^}]*max-height: 320px;[^}]*opacity: 1;[^}]*pointer-events: auto;/);
});

test("embedded CSS resets each shadow surface from :host and restores border-box sizing", () => {
  assert.match(GRAPH_SURFACE_CSS, /:host \{[^}]*all: initial;/);
  assert.match(GRAPH_SURFACE_CSS, /:host \{[^}]*font-family:[^}]*box-sizing: border-box;/);
  assert.match(OVERLAY_SURFACE_CSS, /:host \{[^}]*all: initial;/);
  assert.match(OVERLAY_SURFACE_CSS, /:host \{[^}]*font-family:[^}]*box-sizing: border-box;/);
  assert.match(OVERLAY_SURFACE_CSS, /:host,\s*:host \*,\s*:host \*::before,\s*:host \*::after,\s*\.bmsie-surface-root,\s*\.bmsie-surface-root \*,\s*\.bmsie-surface-root \*::before,\s*\.bmsie-surface-root \*::after \{[^}]*box-sizing: border-box;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-surface-root \{[^}]*all: initial;[^}]*display: block;[^}]*font-family:[^}]*font-size:[^}]*line-height:[^}]*box-sizing: border-box;/);
});

test("embedded CSS restores sizing and inherited typography for isolated UI primitives", () => {
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-ui-button \{[^}]*all: unset;[^}]*box-sizing: border-box;[^}]*display: inline-flex;[^}]*min-inline-size: 0;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-ui-button \{[^}]*color: inherit;[^}]*font: inherit;[^}]*line-height: inherit;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-ui-input,\s*\.bmsie-ui-select \{[^}]*all: unset;[^}]*box-sizing: border-box;[^}]*display: block;[^}]*inline-size: 100%;[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-ui-input,\s*\.bmsie-ui-select \{[^}]*color: inherit;[^}]*font: inherit;[^}]*line-height: inherit;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-ui-checkbox \{[^}]*all: unset;[^}]*box-sizing: border-box;[^}]*display: inline-block;[^}]*min-inline-size: 14px;[^}]*min-block-size: 14px;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-ui-checkbox \{[^}]*color: inherit;[^}]*font: inherit;[^}]*line-height: inherit;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-ui-range \{[^}]*all: unset;[^}]*box-sizing: border-box;[^}]*display: block;[^}]*inline-size: 100%;[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.bmsie-ui-range \{[^}]*color: inherit;[^}]*font: inherit;[^}]*line-height: inherit;/);
});

test("embedded CSS keeps detail inputs and graph settings selects constrained to their grid cells", () => {
  assert.match(OVERLAY_SURFACE_CSS, /\.bd-graph-settings-select,\s*\.score-viewer-mode-select,\s*\.score-viewer-detail-settings-input \{[^}]*inline-size: 100%;[^}]*min-inline-size: 0;[^}]*max-inline-size: 100%;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-detail-settings-pair-row \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*gap: 8px;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-mode-controls \{[^}]*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\);[^}]*gap: 6px;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-mode-cell \{[^}]*display: grid;[^}]*min-width: 0;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-detail-settings-popup \{[^}]*width: min\(240px, calc\(100vw - 24px\)\);[^}]*min-width: 0;[^}]*max-width: calc\(100vw - 24px\);/);
});

test("embedded CSS pins the gear button to the top-right corner of the status panel", () => {
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-status-panel \{[^}]*position: relative;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-status-row\.is-time \{[^}]*padding-right: 24px;/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-detail-settings-toggle \{[^}]*position: absolute;[^}]*top: 8px;[^}]*right: 10px;/);
});

test("embedded CSS anchors the judge line by its bottom edge with a fixed thickness", () => {
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-judge-line \{[^}]*top: var\(--score-viewer-judge-line-top, calc\(var\(--score-viewer-judge-line-ratio, 0\.5\) \* 100%\)\);[^}]*transform: translateY\(-100%\);/);
  assert.match(OVERLAY_SURFACE_CSS, /\.score-viewer-judge-line::after \{[^}]*height: 2px;/);
});

test("controller blurs focused settings controls on status panel mouseleave", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    const statusPanel = findElementByClass(root, "score-viewer-status-panel");
    const spacingInput = findElementByClass(root, "score-viewer-spacing-input");

    spacingInput.focus();
    assert.equal(environment.document.activeElement, spacingInput);

    dispatchEvent(statusPanel, "mouseleave");

    assert.equal(environment.document.activeElement, null);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller blurs shadow-root focused settings controls on status panel mouseleave", () => {
  const environment = installControllerTestEnvironment();
  try {
    const shadowHost = environment.document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;
    shadowRoot.appendChild(root);

    const controller = createScoreViewerController({ root });
    const statusPanel = findElementByClass(root, "score-viewer-status-panel");
    const spacingInput = findElementByClass(root, "score-viewer-spacing-input");

    assert.ok(statusPanel);
    assert.ok(spacingInput);

    spacingInput.focus();

    assert.equal(shadowRoot.activeElement, spacingInput);
    assert.equal(environment.document.activeElement, shadowHost);

    dispatchEvent(statusPanel, "mouseleave");

    assert.equal(shadowRoot.activeElement, null);
    assert.equal(environment.document.activeElement, null);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller exposes game-mode controls with the requested steps and without HS-FIX OFF", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);
    controller.setViewerMode("game");
    controller.setGameTimingConfig({
      durationMs: 500,
      laneHeightPercent: 12.5,
      laneCoverPermille: 350,
      laneCoverVisible: false,
      hsFixMode: "max",
    });

    const spacingInput = findElementByClass(root, "score-viewer-spacing-input");
    const laneHeightInput = findElementByClass(root, "score-viewer-lane-height-input");
    const laneCoverInput = findElementByClass(root, "score-viewer-lane-cover-input");
    const laneCoverVisibleInput = findElementByClass(root, "score-viewer-checkbox-input");
    const hsFixSelect = findElementByClass(root, "score-viewer-hs-fix-select");
    const spacingPrimary = findElementByClass(root, "score-viewer-spacing-value-primary");
    const spacingSecondary = findElementByClass(root, "score-viewer-spacing-value-secondary");
    const laneHeightRow = findElementByClass(root, "score-viewer-lane-height-row");
    const laneCoverRow = findElementByClass(root, "score-viewer-lane-cover-row");

    assert.equal(GAME_DURATION_SLIDER_STEP, 10);
    assert.equal(GAME_DURATION_WHEEL_STEP, 1);
    assert.equal(GAME_LANE_HEIGHT_SLIDER_STEP, 1);
    assert.equal(GAME_LANE_HEIGHT_WHEEL_STEP, 0.1);
    assert.equal(GAME_LANE_COVER_SLIDER_STEP, 10);
    assert.equal(GAME_LANE_COVER_WHEEL_STEP, 1);
    assert.equal(spacingInput.min, "1");
    assert.equal(spacingInput.max, "5000");
    assert.equal(spacingInput.step, "10");
    assert.equal(laneHeightInput.step, "1");
    assert.equal(laneCoverInput.step, "10");
    assert.equal(laneCoverVisibleInput.checked, false);
    assert.equal(hsFixSelect.value, "max");
    assert.equal(hsFixSelect.children.some((option) => option.value === "off"), false);
    assert.equal(spacingPrimary.textContent, "500ms");
    assert.equal(spacingSecondary.textContent, "(300)");
    assert.match(laneHeightRow.children[1].textContent, /12\.5%\(/);
    assert.match(laneCoverRow.children[1].textContent, /350\(35\.0%\)/);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller shows spacing text for time and editor while keeping secondary text game-only", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);

    const spacingPrimary = findElementByClass(root, "score-viewer-spacing-value-primary");
    const spacingSecondary = findElementByClass(root, "score-viewer-spacing-value-secondary");

    assert.equal(spacingPrimary.textContent, "1.00x(160px/s)");
    assert.equal(spacingSecondary.textContent, "");
    assert.equal(spacingSecondary.style.display, "none");

    controller.setViewerMode("editor");

    assert.equal(spacingPrimary.textContent, "1.00x(64px/beat)");
    assert.equal(spacingSecondary.textContent, "");
    assert.equal(spacingSecondary.style.display, "none");

    controller.setViewerMode("game");

    assert.equal(spacingPrimary.textContent, "500ms");
    assert.equal(spacingSecondary.textContent, "(300)");
    assert.equal(spacingSecondary.style.display, "inline");

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller hides the game settings section outside game mode", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);
    controller.setViewerMode("time");

    const gameSettingsSection = findElementByClass(root, "score-viewer-game-settings-section");

    assert.equal(gameSettingsSection.hidden, true);

    controller.setViewerMode("editor");

    assert.equal(gameSettingsSection.hidden, true);

    controller.setViewerMode("game");

    assert.equal(gameSettingsSection.hidden, false);

    controller.setViewerMode("lunatic");

    assert.equal(gameSettingsSection.hidden, false);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller exposes Lunatic as a game-style viewer mode option", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);
    controller.setViewerMode("lunatic");

    const modeSelect = findElementByPredicate(root, (element) => (
      String(element.className ?? "").includes("score-viewer-mode-select")
      && element.children.some((option) => option.value === "lunatic")
    ));
    const spacingPrimary = findElementByClass(root, "score-viewer-spacing-value-primary");

    assert.equal(modeSelect.children.some((option) => option.value === "lunatic"), true);
    assert.equal(modeSelect.value, "lunatic");
    assert.equal(spacingPrimary.textContent, "500ms");

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller avoids rewriting chrome-only styles during selection-only updates", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);
    controller.setViewerMode("game");
    controller.setGameTimingConfig({
      durationMs: 500,
      laneHeightPercent: 12.5,
      laneCoverPermille: 350,
      laneCoverVisible: true,
      hsFixMode: "max",
    });

    const spacingSecondary = findElementByClass(root, "score-viewer-spacing-value-secondary");
    const gameSettingsSection = findElementByClass(root, "score-viewer-game-settings-section");
    const judgeLineTopWrites = root.style.getPropertySetCount("--score-viewer-judge-line-top");
    const spacingDisplayWrites = spacingSecondary.style.getDirectSetCount("display");
    const spacingColorWrites = spacingSecondary.style.getDirectSetCount("color");
    const gameSettingsDisplayWrites = gameSettingsSection.style.getDirectSetCount("display");

    controller.setSelectedTimeSec(0.75);
    controller.setSelectedTimeSec(1.25);

    assert.equal(root.style.getPropertySetCount("--score-viewer-judge-line-top"), judgeLineTopWrites);
    assert.equal(spacingSecondary.style.getDirectSetCount("display"), spacingDisplayWrites);
    assert.equal(spacingSecondary.style.getDirectSetCount("color"), spacingColorWrites);
    assert.equal(gameSettingsSection.style.getDirectSetCount("display"), gameSettingsDisplayWrites);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller toggles playback by double-clicking the viewer area", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const playbackToggleCalls = [];
    const controller = createScoreViewerController({
      root,
      onPlaybackToggle: (nextPlaying) => {
        playbackToggleCalls.push(nextPlaying);
      },
    });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);

    const scrollHost = findElementByClass(root, "score-viewer-scroll-host");

    dispatchEvent(scrollHost, "dblclick");

    assert.deepEqual(playbackToggleCalls, [true]);

    controller.setPlaybackState(true);
    dispatchEvent(scrollHost, "dblclick");

    assert.deepEqual(playbackToggleCalls, [true, false]);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller ignores viewer double-click when closed or unloaded", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const playbackToggleCalls = [];
    const controller = createScoreViewerController({
      root,
      onPlaybackToggle: (nextPlaying) => {
        playbackToggleCalls.push(nextPlaying);
      },
    });

    const scrollHost = findElementByClass(root, "score-viewer-scroll-host");

    dispatchEvent(scrollHost, "dblclick");

    controller.setModel(createControllerTestModel());
    dispatchEvent(scrollHost, "dblclick");

    assert.deepEqual(playbackToggleCalls, []);

    controller.setOpen(true);
    dispatchEvent(scrollHost, "dblclick");

    assert.deepEqual(playbackToggleCalls, [true]);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller does not toggle playback from playback button double-click or during drag", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const playbackToggleCalls = [];
    const controller = createScoreViewerController({
      root,
      onPlaybackToggle: (nextPlaying) => {
        playbackToggleCalls.push(nextPlaying);
      },
    });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);
    controller.setViewerMode("game");

    const scrollHost = findElementByClass(root, "score-viewer-scroll-host");
    const playbackButton = findElementByClass(root, "score-viewer-playback-button");

    dispatchEvent(playbackButton, "dblclick");
    assert.deepEqual(playbackToggleCalls, []);

    dispatchPointerEvent(scrollHost, "pointerdown", {
      pointerId: 21,
      clientY: 360,
    });
    dispatchEvent(scrollHost, "dblclick");
    dispatchPointerEvent(scrollHost, "pointerup", {
      pointerId: 21,
      clientY: 360,
    });

    assert.deepEqual(playbackToggleCalls, []);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller shows game drag handles only in game mode and hides cover handle when cover is invisible", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);

    const laneHeightHandle = findElementByClass(root, "score-viewer-lane-height-handle");
    const laneCoverHandle = findElementByClass(root, "score-viewer-lane-cover-handle");

    assert.equal(laneHeightHandle.hidden, true);
    assert.equal(laneCoverHandle.hidden, true);

    controller.setViewerMode("game");

    assert.equal(laneHeightHandle.hidden, false);
    assert.equal(laneCoverHandle.hidden, false);

    controller.setGameTimingConfig({ laneCoverVisible: false });

    assert.equal(laneHeightHandle.hidden, false);
    assert.equal(laneCoverHandle.hidden, true);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller applies resize cursor classes on hover before dragging", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const controller = createScoreViewerController({ root });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);
    controller.setViewerMode("game");
    controller.setGameTimingConfig({
      laneHeightPercent: 20,
      laneCoverPermille: 250,
      laneCoverVisible: true,
    });

    const scrollHost = findElementByClass(root, "score-viewer-scroll-host");

    dispatchPointerEvent(scrollHost, "pointermove", {
      pointerId: 10,
      button: -1,
      clientY: 144,
    });

    assert.equal(root.classList.contains("is-drag-handle-hovered"), true);

    dispatchPointerEvent(scrollHost, "pointerleave", {
      pointerId: 10,
    });

    assert.equal(root.classList.contains("is-drag-handle-hovered"), false);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller updates lane height and lane cover by pointer drag in game mode", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const gameTimingConfigChanges = [];
    const controller = createScoreViewerController({
      root,
      onGameTimingConfigChange: (config) => {
        gameTimingConfigChanges.push(config);
      },
    });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);
    controller.setViewerMode("game");
    controller.setGameTimingConfig({
      durationMs: 500,
      laneHeightPercent: 20,
      laneCoverPermille: 250,
      laneCoverVisible: true,
      hsFixMode: "main",
    });

    const scrollHost = findElementByClass(root, "score-viewer-scroll-host");
    const laneHeightHandle = findElementByClass(root, "score-viewer-lane-height-handle");
    const laneCoverHandle = findElementByClass(root, "score-viewer-lane-cover-handle");

    dispatchPointerEvent(scrollHost, "pointerdown", {
      pointerId: 1,
      clientY: 144,
    });
    dispatchPointerEvent(scrollHost, "pointermove", {
      pointerId: 1,
      clientY: 288,
    });
    dispatchPointerEvent(scrollHost, "pointerup", {
      pointerId: 1,
      clientY: 288,
    });

    assert.equal(gameTimingConfigChanges.at(-1)?.laneHeightPercent, 40);
    assert.equal(laneHeightHandle.style.top, "288px");

    dispatchPointerEvent(scrollHost, "pointerdown", {
      pointerId: 2,
      clientY: 342,
    });
    dispatchPointerEvent(scrollHost, "pointermove", {
      pointerId: 2,
      clientY: 450,
    });
    dispatchPointerEvent(scrollHost, "pointerup", {
      pointerId: 2,
      clientY: 450,
    });

    assert.equal(gameTimingConfigChanges.at(-1)?.laneCoverPermille, 750);
    assert.equal(laneCoverHandle.style.top, "450px");

    controller.destroy();
  } finally {
    environment.restore();
  }
});

test("controller does not allow lane-cover drag when cover is hidden", () => {
  const environment = installControllerTestEnvironment();
  try {
    const root = environment.document.createElement("div");
    root.clientWidth = 520;
    root.clientHeight = 720;

    const gameTimingConfigChanges = [];
    const controller = createScoreViewerController({
      root,
      onGameTimingConfigChange: (config) => {
        gameTimingConfigChanges.push(config);
      },
    });
    controller.setModel(createControllerTestModel());
    controller.setOpen(true);
    controller.setViewerMode("game");
    controller.setGameTimingConfig({
      laneHeightPercent: 20,
      laneCoverPermille: 250,
      laneCoverVisible: false,
    });

    const scrollHost = findElementByClass(root, "score-viewer-scroll-host");

    dispatchPointerEvent(scrollHost, "pointerdown", {
      pointerId: 3,
      clientY: 342,
    });
    dispatchPointerEvent(scrollHost, "pointermove", {
      pointerId: 3,
      clientY: 450,
    });
    dispatchPointerEvent(scrollHost, "pointerup", {
      pointerId: 3,
      clientY: 450,
    });

    assert.equal(gameTimingConfigChanges.some((config) => config.laneCoverPermille !== 250), false);

    controller.destroy();
  } finally {
    environment.restore();
  }
});

function installControllerTestEnvironment() {
  const previousGlobals = {
    document: globalThis.document,
    window: globalThis.window,
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const documentRef = new ControllerMockDocument();

  globalThis.document = documentRef;
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };

  return {
    document: documentRef,
    restore() {
      globalThis.document = previousGlobals.document;
      globalThis.window = previousGlobals.window;
      globalThis.ResizeObserver = previousGlobals.ResizeObserver;
      globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
    },
  };
}

function findElementByClass(root, className) {
  if (!root) {
    return null;
  }
  const classNames = String(root.className ?? "").split(/\s+/).filter(Boolean);
  if (root.classList?.contains(className) || classNames.includes(className)) {
    return root;
  }
  for (const child of root.children ?? []) {
    const match = findElementByClass(child, className);
    if (match) {
      return match;
    }
  }
  return null;
}

function findElementsByClass(root, className, results = []) {
  if (!root) {
    return results;
  }
  const classNames = String(root.className ?? "").split(/\s+/).filter(Boolean);
  if (root.classList?.contains(className) || classNames.includes(className)) {
    results.push(root);
  }
  for (const child of root.children ?? []) {
    findElementsByClass(child, className, results);
  }
  return results;
}

function findElementByPredicate(root, predicate) {
  if (!root) {
    return null;
  }
  if (predicate(root)) {
    return root;
  }
  for (const child of root.children ?? []) {
    const match = findElementByPredicate(child, predicate);
    if (match) {
      return match;
    }
  }
  return null;
}

function dispatchPointerEvent(element, type, overrides = {}) {
  dispatchEvent(element, type, {
    button: 0,
    pointerType: "mouse",
    ...overrides,
  });
}

function dispatchEvent(element, type, overrides = {}) {
  const listeners = element.listeners.get(type) ?? [];
  const event = {
    preventDefault() {},
    stopPropagation() {},
    target: element,
    currentTarget: element,
    ...overrides,
  };
  for (const listener of listeners) {
    listener(event);
  }
}

function createControllerTestModel() {
  return createScoreViewerModel({
    format: "bms",
    mode: "7k",
    laneCount: 8,
    initialBpm: 150,
    notes: [{ lane: 1, beat: 4, timeSec: 1, kind: "normal" }],
    barLines: [{ beat: 0, timeSec: 0 }, { beat: 4, timeSec: 1 }, { beat: 8, timeSec: 2 }],
    bpmChanges: [],
    stops: [],
    scrollChanges: [],
    comboEvents: [{ lane: 1, beat: 4, timeSec: 1, kind: "normal" }],
    timingActions: [],
    totalDurationSec: 4,
    lastTimelineTimeSec: 4,
    lastPlayableTimeSec: 4,
  });
}

class ControllerMockDocument {
  constructor() {
    this.activeElement = null;
  }

  createElement(tagName) {
    if (tagName === "canvas") {
      return new ControllerMockCanvasElement(this);
    }
    return new ControllerMockElement(tagName, this);
  }
}

class ControllerMockElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.style = createControllerMockStyle();
    this.classList = new ControllerMockClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.clientWidth = 640;
    this.clientHeight = 360;
    this.scrollTop = 0;
    this._pointerCaptures = new Set();
    this.shadowRoot = null;
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

  removeEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((listener) => listener !== callback));
  }

  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this[name] = String(value);
  }

  attachShadow() {
    const shadowRoot = new ControllerMockShadowRoot(this.ownerDocument, this);
    this.shadowRoot = shadowRoot;
    return shadowRoot;
  }

  getRootNode() {
    if (this.parentNode && typeof this.parentNode.getRootNode === "function") {
      return this.parentNode.getRootNode();
    }
    return this.ownerDocument;
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, height: this.clientHeight, width: this.clientWidth };
  }

  setPointerCapture(pointerId) {
    this._pointerCaptures.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this._pointerCaptures.delete(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this._pointerCaptures.has(pointerId);
  }

  focus() {
    const rootNode = this.getRootNode();
    if (rootNode?.activeElement === this) {
      return;
    }
    const previousActiveElement = rootNode?.activeElement ?? this.ownerDocument.activeElement;
    if (previousActiveElement && typeof previousActiveElement.blur === "function") {
      previousActiveElement.blur();
    }
    if (rootNode && "activeElement" in rootNode) {
      rootNode.activeElement = this;
    }
    this.ownerDocument.activeElement = rootNode?.host ?? this;
  }

  blur() {
    const rootNode = this.getRootNode();
    if (rootNode?.activeElement === this) {
      rootNode.activeElement = null;
    }
    if (this.ownerDocument.activeElement === this || this.ownerDocument.activeElement === rootNode?.host) {
      this.ownerDocument.activeElement = null;
    }
  }
}

class ControllerMockShadowRoot {
  constructor(ownerDocument, host) {
    this.ownerDocument = ownerDocument;
    this.host = host;
    this.children = [];
    this.activeElement = null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  getRootNode() {
    return this;
  }
}

class ControllerMockCanvasElement extends ControllerMockElement {
  constructor(ownerDocument) {
    super("canvas", ownerDocument);
    this.width = 0;
    this.height = 0;
  }

  getContext() {
    return {
      setTransform() {},
      clearRect() {},
      fillRect() {},
      save() {},
      restore() {},
      beginPath() {},
      rect() {},
      clip() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fillText() {},
      strokeRect() {},
      drawImage() {},
    };
  }
}

class ControllerMockClassList {
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
    if (force === undefined) {
      if (this.values.has(token)) {
        this.values.delete(token);
        return false;
      }
      this.values.add(token);
      return true;
    }
    if (force) {
      this.values.add(token);
      return true;
    }
    this.values.delete(token);
    return false;
  }

  contains(token) {
    return this.values.has(token);
  }
}

function createControllerMockStyle() {
  const values = Object.create(null);
  const directSetCounts = new Map();
  const propertySetCounts = new Map();
  return new Proxy({
    setProperty(name, value) {
      propertySetCounts.set(name, (propertySetCounts.get(name) ?? 0) + 1);
      values[name] = String(value);
    },
    removeProperty(name) {
      delete values[name];
    },
    getDirectSetCount(name) {
      return directSetCounts.get(name) ?? 0;
    },
    getPropertySetCount(name) {
      return propertySetCounts.get(name) ?? 0;
    },
  }, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      return values[property];
    },
    set(_target, property, value) {
      directSetCounts.set(property, (directSetCounts.get(property) ?? 0) + 1);
      values[property] = value;
      return true;
    },
    deleteProperty(_target, property) {
      delete values[property];
      return true;
    },
  });
}
