import assert from "node:assert/strict";
import test from "node:test";

import { createBmsInfoGraph, getGraphFollowScrollLeft } from "./bms-info-graph.js";

test("graph follow scroll keeps the current position while the cursor stays inside the safe band", () => {
  assert.equal(getGraphFollowScrollLeft({
    targetX: 120,
    currentScrollLeft: 0,
    clientWidth: 400,
    scrollWidth: 1200,
  }), 0);
  assert.equal(getGraphFollowScrollLeft({
    targetX: 360,
    currentScrollLeft: 0,
    clientWidth: 400,
    scrollWidth: 1200,
  }), 160);
});

test("graph reuses the static layer when only the selected cursor changes", () => {
  const { canvas, context, staticContexts } = createGraphCanvas();
  const scrollHost = { scrollLeft: 0, clientWidth: 320, scrollWidth: 900 };
  const tooltip = { style: {}, innerHTML: "" };
  const pinInput = createEventTarget();
  const graph = createBmsInfoGraph({
    scrollHost,
    canvas,
    tooltip,
    pinInput,
  });

  const record = {
    distributionSegments: [
      [1, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0],
    ],
    peakdensity: 12,
    speedChangePoints: [[120, 0], [240, 2000]],
    mainbpm: 120,
    minbpm: 120,
    maxbpm: 240,
  };

  graph.setRecord(record);
  const staticFillRectCountAfterRecord = staticContexts[0].fillRectCalls.length;
  const drawImageCountAfterRecord = context.drawImageCalls.length;

  graph.setSelectedTimeSec(2.5);

  assert.equal(staticContexts[0].fillRectCalls.length, staticFillRectCountAfterRecord);
  assert.equal(context.drawImageCalls.length, drawImageCountAfterRecord + 1);
});

test("graph hover updates the tooltip without changing the selected time", () => {
  const { canvas } = createGraphCanvas();
  const hoverTimes = [];
  const selectedTimes = [];
  const graph = createBmsInfoGraph({
    scrollHost: { scrollLeft: 0, clientWidth: 320, scrollWidth: 900 },
    canvas,
    tooltip: { style: {}, innerHTML: "" },
    pinInput: createEventTarget(),
    onHoverTime: (timeSec) => {
      hoverTimes.push(timeSec);
    },
    onSelectTime: (timeSec) => {
      selectedTimes.push(timeSec);
    },
  });

  graph.setRecord(createRecord());
  graph.setSelectedTimeSec(2);

  canvas.dispatchEvent({ type: "mousemove", clientX: 20, clientY: 10 });

  assert.deepEqual(hoverTimes, [4]);
  assert.deepEqual(selectedTimes, []);
});

test("graph click updates the selected time", () => {
  const { canvas } = createGraphCanvas();
  const selectedTimes = [];
  const graph = createBmsInfoGraph({
    scrollHost: { scrollLeft: 0, clientWidth: 320, scrollWidth: 900 },
    canvas,
    tooltip: { style: {}, innerHTML: "" },
    pinInput: createEventTarget(),
    onSelectTime: (timeSec) => {
      selectedTimes.push(timeSec);
    },
  });

  graph.setRecord(createRecord());
  canvas.dispatchEvent({ type: "click", clientX: 35, clientY: 10 });

  assert.deepEqual(selectedTimes, [7]);
});

test("graph drags the selected line when the pointer starts near it", () => {
  const { canvas } = createGraphCanvas();
  const selectedTimes = [];
  const graph = createBmsInfoGraph({
    scrollHost: { scrollLeft: 0, clientWidth: 320, scrollWidth: 900 },
    canvas,
    tooltip: { style: {}, innerHTML: "" },
    pinInput: createEventTarget(),
    onSelectTime: (timeSec) => {
      selectedTimes.push(timeSec);
    },
  });

  graph.setRecord(createRecord());
  graph.setSelectedTimeSec(2);

  canvas.dispatchEvent({ type: "pointerdown", pointerId: 1, button: 0, clientX: 10, clientY: 10 });
  canvas.dispatchEvent({ type: "pointermove", pointerId: 1, clientX: 26, clientY: 10 });
  canvas.dispatchEvent({ type: "pointerup", pointerId: 1, clientX: 26, clientY: 10 });

  assert.equal(selectedTimes.length, 2);
  assert.ok(Math.abs(selectedTimes[0] - 2) < 0.000001);
  assert.ok(Math.abs(selectedTimes[1] - 5.2) < 0.000001);
  assert.equal(canvas.style.cursor, "");
});

test("graph ignores pointer drags that do not start near the selected line", () => {
  const { canvas } = createGraphCanvas();
  const selectedTimes = [];
  const graph = createBmsInfoGraph({
    scrollHost: { scrollLeft: 0, clientWidth: 320, scrollWidth: 900 },
    canvas,
    tooltip: { style: {}, innerHTML: "" },
    pinInput: createEventTarget(),
    onSelectTime: (timeSec) => {
      selectedTimes.push(timeSec);
    },
  });

  graph.setRecord(createRecord());
  graph.setSelectedTimeSec(2);

  canvas.dispatchEvent({ type: "pointerdown", pointerId: 1, button: 0, clientX: 60, clientY: 10 });
  canvas.dispatchEvent({ type: "pointermove", pointerId: 1, clientX: 80, clientY: 10 });
  canvas.dispatchEvent({ type: "pointerup", pointerId: 1, clientX: 80, clientY: 10 });

  assert.deepEqual(selectedTimes, []);
});

test("graph clears drag state on pointercancel", () => {
  const { canvas } = createGraphCanvas();
  const selectedTimes = [];
  const graph = createBmsInfoGraph({
    scrollHost: { scrollLeft: 0, clientWidth: 320, scrollWidth: 900 },
    canvas,
    tooltip: { style: {}, innerHTML: "" },
    pinInput: createEventTarget(),
    onSelectTime: (timeSec) => {
      selectedTimes.push(timeSec);
    },
  });

  graph.setRecord(createRecord());
  graph.setSelectedTimeSec(2);

  canvas.dispatchEvent({ type: "pointerdown", pointerId: 1, button: 0, clientX: 10, clientY: 10 });
  canvas.dispatchEvent({ type: "pointercancel", pointerId: 1, clientX: 10, clientY: 10 });
  canvas.dispatchEvent({ type: "pointermove", pointerId: 1, clientX: 31, clientY: 10 });
  canvas.dispatchEvent({ type: "mousemove", clientX: 80, clientY: 10 });

  assert.equal(selectedTimes.length, 1);
  assert.ok(Math.abs(selectedTimes[0] - 2) < 0.000001);
  assert.equal(canvas.style.cursor, "");
});

test("graph skips duplicate BPM transition lines when the same x region is already painted", () => {
  const { staticContexts } = createGraphWithRecord({
    distributionSegments: Array.from({ length: 4 }, () => [0, 0, 0, 0, 0, 0, 0]),
    peakdensity: 12,
    speedChangePoints: [
      [120, 0],
      [240, 2000],
      [180, 2000],
      [240, 2000],
      [90, 3000],
    ],
    mainbpm: 120,
    minbpm: 90,
    maxbpm: 240,
  });

  const verticalTransitionStrokes = getVerticalTransitionStrokes(staticContexts[0]);

  assert.equal(verticalTransitionStrokes.filter(({ path }) => path[0].x === 11).length, 1);
});

test("graph keeps BPM transition lines when they share x but occupy different y ranges", () => {
  const { staticContexts } = createGraphWithRecord({
    distributionSegments: Array.from({ length: 4 }, () => [0, 0, 0, 0, 0, 0, 0]),
    peakdensity: 12,
    speedChangePoints: [
      [120, 0],
      [180, 2000],
      [240, 2000],
      [240, 3000],
    ],
    mainbpm: 120,
    minbpm: 120,
    maxbpm: 240,
  });

  const sameXStrokes = getVerticalTransitionStrokes(staticContexts[0]).filter(({ path }) => path[0].x === 11);
  const yPairs = sameXStrokes.map(({ path }) => [path[0].y, path[1].y]);

  assert.equal(sameXStrokes.length, 2);
  assert.notDeepEqual(yPairs[0], yPairs[1]);
});

test("graph keeps BPM transition lines for distinct x regions", () => {
  const { staticContexts } = createGraphWithRecord({
    distributionSegments: Array.from({ length: 5 }, () => [0, 0, 0, 0, 0, 0, 0]),
    peakdensity: 12,
    speedChangePoints: [
      [120, 0],
      [240, 1000],
      [180, 2000],
      [90, 3000],
    ],
    mainbpm: 120,
    minbpm: 90,
    maxbpm: 240,
  });

  const verticalTransitionStrokes = getVerticalTransitionStrokes(staticContexts[0]);

  assert.equal(verticalTransitionStrokes.length, 3);
  assert.deepEqual(verticalTransitionStrokes.map(({ path }) => path[0].x), [6, 11, 16]);
});

function createGraphWithRecord(record) {
  const graphCanvas = createGraphCanvas();
  const graph = createBmsInfoGraph({
    scrollHost: { scrollLeft: 0, clientWidth: 320, scrollWidth: 900 },
    canvas: graphCanvas.canvas,
    tooltip: { style: {}, innerHTML: "" },
    pinInput: createEventTarget(),
  });
  graph.setRecord(record);
  return graphCanvas;
}

function createRecord() {
  return {
    distributionSegments: Array.from({ length: 8 }, () => [0, 0, 0, 0, 0, 0, 0]),
    peakdensity: 12,
    speedChangePoints: [[120, 0]],
    mainbpm: 120,
    minbpm: 120,
    maxbpm: 120,
  };
}

function getVerticalTransitionStrokes(context) {
  return context.strokeCalls.filter(({ strokeStyle, path, lineWidth }) => (
    strokeStyle === "rgba(127, 127, 127, 0.5)"
    && lineWidth === 2
    && path.length === 2
    && path[0].type === "moveTo"
    && path[1].type === "lineTo"
    && path[0].x === path[1].x
  ));
}

function createGraphCanvas() {
  const staticContexts = [];
  const ownerDocument = {
    createElement(tagName) {
      if (tagName !== "canvas") {
        throw new Error(`Unexpected element request: ${tagName}`);
      }
      const staticContext = new MockRenderingContext2D();
      staticContexts.push(staticContext);
      return {
        width: 0,
        height: 0,
        style: {},
        ownerDocument,
        getContext() {
          return staticContext;
        },
      };
    },
  };
  const context = new MockRenderingContext2D();
  const listeners = new Map();
  const capturedPointerIds = new Set();
  return {
    canvas: {
      width: 0,
      height: 0,
      style: {},
      ownerDocument,
      getContext() {
        return context;
      },
      addEventListener(type, callback) {
        const typeListeners = listeners.get(type) ?? [];
        typeListeners.push(callback);
        listeners.set(type, typeListeners);
      },
      dispatchEvent(event) {
        const normalizedEvent = {
          preventDefault() {},
          stopPropagation() {},
          currentTarget: this,
          target: this,
          ...event,
        };
        const typeListeners = listeners.get(normalizedEvent.type) ?? [];
        for (const listener of typeListeners) {
          listener(normalizedEvent);
        }
      },
      setPointerCapture(pointerId) {
        capturedPointerIds.add(pointerId);
      },
      releasePointerCapture(pointerId) {
        capturedPointerIds.delete(pointerId);
      },
      hasPointerCapture(pointerId) {
        return capturedPointerIds.has(pointerId);
      },
      getBoundingClientRect() {
        return { left: 0, top: 0 };
      },
    },
    context,
    staticContexts,
  };
}

function createEventTarget() {
  const listeners = new Map();
  return {
    checked: false,
    disabled: false,
    addEventListener(type, callback) {
      const typeListeners = listeners.get(type) ?? [];
      typeListeners.push(callback);
      listeners.set(type, typeListeners);
    },
    dispatchEvent(event) {
      const normalizedEvent = {
        preventDefault() {},
        stopPropagation() {},
        currentTarget: this,
        target: this,
        ...event,
      };
      const typeListeners = listeners.get(normalizedEvent.type) ?? [];
      for (const listener of typeListeners) {
        listener(normalizedEvent);
      }
    },
  };
}

class MockRenderingContext2D {
  constructor() {
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.lineWidth = 1;
    this.fillRectCalls = [];
    this.drawImageCalls = [];
    this.strokeCalls = [];
    this.currentPath = [];
  }

  clearRect() {}

  fillRect(x, y, width, height) {
    this.fillRectCalls.push({ x, y, width, height, fillStyle: this.fillStyle });
  }

  drawImage(image, x, y) {
    this.drawImageCalls.push({ image, x, y });
  }

  beginPath() {
    this.currentPath = [];
  }

  moveTo(x, y) {
    this.currentPath.push({ type: "moveTo", x, y });
  }

  lineTo(x, y) {
    this.currentPath.push({ type: "lineTo", x, y });
  }

  stroke() {
    this.strokeCalls.push({
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      path: this.currentPath.map((segment) => ({ ...segment })),
    });
  }

  save() {}

  restore() {}
}
