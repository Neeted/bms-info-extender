  // <generated-preview-runtime:start>
  // このブロックは script/build_preview_runtime.mjs により生成されます。手編集しないでください。
  const __previewRuntimeModules = Object.create(null);

  (() => {
    const exports = {};

    const DEFAULT_VIEWER_PIXELS_PER_SECOND = 160;

    function createScoreViewerModel(score) {
      if (!score) {
        return null;
      }

      const notes = score.notes
        .filter((note) => note.kind !== "invisible")
        .map((note) => ({ ...note }))
        .sort(compareNoteLike);

      const comboEvents = (score.comboEvents?.length > 0 ? score.comboEvents : createFallbackComboEvents(score.notes))
        .map((event) => ({ ...event }))
        .sort(compareComboEvent)
        .map((event, index) => ({
          ...event,
          combo: index + 1,
        }));

      const longEndEventKeys = new Set(
        comboEvents
          .filter((event) => event.kind === "long-end")
          .map(createTimedLaneKey),
      );

      return {
        score,
        notes,
        comboEvents,
        longEndEventKeys,
        barLines: [...score.barLines].sort(compareNoteLike),
        bpmChanges: [...score.bpmChanges].sort(compareNoteLike),
        stops: [...score.stops].sort(compareNoteLike),
        scrollChanges: [...(score.scrollChanges ?? [])].sort(compareNoteLike),
        totalCombo: comboEvents.length,
      };
    }

    function getScoreTotalDurationSec(score) {
      if (!score || typeof score !== "object") {
        return 0;
      }
      const totalDurationSec = Number.isFinite(score.totalDurationSec) ? score.totalDurationSec : null;
      const lastTimelineTimeSec = Number.isFinite(score.lastTimelineTimeSec) ? score.lastTimelineTimeSec : null;
      const lastPlayableTimeSec = Number.isFinite(score.lastPlayableTimeSec) ? score.lastPlayableTimeSec : 0;
      return Math.max(totalDurationSec ?? lastTimelineTimeSec ?? lastPlayableTimeSec, 0);
    }

    function getClampedSelectedTimeSec(model, timeSec) {
      if (!model) {
        return 0;
      }
      const numericValue = Number.isFinite(timeSec) ? timeSec : 0;
      return clamp(numericValue, 0, getScoreTotalDurationSec(model.score));
    }

    function getContentHeightPx(model, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
      if (!model) {
        return Math.max(1, viewportHeight);
      }
      return Math.max(
        Math.max(1, viewportHeight),
        Math.ceil(getScoreTotalDurationSec(model.score) * pixelsPerSecond + viewportHeight),
      );
    }

    function getTimeSecForScrollTop(model, scrollTop, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
      if (!model) {
        return 0;
      }
      return getClampedSelectedTimeSec(model, scrollTop / pixelsPerSecond);
    }

    function getScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
      if (!model) {
        return 0;
      }
      const clampedTimeSec = getClampedSelectedTimeSec(model, timeSec);
      const maxScrollTop = Math.max(0, getContentHeightPx(model, viewportHeight, pixelsPerSecond) - viewportHeight);
      return clamp(clampedTimeSec * pixelsPerSecond, 0, maxScrollTop);
    }

    function getVisibleTimeRange(
      model,
      selectedTimeSec,
      viewportHeight,
      pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND,
    ) {
      if (!model) {
        return { startTimeSec: 0, endTimeSec: 0 };
      }
      const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
      const halfViewportSec = viewportHeight / pixelsPerSecond / 2;
      const overscanSec = Math.max(halfViewportSec * 0.35, 0.75);
      return {
        startTimeSec: Math.max(0, clampedTimeSec - halfViewportSec - overscanSec),
        endTimeSec: Math.min(getScoreTotalDurationSec(model.score), clampedTimeSec + halfViewportSec + overscanSec),
      };
    }

    function getViewerCursor(model, selectedTimeSec) {
      if (!model) {
        return {
          timeSec: 0,
          measureIndex: 0,
          totalMeasureIndex: 0,
          comboCount: 0,
          totalCombo: 0,
        };
      }

      const clampedTimeSec = getClampedSelectedTimeSec(model, selectedTimeSec);
      const totalMeasureIndex = getTotalMeasureIndex(model);
      return {
        timeSec: clampedTimeSec,
        measureIndex: Math.min(getMeasureIndexAtTime(model, clampedTimeSec), totalMeasureIndex),
        totalMeasureIndex,
        comboCount: getComboCountAtTime(model, clampedTimeSec),
        totalCombo: model.totalCombo,
      };
    }

    function getMeasureIndexAtTime(model, timeSec) {
      if (!model || model.barLines.length === 0) {
        return 0;
      }
      const index = upperBoundByTime(model.barLines, timeSec) - 1;
      return Math.max(0, index);
    }

    function getTotalMeasureIndex(model) {
      if (!model || model.barLines.length === 0) {
        return 0;
      }
      return Math.max(model.barLines.length - 2, 0);
    }

    function getComboCountAtTime(model, timeSec) {
      if (!model || model.comboEvents.length === 0) {
        return 0;
      }
      return upperBoundByTime(model.comboEvents, timeSec);
    }

    function shouldDrawLongEndCap(model, note) {
      if (!model || note?.kind !== "long" || !Number.isFinite(note?.endTimeSec)) {
        return false;
      }
      return model.longEndEventKeys.has(createTimedLaneKey(note.lane, note.endTimeSec, note.side));
    }

    function createFallbackComboEvents(notes) {
      return notes
        .filter((note) => note.kind === "normal" || note.kind === "long")
        .map((note) => ({
          lane: note.lane,
          timeSec: note.timeSec,
          kind: note.kind === "long" ? "long-start" : "normal",
          ...(note.side ? { side: note.side } : {}),
        }));
    }

    function upperBoundByTime(items, timeSec) {
      let low = 0;
      let high = items.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (items[mid].timeSec <= timeSec) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      return low;
    }

    function compareNoteLike(left, right) {
      if (left.timeSec !== right.timeSec) {
        return left.timeSec - right.timeSec;
      }
      return (left.lane ?? 0) - (right.lane ?? 0);
    }

    function compareComboEvent(left, right) {
      if (left.timeSec !== right.timeSec) {
        return left.timeSec - right.timeSec;
      }
      const order = comboEventOrder(left.kind) - comboEventOrder(right.kind);
      if (order !== 0) {
        return order;
      }
      return left.lane - right.lane;
    }

    function comboEventOrder(kind) {
      switch (kind) {
        case "normal":
          return 0;
        case "long-start":
          return 1;
        case "long-end":
          return 2;
        default:
          return 99;
      }
    }

    function createTimedLaneKey(input, timeSec, side = undefined) {
      if (typeof input === "object" && input !== null) {
        return createTimedLaneKey(input.lane, input.timeSec ?? input.endTimeSec, input.side);
      }
      return `${side ?? "-"}:${input}:${Math.round((timeSec ?? 0) * 1000000)}`;
    }

    function clamp(value, minValue, maxValue) {
      return Math.min(Math.max(value, minValue), maxValue);
    }
    exports.DEFAULT_VIEWER_PIXELS_PER_SECOND = DEFAULT_VIEWER_PIXELS_PER_SECOND;
    exports.createScoreViewerModel = createScoreViewerModel;
    exports.getScoreTotalDurationSec = getScoreTotalDurationSec;
    exports.getClampedSelectedTimeSec = getClampedSelectedTimeSec;
    exports.getContentHeightPx = getContentHeightPx;
    exports.getTimeSecForScrollTop = getTimeSecForScrollTop;
    exports.getScrollTopForTimeSec = getScrollTopForTimeSec;
    exports.getVisibleTimeRange = getVisibleTimeRange;
    exports.getViewerCursor = getViewerCursor;
    exports.getMeasureIndexAtTime = getMeasureIndexAtTime;
    exports.getComboCountAtTime = getComboCountAtTime;
    exports.shouldDrawLongEndCap = shouldDrawLongEndCap;
    __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-model.js"] = exports;
  })();

  (() => {
    const exports = {};
    const { DEFAULT_VIEWER_PIXELS_PER_SECOND, getVisibleTimeRange, shouldDrawLongEndCap } = __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-model.js"];
    const VIEWER_LANE_SIDE_PADDING = 6;
    const DP_GUTTER_UNITS = 1.2;
    const FIXED_LANE_WIDTH = 16;
    const BACKGROUND_FILL = "#000000";
    const SEPARATOR_COLOR = "rgba(72, 72, 72, 0.95)";
    const BAR_LINE = "rgba(255, 255, 255, 0.92)";
    const BPM_MARKER = "#00ff00";
    const STOP_MARKER = "#ff00ff";
    const SCROLL_MARKER = "#ff0";
    const MINE_COLOR = "#880000";
    const NOTE_HEAD_HEIGHT = 4;
    const TEMPO_MARKER_HEIGHT = 1;
    const TEMPO_MARKER_WIDTH_RATIO = 0.5;
    const TEMPO_LABEL_GAP = 8;
    const TEMPO_LABEL_MIN_GAP = 12;
    const LEFT_TEMPO_MARKER_SEPARATOR_COMPENSATION_PX = 1;
    const JUDGE_LINE_SIDE_OVERHANG = FIXED_LANE_WIDTH * 3;

    const BEAT_LANE_COLORS = new Map([
      ["0", "#e04a4a"],
      ["1", "#bebebe"],
      ["2", "#5074fe"],
      ["3", "#bebebe"],
      ["4", "#5074fe"],
      ["5", "#bebebe"],
      ["6", "#5074fe"],
      ["7", "#bebebe"],
      ["8", "#bebebe"],
      ["9", "#5074fe"],
      ["10", "#bebebe"],
      ["11", "#5074fe"],
      ["12", "#bebebe"],
      ["13", "#5074fe"],
      ["14", "#bebebe"],
      ["15", "#e04a4a"],
      ["g0", "#e04a4a"],
      ["g1", "#bebebe"],
      ["g2", "#5074fe"],
      ["g3", "#bebebe"],
      ["g4", "#5074fe"],
      ["g5", "#bebebe"],
      ["g6", "#bebebe"],
      ["g7", "#5074fe"],
      ["g8", "#bebebe"],
      ["g9", "#5074fe"],
      ["g10", "#bebebe"],
      ["g11", "#e04a4a"],
    ]);

    const POPN_LANE_COLORS = new Map([
      ["p0", "#c4c4c4"],
      ["p1", "#fff500"],
      ["p2", "#99ff67"],
      ["p3", "#30b9f9"],
      ["p4", "#ff6c6c"],
      ["p5", "#30b9f9"],
      ["p6", "#99ff67"],
      ["p7", "#fff500"],
      ["p8", "#c4c4c4"],
    ]);

    function createScoreViewerRenderer(canvas) {
      const context = canvas.getContext("2d");
      let width = 0;
      let height = 0;
      let dpr = 1;

      function resize(nextWidth, nextHeight) {
        width = Math.max(1, Math.floor(nextWidth));
        height = Math.max(1, Math.floor(nextHeight));
        dpr = typeof window === "undefined" ? 1 : Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function render(model, selectedTimeSec, pixelsPerSecond = DEFAULT_VIEWER_PIXELS_PER_SECOND) {
        context.clearRect(0, 0, width, height);
        context.fillStyle = BACKGROUND_FILL;
        context.fillRect(0, 0, width, height);

        if (!model) {
          return createEmptyRenderResult();
        }

        const lanes = createLaneLayout(model.score.mode, model.score.laneCount, width);
        const { startTimeSec, endTimeSec } = getVisibleTimeRange(model, selectedTimeSec, height, pixelsPerSecond);

        drawBarLines(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
        drawLongBodies(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
        drawNoteHeads(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
        drawLaneSeparators(context, lanes, height);
        const markers = drawTempoMarkers(
          context,
          model.bpmChanges,
          model.stops,
          model.scrollChanges,
          lanes,
          selectedTimeSec,
          startTimeSec,
          endTimeSec,
          height,
          pixelsPerSecond,
        );

        return {
          markers,
          laneBounds: getLaneBounds(lanes),
        };
      }

      return { resize, render };
    }

    function estimateViewerWidth(mode, laneCount) {
      const layout = getModeLayout(mode, laneCount);
      const gutterWidth = layout.splitAfter === null ? 0 : FIXED_LANE_WIDTH * DP_GUTTER_UNITS;
      const contentWidth = layout.display.length * FIXED_LANE_WIDTH + gutterWidth;
      return Math.ceil(contentWidth + JUDGE_LINE_SIDE_OVERHANG * 2);
    }

    function drawBarLines(context, barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
      const { leftLane, rightLane } = getVisualLaneEdges(lanes);
      if (!leftLane || !rightLane) {
        return;
      }
      const leftX = leftLane.x;
      const rightX = rightLane.x + rightLane.width;
      context.save();
      context.strokeStyle = BAR_LINE;
      context.lineWidth = 1;
      for (const barLine of barLines) {
        if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
          continue;
        }
        const y = timeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        context.beginPath();
        context.moveTo(leftX, y + 0.5);
        context.lineTo(rightX, y + 0.5);
        context.stroke();
      }
      context.restore();
    }

    function drawTempoMarkers(
      context,
      bpmChanges,
      stops,
      scrollChanges,
      lanes,
      selectedTimeSec,
      startTimeSec,
      endTimeSec,
      viewportHeight,
      pixelsPerSecond,
    ) {
      const { leftLane, rightLane } = getVisualLaneEdges(lanes);
      if (!leftLane || !rightLane) {
        return [];
      }
      const markers = [];
      let lastBpmLabelY = Number.POSITIVE_INFINITY;
      let lastStopLabelY = Number.POSITIVE_INFINITY;
      let lastScrollLabelY = Number.POSITIVE_INFINITY;

      context.save();
      context.fillStyle = BPM_MARKER;
      for (const bpmChange of bpmChanges) {
        if (bpmChange.timeSec < startTimeSec || bpmChange.timeSec > endTimeSec) {
          continue;
        }
        const y = timeToViewportY(bpmChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        const markerRect = getTempoMarkerRect(rightLane, "right");
        context.fillRect(
          markerRect.x,
          Math.round(y - TEMPO_MARKER_HEIGHT / 2),
          markerRect.width,
          TEMPO_MARKER_HEIGHT,
        );
        if (shouldKeepTempoMarkerLabel(lastBpmLabelY, y)) {
          markers.push({
            type: "bpm",
            timeSec: bpmChange.timeSec,
            y,
            label: formatBpmMarkerLabel(bpmChange.bpm),
            side: "right",
            color: BPM_MARKER,
            x: rightLane.x + rightLane.width + TEMPO_LABEL_GAP,
          });
          lastBpmLabelY = y;
        }
      }

      context.fillStyle = STOP_MARKER;
      for (const stop of stops) {
        if (stop.timeSec < startTimeSec || stop.timeSec > endTimeSec) {
          continue;
        }
        const y = timeToViewportY(stop.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        const markerRect = getTempoMarkerRect(leftLane, "left");
        context.fillRect(
          markerRect.x,
          Math.round(y - TEMPO_MARKER_HEIGHT / 2),
          markerRect.width,
          TEMPO_MARKER_HEIGHT,
        );
        if (shouldKeepTempoMarkerLabel(lastStopLabelY, y)) {
          markers.push({
            type: "stop",
            timeSec: stop.timeSec,
            y,
            label: formatStopMarkerLabel(stop.durationSec),
            side: "left",
            color: STOP_MARKER,
            x: leftLane.x - TEMPO_LABEL_GAP,
          });
          lastStopLabelY = y;
        }
      }

      context.fillStyle = SCROLL_MARKER;
      for (const scrollChange of scrollChanges) {
        if (scrollChange.timeSec < startTimeSec || scrollChange.timeSec > endTimeSec) {
          continue;
        }
        const y = timeToViewportY(scrollChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        const markerRect = getTempoMarkerRect(leftLane, "left");
        context.fillRect(
          markerRect.x,
          Math.round(y - TEMPO_MARKER_HEIGHT / 2),
          markerRect.width,
          TEMPO_MARKER_HEIGHT,
        );
        if (shouldKeepTempoMarkerLabel(lastScrollLabelY, y)) {
          markers.push({
            type: "scroll",
            timeSec: scrollChange.timeSec,
            y,
            label: formatScrollMarkerLabel(scrollChange.rate),
            side: "left",
            color: SCROLL_MARKER,
            x: leftLane.x - TEMPO_LABEL_GAP,
          });
          lastScrollLabelY = y;
        }
      }

      context.restore();
      return markers;
    }

    function shouldKeepTempoMarkerLabel(lastAcceptedY, nextY) {
      return !Number.isFinite(lastAcceptedY) || Math.abs(nextY - lastAcceptedY) >= TEMPO_LABEL_MIN_GAP;
    }

    function getTempoMarkerRect(lane, side) {
      const width = lane.width * TEMPO_MARKER_WIDTH_RATIO;
      if (side === "left") {
        // 左側はセパレーター線と重なりすぎないように 1px だけ内側へ寄せる。
        return {
          x: lane.x - width + LEFT_TEMPO_MARKER_SEPARATOR_COMPENSATION_PX,
          width,
        };
      }
      return {
        x: lane.x + lane.width,
        width,
      };
    }

    function drawLongBodies(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
      context.save();
      for (const note of model.notes) {
        if (note.kind !== "long" || !Number.isFinite(note.endTimeSec)) {
          continue;
        }
        if (note.endTimeSec < startTimeSec || note.timeSec > endTimeSec) {
          continue;
        }
        const lane = lanes[note.lane];
        if (!lane) {
          continue;
        }
        const startY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        const endY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        const topY = Math.max(Math.min(startY, endY), -NOTE_HEAD_HEIGHT - 24);
        const bottomY = Math.min(Math.max(startY, endY), viewportHeight + NOTE_HEAD_HEIGHT + 24);
        const bodyHeight = Math.max(bottomY - topY, 2);
        context.fillStyle = dimColor(lane.note, 0.42);
        context.fillRect(lane.x, topY, lane.width, bodyHeight);
      }
      context.restore();
    }

    function drawNoteHeads(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
      context.save();
      for (const note of model.notes) {
        const noteEndTimeSec = note.endTimeSec ?? note.timeSec;
        if (noteEndTimeSec < startTimeSec || note.timeSec > endTimeSec) {
          continue;
        }
        const lane = lanes[note.lane];
        if (!lane || note.kind === "invisible") {
          continue;
        }

        const headY = timeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        drawRectNote(context, lane, headY, note.kind === "mine" ? MINE_COLOR : lane.note);

        if (note.kind === "long" && Number.isFinite(note.endTimeSec) && shouldDrawLongEndCap(model, note)) {
          const endHeadY = timeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
          drawRectNote(context, lane, endHeadY, lane.note);
        }
      }
      context.restore();
    }

    function drawRectNote(context, lane, y, color) {
      context.fillStyle = color;
      context.fillRect(lane.x, Math.round(y - NOTE_HEAD_HEIGHT), lane.width, NOTE_HEAD_HEIGHT);
    }

    function drawLaneSeparators(context, lanes, viewportHeight) {
      if (lanes.length === 0) {
        return;
      }
      context.save();
      context.strokeStyle = SEPARATOR_COLOR;
      context.lineWidth = 1;
      const uniqueBoundaries = new Set();
      uniqueBoundaries.add(Math.round(lanes[0].x));
      for (const lane of lanes) {
        uniqueBoundaries.add(Math.round(lane.x));
        uniqueBoundaries.add(Math.round(lane.x + lane.width));
      }
      for (const x of [...uniqueBoundaries].sort((left, right) => left - right)) {
        context.beginPath();
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, viewportHeight);
        context.stroke();
      }
      context.restore();
    }

    function getLaneBounds(lanes) {
      const { leftLane, rightLane } = getVisualLaneEdges(lanes);
      if (!leftLane || !rightLane) {
        return {
          leftX: 0,
          rightX: 0,
        };
      }
      return {
        leftX: leftLane.x,
        rightX: rightLane.x + rightLane.width,
      };
    }

    function getVisualLaneEdges(lanes) {
      const visibleLanes = lanes.filter(Boolean);
      if (visibleLanes.length === 0) {
        return { leftLane: null, rightLane: null };
      }

      let leftLane = visibleLanes[0];
      let rightLane = visibleLanes[0];
      for (const lane of visibleLanes) {
        if (lane.x < leftLane.x) {
          leftLane = lane;
        }
        if (lane.x + lane.width > rightLane.x + rightLane.width) {
          rightLane = lane;
        }
      }

      return { leftLane, rightLane };
    }

    function createEmptyRenderResult() {
      return {
        markers: [],
        laneBounds: {
          leftX: 0,
          rightX: 0,
        },
      };
    }

    function createLaneLayout(mode, laneCount, viewportWidth) {
      const layout = getModeLayout(mode, laneCount);
      const gutterWidth = layout.splitAfter === null ? 0 : FIXED_LANE_WIDTH * DP_GUTTER_UNITS;
      const contentWidth = layout.display.length * FIXED_LANE_WIDTH + gutterWidth;
      const startX = Math.max(VIEWER_LANE_SIDE_PADDING, Math.floor((viewportWidth - contentWidth) / 2));
      const lanes = new Array(Math.max(1, laneCount));

      let cursorX = startX;
      for (let slotIndex = 0; slotIndex < layout.display.length; slotIndex += 1) {
        if (layout.splitAfter !== null && slotIndex === layout.splitAfter) {
          cursorX += gutterWidth;
        }

        const slot = layout.display[slotIndex];
        lanes[slot.actualLane] = {
          lane: slot.actualLane,
          x: cursorX,
          width: FIXED_LANE_WIDTH,
          note: slot.note,
        };
        cursorX += FIXED_LANE_WIDTH;
      }

      return lanes;
    }

    function getModeLayout(mode, laneCount) {
      switch (mode) {
        case "5k":
          return createDisplayLayout([0, 1, 2, 3, 4, 5], null, (slotIndex) => getBeatNoteColor(`g${slotIndex}`));
        case "7k":
          return createDisplayLayout([0, 1, 2, 3, 4, 5, 6, 7], null, (slotIndex) => getBeatNoteColor(String(slotIndex)));
        case "10k":
          return createDisplayLayout(
            [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 6],
            6,
            (slotIndex) => getBeatNoteColor(`g${slotIndex}`),
          );
        case "14k":
          return createDisplayLayout(
            [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8],
            8,
            (slotIndex) => getBeatNoteColor(String(slotIndex)),
          );
        case "popn-5k":
          return createDisplayLayout([0, 1, 2, 3, 4], null, (slotIndex) => getPopnNoteColor(slotIndex));
        case "popn-9k":
        case "9k":
          return createDisplayLayout(
            Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
            null,
            (slotIndex) => getPopnNoteColor(slotIndex),
          );
        default:
          return createDisplayLayout(
            Array.from({ length: Math.max(1, laneCount) }, (_, index) => index),
            null,
            () => "#bebebe",
          );
      }
    }

    function createDisplayLayout(displayOrder, splitAfter, getColor) {
      return {
        splitAfter,
        display: displayOrder.map((actualLane, slotIndex) => ({
          actualLane,
          note: getColor(slotIndex),
        })),
      };
    }

    function getBeatNoteColor(key) {
      return BEAT_LANE_COLORS.get(key) ?? "#bebebe";
    }

    function getPopnNoteColor(slotIndex) {
      return POPN_LANE_COLORS.get(`p${slotIndex}`) ?? "#c4c4c4";
    }

    function timeToViewportY(eventTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond) {
      return viewportHeight / 2 - (eventTimeSec - selectedTimeSec) * pixelsPerSecond;
    }

    function formatBpmMarkerLabel(bpm) {
      return trimDecimal(Number(bpm).toFixed(2));
    }

    function formatStopMarkerLabel(durationSec) {
      return `${trimDecimal(Number(durationSec).toFixed(3))}s`;
    }

    function formatScrollMarkerLabel(rate) {
      return trimDecimal(Number(rate).toFixed(3));
    }

    function trimDecimal(value) {
      return String(value).replace(/\.?0+$/, "");
    }

    function dimColor(color, factor) {
      if (!color.startsWith("#")) {
        return color;
      }
      const [red, green, blue] = hexToRgb(color);
      return `rgb(${Math.round(red * factor)}, ${Math.round(green * factor)}, ${Math.round(blue * factor)})`;
    }

    function hexToRgb(color) {
      const normalized = color.replace("#", "");
      const red = Number.parseInt(normalized.slice(0, 2), 16);
      const green = Number.parseInt(normalized.slice(2, 4), 16);
      const blue = Number.parseInt(normalized.slice(4, 6), 16);
      return [red, green, blue];
    }
    exports.VIEWER_LANE_SIDE_PADDING = VIEWER_LANE_SIDE_PADDING;
    exports.DP_GUTTER_UNITS = DP_GUTTER_UNITS;
    exports.FIXED_LANE_WIDTH = FIXED_LANE_WIDTH;
    exports.createScoreViewerRenderer = createScoreViewerRenderer;
    exports.estimateViewerWidth = estimateViewerWidth;
    __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-renderer.js"] = exports;
  })();

  (() => {
    const exports = {};
    const { DEFAULT_VIEWER_PIXELS_PER_SECOND, getClampedSelectedTimeSec, getContentHeightPx, getScrollTopForTimeSec, getTimeSecForScrollTop, getViewerCursor } = __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-model.js"];
    const { createScoreViewerRenderer, estimateViewerWidth } = __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-renderer.js"];
    const SCROLL_MULTIPLIER = 2;
    const MIN_SPACING_SCALE = 0.5;
    const MAX_SPACING_SCALE = 8.0;
    const SPACING_STEP = 0.01;
    const DEFAULT_SPACING_SCALE = 1.0;

    function createScoreViewerController({ root, onTimeChange = () => {}, onPlaybackToggle = () => {} }) {
      const scrollHost = document.createElement("div");
      scrollHost.className = "score-viewer-scroll-host";

      const spacer = document.createElement("div");
      spacer.className = "score-viewer-spacer";
      scrollHost.appendChild(spacer);

      const canvas = document.createElement("canvas");
      canvas.className = "score-viewer-canvas";

      const markerOverlay = document.createElement("div");
      markerOverlay.className = "score-viewer-marker-overlay";

      const markerLabelsLeft = document.createElement("div");
      markerLabelsLeft.className = "score-viewer-marker-labels is-left";

      const markerLabelsRight = document.createElement("div");
      markerLabelsRight.className = "score-viewer-marker-labels is-right";

      markerOverlay.append(markerLabelsLeft, markerLabelsRight);

      const bottomBar = document.createElement("div");
      bottomBar.className = "score-viewer-bottom-bar";

      const statusPanel = document.createElement("div");
      statusPanel.className = "score-viewer-status-panel";

      const playbackRow = document.createElement("div");
      playbackRow.className = "score-viewer-status-row is-time";

      const playbackButton = document.createElement("button");
      playbackButton.className = "score-viewer-playback-button";
      playbackButton.type = "button";
      playbackButton.setAttribute("aria-label", "Play score viewer");
      playbackButton.textContent = "▶";

      const playbackTime = document.createElement("span");
      playbackTime.className = "score-viewer-playback-time";

      playbackRow.append(playbackButton, playbackTime);

      const measureRow = document.createElement("div");
      measureRow.className = "score-viewer-status-row score-viewer-status-metric";

      const comboRow = document.createElement("div");
      comboRow.className = "score-viewer-status-row score-viewer-status-metric";

      const spacingRow = document.createElement("div");
      spacingRow.className = "score-viewer-status-row score-viewer-spacing-row";

      const spacingTitle = document.createElement("span");
      spacingTitle.className = "score-viewer-spacing-title";
      spacingTitle.textContent = "Spacing";

      const spacingValue = document.createElement("span");
      spacingValue.className = "score-viewer-spacing-value";
      spacingRow.append(spacingTitle, spacingValue);

      const spacingInput = document.createElement("input");
      spacingInput.className = "score-viewer-spacing-input";
      spacingInput.type = "range";
      spacingInput.min = String(MIN_SPACING_SCALE);
      spacingInput.max = String(MAX_SPACING_SCALE);
      spacingInput.step = String(SPACING_STEP);
      spacingInput.value = String(DEFAULT_SPACING_SCALE);

      statusPanel.append(playbackRow, measureRow, comboRow, spacingRow, spacingInput);
      bottomBar.append(statusPanel);

      const judgeLine = document.createElement("div");
      judgeLine.className = "score-viewer-judge-line";

      root.replaceChildren(scrollHost, canvas, markerOverlay, bottomBar, judgeLine);

      const renderer = createScoreViewerRenderer(canvas);
      const state = {
        model: null,
        selectedTimeSec: 0,
        isPinned: false,
        isOpen: false,
        isPlaying: false,
        spacingScale: DEFAULT_SPACING_SCALE,
      };

      let ignoreScrollUntilNextFrame = false;
      let resizeObserver = null;
      let dragState = null;

      scrollHost.addEventListener("scroll", () => {
        syncTimeFromScrollPosition();
      });

      scrollHost.addEventListener("wheel", (event) => {
        if (!state.model || !state.isOpen || !isScrollInteractive()) {
          return;
        }
        scrollHost.scrollTop += event.deltaY * SCROLL_MULTIPLIER;
        syncTimeFromScrollPosition({ force: true });
        event.preventDefault();
      }, { passive: false });

      scrollHost.addEventListener("pointerdown", (event) => {
        if (!canDragScroll(event)) {
          return;
        }
        dragState = {
          pointerId: event.pointerId,
          startY: event.clientY,
          startScrollTop: scrollHost.scrollTop,
        };
        scrollHost.classList.add("is-dragging");
        if (typeof scrollHost.setPointerCapture === "function") {
          scrollHost.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
      });

      scrollHost.addEventListener("pointermove", (event) => {
        if (!dragState || event.pointerId !== dragState.pointerId) {
          return;
        }
        const deltaY = event.clientY - dragState.startY;
        scrollHost.scrollTop = dragState.startScrollTop + deltaY * SCROLL_MULTIPLIER;
        syncTimeFromScrollPosition({ force: true });
        event.preventDefault();
      });

      scrollHost.addEventListener("pointerup", handlePointerRelease);
      scrollHost.addEventListener("pointercancel", handlePointerRelease);
      scrollHost.addEventListener("lostpointercapture", handlePointerRelease);

      spacingInput.addEventListener("input", () => {
        const nextScale = clampScale(Number.parseFloat(spacingInput.value));
        if (Math.abs(nextScale - state.spacingScale) < 0.0005) {
          spacingValue.textContent = formatSpacingScale(state.spacingScale);
          return;
        }
        state.spacingScale = nextScale;
        spacingValue.textContent = formatSpacingScale(state.spacingScale);
        refreshLayout();
      });

      playbackButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!state.model) {
          return;
        }
        onPlaybackToggle(!state.isPlaying);
      });

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          refreshLayout();
        });
        resizeObserver.observe(root);
      } else {
        window.addEventListener("resize", refreshLayout);
      }

      function setModel(model) {
        if (state.model === model) {
          return;
        }
        state.model = model;
        state.selectedTimeSec = getClampedSelectedTimeSec(state.model, state.selectedTimeSec);
        updateRootWidth();
        refreshLayout();
      }

      function setSelectedTimeSec(timeSec) {
        const clampedTimeSec = getClampedSelectedTimeSec(state.model, timeSec);
        if (Math.abs(clampedTimeSec - state.selectedTimeSec) < 0.0005 && state.model) {
          syncScrollPosition();
          renderScene();
          return;
        }
        state.selectedTimeSec = clampedTimeSec;
        syncScrollPosition();
        renderScene();
      }

      function setPinned(nextPinned) {
        state.isPinned = Boolean(nextPinned);
        updateScrollInteractivity();
        renderScene();
      }

      function setOpen(nextOpen) {
        state.isOpen = Boolean(nextOpen);
        root.classList.toggle("is-visible", state.isOpen && Boolean(state.model));
        syncScrollPosition();
        renderScene();
      }

      function setPlaybackState(nextPlaying) {
        state.isPlaying = Boolean(nextPlaying);
        updateScrollInteractivity();
        renderScene();
      }

      function setEmptyState(_title, _message) {}

      function syncScrollPosition() {
        if (!state.model) {
          scrollHost.scrollTop = 0;
          return;
        }
        ignoreScrollUntilNextFrame = true;
        scrollHost.scrollTop = getScrollTopForTimeSec(
          state.model,
          state.selectedTimeSec,
          root.clientHeight || 0,
          getPixelsPerSecond(),
        );
        requestAnimationFrame(() => {
          ignoreScrollUntilNextFrame = false;
        });
      }

      function syncTimeFromScrollPosition({ force = false } = {}) {
        if (!state.model || !state.isOpen || !isScrollInteractive()) {
          return;
        }
        if (!force && ignoreScrollUntilNextFrame) {
          return;
        }
        const nextTimeSec = getTimeSecForScrollTop(state.model, scrollHost.scrollTop, getPixelsPerSecond());
        if (Math.abs(nextTimeSec - state.selectedTimeSec) < 0.0005) {
          return;
        }
        state.selectedTimeSec = nextTimeSec;
        renderScene();
        onTimeChange(nextTimeSec);
      }

      function refreshLayout() {
        updateRootWidth();
        const width = Math.max(1, root.clientWidth);
        const height = Math.max(260, root.clientHeight);
        renderer.resize(width, height);
        spacer.style.height = `${getContentHeightPx(state.model, height, getPixelsPerSecond())}px`;
        syncScrollPosition();
        renderScene();
      }

      function renderScene() {
        const cursor = getViewerCursor(state.model, state.selectedTimeSec);
        const showScene = Boolean(state.model && state.isOpen);
        canvas.hidden = !showScene;
        markerOverlay.hidden = !showScene;
        bottomBar.hidden = !showScene;
        judgeLine.hidden = !showScene;

        playbackButton.disabled = !state.model;
        playbackButton.textContent = state.isPlaying ? "❚❚" : "▶";
        playbackButton.setAttribute("aria-label", state.isPlaying ? "Pause score viewer" : "Play score viewer");
        playbackTime.textContent = `${formatPlaybackTime(cursor.timeSec)} s`;
        measureRow.textContent = `Measure: ${formatMeasureCounter(cursor.measureIndex, cursor.totalMeasureIndex)}`;
        comboRow.textContent = `Combo: ${cursor.comboCount}/${cursor.totalCombo}`;
        spacingValue.textContent = formatSpacingScale(state.spacingScale);
        spacingInput.value = String(state.spacingScale);

        const renderResult = renderer.render(showScene ? state.model : null, cursor.timeSec, getPixelsPerSecond());
        renderMarkerLabels(showScene ? renderResult.markers : []);
      }

      function renderMarkerLabels(markers) {
        markerLabelsLeft.replaceChildren();
        markerLabelsRight.replaceChildren();

        if (!Array.isArray(markers) || markers.length === 0) {
          return;
        }

        const leftMarkers = filterMarkerLabels(markers.filter((marker) => marker.side === "left"));
        const rightMarkers = filterMarkerLabels(markers.filter((marker) => marker.side === "right"));

        for (const marker of leftMarkers) {
          markerLabelsLeft.appendChild(createMarkerLabel(marker, "left"));
        }
        for (const marker of rightMarkers) {
          markerLabelsRight.appendChild(createMarkerLabel(marker, "right"));
        }
      }

      function destroy() {
        clearDragState();
        if (resizeObserver) {
          resizeObserver.disconnect();
        } else {
          window.removeEventListener("resize", refreshLayout);
        }
      }

      setPinned(false);
      spacingValue.textContent = formatSpacingScale(state.spacingScale);
      refreshLayout();

      return {
        setModel,
        setSelectedTimeSec,
        setPinned,
        setOpen,
        setPlaybackState,
        setEmptyState,
        refreshLayout,
        destroy,
      };

      function handlePointerRelease(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) {
          return;
        }
        clearDragState();
      }

      function clearDragState() {
        if (dragState && typeof scrollHost.releasePointerCapture === "function") {
          try {
            if (scrollHost.hasPointerCapture?.(dragState.pointerId)) {
              scrollHost.releasePointerCapture(dragState.pointerId);
            }
          } catch {
            // Ignore release errors from already-cleared captures.
          }
        }
        dragState = null;
        scrollHost.classList.remove("is-dragging");
      }

      function canDragScroll(event) {
        return Boolean(
          state.model
            && state.isOpen
            && isScrollInteractive()
            && (event.button === 0 || event.pointerType === "touch" || event.pointerType === "pen"),
        );
      }

      function isScrollInteractive() {
        return state.isPinned || state.isPlaying;
      }

      function updateRootWidth() {
        if (!state.model) {
          root.style.removeProperty("--score-viewer-width");
          return;
        }
        root.style.setProperty(
          "--score-viewer-width",
          `${estimateViewerWidth(state.model.score.mode, state.model.score.laneCount)}px`,
        );
      }

      function updateScrollInteractivity() {
        const interactive = isScrollInteractive();
        scrollHost.classList.toggle("is-scrollable", interactive);
        scrollHost.style.overflowY = interactive ? "auto" : "hidden";
        if (!interactive) {
          clearDragState();
        }
      }

      function getPixelsPerSecond() {
        return DEFAULT_VIEWER_PIXELS_PER_SECOND * state.spacingScale;
      }
    }

    function createMarkerLabel(marker, side) {
      const label = document.createElement("div");
      label.className = `score-viewer-marker-label is-${marker.type} is-${side}`;
      label.textContent = marker.label;
      label.style.top = `${marker.y}px`;
      label.style.color = marker.color;
      label.style.left = `${marker.x}px`;
      return label;
    }

    function filterMarkerLabels(markers) {
      const filtered = [];
      let lastY = Number.NEGATIVE_INFINITY;
      for (const marker of [...markers].sort((left, right) => left.y - right.y)) {
        if (Math.abs(marker.y - lastY) < 12) {
          continue;
        }
        filtered.push(marker);
        lastY = marker.y;
      }
      return filtered;
    }

    function clampScale(value) {
      if (!Number.isFinite(value)) {
        return DEFAULT_SPACING_SCALE;
      }
      return Math.min(Math.max(value, MIN_SPACING_SCALE), MAX_SPACING_SCALE);
    }

    function formatSpacingScale(value) {
      return `${clampScale(value).toFixed(2)}x`;
    }

    function formatPlaybackTime(timeSec) {
      const safeTimeSec = Number.isFinite(timeSec) ? Math.max(timeSec, 0) : 0;
      const [secondsPart, fractionPart] = safeTimeSec.toFixed(3).split(".");
      return `${secondsPart.padStart(2, "0")}.${fractionPart}`;
    }

    function formatMeasureCounter(currentMeasureIndex, totalMeasureIndex) {
      const safeTotalMeasureIndex = Math.max(0, Math.floor(Number.isFinite(totalMeasureIndex) ? totalMeasureIndex : 0));
      const safeCurrentMeasureIndex = Math.min(
        Math.max(0, Math.floor(Number.isFinite(currentMeasureIndex) ? currentMeasureIndex : 0)),
        safeTotalMeasureIndex,
      );
      const digits = Math.max(3, String(safeTotalMeasureIndex).length);
      return `${String(safeCurrentMeasureIndex).padStart(digits, "0")}/${String(safeTotalMeasureIndex).padStart(digits, "0")}`;
    }
    exports.createScoreViewerController = createScoreViewerController;
    __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-controller.js"] = exports;
  })();

  (() => {
    const exports = {};

    const BMSDATA_COLUMNS = [
      "md5",
      "sha256",
      "maxbpm",
      "minbpm",
      "length",
      "mode",
      "judge",
      "feature",
      "notes",
      "n",
      "ln",
      "s",
      "ls",
      "total",
      "density",
      "peakdensity",
      "enddensity",
      "mainbpm",
      "distribution",
      "speedchange",
      "lanenotes",
      "tables",
      "stella",
      "bmsid",
    ];

    const BMS_FEATURE_NAMES = [
      "LN(#LNMODE undef)",
      "MINE",
      "RANDOM",
      "LN",
      "CN",
      "HCN",
      "STOP",
      "SCROLL",
    ];

    const DISTRIBUTION_NOTE_COLORS = [
      "#44FF44",
      "#228822",
      "#FF4444",
      "#4444FF",
      "#222288",
      "#CCCCCC",
      "#880000",
    ];

    const DISTRIBUTION_NOTE_NAMES = [
      "LNSCR",
      "LNSCR HOLD",
      "SCR",
      "LN",
      "LN HOLD",
      "NORMAL",
      "MINE",
    ];

    const BEAT_LANE_COLORS = new Map([
      ["0", "#e04a4a"],
      ["1", "#bebebe"],
      ["2", "#5074fe"],
      ["3", "#bebebe"],
      ["4", "#5074fe"],
      ["5", "#bebebe"],
      ["6", "#5074fe"],
      ["7", "#bebebe"],
      ["8", "#bebebe"],
      ["9", "#5074fe"],
      ["10", "#bebebe"],
      ["11", "#5074fe"],
      ["12", "#bebebe"],
      ["13", "#5074fe"],
      ["14", "#bebebe"],
      ["15", "#e04a4a"],
      ["g0", "#e04a4a"],
      ["g1", "#bebebe"],
      ["g2", "#5074fe"],
      ["g3", "#bebebe"],
      ["g4", "#5074fe"],
      ["g5", "#bebebe"],
      ["g6", "#bebebe"],
      ["g7", "#5074fe"],
      ["g8", "#bebebe"],
      ["g9", "#5074fe"],
      ["g10", "#bebebe"],
      ["g11", "#e04a4a"],
    ]);

    const POPN_LANE_COLORS = new Map([
      ["p0", "#c4c4c4"],
      ["p1", "#fff500"],
      ["p2", "#99ff67"],
      ["p3", "#30b9f9"],
      ["p4", "#ff6c6c"],
      ["p5", "#30b9f9"],
      ["p6", "#99ff67"],
      ["p7", "#fff500"],
      ["p8", "#c4c4c4"],
    ]);

    async function fetchBmsInfoRecord(sha256) {
      return fetchBmsInfoRecordByLookupKey(sha256);
    }

    async function fetchBmsInfoRecordByLookupKey(lookupKey) {
      const response = await fetch(`https://bms.howan.jp/${lookupKey}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch BMS data: HTTP ${response.status}`);
      }

      const text = await response.text();
      const values = text.split("\x1f");
      if (values.length !== BMSDATA_COLUMNS.length) {
        throw new Error(`BMS data column count mismatch: expected ${BMSDATA_COLUMNS.length}, got ${values.length}`);
      }

      const rawRecord = {};
      for (let index = 0; index < BMSDATA_COLUMNS.length; index += 1) {
        rawRecord[BMSDATA_COLUMNS[index]] = values[index];
      }
      return normalizeBmsInfoRecord(rawRecord);
    }

    function normalizeBmsInfoRecord(rawRecord) {
      const mode = Number(rawRecord.mode);
      const notes = Number(rawRecord.notes);
      const n = Number(rawRecord.n);
      const ln = Number(rawRecord.ln);
      const s = Number(rawRecord.s);
      const ls = Number(rawRecord.ls);
      const total = Number(rawRecord.total);
      const feature = Number(rawRecord.feature);
      const lengthMs = Number(rawRecord.length);

      return {
        md5: rawRecord.md5,
        sha256: rawRecord.sha256,
        maxbpm: Number(rawRecord.maxbpm),
        minbpm: Number(rawRecord.minbpm),
        mainbpm: Number(rawRecord.mainbpm),
        lengthMs,
        durationSec: lengthMs / 1000,
        mode,
        judge: Number(rawRecord.judge),
        feature,
        featureNames: BMS_FEATURE_NAMES.filter((name, index) => (feature & (1 << index)) !== 0),
        notes,
        n,
        ln,
        s,
        ls,
        total,
        density: Number(rawRecord.density),
        peakdensity: Number(rawRecord.peakdensity),
        enddensity: Number(rawRecord.enddensity),
        distribution: rawRecord.distribution,
        distributionSegments: parseDistributionSegments(rawRecord.distribution),
        speedchange: rawRecord.speedchange,
        speedChangePoints: parseSpeedChange(rawRecord.speedchange),
        lanenotesArr: parseLaneNotes(mode, rawRecord.lanenotes),
        tables: parseTables(rawRecord.tables),
        bmsid: Number(rawRecord.bmsid),
        stella: Number(rawRecord.stella),
        notesStr: `${notes} (N:${n}, LN:${ln}, SCR:${s}, LNSCR:${ls})`,
        totalStr: `${total % 1 === 0 ? Math.round(total) : total} (${notes > 0 ? (total / notes).toFixed(3) : "0.000"} T/N)`,
        durationStr: `${(lengthMs / 1000).toFixed(2)} s`,
      };
    }

    function parseTables(tablesRaw) {
      try {
        return JSON.parse(tablesRaw);
      } catch {
        return [];
      }
    }

    function parseLaneNotes(mode, lanenotes) {
      const tokens = String(lanenotes ?? "")
        .split(",")
        .map((token) => Number(token));

      let laneCount = mode;
      if (mode === 7) {
        laneCount = 8;
      } else if (mode === 14) {
        laneCount = 16;
      } else if (mode === 5) {
        laneCount = 6;
      } else if (mode === 10) {
        laneCount = 12;
      }

      const lanenotesArr = [];
      for (let index = 0; index < laneCount; index += 1) {
        const baseIndex = index * 3;
        const normal = tokens[baseIndex] ?? 0;
        const long = tokens[baseIndex + 1] ?? 0;
        const mine = tokens[baseIndex + 2] ?? 0;
        lanenotesArr.push([normal, long, mine, normal + long]);
      }

      if (mode === 7 || mode === 14) {
        const move = lanenotesArr.splice(7, 1)[0];
        if (move) {
          lanenotesArr.unshift(move);
        }
      } else if (mode === 5 || mode === 10) {
        const move = lanenotesArr.splice(5, 1)[0];
        if (move) {
          lanenotesArr.unshift(move);
        }
      }

      return lanenotesArr;
    }

    function parseDistributionSegments(distribution) {
      const noteTypes = 7;
      const data = String(distribution ?? "").startsWith("#") ? String(distribution).slice(1) : String(distribution ?? "");
      const segments = [];

      for (let index = 0; index < data.length; index += 14) {
        const chunk = data.slice(index, index + 14);
        if (chunk.length !== 14) {
          continue;
        }

        const noteCounts = [];
        for (let typeIndex = 0; typeIndex < noteTypes; typeIndex += 1) {
          const base36 = chunk.slice(typeIndex * 2, typeIndex * 2 + 2);
          noteCounts.push(Number.parseInt(base36, 36) || 0);
        }
        segments.push(noteCounts);
      }

      return segments;
    }

    function parseSpeedChange(raw) {
      const numbers = String(raw ?? "")
        .split(",")
        .map((token) => Number(token))
        .filter((value) => Number.isFinite(value));

      const result = [];
      for (let index = 0; index < numbers.length; index += 2) {
        result.push([numbers[index], numbers[index + 1]]);
      }
      return result;
    }

    function getLaneChipKey(mode, laneIndex) {
      if (mode === 5 || mode === 10) {
        return `g${laneIndex}`;
      }
      if (mode === 9) {
        return `p${laneIndex}`;
      }
      return String(laneIndex);
    }

    function getLaneChipColor(mode, laneIndex) {
      const key = getLaneChipKey(mode, laneIndex);
      if (key.startsWith("p")) {
        return POPN_LANE_COLORS.get(key) ?? "#c4c4c4";
      }
      return BEAT_LANE_COLORS.get(key) ?? "#bebebe";
    }

    function getLaneChipTextColor(mode, laneIndex) {
      const color = getLaneChipColor(mode, laneIndex).toLowerCase();
      return color === "#e04a4a" || color === "#5074fe" ? "#ffffff" : "#000000";
    }
    exports.BMSDATA_COLUMNS = BMSDATA_COLUMNS;
    exports.BMS_FEATURE_NAMES = BMS_FEATURE_NAMES;
    exports.DISTRIBUTION_NOTE_COLORS = DISTRIBUTION_NOTE_COLORS;
    exports.DISTRIBUTION_NOTE_NAMES = DISTRIBUTION_NOTE_NAMES;
    exports.fetchBmsInfoRecord = fetchBmsInfoRecord;
    exports.fetchBmsInfoRecordByLookupKey = fetchBmsInfoRecordByLookupKey;
    exports.normalizeBmsInfoRecord = normalizeBmsInfoRecord;
    exports.parseTables = parseTables;
    exports.parseLaneNotes = parseLaneNotes;
    exports.parseDistributionSegments = parseDistributionSegments;
    exports.parseSpeedChange = parseSpeedChange;
    exports.getLaneChipKey = getLaneChipKey;
    exports.getLaneChipColor = getLaneChipColor;
    exports.getLaneChipTextColor = getLaneChipTextColor;
    __previewRuntimeModules["site/dev/score-viewer/lib/bms-info-data.js"] = exports;
  })();

  (() => {
    const exports = {};
    const { DISTRIBUTION_NOTE_COLORS, DISTRIBUTION_NOTE_NAMES } = __previewRuntimeModules["site/dev/score-viewer/lib/bms-info-data.js"];
    const RECT_WIDTH = 4;
    const RECT_HEIGHT = 2;
    const SPACING = 1;
    const MIN_RATIO = 1 / 8;
    const MAX_RATIO = 8;
    const MIN_LOG = Math.log10(MIN_RATIO);
    const MAX_LOG = Math.log10(MAX_RATIO);

    function createBmsInfoGraph({
      scrollHost,
      canvas,
      tooltip,
      pinInput,
      onHoverTime = () => {},
      onHoverLeave = () => {},
      onSelectTime = () => {},
      onPinChange = () => {},
    }) {
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
        render();
      }

      function setSelectedTimeSec(timeSec) {
        state.selectedTimeSec = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0;
        render();
        syncScrollToSelected();
      }

      function setPinned(nextPinned) {
        state.isPinned = Boolean(nextPinned);
        pinInput.checked = state.isPinned;
        pinInput.disabled = !state.record;
      }

      function render() {
        const record = state.record;
        if (!record) {
          canvas.width = 640;
          canvas.height = 180;
          const context = canvas.getContext("2d");
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = "#000000";
          context.fillRect(0, 0, canvas.width, canvas.height);
          drawSelectedTimeLine(context, 0, canvas.height);
          return;
        }

        const segments = record.distributionSegments;
        const timeLength = Math.max(segments.length, 1);
        const maxNotesPerSecond = Math.max(40, Math.min(record.peakdensity || 0, 100));
        const canvasWidth = timeLength * (RECT_WIDTH + SPACING);
        const canvasHeight = maxNotesPerSecond * (RECT_HEIGHT + SPACING) - SPACING;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#000000";
        context.fillRect(0, 0, canvas.width, canvas.height);

        drawHorizontalGrid(context, canvasWidth, canvasHeight, maxNotesPerSecond);
        drawVerticalGrid(context, canvasWidth, canvasHeight, timeLength);
        drawDistributionBars(context, segments, canvasHeight, maxNotesPerSecond);
        drawSpeedChangeLines(context, record, canvasWidth, canvasHeight, timeLength);
        drawSelectedTimeLine(context, timeToX(state.selectedTimeSec), canvasHeight);
      }

      function syncScrollToSelected() {
        if (!state.record || !scrollHost) {
          return;
        }
        const x = timeToX(state.selectedTimeSec);
        const maxScrollLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth);
        const desired = clamp(x - scrollHost.clientWidth / 2, 0, maxScrollLeft);
        if (Math.abs(scrollHost.scrollLeft - desired) > 8) {
          scrollHost.scrollLeft = desired;
        }
      }

      render();

      return {
        setRecord,
        setSelectedTimeSec,
        setPinned,
        render,
      };
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

    function clamp(value, minValue, maxValue) {
      return Math.min(Math.max(value, minValue), maxValue);
    }
    exports.createBmsInfoGraph = createBmsInfoGraph;
    __previewRuntimeModules["site/dev/score-viewer/lib/bms-info-graph.js"] = exports;
  })();

  (() => {
    const exports = {};
    const { createScoreViewerModel, getClampedSelectedTimeSec, getScoreTotalDurationSec } = __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-model.js"];
    const { createScoreViewerController } = __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-controller.js"];
    const { estimateViewerWidth } = __previewRuntimeModules["site/dev/score-viewer/lib/score-viewer-renderer.js"];
    const { fetchBmsInfoRecordByLookupKey, getLaneChipKey } = __previewRuntimeModules["site/dev/score-viewer/lib/bms-info-data.js"];
    const { createBmsInfoGraph } = __previewRuntimeModules["site/dev/score-viewer/lib/bms-info-graph.js"];
    const BMSDATA_STYLE_ID = "bms-info-extender-style";
    const BMSSEARCH_PATTERN_API_BASE_URL = "https://api.bmssearch.net/v1/patterns/sha256";
    const BMSSEARCH_PATTERN_PAGE_BASE_URL = "https://bmssearch.net/patterns";
    const SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS = 250;

    const bmsSearchPatternAvailabilityCache = new Map();

    const BMSDATA_CSS = `
      .bmsdata {
        --bd-dctx: #333;
        --bd-dcbk: #fff;
        --bd-hdtx: #eef;
        --bd-hdbk: #669;
      }
      .bmsdata * { line-height: 100%; color: var(--bd-dctx); background-color: var(--bd-dcbk); font-family: "Inconsolata", "Noto Sans JP"; vertical-align: middle; box-sizing: content-box; }
      .bd-info { display: flex; border: 0px; height: 9.6rem; }
      .bd-info a { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border: 1px solid; border-radius: 2px; font-size: 0.750rem; color: #155dfc; text-decoration: none; }
      .bd-info a:hover { color: red; }
      .bd-icon { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border-radius: 2px; background: var(--bd-dctx); color: var(--bd-dcbk); font-size: 0.750rem; }
      .bd-icon:nth-child(n+2) { margin-left: 0.4rem; }
      .bd-info .bd-info-table { flex: 1; border-collapse: collapse; height: 100%; }
      .bd-info td { border: unset; padding: 0.1rem 0.2rem; height: 1rem; white-space: nowrap; font-size: 0.875rem; }
      .bd-info .bd-header-cell { background-color: var(--bd-hdbk); color: var(--bd-hdtx); }
      .bd-info .bd-lanenote { margin-right: 0.2rem; padding: 0.1rem 0.2rem; border-radius: 2px; font-size: 0.750rem; }
      .bd-table-list { flex: 1; display: flex; min-width: 100px; flex-direction: column; box-sizing: border-box; }
      .bd-table-list .bd-header-cell { padding: 0.1rem 0.2rem; min-height: 1rem; white-space: nowrap; font-size: 0.875rem; color: var(--bd-hdtx); display: flex; align-items: center; }
      .bd-table-scroll { overflow: auto; flex: 1 1 auto; scrollbar-color: var(--bd-hdbk) white; scrollbar-width: thin; }
      .bd-table-list ul { padding: 0.1rem 0.2rem; margin: 0; }
      .bd-table-list li { margin-bottom: 0.2rem; line-height: 1rem; font-size: 0.875rem; white-space: nowrap; list-style-type: none; }
      #bd-graph { position: relative; padding: 0px; border-width: 0px; background-color: #000; overflow-x: auto; line-height: 0; scrollbar-color: var(--bd-hdbk) black; scrollbar-width: thin; }
      #bd-graph-canvas { background-color: #000; }
      #bd-graph-tooltip { line-height: 1.25; position: fixed; background: rgba(32, 32, 64, 0.88); color: #fff; padding: 4px 8px; font-size: 0.8125rem; pointer-events: none; border-radius: 6px; display: none; z-index: 10; white-space: nowrap; box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22); }
      .bd-scoreviewer-pin { position: absolute; top: 4px; left: 4px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: rgba(32, 32, 64, 0.5); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-sizing: border-box; z-index: 2; width: auto; }
      .bd-scoreviewer-pin * { background: transparent; color: #fff; font-family: "Inconsolata", "Noto Sans JP"; }
      .bd-scoreviewer-pin input { width: auto; flex: 0 0 auto; min-height: auto; margin: 0; padding: 0; border: none; background: transparent; accent-color: #ffffff; }
      .bd-scoreviewer-pin span { display: inline-block; line-height: 1.25; white-space: nowrap; }
      .score-viewer-shell * { box-sizing: content-box; }
      .score-viewer-shell { --score-viewer-width: 520px; position: fixed; top: 0; right: 0; width: var(--score-viewer-width); height: 100dvh; background: #000; border-left: 1px solid rgba(112, 112, 132, 0.4); box-shadow: -12px 0 32px rgba(0, 0, 0, 0.38); overflow: hidden; z-index: 2147483000; opacity: 0; pointer-events: none; transform: translateX(100%); transition: transform 120ms ease, opacity 120ms ease; }
      .score-viewer-shell.is-visible { opacity: 1; pointer-events: auto; transform: translateX(0); }
      .score-viewer-scroll-host { position: absolute; inset: 0; overflow-x: hidden; overflow-y: hidden; scrollbar-gutter: stable; }
      .score-viewer-scroll-host.is-scrollable { overflow-y: auto; cursor: grab; touch-action: none; }
      .score-viewer-scroll-host.is-scrollable.is-dragging { cursor: grabbing; }
      .score-viewer-spacer { width: 1px; opacity: 0; }
      .score-viewer-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
      .score-viewer-marker-overlay, .score-viewer-marker-labels { position: absolute; inset: 0; pointer-events: none; }
      .score-viewer-marker-label { position: absolute; top: 0; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1; white-space: nowrap; text-shadow: 0 0 4px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.72); }
      .score-viewer-marker-label.is-left { transform: translate(-100%, -50%); text-align: right; }
      .score-viewer-marker-label.is-right { transform: translate(0, -50%); text-align: left; }
      .score-viewer-bottom-bar { position: absolute; left: 12px; bottom: 12px; z-index: 3; pointer-events: none; }
      .score-viewer-status-panel { display: grid; gap: 4px; min-width: 180px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(160, 160, 196, 0.22); background: rgba(32, 32, 64, 0.8); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24); pointer-events: auto; }
      .score-viewer-status-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .score-viewer-status-row.is-time { justify-content: flex-start; gap: 8px; }
      .score-viewer-status-metric { font-variant-numeric: tabular-nums; }
      .score-viewer-spacing-row { padding-top: 2px; }
      .score-viewer-spacing-title { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
      .score-viewer-spacing-value { margin-left: auto; color: #fff; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
      .score-viewer-playback-button { display: inline-flex; align-items: center; justify-content: center; width: 20px; min-width: 20px; height: 20px; min-height: 20px; padding: 0; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.24); background: rgba(255, 255, 255, 0.16); color: #fff; box-shadow: none; font-size: 0.58rem; line-height: 1; pointer-events: auto; cursor: pointer; }
      .score-viewer-playback-button:disabled { opacity: 0.5; cursor: not-allowed; }
      .score-viewer-playback-time { font-variant-numeric: tabular-nums; }
      .score-viewer-spacing-input { width: 100%; min-height: auto; margin: 0; padding: 0; background: transparent; border: none; accent-color: #ffffff; pointer-events: auto; }
      .score-viewer-judge-line { position: absolute; left: 0; right: 0; top: 50%; display: flex; align-items: center; transform: translateY(-50%); pointer-events: none; }
      .score-viewer-judge-line::after { content: ""; width: 100%; height: 2px; background: linear-gradient(90deg, rgba(187, 71, 49, 0.18) 0%, rgba(187, 71, 49, 0.94) 48%, rgba(187, 71, 49, 0.18) 100%); box-shadow: 0 0 20px rgba(187, 71, 49, 0.2); }
      .bd-lanenote[lane="0"] { background: #e04a4a; color: #fff; }
      .bd-lanenote[lane="1"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="2"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="3"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="4"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="5"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="6"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="7"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="8"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="9"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="10"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="11"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="12"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="13"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="14"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="15"] { background: #e04a4a; color: #fff; }
      .bd-lanenote[lane="g0"] { background: #e04a4a; color: #fff; }
      .bd-lanenote[lane="g1"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="g2"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="g3"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="g4"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="g5"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="g6"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="g7"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="g8"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="g9"] { background: #5074fe; color: #fff; }
      .bd-lanenote[lane="g10"] { background: #bebebe; color: #000; }
      .bd-lanenote[lane="g11"] { background: #e04a4a; color: #fff; }
      .bd-lanenote[lane="p0"] { background: #c4c4c4; color: #000; }
      .bd-lanenote[lane="p1"] { background: #fff500; color: #000; }
      .bd-lanenote[lane="p2"] { background: #99ff67; color: #000; }
      .bd-lanenote[lane="p3"] { background: #30b9f9; color: #000; }
      .bd-lanenote[lane="p4"] { background: #ff6c6c; color: #000; }
      .bd-lanenote[lane="p5"] { background: #30b9f9; color: #000; }
      .bd-lanenote[lane="p6"] { background: #99ff67; color: #000; }
      .bd-lanenote[lane="p7"] { background: #fff500; color: #000; }
      .bd-lanenote[lane="p8"] { background: #c4c4c4; color: #000; }
    `;

    const BMSDATA_TEMPLATE_HTML = `
      <div id="bmsdata-container" class="bmsdata" style="display: none;">
        <div class="bd-info">
          <table class="bd-info-table">
            <tr>
              <td class="bd-header-cell">LINK</td>
              <td colspan="3">
                <a href="" id="bd-lr2ir" style="display: none;">LR2IR</a><a href="" id="bd-minir" style="display: none;">MinIR</a><a href="" id="bd-mocha" style="display: none;">Mocha</a><a href="" id="bd-viewer" style="display: none;">Viewer</a><a href="" id="bd-bmssearch" style="display: none;">BMS<span style="display:inline-block; width:2px;"></span>SEARCH</a><a href="" id="bd-bokutachi" style="display: none;">Bokutachi</a><a href="" id="bd-stellaverse" style="display: none;">STELLAVERSE</a>
              </td>
            </tr>
            <tr>
              <td class="bd-header-cell">SHA256</td>
              <td colspan="3" id="bd-sha256">Loading...</td>
            </tr>
            <tr>
              <td class="bd-header-cell">MD5</td>
              <td id="bd-md5">Loading...</td>
              <td class="bd-header-cell">BMSID</td>
              <td id="bd-bmsid">Loading...</td>
            </tr>
            <tr>
              <td class="bd-header-cell">BPM</td>
              <td>
                <span class="bd-icon">MAIN</span><span id="bd-mainbpm">0</span><span class="bd-icon">MIN</span><span
                  id="bd-minbpm">0</span><span class="bd-icon">MAX</span><span id="bd-maxbpm">0</span>
              </td>
              <td class="bd-header-cell">MODE</td>
              <td id="bd-mode">0</td>
            </tr>
            <tr>
              <td class="bd-header-cell">FEATURE</td>
              <td id="bd-feature">Loading...</td>
              <td class="bd-header-cell">JUDGERANK</td>
              <td id="bd-judgerank">0</td>
            </tr>
            <tr>
              <td class="bd-header-cell">NOTES</td>
              <td id="bd-notes">0 (N: 0, LN: 0, SC: 0, LNSC: 0)</td>
              <td class="bd-header-cell">TOTAL</td>
              <td id="bd-total">0 (0.000 T/N)</td>
            </tr>
            <tr>
              <td class="bd-header-cell">DENSITY</td>
              <td><span class="bd-icon">AVG</span><span id="bd-avgdensity">0.0</span><span class="bd-icon">PEAK</span><span
                  id="bd-peakdensity">0</span><span class="bd-icon">END</span><span id="bd-enddensity">0.0</span></td>
              <td class="bd-header-cell">DURATION</td>
              <td id="bd-duration">000.000 s</td>
            </tr>
            <tr>
              <td class="bd-header-cell">LANENOTES</td>
              <td colspan="3">
                <div class="bd-lanenotes" id="bd-lanenotes-div"></div>
              </td>
            </tr>
          </table>
          <div class="bd-table-list">
            <div class="bd-header-cell">TABLES</div>
            <div class="bd-table-scroll">
              <ul id="bd-tables-ul">
              </ul>
            </div>
          </div>
        </div>
        <div id="bd-graph">
          <label class="bd-scoreviewer-pin">
            <input id="bd-scoreviewer-pin-input" type="checkbox">
            <span>Pin the score viewer</span>
          </label>
          <div id="bd-graph-tooltip"></div>
          <canvas id="bd-graph-canvas"></canvas>
        </div>
      </div>
    `;

    function ensureBmsDataStyleOnce(documentRef = document) {
      if (documentRef.getElementById(BMSDATA_STYLE_ID)) {
        return;
      }
      const styleElement = documentRef.createElement("style");
      styleElement.id = BMSDATA_STYLE_ID;
      styleElement.textContent = BMSDATA_CSS;
      documentRef.head.appendChild(styleElement);
    }

    function createBmsDataContainer({ documentRef = document, theme }) {
      ensureBmsDataStyleOnce(documentRef);
      const template = documentRef.createElement("template");
      template.innerHTML = BMSDATA_TEMPLATE_HTML.trim();
      const container = template.content.firstElementChild;
      if (!container) {
        throw new Error("BMS preview template did not create a container.");
      }
      if (theme) {
        container.style.setProperty("--bd-dctx", theme.dctx);
        container.style.setProperty("--bd-dcbk", theme.dcbk);
        container.style.setProperty("--bd-hdtx", theme.hdtx);
        container.style.setProperty("--bd-hdbk", theme.hdbk);
      }
      return container;
    }

    function insertBmsDataContainer({ documentRef = document, insertion, theme }) {
      const container = createBmsDataContainer({ documentRef, theme });
      insertion.element.insertAdjacentElement(insertion.position, container);
      return container;
    }

    async function fetchBmsInfoRecordByIdentifiers({ md5 = null, sha256 = null, bmsid = null }) {
      const lookupKey = md5 ?? sha256 ?? bmsid;
      if (!lookupKey) {
        return false;
      }

      try {
        return await fetchBmsInfoRecordByLookupKey(lookupKey);
      } catch (error) {
        console.error("Fetch or parse error:", error);
        return false;
      }
    }

    async function checkBmsSearchPatternExists(sha256) {
      if (!sha256) {
        return false;
      }

      let cachedPromise = bmsSearchPatternAvailabilityCache.get(sha256);
      if (!cachedPromise) {
        cachedPromise = (async () => {
          try {
            const response = await fetch(`${BMSSEARCH_PATTERN_API_BASE_URL}/${sha256}`);
            return response.ok;
          } catch (error) {
            bmsSearchPatternAvailabilityCache.delete(sha256);
            console.warn("BMS SEARCH APIで譜面の存在確認に失敗しました:", error);
            return false;
          }
        })();
        bmsSearchPatternAvailabilityCache.set(sha256, cachedPromise);
      }

      return cachedPromise;
    }

    async function renderBmsSearchLinkIfAvailable(container, sha256) {
      try {
        if (!sha256 || !await checkBmsSearchPatternExists(sha256) || !container.isConnected) {
          return;
        }
        const bmsSearchLink = container.querySelector("#bd-bmssearch");
        if (!bmsSearchLink) {
          return;
        }
        showLink(bmsSearchLink, `${BMSSEARCH_PATTERN_PAGE_BASE_URL}/${sha256}`);
      } catch (error) {
        console.warn("BMS SEARCHリンクの表示に失敗しました:", error);
      }
    }

    function renderBmsData(container, normalizedRecord) {
      const getById = (id) => container.querySelector(`#${id}`);

      renderLinks(container, normalizedRecord);
      getById("bd-sha256").textContent = normalizedRecord.sha256;
      getById("bd-md5").textContent = normalizedRecord.md5;
      getById("bd-bmsid").textContent = normalizedRecord.bmsid ? normalizedRecord.bmsid : "Undefined";
      getById("bd-mainbpm").textContent = formatCompactNumber(normalizedRecord.mainbpm);
      getById("bd-maxbpm").textContent = formatCompactNumber(normalizedRecord.maxbpm);
      getById("bd-minbpm").textContent = formatCompactNumber(normalizedRecord.minbpm);
      getById("bd-mode").textContent = normalizedRecord.mode;
      getById("bd-feature").textContent = normalizedRecord.featureNames.join(", ");
      getById("bd-judgerank").textContent = normalizedRecord.judge;
      getById("bd-notes").textContent = normalizedRecord.notesStr;
      getById("bd-total").textContent = normalizedRecord.totalStr;
      getById("bd-avgdensity").textContent = normalizedRecord.density.toFixed(3);
      getById("bd-peakdensity").textContent = formatCompactNumber(normalizedRecord.peakdensity);
      getById("bd-enddensity").textContent = formatCompactNumber(normalizedRecord.enddensity);
      getById("bd-duration").textContent = normalizedRecord.durationStr;
      renderLaneNotes(container, normalizedRecord);
      renderTables(container, normalizedRecord);
      container.style.display = "block";
      void renderBmsSearchLinkIfAvailable(container, normalizedRecord.sha256);
    }

    function createBmsInfoPreview({
      container,
      documentRef = document,
      loadParsedScore = async () => null,
      prefetchParsedScore = async () => {},
      onSelectedTimeChange = () => {},
      onPinChange = () => {},
      onPlaybackChange = () => {},
      onViewerOpenChange = () => {},
      onRuntimeError = () => {},
    }) {
      const graphHost = container.querySelector("#bd-graph");
      const graphCanvas = container.querySelector("#bd-graph-canvas");
      const graphTooltip = container.querySelector("#bd-graph-tooltip");
      const pinInput = container.querySelector("#bd-scoreviewer-pin-input");

      if (!graphHost || !graphCanvas || !graphTooltip || !pinInput) {
        throw new Error("BMS preview graph elements are missing.");
      }

      const shell = documentRef.createElement("div");
      shell.className = "score-viewer-shell";
      documentRef.body.appendChild(shell);

      const parsedScoreCache = new Map();
      const loadPromiseCache = new Map();
      const state = {
        record: null,
        selectedSha256: null,
        selectedTimeSec: 0,
        isPinned: false,
        isViewerOpen: false,
        isPlaying: false,
        isGraphHovered: false,
        parsedScore: null,
        viewerModel: null,
        loadToken: 0,
        renderFrameId: null,
        playbackFrameId: null,
        lastPlaybackTimestamp: null,
        lastViewerOpenState: false,
        isDestroyed: false,
      };

      const viewerController = createScoreViewerController({
        root: shell,
        onTimeChange: (timeSec) => {
          setSelectedTimeSec(timeSec, { openViewer: true, notify: true });
        },
        onPlaybackToggle: (nextPlaying) => {
          setPlaybackState(nextPlaying);
        },
      });

      const graphController = createBmsInfoGraph({
        scrollHost: graphHost,
        canvas: graphCanvas,
        tooltip: graphTooltip,
        pinInput,
        onHoverTime: (timeSec) => {
          handleGraphHover(timeSec);
        },
        onHoverLeave: () => {
          state.isGraphHovered = false;
          if (!state.isPinned && !state.isPlaying) {
            state.isViewerOpen = false;
          }
          scheduleRender();
        },
        onSelectTime: (timeSec) => {
          state.isPinned = true;
          onPinChange(true);
          void activateRecord({ openViewer: true });
          setSelectedTimeSec(timeSec, { openViewer: true, notify: true });
        },
        onPinChange: (nextPinned) => {
          state.isPinned = Boolean(nextPinned);
          onPinChange(state.isPinned);
          if (state.isPinned) {
            state.isViewerOpen = true;
            void activateRecord({ openViewer: true });
          } else if (!state.isGraphHovered && !state.isPlaying) {
            state.isViewerOpen = false;
          }
          scheduleRender();
        },
      });

      return {
        setRecord,
        setSelectedTimeSec,
        setPinned,
        setPlaybackState,
        prefetch,
        destroy,
        getState: () => ({ ...state }),
      };

      function setRecord(normalizedRecord, { parsedScore = null } = {}) {
        const previousSha256 = state.record?.sha256 ?? null;
        const nextSha256Value = normalizedRecord?.sha256 ?? null;
        const recordChanged = previousSha256 !== nextSha256Value || state.record !== normalizedRecord;
        state.record = normalizedRecord;
        if (!normalizedRecord) {
          state.selectedSha256 = null;
          state.parsedScore = null;
          state.viewerModel = null;
          state.selectedTimeSec = 0;
          state.isViewerOpen = false;
          graphController.setRecord(null);
          scheduleRender();
          return;
        }

        if (recordChanged) {
          renderBmsData(container, normalizedRecord);
          graphController.setRecord(normalizedRecord);
          shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(normalizedRecord.mode)}px`);
        }

        const nextSha256 = normalizedRecord.sha256 ? normalizedRecord.sha256.toLowerCase() : null;
        if (parsedScore && nextSha256) {
          const viewerModel = createScoreViewerModel(parsedScore);
          parsedScoreCache.set(nextSha256, { score: parsedScore, viewerModel });
          state.parsedScore = parsedScore;
          state.viewerModel = viewerModel;
          state.selectedSha256 = nextSha256;
          state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        } else if (state.selectedSha256 !== nextSha256) {
          state.parsedScore = null;
          state.viewerModel = null;
          state.selectedSha256 = nextSha256;
          state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        }

        graphController.setPinned(state.isPinned);
        graphController.setSelectedTimeSec(state.selectedTimeSec);
        scheduleRender();
      }

      async function prefetch() {
        if (!state.record?.sha256) {
          return;
        }
        try {
          await prefetchParsedScore(state.record);
        } catch (error) {
          console.warn("Score prefetch failed:", error);
        }
      }

      function handleGraphHover(timeSec) {
        state.isGraphHovered = true;
        void activateRecord({ openViewer: true });
        if (state.isPlaying) {
          return;
        }
        setSelectedTimeSec(timeSec, { openViewer: true, notify: true });
      }

      async function activateRecord({ openViewer = false } = {}) {
        if (!state.record) {
          return;
        }
        if (openViewer) {
          state.isViewerOpen = true;
        }

        const sha256 = state.record.sha256 ? state.record.sha256.toLowerCase() : null;
        if (!sha256) {
          state.parsedScore = null;
          state.viewerModel = null;
          scheduleRender();
          return;
        }

        if (state.selectedSha256 === sha256 && state.viewerModel) {
          scheduleRender();
          return;
        }

        state.selectedSha256 = sha256;
        scheduleRender();
        await loadSelectedRecord(state.record);
      }

      async function loadSelectedRecord(normalizedRecord) {
        if (!normalizedRecord?.sha256) {
          state.parsedScore = null;
          state.viewerModel = null;
          scheduleRender();
          return;
        }

        const sha256 = normalizedRecord.sha256.toLowerCase();
        const loadToken = ++state.loadToken;

        if (parsedScoreCache.has(sha256)) {
          const cached = parsedScoreCache.get(sha256);
          if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
            return;
          }
          applyLoadedScore(cached.score, cached.viewerModel);
          return;
        }

        try {
          let loadPromise = loadPromiseCache.get(sha256);
          if (!loadPromise) {
            loadPromise = Promise.resolve(loadParsedScore(normalizedRecord))
              .then((parsedScore) => {
                if (!parsedScore) {
                  throw new Error("Parsed score was not returned.");
                }
                const viewerModel = createScoreViewerModel(parsedScore);
                const cached = { score: parsedScore, viewerModel };
                parsedScoreCache.set(sha256, cached);
                loadPromiseCache.delete(sha256);
                return cached;
              })
              .catch((error) => {
                loadPromiseCache.delete(sha256);
                throw error;
              });
            loadPromiseCache.set(sha256, loadPromise);
          }

          const cached = await loadPromise;
          if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
            return;
          }
          applyLoadedScore(cached.score, cached.viewerModel);
        } catch (error) {
          if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
            return;
          }
          console.warn("Score viewer parse/load failed:", error);
          onRuntimeError(error);
          state.parsedScore = null;
          state.viewerModel = null;
          state.isViewerOpen = false;
          scheduleRender();
        }
      }

      function applyLoadedScore(parsedScore, viewerModel) {
        state.parsedScore = parsedScore;
        state.viewerModel = viewerModel;
        state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        scheduleRender();
      }

      function setSelectedTimeSec(nextTimeSec, { openViewer = false, notify = false } = {}) {
        const clampedTimeSec = clampSelectedTimeSec(state, nextTimeSec);
        const changed = Math.abs(clampedTimeSec - state.selectedTimeSec) >= 0.0005;
        if (openViewer) {
          state.isViewerOpen = true;
        }
        state.selectedTimeSec = clampedTimeSec;
        if (notify && changed) {
          onSelectedTimeChange(clampedTimeSec);
        }
        if (!changed && !openViewer) {
          return;
        }
        scheduleRender();
      }

      function setPinned(nextPinned) {
        const normalized = Boolean(nextPinned);
        if (state.isPinned === normalized) {
          return;
        }
        state.isPinned = normalized;
        onPinChange(state.isPinned);
        if (state.isPinned) {
          state.isViewerOpen = true;
          void activateRecord({ openViewer: true });
        } else if (!state.isGraphHovered && !state.isPlaying) {
          state.isViewerOpen = false;
        }
        scheduleRender();
      }

      function setPlaybackState(nextPlaying) {
        if (state.isPlaying === Boolean(nextPlaying) && state.viewerModel && state.parsedScore) {
          return;
        }
        if (!state.viewerModel || !state.parsedScore) {
          stopPlayback(false);
          scheduleRender();
          return;
        }
        if (nextPlaying) {
          startPlayback();
        } else {
          stopPlayback(true);
        }
      }

      function startPlayback() {
        if (!state.viewerModel || !state.parsedScore) {
          return;
        }
        const maxTimeSec = getScoreTotalDurationSec(state.parsedScore);
        if (maxTimeSec <= 0) {
          return;
        }
        if (state.selectedTimeSec >= maxTimeSec - 0.0005) {
          state.selectedTimeSec = 0;
          onSelectedTimeChange(state.selectedTimeSec);
        }
        state.isPlaying = true;
        state.isViewerOpen = true;
        state.lastPlaybackTimestamp = null;
        onPlaybackChange(true);
        if (state.playbackFrameId !== null) {
          cancelAnimationFrame(state.playbackFrameId);
        }
        scheduleRender();
        state.playbackFrameId = requestAnimationFrame(stepPlayback);
      }

      function stopPlayback(renderAfter = true) {
        if (state.playbackFrameId !== null) {
          cancelAnimationFrame(state.playbackFrameId);
          state.playbackFrameId = null;
        }
        state.lastPlaybackTimestamp = null;
        if (state.isPlaying) {
          state.isPlaying = false;
          onPlaybackChange(false);
        }
        if (renderAfter) {
          scheduleRender();
        }
      }

      function stepPlayback(timestamp) {
        if (!state.isPlaying || !state.viewerModel || !state.parsedScore) {
          state.playbackFrameId = null;
          state.lastPlaybackTimestamp = null;
          return;
        }
        if (state.lastPlaybackTimestamp === null || timestamp - state.lastPlaybackTimestamp > SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS) {
          state.lastPlaybackTimestamp = timestamp;
          state.playbackFrameId = requestAnimationFrame(stepPlayback);
          return;
        }
        const deltaSec = (timestamp - state.lastPlaybackTimestamp) / 1000;
        state.lastPlaybackTimestamp = timestamp;
        const maxTimeSec = getScoreTotalDurationSec(state.parsedScore);
        const nextTimeSec = Math.min(state.selectedTimeSec + deltaSec, maxTimeSec);
        const changed = Math.abs(nextTimeSec - state.selectedTimeSec) >= 0.0005;
        state.selectedTimeSec = nextTimeSec;
        if (changed) {
          onSelectedTimeChange(state.selectedTimeSec);
        }
        scheduleRender();
        if (nextTimeSec >= maxTimeSec - 0.0005) {
          stopPlayback(false);
          scheduleRender();
          return;
        }
        state.playbackFrameId = requestAnimationFrame(stepPlayback);
      }

      function scheduleRender() {
        if (state.isDestroyed || state.renderFrameId !== null) {
          return;
        }
        state.renderFrameId = requestAnimationFrame(() => {
          state.renderFrameId = null;
          flushRender();
        });
      }

      function flushRender() {
        graphController.setPinned(state.isPinned);
        graphController.setSelectedTimeSec(state.selectedTimeSec);
        viewerController.setPlaybackState(state.isPlaying);
        viewerController.setPinned(state.isPinned);
        viewerController.setModel(state.viewerModel);
        viewerController.setSelectedTimeSec(state.selectedTimeSec);
        viewerController.setOpen(Boolean(state.isViewerOpen && state.viewerModel));

        const isActuallyOpen = Boolean(state.isViewerOpen && state.viewerModel);
        if (state.lastViewerOpenState !== isActuallyOpen) {
          state.lastViewerOpenState = isActuallyOpen;
          onViewerOpenChange(isActuallyOpen);
        }
      }

      function destroy() {
        state.isDestroyed = true;
        if (state.renderFrameId !== null) {
          cancelAnimationFrame(state.renderFrameId);
          state.renderFrameId = null;
        }
        stopPlayback(false);
        graphController.destroy();
        viewerController.destroy();
        shell.remove();
      }
    }

    function renderLinks(container, normalizedRecord) {
      const getById = (id) => container.querySelector(`#${id}`);

      if (normalizedRecord.md5) {
        showLink(getById("bd-lr2ir"), `http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5=${normalizedRecord.md5}`);
        showLink(getById("bd-viewer"), `https://bms-score-viewer.pages.dev/view?md5=${normalizedRecord.md5}`);
      }
      if (normalizedRecord.sha256) {
        showLink(getById("bd-minir"), `https://www.gaftalk.com/minir/#/viewer/song/${normalizedRecord.sha256}/0`);
        showLink(getById("bd-mocha"), `https://mocha-repository.info/song.php?sha256=${normalizedRecord.sha256}`);
      }
      if (normalizedRecord.stella) {
        showLink(getById("bd-stellaverse"), `https://stellabms.xyz/song/${normalizedRecord.stella}`);
      }
    }

    function renderLaneNotes(container, normalizedRecord) {
      const laneNotesContainer = container.querySelector("#bd-lanenotes-div");
      if (!laneNotesContainer) {
        return;
      }
      laneNotesContainer.replaceChildren();
      normalizedRecord.lanenotesArr.forEach((laneNotes, index) => {
        const span = container.ownerDocument.createElement("span");
        span.className = "bd-lanenote";
        span.setAttribute("lane", getLaneChipKey(normalizedRecord.mode, index));
        span.textContent = String(laneNotes[3]);
        laneNotesContainer.appendChild(span);
      });
    }

    function renderTables(container, normalizedRecord) {
      const tableList = container.querySelector("#bd-tables-ul");
      if (!tableList) {
        return;
      }
      tableList.replaceChildren();
      normalizedRecord.tables.forEach((text) => {
        const item = container.ownerDocument.createElement("li");
        item.textContent = text;
        tableList.appendChild(item);
      });
    }

    function showLink(linkElement, href) {
      if (!linkElement) {
        return;
      }
      linkElement.href = href;
      linkElement.style.display = "inline";
    }

    function clampSelectedTimeSec(state, timeSec) {
      if (state.viewerModel) {
        return getClampedSelectedTimeSec(state.viewerModel, timeSec);
      }
      const maxTimeSec = state.record?.durationSec ?? 0;
      return clampValue(Number.isFinite(timeSec) ? timeSec : 0, 0, Math.max(maxTimeSec, 0));
    }

    function estimateViewerWidthFromNumericMode(mode) {
      switch (Number(mode)) {
        case 5:
          return estimateViewerWidth("5k", 6);
        case 7:
          return estimateViewerWidth("7k", 8);
        case 9:
          return estimateViewerWidth("popn-9k", 9);
        case 10:
          return estimateViewerWidth("10k", 12);
        case 14:
          return estimateViewerWidth("14k", 16);
        default:
          return estimateViewerWidth(String(mode ?? ""), getDisplayLaneCount(mode));
      }
    }

    function getDisplayLaneCount(mode) {
      switch (mode) {
        case 5:
        case "5k":
          return 6;
        case 7:
        case "7k":
          return 8;
        case 10:
        case "10k":
          return 12;
        case 14:
        case "14k":
          return 16;
        case 9:
        case "9k":
        case "popn-9k":
          return 9;
        case "popn-5k":
          return 5;
        default:
          return Number.isFinite(Number(mode)) && Number(mode) > 0 ? Number(mode) : 8;
      }
    }

    function formatCompactNumber(value) {
      if (!Number.isFinite(value)) {
        return "-";
      }
      return Number.isInteger(value) ? String(Math.trunc(value)) : String(value);
    }

    function clampValue(value, minValue, maxValue) {
      return Math.min(Math.max(value, minValue), maxValue);
    }
    exports.BMSDATA_STYLE_ID = BMSDATA_STYLE_ID;
    exports.BMSDATA_CSS = BMSDATA_CSS;
    exports.BMSDATA_TEMPLATE_HTML = BMSDATA_TEMPLATE_HTML;
    exports.ensureBmsDataStyleOnce = ensureBmsDataStyleOnce;
    exports.createBmsDataContainer = createBmsDataContainer;
    exports.insertBmsDataContainer = insertBmsDataContainer;
    exports.fetchBmsInfoRecordByIdentifiers = fetchBmsInfoRecordByIdentifiers;
    exports.checkBmsSearchPatternExists = checkBmsSearchPatternExists;
    exports.renderBmsSearchLinkIfAvailable = renderBmsSearchLinkIfAvailable;
    exports.renderBmsData = renderBmsData;
    exports.createBmsInfoPreview = createBmsInfoPreview;
    __previewRuntimeModules["site/dev/score-viewer/lib/preview-runtime-source.js"] = exports;
  })();

  const __previewRuntimeEntry = __previewRuntimeModules["site/dev/score-viewer/lib/preview-runtime-source.js"];
  const PreviewRuntime = __previewRuntimeEntry;
  // <generated-preview-runtime:end>
