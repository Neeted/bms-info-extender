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
import { BMSDATA_CSS } from "./index.js";

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
    canDragScroll: true,
    isJudgeLineHit: true,
  }), "judge-line");
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: false,
    canDragScroll: true,
    isJudgeLineHit: false,
  }), "scroll");
  assert.equal(resolvePointerDragIntent({
    canDragJudgeLine: true,
    canDragScroll: false,
    isJudgeLineHit: false,
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
    assert.equal(statusPanel.children.length, 3);
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

test("embedded CSS hides settings panel until hover or focus-within", () => {
  assert.match(BMSDATA_CSS, /\.score-viewer-settings-group \{[^}]*display: grid;[^}]*gap: 4px;/);
  assert.match(BMSDATA_CSS, /\.score-viewer-settings-panel \{[^}]*max-height: 0;[^}]*opacity: 0;[^}]*pointer-events: none;/);
  assert.match(BMSDATA_CSS, /\.score-viewer-status-panel:hover \.score-viewer-settings-panel, \.score-viewer-status-panel:focus-within \.score-viewer-settings-panel \{[^}]*max-height: 320px;[^}]*opacity: 1;[^}]*pointer-events: auto;/);
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

  getBoundingClientRect() {
    return { top: 0, left: 0, height: this.clientHeight, width: this.clientWidth };
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
