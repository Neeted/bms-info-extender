import {
  getClampedSelectedTimeSec,
  getContentHeightPx,
  getScrollTopForTimeSec,
  getTimeSecForScrollTop,
  getViewerCursor,
} from "./score-viewer-model.js";
import { createScoreViewerRenderer } from "./score-viewer-renderer.js";

const SCROLL_MULTIPLIER = 2;

export function createScoreViewerController({ root, onTimeChange = () => {} }) {
  const scrollHost = document.createElement("div");
  scrollHost.className = "score-viewer-scroll-host";

  const spacer = document.createElement("div");
  spacer.className = "score-viewer-spacer";
  scrollHost.appendChild(spacer);

  const canvas = document.createElement("canvas");
  canvas.className = "score-viewer-canvas";

  const overlay = document.createElement("div");
  overlay.className = "score-viewer-overlay";

  const markerOverlay = document.createElement("div");
  markerOverlay.className = "score-viewer-marker-overlay";

  const markerLabelsLeft = document.createElement("div");
  markerLabelsLeft.className = "score-viewer-marker-labels is-left";

  const markerLabelsRight = document.createElement("div");
  markerLabelsRight.className = "score-viewer-marker-labels is-right";

  markerOverlay.append(markerLabelsLeft, markerLabelsRight);

  const primaryChip = document.createElement("div");
  primaryChip.className = "score-viewer-chip";

  const secondaryChip = document.createElement("div");
  secondaryChip.className = "score-viewer-chip";

  const tertiaryChip = document.createElement("div");
  tertiaryChip.className = "score-viewer-chip";

  overlay.append(primaryChip, secondaryChip, tertiaryChip);

  const judgeLine = document.createElement("div");
  judgeLine.className = "score-viewer-judge-line";
  const judgeLabel = document.createElement("span");
  judgeLabel.className = "score-viewer-judge-label";
  judgeLabel.textContent = "selectedTimeSec";
  judgeLine.appendChild(judgeLabel);

  const emptyState = document.createElement("div");
  emptyState.className = "score-viewer-empty";
  emptyState.innerHTML = "<strong>Canvas Viewer</strong><span>Load a score to draw the actual chart in this stage.</span>";

  root.replaceChildren(scrollHost, canvas, overlay, markerOverlay, judgeLine, emptyState);

  const renderer = createScoreViewerRenderer(canvas);
  const state = {
    model: null,
    selectedTimeSec: 0,
    isPinned: false,
    isOpen: false,
    emptyTitle: "Canvas Viewer",
    emptyMessage: "Load a score to draw the actual chart in this stage.",
  };

  let ignoreScrollUntilNextFrame = false;
  let resizeObserver = null;
  let dragState = null;

  scrollHost.addEventListener("scroll", () => {
    if (!state.model || !state.isOpen || !state.isPinned || ignoreScrollUntilNextFrame) {
      return;
    }
    const nextTimeSec = getTimeSecForScrollTop(state.model, scrollHost.scrollTop);
    if (Math.abs(nextTimeSec - state.selectedTimeSec) < 0.0005) {
      return;
    }
    state.selectedTimeSec = nextTimeSec;
    renderScene();
    onTimeChange(nextTimeSec);
  });

  scrollHost.addEventListener("wheel", (event) => {
    if (!state.model || !state.isOpen || !state.isPinned) {
      return;
    }
    scrollHost.scrollTop += event.deltaY * SCROLL_MULTIPLIER;
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
    event.preventDefault();
  });

  scrollHost.addEventListener("pointerup", handlePointerRelease);
  scrollHost.addEventListener("pointercancel", handlePointerRelease);
  scrollHost.addEventListener("lostpointercapture", handlePointerRelease);

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
    scrollHost.classList.toggle("is-pinned", state.isPinned);
    scrollHost.style.overflowY = state.isPinned ? "auto" : "hidden";
    if (!state.isPinned) {
      clearDragState();
    }
    renderScene();
  }

  function setOpen(nextOpen) {
    state.isOpen = Boolean(nextOpen);
    syncScrollPosition();
    renderScene();
  }

  function setEmptyState(title, message) {
    state.emptyTitle = title;
    state.emptyMessage = message;
    renderScene();
  }

  function syncScrollPosition() {
    if (!state.model) {
      scrollHost.scrollTop = 0;
      return;
    }
    ignoreScrollUntilNextFrame = true;
    scrollHost.scrollTop = getScrollTopForTimeSec(state.model, state.selectedTimeSec, root.clientHeight || 0);
    requestAnimationFrame(() => {
      ignoreScrollUntilNextFrame = false;
    });
  }

  function refreshLayout() {
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(260, root.clientHeight);
    renderer.resize(width, height);
    spacer.style.height = `${getContentHeightPx(state.model, height)}px`;
    syncScrollPosition();
    renderScene();
  }

  function renderScene() {
    const cursor = getViewerCursor(state.model, state.selectedTimeSec);
    const showScene = Boolean(state.model && state.isOpen);
    emptyState.hidden = showScene;
    canvas.hidden = !showScene;
    overlay.hidden = !showScene;
    markerOverlay.hidden = !showScene;
    judgeLine.hidden = !showScene;

    emptyState.innerHTML = `<strong>${escapeHtml(state.emptyTitle)}</strong><span>${escapeHtml(state.emptyMessage)}</span>`;

    primaryChip.textContent = `${cursor.timeSec.toFixed(3)} s`;
    secondaryChip.textContent = `Measure ${cursor.measureIndex} / Combo ${cursor.comboCount}`;
    tertiaryChip.textContent = state.model
      ? `${state.model.score.mode} / ${state.model.score.laneCount} lanes / ${state.isPinned ? "Pinned" : "Follow"}`
      : "No parsed score";

    const renderResult = renderer.render(showScene ? state.model : null, cursor.timeSec);
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
  refreshLayout();

  return {
    setModel,
    setSelectedTimeSec,
    setPinned,
    setOpen,
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
        && state.isPinned
        && (event.button === 0 || event.pointerType === "touch" || event.pointerType === "pen"),
    );
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
