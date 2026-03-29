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
  return {
    canvas: {
      width: 0,
      height: 0,
      style: {},
      ownerDocument,
      getContext() {
        return context;
      },
      addEventListener() {},
      getBoundingClientRect() {
        return { left: 0, top: 0 };
      },
    },
    context,
    staticContexts,
  };
}

function createEventTarget() {
  return {
    checked: false,
    disabled: false,
    addEventListener() {},
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
