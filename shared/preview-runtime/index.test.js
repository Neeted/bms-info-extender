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
  GAME_DURATION_MS_STORAGE_KEY,
  GAME_HS_FIX_MODE_STORAGE_KEY,
  GAME_LANE_COVER_PERMILLE_STORAGE_KEY,
  GAME_LANE_COVER_VISIBLE_STORAGE_KEY,
  GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY,
  INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY,
  JUDGE_LINE_POSITION_RATIO_STORAGE_KEY,
  SPACING_SCALE_STORAGE_KEYS,
  VIEWER_MODE_STORAGE_KEY,
  expandPreviewRenderMask,
  getInitialSpacingScale,
  getInitialSpacingScaleByMode,
  getInitialViewerMode,
  getInitialInvisibleNoteVisibility,
  getInitialJudgeLinePositionRatio,
  getInitialGameTimingConfig,
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

  preferences.setPersistedViewerMode("game");
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

  assert.equal(store.get(VIEWER_MODE_STORAGE_KEY), "game");
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
  assert.equal(preferences.getPersistedViewerMode(), "game");
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

  store.set(JUDGE_LINE_POSITION_RATIO_STORAGE_KEY, "invalid");
  store.set(SPACING_SCALE_STORAGE_KEYS.editor, "invalid");
  store.set(GAME_DURATION_MS_STORAGE_KEY, "invalid");
  store.set(GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY, "invalid");
  store.set(GAME_LANE_COVER_PERMILLE_STORAGE_KEY, "invalid");
  store.set(GAME_LANE_COVER_VISIBLE_STORAGE_KEY, "invalid");
  store.set(GAME_HS_FIX_MODE_STORAGE_KEY, "invalid");
  assert.equal(preferences.getPersistedJudgeLinePositionRatio(), 0.5);
  assert.equal(preferences.getPersistedSpacingScale("editor"), 1.0);
  assert.equal(preferences.getPersistedGameDurationMs(), 500);
  assert.equal(preferences.getPersistedGameLaneHeightPercent(), 0);
  assert.equal(preferences.getPersistedGameLaneCoverPermille(), 0);
  assert.equal(preferences.getPersistedGameLaneCoverVisible(), true);
  assert.equal(preferences.getPersistedGameHsFixMode(), "main");
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
} = {}) {
  const elements = createPreviewContainerElements(documentRef);
  const preview = createBmsInfoPreview({
    container: elements.container,
    documentRef,
    prefetchParsedScore,
    loadParsedScore,
  });
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
    "bd-scoreviewer-pin-input",
    "bd-graph-tooltip",
    "bd-graph-canvas",
  ];
  for (const id of ids) {
    let element;
    if (id === "bd-graph-canvas") {
      element = new MockCanvasElement(documentRef);
      element.width = 640;
      element.height = 180;
    } else {
      element = documentRef.createElement(id === "bd-scoreviewer-pin-input" ? "input" : "div");
    }
    element.id = id;
    container.registerElement(id, element);
  }
  container.querySelector("#bd-graph").clientWidth = 320;
  container.querySelector("#bd-graph").clientHeight = 180;
  container.querySelector("#bd-graph").scrollWidth = 900;
  container.querySelector("#bd-graph-canvas").getBoundingClientRect = () => ({ left: 0, top: 0 });
  return {
    container,
    graphCanvas: container.querySelector("#bd-graph-canvas"),
    pinInput: container.querySelector("#bd-scoreviewer-pin-input"),
  };
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

class MockContainerElement extends MockElement {
  constructor(ownerDocument) {
    super("div", ownerDocument);
    this._elementsById = new Map();
    this._isConnected = true;
  }

  registerElement(id, element) {
    element.id = id;
    element.parentNode = this;
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
  }

  getContext() {
    return this.context;
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
