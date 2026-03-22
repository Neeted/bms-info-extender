import {
  DEFAULT_VIEWER_PIXELS_PER_SECOND,
  getClampedSelectedTimeSec,
  getContentHeightPx,
  getScrollTopForTimeSec,
  getTimeSecForScrollTop,
  getViewerCursor,
} from "./score-viewer-model.js";
import {
  createScoreViewerRenderer,
  estimateViewerWidth,
} from "./score-viewer-renderer.js";

const SCROLL_MULTIPLIER = 2;
const MIN_SPACING_SCALE = 0.5;
const MAX_SPACING_SCALE = 8.0;
const SPACING_STEP = 0.01;
const DEFAULT_SPACING_SCALE = 1.0;

export function createScoreViewerController({ root, onTimeChange = () => {}, onPlaybackToggle = () => {} }) {
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

  const primaryChip = document.createElement("div");
  primaryChip.className = "score-viewer-chip is-primary";

  const playbackButton = document.createElement("button");
  playbackButton.className = "score-viewer-playback-button";
  playbackButton.type = "button";
  playbackButton.setAttribute("aria-label", "Play score viewer");
  playbackButton.textContent = "▶";

  const playbackTime = document.createElement("span");
  playbackTime.className = "score-viewer-playback-time";

  primaryChip.append(playbackButton, playbackTime);

  const measureChip = document.createElement("div");
  measureChip.className = "score-viewer-chip is-compact";

  const comboChip = document.createElement("div");
  comboChip.className = "score-viewer-chip is-compact";

  const spacingPanel = document.createElement("div");
  spacingPanel.className = "score-viewer-chip score-viewer-spacing-panel";

  const spacingLabel = document.createElement("label");
  spacingLabel.className = "score-viewer-spacing-label";
  spacingLabel.textContent = "SPACING";

  const spacingValue = document.createElement("span");
  spacingValue.className = "score-viewer-spacing-value";
  spacingLabel.appendChild(spacingValue);

  const spacingInput = document.createElement("input");
  spacingInput.className = "score-viewer-spacing-input";
  spacingInput.type = "range";
  spacingInput.min = String(MIN_SPACING_SCALE);
  spacingInput.max = String(MAX_SPACING_SCALE);
  spacingInput.step = String(SPACING_STEP);
  spacingInput.value = String(DEFAULT_SPACING_SCALE);

  spacingPanel.append(spacingLabel, spacingInput);
  bottomBar.append(primaryChip, measureChip, comboChip, spacingPanel);

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
    playbackTime.textContent = `${cursor.timeSec.toFixed(3)} s`;
    measureChip.textContent = `M ${cursor.measureIndex}`;
    comboChip.textContent = `C ${cursor.comboCount}/${cursor.totalCombo}`;
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
