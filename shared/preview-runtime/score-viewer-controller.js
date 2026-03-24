import {
  DEFAULT_EDITOR_PIXELS_PER_BEAT,
  DEFAULT_VIEWER_MODE,
  DEFAULT_VIEWER_PIXELS_PER_SECOND,
  getBeatAtTimeSec,
  getClampedSelectedBeat,
  getClampedSelectedTimeSec,
  getContentHeightPx,
  getEditorFrameStateForBeat,
  getEditorContentHeightPx,
  getEditorScrollTopForBeat,
  getEditorScrollTopForTimeSec,
  hasViewerSelectionChanged,
  getTimeSecForBeat,
  getTimeSecForEditorScrollTop,
  getScrollTopForTimeSec,
  getTimeSecForScrollTop,
  getViewerCursor,
  normalizeViewerMode,
  resolveViewerModeForModel,
} from "./score-viewer-model.js";
import {
  createScoreViewerRenderer,
  estimateViewerWidth,
} from "./score-viewer-renderer.js";

const DEFAULT_WHEEL_LINE_HEIGHT_PX = 16;
const MIN_SPACING_SCALE = 0.5;
const MAX_SPACING_SCALE = 8.0;
const SPACING_STEP = 0.01;
const DEFAULT_SPACING_SCALE = 1.0;

export function createScoreViewerController({
  root,
  onTimeChange = () => {},
  onPlaybackToggle = () => {},
  onViewerModeChange = () => {},
}) {
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

  const modeRow = document.createElement("div");
  modeRow.className = "score-viewer-status-row score-viewer-mode-row";

  const modeTitle = document.createElement("span");
  modeTitle.className = "score-viewer-mode-title";
  modeTitle.textContent = "Mode";

  const modeSelect = document.createElement("select");
  modeSelect.className = "score-viewer-mode-select";
  modeSelect.append(
    createModeOption("time", "Time"),
    createModeOption("editor", "Editor"),
    createModeOption("game", "Game", true),
  );
  modeRow.append(modeTitle, modeSelect);

  statusPanel.append(playbackRow, measureRow, comboRow, spacingRow, spacingInput, modeRow);
  bottomBar.append(statusPanel);

  const judgeLine = document.createElement("div");
  judgeLine.className = "score-viewer-judge-line";

  root.replaceChildren(scrollHost, canvas, markerOverlay, bottomBar, judgeLine);

  const renderer = createScoreViewerRenderer(canvas);
  const state = {
    model: null,
    selectedTimeSec: 0,
    selectedBeat: 0,
    isPinned: false,
    isOpen: false,
    isPlaying: false,
    spacingScale: DEFAULT_SPACING_SCALE,
    viewerMode: DEFAULT_VIEWER_MODE,
  };
  const uiState = {
    playbackButtonDisabled: null,
    playbackButtonText: null,
    playbackButtonLabel: null,
    playbackTime: null,
    measureText: null,
    comboText: null,
    spacingText: null,
    spacingInputValue: null,
    modeSelectValue: null,
    modeSelectDisabled: null,
  };

  let ignoreScrollUntilNextFrame = false;
  let resizeObserver = null;
  let dragState = null;
  let editorFrameStateCache = null;

  scrollHost.addEventListener("scroll", () => {
    syncTimeFromScrollPosition();
  });

  scrollHost.addEventListener("wheel", (event) => {
    if (!state.model || !state.isOpen || !isScrollInteractive()) {
      return;
    }
    scrollHost.scrollTop += normalizeWheelDeltaY(event.deltaY, event.deltaMode, scrollHost.clientHeight);
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
    scrollHost.scrollTop = dragState.startScrollTop + deltaY;
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

  modeSelect.addEventListener("change", () => {
    const nextMode = normalizeViewerMode(modeSelect.value);
    if (nextMode === "game") {
      modeSelect.value = getResolvedViewerMode();
      return;
    }
    if (nextMode === "editor" && !state.model?.supportsEditorMode) {
      modeSelect.value = getResolvedViewerMode();
      return;
    }
    if (nextMode === state.viewerMode) {
      return;
    }
    state.viewerMode = nextMode;
    onViewerModeChange(state.viewerMode);
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
    state.selectedBeat = getBeatAtTimeSec(state.model, state.selectedTimeSec);
    editorFrameStateCache = null;
    updateRootWidth();
    refreshLayout();
  }

  function setSelectedTimeSec(timeSec, { beatHint } = {}) {
    const clampedTimeSec = getClampedSelectedTimeSec(state.model, timeSec);
    const resolvedViewerMode = getResolvedViewerMode();
    const nextBeat = resolvedViewerMode === "editor"
      ? resolveSelectedBeat(clampedTimeSec, beatHint)
      : getBeatAtTimeSec(state.model, clampedTimeSec);
    if (!hasViewerSelectionChanged(
      state.model,
      resolvedViewerMode,
      state.selectedTimeSec,
      clampedTimeSec,
      state.selectedBeat,
      nextBeat,
    ) && state.model) {
      syncScrollPosition();
      renderScene();
      return;
    }
    state.selectedTimeSec = clampedTimeSec;
    state.selectedBeat = nextBeat;
    editorFrameStateCache = null;
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

  function setViewerMode(nextViewerMode) {
    const normalizedMode = normalizeViewerMode(nextViewerMode);
    const resolvedInputMode = normalizedMode === "game" ? DEFAULT_VIEWER_MODE : normalizedMode;
    if (state.viewerMode === resolvedInputMode) {
      renderScene();
      return;
    }
    state.viewerMode = resolvedInputMode;
    state.selectedBeat = getBeatAtTimeSec(state.model, state.selectedTimeSec);
    editorFrameStateCache = null;
    refreshLayout();
  }

  function setEmptyState(_title, _message) {}

  function syncScrollPosition() {
    if (!state.model) {
      scrollHost.scrollTop = 0;
      return;
    }
    ignoreScrollUntilNextFrame = true;
    const viewportHeight = root.clientHeight || 0;
    if (getResolvedViewerMode() === "editor") {
      scrollHost.scrollTop = getEditorScrollTopForBeat(
        state.model,
        state.selectedBeat,
        viewportHeight,
        getPixelsPerBeat(),
      );
    } else {
      scrollHost.scrollTop = getScrollTopForResolvedMode(
        state.model,
        state.selectedTimeSec,
        viewportHeight,
      );
    }
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
    const resolvedViewerMode = getResolvedViewerMode();
    if (resolvedViewerMode === "editor") {
      const nextBeat = getClampedSelectedBeat(state.model, scrollHost.scrollTop / getPixelsPerBeat());
      if (!hasViewerSelectionChanged(
        state.model,
        resolvedViewerMode,
        state.selectedTimeSec,
        state.selectedTimeSec,
        state.selectedBeat,
        nextBeat,
      )) {
        return;
      }
      state.selectedBeat = nextBeat;
      state.selectedTimeSec = getTimeSecForBeat(state.model, nextBeat);
      editorFrameStateCache = null;
      renderScene();
      onTimeChange({
        timeSec: state.selectedTimeSec,
        beat: nextBeat,
        viewerMode: resolvedViewerMode,
        source: "scroll",
      });
      return;
    }

    const nextTimeSec = getTimeSecForResolvedMode(state.model, scrollHost.scrollTop);
    if (!hasViewerSelectionChanged(state.model, resolvedViewerMode, state.selectedTimeSec, nextTimeSec)) {
      return;
    }
    state.selectedTimeSec = nextTimeSec;
    state.selectedBeat = getBeatAtTimeSec(state.model, nextTimeSec);
    editorFrameStateCache = null;
    renderScene();
    onTimeChange({
      timeSec: nextTimeSec,
      beat: state.selectedBeat,
      viewerMode: resolvedViewerMode,
      source: "scroll",
    });
  }

  function refreshLayout() {
    updateRootWidth();
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(260, root.clientHeight);
    renderer.resize(width, height);
    spacer.style.height = `${getContentHeightForResolvedMode(state.model, height)}px`;
    syncScrollPosition();
    renderScene();
  }

  function renderScene() {
    const showScene = Boolean(state.model && state.isOpen);
    const resolvedViewerMode = getResolvedViewerMode();
    const editorFrameState = resolvedViewerMode === "editor"
      ? getEditorFrameStateForCurrentView(root.clientHeight || 0)
      : null;
    const cursor = getViewerCursor(
      state.model,
      state.selectedTimeSec,
      resolvedViewerMode,
      state.selectedBeat,
    );

    canvas.hidden = !showScene;
    markerOverlay.hidden = !showScene;
    bottomBar.hidden = !showScene;
    judgeLine.hidden = !showScene;

    setDisabledIfChanged(playbackButton, !state.model, "playbackButtonDisabled");
    setTextIfChanged(playbackButton, state.isPlaying ? "❚❚" : "▶", "playbackButtonText");
    setAttributeIfChanged(
      playbackButton,
      "aria-label",
      state.isPlaying ? "Pause score viewer" : "Play score viewer",
      "playbackButtonLabel",
    );
    setTextIfChanged(playbackTime, `${formatPlaybackTime(cursor.timeSec)} s`, "playbackTime");
    setTextIfChanged(
      measureRow,
      `Measure: ${formatMeasureCounter(cursor.measureIndex, cursor.totalMeasureIndex)}`,
      "measureText",
    );
    setTextIfChanged(comboRow, `Combo: ${cursor.comboCount}/${cursor.totalCombo}`, "comboText");
    setTextIfChanged(spacingValue, formatSpacingScale(state.spacingScale), "spacingText");
    setValueIfChanged(spacingInput, String(state.spacingScale), "spacingInputValue");
    setValueIfChanged(modeSelect, resolvedViewerMode, "modeSelectValue");
    setDisabledIfChanged(modeSelect, !state.model, "modeSelectDisabled");

    const renderResult = renderer.render(showScene ? state.model : null, cursor.timeSec, {
      viewerMode: resolvedViewerMode,
      pixelsPerSecond: getPixelsPerSecond(),
      pixelsPerBeat: getPixelsPerBeat(),
      editorFrameState,
    });
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
  modeSelect.value = DEFAULT_VIEWER_MODE;
  refreshLayout();

  return {
    setModel,
    setSelectedTimeSec,
    setPinned,
    setOpen,
    setPlaybackState,
    setViewerMode,
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

  function getResolvedViewerMode() {
    return resolveViewerModeForModel(state.model, state.viewerMode);
  }

  function getPixelsPerSecond() {
    return DEFAULT_VIEWER_PIXELS_PER_SECOND * state.spacingScale;
  }

  function getPixelsPerBeat() {
    return DEFAULT_EDITOR_PIXELS_PER_BEAT * state.spacingScale;
  }

  function getEditorFrameStateForCurrentView(viewportHeight = root.clientHeight || 0) {
    if (!state.model || getResolvedViewerMode() !== "editor") {
      editorFrameStateCache = null;
      return null;
    }
    const pixelsPerBeat = getPixelsPerBeat();
    if (
      editorFrameStateCache
      && editorFrameStateCache.model === state.model
      && Math.abs(editorFrameStateCache.selectedBeat - state.selectedBeat) < 0.000001
      && editorFrameStateCache.viewportHeight === viewportHeight
      && Math.abs(editorFrameStateCache.pixelsPerBeat - pixelsPerBeat) < 0.0005
    ) {
      return editorFrameStateCache.frameState;
    }
    const frameState = getEditorFrameStateForBeat(
      state.model,
      state.selectedBeat,
      viewportHeight,
      pixelsPerBeat,
    );
    editorFrameStateCache = {
      model: state.model,
      selectedBeat: state.selectedBeat,
      viewportHeight,
      pixelsPerBeat,
      frameState,
    };
    return frameState;
  }

  function getContentHeightForResolvedMode(model, viewportHeight) {
    if (getResolvedViewerMode() === "editor") {
      return getEditorContentHeightPx(model, viewportHeight, getPixelsPerBeat());
    }
    return getContentHeightPx(model, viewportHeight, getPixelsPerSecond());
  }

  function getScrollTopForResolvedMode(model, selectedTimeSec, viewportHeight) {
    if (getResolvedViewerMode() === "editor") {
      return getEditorScrollTopForTimeSec(model, selectedTimeSec, viewportHeight, getPixelsPerBeat());
    }
    return getScrollTopForTimeSec(model, selectedTimeSec, viewportHeight, getPixelsPerSecond());
  }

  function getTimeSecForResolvedMode(model, scrollTop) {
    if (getResolvedViewerMode() === "editor") {
      return getTimeSecForEditorScrollTop(model, scrollTop, getPixelsPerBeat());
    }
    return getTimeSecForScrollTop(model, scrollTop, getPixelsPerSecond());
  }

  function resolveSelectedBeat(timeSec, beatHint = undefined) {
    if (!state.model || getResolvedViewerMode() !== "editor") {
      return 0;
    }
    if (Number.isFinite(beatHint)) {
      return getClampedSelectedBeat(state.model, beatHint);
    }
    return getBeatAtTimeSec(state.model, timeSec);
  }

  function setTextIfChanged(element, nextValue, key) {
    if (uiState[key] === nextValue) {
      return;
    }
    uiState[key] = nextValue;
    element.textContent = nextValue;
  }

  function setValueIfChanged(element, nextValue, key) {
    if (uiState[key] === nextValue) {
      return;
    }
    uiState[key] = nextValue;
    element.value = nextValue;
  }

  function setDisabledIfChanged(element, nextValue, key) {
    if (uiState[key] === nextValue) {
      return;
    }
    uiState[key] = nextValue;
    element.disabled = nextValue;
  }

  function setAttributeIfChanged(element, attributeName, nextValue, key) {
    if (uiState[key] === nextValue) {
      return;
    }
    uiState[key] = nextValue;
    element.setAttribute(attributeName, nextValue);
  }
}

function createModeOption(value, label, disabled = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  return option;
}

export function normalizeWheelDeltaY(deltaY, deltaMode, viewportHeight, lineHeightPx = DEFAULT_WHEEL_LINE_HEIGHT_PX) {
  switch (deltaMode) {
    case 1:
      return deltaY * lineHeightPx;
    case 2:
      return deltaY * Math.max(viewportHeight, 1);
    default:
      return deltaY;
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
