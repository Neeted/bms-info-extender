import {
  DISTRIBUTION_NOTE_COLORS,
  DISTRIBUTION_NOTE_NAMES,
} from "./bms-info-data.js";

const RECT_WIDTH = 4;
const RECT_HEIGHT = 2;
const SPACING = 1;
const MIN_RATIO = 1 / 8;
const MAX_RATIO = 8;
const MIN_LOG = Math.log10(MIN_RATIO);
const MAX_LOG = Math.log10(MAX_RATIO);
const GRAPH_SCROLL_FOLLOW_MIN_MARGIN_PX = 48;
const GRAPH_SCROLL_FOLLOW_MAX_MARGIN_PX = 160;

export function createBmsInfoGraph({
  scrollHost,
  canvas,
  tooltip,
  pinInput,
  onHoverTime = () => {},
  onHoverLeave = () => {},
  onSelectTime = () => {},
  onPinChange = () => {},
}) {
  const context = canvas.getContext("2d");
  const staticCanvas = createLayerCanvas(canvas);
  const staticContext = staticCanvas.getContext("2d");
  const state = {
    record: null,
    selectedTimeSec: 0,
    isPinned: false,
  };

  canvas.addEventListener("mousemove", (event) => {
    if (!state.record) {
      hideTooltip(tooltip);
      return;
    }

    const timeSec = getHoverTimeSec(event, canvas);
    if (timeSec < 0 || timeSec > state.record.distributionSegments.length) {
      hideTooltip(tooltip);
      return;
    }

    renderTooltip(tooltip, event, state.record, timeSec);
    onHoverTime(timeSec);
  });

  canvas.addEventListener("mouseleave", () => {
    hideTooltip(tooltip);
    onHoverLeave();
  });

  canvas.addEventListener("click", (event) => {
    if (!state.record) {
      return;
    }
    const timeSec = getHoverTimeSec(event, canvas);
    if (timeSec < 0) {
      return;
    }
    onSelectTime(timeSec);
  });

  pinInput.addEventListener("change", () => {
    onPinChange(pinInput.checked);
  });

  function setRecord(record) {
    state.record = record;
    pinInput.disabled = !record;
    renderStaticScene();
    renderDynamicScene();
  }

  function setSelectedTimeSec(timeSec) {
    state.selectedTimeSec = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0;
    renderDynamicScene();
    syncScrollToSelected();
  }

  function setPinned(nextPinned) {
    state.isPinned = Boolean(nextPinned);
    pinInput.checked = state.isPinned;
    pinInput.disabled = !state.record;
  }

  function renderStaticScene() {
    const record = state.record;
    if (!record) {
      staticCanvas.width = 640;
      staticCanvas.height = 180;
      staticContext.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
      staticContext.fillStyle = "#000000";
      staticContext.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
      return;
    }

    const segments = record.distributionSegments;
    const timeLength = Math.max(segments.length, 1);
    const maxNotesPerSecond = Math.max(40, Math.min(record.peakdensity || 0, 100));
    const canvasWidth = timeLength * (RECT_WIDTH + SPACING);
    const canvasHeight = maxNotesPerSecond * (RECT_HEIGHT + SPACING) - SPACING;
    staticCanvas.width = canvasWidth;
    staticCanvas.height = canvasHeight;

    staticContext.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
    staticContext.fillStyle = "#000000";
    staticContext.fillRect(0, 0, staticCanvas.width, staticCanvas.height);

    drawHorizontalGrid(staticContext, canvasWidth, canvasHeight, maxNotesPerSecond);
    drawVerticalGrid(staticContext, canvasWidth, canvasHeight, timeLength);
    drawDistributionBars(staticContext, segments, canvasHeight, maxNotesPerSecond);
    drawSpeedChangeLines(staticContext, record, canvasWidth, canvasHeight, timeLength);
  }

  function renderDynamicScene() {
    const targetWidth = Math.max(staticCanvas.width || 640, 1);
    const targetHeight = Math.max(staticCanvas.height || 180, 1);
    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
    }
    if (canvas.height !== targetHeight) {
      canvas.height = targetHeight;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(staticCanvas, 0, 0);
    drawSelectedTimeLine(context, timeToX(state.selectedTimeSec), canvas.height);
  }

  function syncScrollToSelected() {
    if (!state.record || !scrollHost) {
      return;
    }
    const x = timeToX(state.selectedTimeSec);
    const desired = getGraphFollowScrollLeft({
      targetX: x,
      currentScrollLeft: scrollHost.scrollLeft,
      clientWidth: scrollHost.clientWidth,
      scrollWidth: scrollHost.scrollWidth,
    });
    if (Math.abs(scrollHost.scrollLeft - desired) > 1) {
      scrollHost.scrollLeft = desired;
    }
  }

  renderStaticScene();
  renderDynamicScene();

  return {
    setRecord,
    setSelectedTimeSec,
    setPinned,
    render() {
      renderStaticScene();
      renderDynamicScene();
    },
    destroy() {},
  };
}

function createLayerCanvas(referenceCanvas) {
  if (typeof referenceCanvas?.ownerDocument?.createElement === "function") {
    return referenceCanvas.ownerDocument.createElement("canvas");
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    return document.createElement("canvas");
  }
  throw new Error("Canvas layer creation requires a document.");
}

function drawHorizontalGrid(context, canvasWidth, canvasHeight, maxNotesPerSecond) {
  context.strokeStyle = "#202080";
  context.lineWidth = 1;
  for (let count = 5; count < maxNotesPerSecond; count += 5) {
    const y = canvasHeight - (count * (RECT_HEIGHT + SPACING) - 0.5);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvasWidth, y);
    context.stroke();
  }
}

function drawVerticalGrid(context, canvasWidth, canvasHeight, timeLength) {
  context.strokeStyle = "#777777";
  context.lineWidth = 1;
  for (let second = 10; second < timeLength; second += 10) {
    const x = second * (RECT_WIDTH + SPACING) - 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvasHeight);
    context.stroke();
  }
}

function drawDistributionBars(context, segments, canvasHeight, maxNotesPerSecond) {
  segments.forEach((counts, timeIndex) => {
    let yOffset = 0;
    for (let typeIndex = 0; typeIndex < DISTRIBUTION_NOTE_COLORS.length; typeIndex += 1) {
      const count = counts[typeIndex];
      const color = DISTRIBUTION_NOTE_COLORS[typeIndex];
      for (let index = 0; index < count; index += 1) {
        const x = timeIndex * (RECT_WIDTH + SPACING);
        const y = canvasHeight - ((yOffset + 1) * RECT_HEIGHT + yOffset * SPACING);
        if (y < 0 || yOffset >= maxNotesPerSecond) {
          break;
        }
        context.fillStyle = color;
        context.fillRect(x, y, RECT_WIDTH, RECT_HEIGHT);
        yOffset += 1;
      }
    }
  });
}

function drawSpeedChangeLines(context, record, canvasWidth, canvasHeight, timeLength) {
  const points = record.speedChangePoints;
  for (let index = 0; index < points.length; index += 1) {
    const [bpm, time] = points[index];
    const x1 = timeToX((time / 1000));
    const y1 = logScaleY(bpm, record.mainbpm, canvasHeight) - 1;
    const next = points[index + 1];
    const x2 = next ? timeToX(next[1] / 1000) : canvasWidth;

    let color = "#ffff00";
    if (bpm <= 0) {
      color = "#ff00ff";
    } else if (bpm === record.mainbpm) {
      color = "#00ff00";
    } else if (bpm === record.minbpm) {
      color = "#0000ff";
    } else if (bpm === record.maxbpm) {
      color = "#ff0000";
    }

    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x1 - 1, y1);
    context.lineTo(x2 + 1, y1);
    context.stroke();

    if (next) {
      const y2 = logScaleY(next[0], record.mainbpm, canvasHeight) - 1;
      if (Math.abs(y2 - y1) >= 1) {
        context.strokeStyle = "rgba(127, 127, 127, 0.5)";
        context.beginPath();
        context.moveTo(x2, y2 < y1 ? y1 - 1 : y1 + 1);
        context.lineTo(x2, y2 < y1 ? y2 + 1 : y2 - 1);
        context.stroke();
      }
    }
  }
}

function drawSelectedTimeLine(context, x, canvasHeight) {
  context.save();
  context.strokeStyle = "#ff2c2c";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 0.5, 0);
  context.lineTo(x + 0.5, canvasHeight);
  context.stroke();
  context.restore();
}

function renderTooltip(tooltip, event, record, timeSec) {
  const timeIndex = Math.floor(timeSec);
  const counts = record.distributionSegments[timeIndex] ?? Array.from({ length: 7 }, () => 0);

  let bpmDisplay = 0;
  for (let index = record.speedChangePoints.length - 1; index >= 0; index -= 1) {
    if (timeSec * 1000 >= record.speedChangePoints[index][1]) {
      bpmDisplay = record.speedChangePoints[index][0];
      break;
    }
  }

  let html = `${timeSec.toFixed(1)} sec<br>`;
  html += `BPM: ${bpmDisplay}<br>`;
  html += `Notes: ${counts.reduce((total, count) => total + count, 0)}<br>`;
  counts.forEach((count, index) => {
    if (count > 0) {
      html += `<span style="color: ${DISTRIBUTION_NOTE_COLORS[index]}; background-color: transparent;">■</span> ${count} - ${DISTRIBUTION_NOTE_NAMES[index]}<br>`;
    }
  });

  tooltip.innerHTML = html;
  tooltip.style.left = `${event.clientX + 10}px`;
  tooltip.style.top = `${event.clientY + 10}px`;
  tooltip.style.display = "block";
}

function hideTooltip(tooltip) {
  tooltip.style.display = "none";
}

function getHoverTimeSec(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  return mouseX / (RECT_WIDTH + SPACING);
}

function logScaleY(bpm, mainBpm, canvasHeight) {
  const ratio = Math.min(Math.max(bpm / mainBpm, MIN_RATIO), MAX_RATIO);
  const logValue = Math.log10(ratio);
  const t = (logValue - MIN_LOG) / (MAX_LOG - MIN_LOG);
  return canvasHeight - Math.round(t * (canvasHeight - 2));
}

function timeToX(timeSec) {
  return Math.round(timeSec * (RECT_WIDTH + SPACING)) + 1;
}

export function getGraphFollowScrollLeft({
  targetX,
  currentScrollLeft,
  clientWidth,
  scrollWidth,
}) {
  const safeClientWidth = Math.max(clientWidth ?? 0, 1);
  const maxScrollLeft = Math.max(0, (scrollWidth ?? 0) - safeClientWidth);
  const marginPx = clamp(safeClientWidth * 0.2, GRAPH_SCROLL_FOLLOW_MIN_MARGIN_PX, GRAPH_SCROLL_FOLLOW_MAX_MARGIN_PX);
  const leftBound = (currentScrollLeft ?? 0) + marginPx;
  const rightBound = (currentScrollLeft ?? 0) + safeClientWidth - marginPx;
  if (targetX >= leftBound && targetX <= rightBound) {
    return clamp(currentScrollLeft ?? 0, 0, maxScrollLeft);
  }
  return clamp(targetX - safeClientWidth / 2, 0, maxScrollLeft);
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}
