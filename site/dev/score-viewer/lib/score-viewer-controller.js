import {
  getClampedSelectedTimeSec,
  getContentHeightPx,
  getScrollTopForTimeSec,
  getTimeSecForScrollTop,
  getViewerCursor,
} from "./score-viewer-model.js";
import { createScoreViewerRenderer } from "./score-viewer-renderer.js";

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

  root.replaceChildren(scrollHost, canvas, overlay, judgeLine, emptyState);

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
    judgeLine.hidden = !showScene;

    emptyState.innerHTML = `<strong>${escapeHtml(state.emptyTitle)}</strong><span>${escapeHtml(state.emptyMessage)}</span>`;

    primaryChip.textContent = `${cursor.timeSec.toFixed(3)} s`;
    secondaryChip.textContent = `Measure ${cursor.measureIndex} / Combo ${cursor.comboCount}`;
    tertiaryChip.textContent = state.model
      ? `${state.model.score.mode} / ${state.model.score.laneCount} lanes / ${state.isPinned ? "Pinned" : "Follow"}`
      : "No parsed score";

    renderer.render(showScene ? state.model : null, cursor.timeSec);
  }

  function destroy() {
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
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
