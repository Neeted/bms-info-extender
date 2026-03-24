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
  }

  clearRect() {}

  fillRect(x, y, width, height) {
    this.fillRectCalls.push({ x, y, width, height, fillStyle: this.fillStyle });
  }

  drawImage(image, x, y) {
    this.drawImageCalls.push({ image, x, y });
  }

  beginPath() {}

  moveTo() {}

  lineTo() {}

  stroke() {}

  save() {}

  restore() {}
}
