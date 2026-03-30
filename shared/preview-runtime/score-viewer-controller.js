import {
  DEFAULT_INVISIBLE_NOTE_VISIBILITY,
  DEFAULT_EDITOR_PIXELS_PER_BEAT,
  DEFAULT_JUDGE_LINE_POSITION_RATIO,
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
  getJudgeLineY,
  hasViewerSelectionChanged,
  getTimeSecForBeat,
  getTimeSecForEditorScrollTop,
  getScrollTopForTimeSec,
  getTimeSecForScrollTop,
  getViewerCursor,
  normalizeInvisibleNoteVisibility,
  normalizeJudgeLinePositionRatio,
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
export const SPACING_STEP = 0.05;
export const SPACING_WHEEL_STEP = 0.01;
const DEFAULT_SPACING_SCALE = 1.0;
const GAME_PLAYBACK_SCROLL_SYNC_VIEWPORT_RATIO = 0.4;
const GAME_PLAYBACK_SCROLL_SYNC_MIN_PX = 120;
export const JUDGE_LINE_DRAG_HIT_MARGIN_PX = 10;

export function createScoreViewerController({
  root,
  onTimeChange = () => {},
  onPlaybackToggle = () => {},
  onViewerModeChange = () => {},
  onInvisibleNoteVisibilityChange = () => {},
  onJudgeLinePositionChange = () => {},
  onSpacingScaleChange = () => {},
}) {
  const scrollHost = document.createElement("div");
  scrollHost.className = "score-viewer-scroll-host";

  const spacer = document.createElement("div");
  spacer.className = "score-viewer-spacer";
  scrollHost.appendChild(spacer);

  const canvas = document.createElement("canvas");
  canvas.className = "score-viewer-canvas";

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

  const metricsRow = document.createElement("div");
  metricsRow.className = "score-viewer-metrics-row";
  metricsRow.append(measureRow, comboRow);

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

  const modeControls = document.createElement("div");
  modeControls.className = "score-viewer-mode-controls";

  const modeSelect = document.createElement("select");
  modeSelect.className = "score-viewer-mode-select";
  modeSelect.append(
    createModeOption("time", "Time"),
    createModeOption("editor", "Editor"),
    createModeOption("game", "Game"),
  );

  const invisibleNoteVisibilitySelect = document.createElement("select");
  invisibleNoteVisibilitySelect.className = "score-viewer-mode-select score-viewer-invisible-note-select";
  invisibleNoteVisibilitySelect.append(
    createModeOption("hide", "INVISIBLE Hide"),
    createModeOption("show", "INVISIBLE Show"),
  );

  modeControls.append(modeSelect, invisibleNoteVisibilitySelect);
  modeRow.append(modeTitle, modeControls);

  statusPanel.append(playbackRow, metricsRow, spacingRow, spacingInput, modeRow);
  bottomBar.append(statusPanel);

  const judgeLine = document.createElement("div");
  judgeLine.className = "score-viewer-judge-line";

  root.replaceChildren(scrollHost, canvas, bottomBar, judgeLine);

  const renderer = createScoreViewerRenderer(canvas);
  const state = {
    model: null,
    selectedTimeSec: 0,
    selectedBeat: 0,
    isPinned: false,
    isOpen: false,
    isPlaying: false,
    spacingScaleByMode: createDefaultSpacingScaleByMode(),
    viewerMode: DEFAULT_VIEWER_MODE,
    invisibleNoteVisibility: DEFAULT_INVISIBLE_NOTE_VISIBILITY,
    judgeLinePositionRatio: DEFAULT_JUDGE_LINE_POSITION_RATIO,
    isJudgeLineHovered: false,
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
    invisibleNoteVisibilityValue: null,
    invisibleNoteVisibilityDisabled: null,
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
    const dragIntent = resolvePointerDragIntent({
      canDragJudgeLine: canDragJudgeLine(event),
      canDragScroll: canDragScroll(event),
      isJudgeLineHit: isPointerNearJudgeLine(event),
    });
    if (!dragIntent) {
      return;
    }
    if (dragIntent === "judge-line") {
      dragState = {
        type: "judge-line",
        pointerId: event.pointerId,
      };
      updateJudgeLinePositionFromPointer(event, { notify: true });
    } else {
      dragState = {
        type: "scroll",
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: scrollHost.scrollTop,
      };
      scrollHost.classList.add("is-dragging");
    }
    if (typeof scrollHost.setPointerCapture === "function") {
      scrollHost.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  });

  scrollHost.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      updateJudgeLineHover(event);
      return;
    }
    if (dragState.type === "judge-line") {
      updateJudgeLinePositionFromPointer(event, { notify: true });
    } else {
      const deltaY = event.clientY - dragState.startY;
      scrollHost.scrollTop = dragState.startScrollTop + deltaY;
      syncTimeFromScrollPosition({ force: true });
    }
    event.preventDefault();
  });

  scrollHost.addEventListener("pointerleave", () => {
    if (dragState?.type === "judge-line") {
      return;
    }
    setJudgeLineHover(false);
  });
  scrollHost.addEventListener("pointerup", handlePointerRelease);
  scrollHost.addEventListener("pointercancel", handlePointerRelease);
  scrollHost.addEventListener("lostpointercapture", handlePointerRelease);

  spacingInput.addEventListener("input", () => {
    updateSpacingScaleForMode(
      getResolvedViewerMode(),
      normalizeSliderSpacingScale(Number.parseFloat(spacingInput.value)),
      { notify: true },
    );
  });

  spacingInput.addEventListener("wheel", (event) => {
    if (!state.isOpen || !state.model) {
      return;
    }
    const delta = event.deltaY < 0 ? SPACING_WHEEL_STEP : event.deltaY > 0 ? -SPACING_WHEEL_STEP : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateSpacingScaleForMode(
      getResolvedViewerMode(),
      roundSpacingScaleToHundredths(getSpacingScaleForMode(getResolvedViewerMode()) + delta),
      { notify: true },
    );
  }, { passive: false });

  modeSelect.addEventListener("change", () => {
    const nextMode = normalizeViewerMode(modeSelect.value);
    if (nextMode === "game" && !state.model?.supportsGameMode) {
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

  invisibleNoteVisibilitySelect.addEventListener("change", () => {
    const nextVisibility = normalizeInvisibleNoteVisibility(invisibleNoteVisibilitySelect.value);
    if (nextVisibility === state.invisibleNoteVisibility) {
      return;
    }
    state.invisibleNoteVisibility = nextVisibility;
    onInvisibleNoteVisibilityChange(state.invisibleNoteVisibility);
    renderScene();
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
    const normalizedPinned = Boolean(nextPinned);
    if (state.isPinned === normalizedPinned) {
      return;
    }
    state.isPinned = normalizedPinned;
    updateScrollInteractivity();
    renderScene();
  }

  function setOpen(nextOpen) {
    const normalizedOpen = Boolean(nextOpen);
    if (state.isOpen === normalizedOpen) {
      return;
    }
    state.isOpen = normalizedOpen;
    if (!state.isOpen) {
      clearDragState();
      setJudgeLineHover(false);
    }
    root.classList.toggle("is-visible", state.isOpen && Boolean(state.model));
    syncScrollPosition();
    renderScene();
  }

  function setPlaybackState(nextPlaying) {
    const normalizedPlaying = Boolean(nextPlaying);
    if (state.isPlaying === normalizedPlaying) {
      return;
    }
    state.isPlaying = normalizedPlaying;
    updateScrollInteractivity();
    if (!state.isPlaying) {
      syncScrollPosition();
    }
    renderScene();
  }

  function setViewerMode(nextViewerMode) {
    const normalizedMode = normalizeViewerMode(nextViewerMode);
    if (state.viewerMode === normalizedMode) {
      return;
    }
    state.viewerMode = normalizedMode;
    state.selectedBeat = getBeatAtTimeSec(state.model, state.selectedTimeSec);
    editorFrameStateCache = null;
    refreshLayout();
  }

  function setInvisibleNoteVisibility(nextVisibility) {
    const normalizedVisibility = normalizeInvisibleNoteVisibility(nextVisibility);
    if (state.invisibleNoteVisibility === normalizedVisibility) {
      return;
    }
    state.invisibleNoteVisibility = normalizedVisibility;
    renderScene();
  }

  function setJudgeLinePositionRatio(nextRatio) {
    const normalizedRatio = normalizeJudgeLinePositionRatio(nextRatio);
    if (Math.abs(state.judgeLinePositionRatio - normalizedRatio) < 0.000001) {
      return;
    }
    state.judgeLinePositionRatio = normalizedRatio;
    editorFrameStateCache = null;
    syncScrollPosition();
    renderScene();
  }

  function setSpacingScaleByMode(nextSpacingScaleByMode = {}) {
    const normalizedSpacingScaleByMode = {
      time: clampScale(nextSpacingScaleByMode.time),
      editor: clampScale(nextSpacingScaleByMode.editor),
      game: clampScale(nextSpacingScaleByMode.game),
    };
    if (areSpacingScaleMapsEqual(state.spacingScaleByMode, normalizedSpacingScaleByMode)) {
      return;
    }
    state.spacingScaleByMode = normalizedSpacingScaleByMode;
    editorFrameStateCache = null;
    refreshLayout();
  }

  function setEmptyState(_title, _message) {}

  function syncScrollPosition() {
    if (!state.model) {
      scrollHost.scrollTop = 0;
      return;
    }
    const viewportHeight = root.clientHeight || 0;
    const resolvedViewerMode = getResolvedViewerMode();
    const desiredScrollTop = resolvedViewerMode === "editor"
      ? getEditorScrollTopForBeat(
        state.model,
        state.selectedBeat,
        viewportHeight,
        getPixelsPerBeat(),
      )
      : getScrollTopForResolvedMode(
        state.model,
        state.selectedTimeSec,
        viewportHeight,
      );
    if (!shouldSyncPlaybackScrollPosition({
      viewerMode: resolvedViewerMode,
      isPlaying: state.isPlaying,
      currentScrollTop: scrollHost.scrollTop,
      desiredScrollTop,
      viewportHeight,
    })) {
      return;
    }
    ignoreScrollUntilNextFrame = true;
    scrollHost.scrollTop = desiredScrollTop;
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
    bottomBar.hidden = !showScene;
    judgeLine.hidden = !showScene;
    root.style.setProperty("--score-viewer-judge-line-ratio", String(state.judgeLinePositionRatio));
    scrollHost.classList.toggle("is-judge-line-draggable", showScene && state.isJudgeLineHovered);
    scrollHost.classList.toggle("is-judge-line-dragging", dragState?.type === "judge-line");
    judgeLine.classList.toggle("is-draggable", showScene && state.isJudgeLineHovered);
    judgeLine.classList.toggle("is-dragging", dragState?.type === "judge-line");

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
      `BAR: ${formatMeasureCounter(cursor.measureIndex, cursor.totalMeasureIndex)}`,
      "measureText",
    );
    setTextIfChanged(comboRow, `CB: ${cursor.comboCount}/${cursor.totalCombo}`, "comboText");
    const activeSpacingScale = getSpacingScaleForMode(resolvedViewerMode);
    setTextIfChanged(
      spacingValue,
      formatSpacingScaleDisplay(resolvedViewerMode, activeSpacingScale),
      "spacingText",
    );
    setValueIfChanged(spacingInput, activeSpacingScale.toFixed(2), "spacingInputValue");
    setValueIfChanged(modeSelect, resolvedViewerMode, "modeSelectValue");
    setDisabledIfChanged(modeSelect, !state.model, "modeSelectDisabled");
    setValueIfChanged(invisibleNoteVisibilitySelect, state.invisibleNoteVisibility, "invisibleNoteVisibilityValue");
    setDisabledIfChanged(invisibleNoteVisibilitySelect, !state.model, "invisibleNoteVisibilityDisabled");

    renderer.render(showScene ? state.model : null, cursor.timeSec, {
      viewerMode: resolvedViewerMode,
      pixelsPerSecond: getPixelsPerSecond(),
      pixelsPerBeat: getPixelsPerBeat(),
      editorFrameState,
      showInvisibleNotes: state.invisibleNoteVisibility === "show",
      judgeLineY: getCurrentJudgeLineY(),
    });
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
  spacingValue.textContent = formatSpacingScaleDisplay(DEFAULT_VIEWER_MODE, DEFAULT_SPACING_SCALE);
  modeSelect.value = DEFAULT_VIEWER_MODE;
  invisibleNoteVisibilitySelect.value = DEFAULT_INVISIBLE_NOTE_VISIBILITY;
  refreshLayout();

  return {
    setModel,
    setSelectedTimeSec,
    setPinned,
    setOpen,
    setPlaybackState,
    setViewerMode,
    setInvisibleNoteVisibility,
    setJudgeLinePositionRatio,
    setSpacingScaleByMode,
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
    scrollHost.classList.remove("is-judge-line-dragging");
    judgeLine.classList.remove("is-dragging");
  }

  function canDragScroll(event) {
    return Boolean(
      state.model
        && state.isOpen
        && isScrollInteractive()
        && isPrimaryPointer(event),
    );
  }

  function canDragJudgeLine(event) {
    return Boolean(
      state.model
        && state.isOpen
        && isPrimaryPointer(event),
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
    return DEFAULT_VIEWER_PIXELS_PER_SECOND * getSpacingScaleForMode("time");
  }

  function getPixelsPerBeat() {
    return DEFAULT_EDITOR_PIXELS_PER_BEAT * getSpacingScaleForMode(getResolvedViewerMode());
  }

  function getCurrentJudgeLineY(viewportHeight = root.clientHeight || 0) {
    return getJudgeLineY(viewportHeight, state.judgeLinePositionRatio);
  }

  function getEditorFrameStateForCurrentView(viewportHeight = root.clientHeight || 0) {
    if (!state.model || getResolvedViewerMode() !== "editor") {
      editorFrameStateCache = null;
      return null;
    }
    const pixelsPerBeat = getPixelsPerBeat();
    const judgeLineY = getCurrentJudgeLineY(viewportHeight);
    if (
      editorFrameStateCache
      && editorFrameStateCache.model === state.model
      && Math.abs(editorFrameStateCache.selectedBeat - state.selectedBeat) < 0.000001
      && editorFrameStateCache.viewportHeight === viewportHeight
      && Math.abs(editorFrameStateCache.pixelsPerBeat - pixelsPerBeat) < 0.0005
      && Math.abs(editorFrameStateCache.judgeLineY - judgeLineY) < 0.0005
    ) {
      return editorFrameStateCache.frameState;
    }
    const frameState = getEditorFrameStateForBeat(
      state.model,
      state.selectedBeat,
      viewportHeight,
      pixelsPerBeat,
      judgeLineY,
    );
    editorFrameStateCache = {
      model: state.model,
      selectedBeat: state.selectedBeat,
      viewportHeight,
      pixelsPerBeat,
      judgeLineY,
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

  function setJudgeLineHover(nextHovered) {
    state.isJudgeLineHovered = Boolean(nextHovered);
    renderScene();
  }

  function updateJudgeLineHover(event) {
    if (!state.model || !state.isOpen) {
      if (state.isJudgeLineHovered) {
        setJudgeLineHover(false);
      }
      return;
    }
    const hovered = isPointerNearJudgeLine(event);
    if (hovered !== state.isJudgeLineHovered) {
      setJudgeLineHover(hovered);
    }
  }

  function isPointerNearJudgeLine(event) {
    const rootRect = root.getBoundingClientRect();
    return isJudgeLineHit({
      pointerClientY: event.clientY,
      rootTop: rootRect.top,
      judgeLineY: getCurrentJudgeLineY(rootRect.height),
    });
  }

  function updateJudgeLinePositionFromPointer(event, { notify = false } = {}) {
    const rootRect = root.getBoundingClientRect();
    const nextRatio = getJudgeLinePositionRatioFromPointer({
      pointerClientY: event.clientY,
      rootTop: rootRect.top,
      rootHeight: rootRect.height,
    });
    if (Math.abs(state.judgeLinePositionRatio - nextRatio) < 0.000001) {
      setJudgeLineHover(true);
      return;
    }
    state.judgeLinePositionRatio = nextRatio;
    editorFrameStateCache = null;
    setJudgeLineHover(true);
    syncScrollPosition();
    renderScene();
    if (notify) {
      onJudgeLinePositionChange(state.judgeLinePositionRatio);
    }
  }

  function getSpacingScaleForMode(mode) {
    return state.spacingScaleByMode[normalizeSpacingMode(mode)] ?? DEFAULT_SPACING_SCALE;
  }

  function updateSpacingScaleForMode(mode, nextScale, { notify = false } = {}) {
    const normalizedMode = normalizeSpacingMode(mode);
    const normalizedScale = clampScale(nextScale);
    if (Math.abs(getSpacingScaleForMode(normalizedMode) - normalizedScale) < 0.0005) {
      setTextIfChanged(
        spacingValue,
        formatSpacingScaleDisplay(getResolvedViewerMode(), getSpacingScaleForMode(getResolvedViewerMode())),
        "spacingText",
      );
      return;
    }
    state.spacingScaleByMode = {
      ...state.spacingScaleByMode,
      [normalizedMode]: normalizedScale,
    };
    editorFrameStateCache = null;
    refreshLayout();
    if (notify) {
      onSpacingScaleChange(normalizedMode, normalizedScale);
    }
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

export function shouldSyncPlaybackScrollPosition({
  viewerMode,
  isPlaying,
  currentScrollTop,
  desiredScrollTop,
  viewportHeight,
}) {
  if (viewerMode !== "game" || !isPlaying) {
    return true;
  }
  const threshold = Math.max(
    Math.round(Math.max(viewportHeight, 0) * GAME_PLAYBACK_SCROLL_SYNC_VIEWPORT_RATIO),
    GAME_PLAYBACK_SCROLL_SYNC_MIN_PX,
  );
  return Math.abs((desiredScrollTop ?? 0) - (currentScrollTop ?? 0)) >= threshold;
}

export function isJudgeLineHit({
  pointerClientY,
  rootTop,
  judgeLineY,
  hitMarginPx = JUDGE_LINE_DRAG_HIT_MARGIN_PX,
}) {
  const pointerOffsetY = Number.isFinite(pointerClientY) && Number.isFinite(rootTop)
    ? pointerClientY - rootTop
    : Number.NaN;
  return Number.isFinite(pointerOffsetY)
    && Number.isFinite(judgeLineY)
    && Math.abs(pointerOffsetY - judgeLineY) <= Math.max(hitMarginPx, 0);
}

export function getJudgeLinePositionRatioFromPointer({
  pointerClientY,
  rootTop,
  rootHeight,
}) {
  if (!Number.isFinite(rootHeight) || rootHeight <= 0) {
    return DEFAULT_JUDGE_LINE_POSITION_RATIO;
  }
  return normalizeJudgeLinePositionRatio(clamp(
    (pointerClientY - rootTop) / rootHeight,
    0,
    1,
  ));
}

export function resolvePointerDragIntent({
  canDragJudgeLine,
  canDragScroll,
  isJudgeLineHit,
}) {
  if (canDragJudgeLine && isJudgeLineHit) {
    return "judge-line";
  }
  if (canDragScroll) {
    return "scroll";
  }
  return null;
}

function clampScale(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SPACING_SCALE;
  }
  return Math.min(Math.max(value, MIN_SPACING_SCALE), MAX_SPACING_SCALE);
}

function createDefaultSpacingScaleByMode() {
  return {
    time: DEFAULT_SPACING_SCALE,
    editor: DEFAULT_SPACING_SCALE,
    game: DEFAULT_SPACING_SCALE,
  };
}

function normalizeSpacingMode(mode) {
  return mode === "editor" || mode === "game" ? mode : "time";
}

export function normalizeSliderSpacingScale(value) {
  return roundSpacingScaleToStep(clampScale(value), SPACING_STEP);
}

export function roundSpacingScaleToHundredths(value) {
  return roundSpacingScaleToStep(clampScale(value), SPACING_WHEEL_STEP);
}

function roundSpacingScaleToStep(value, step) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SPACING_SCALE;
  }
  const baseValue = Math.round(value / step) * step;
  return Number(clampScale(baseValue).toFixed(2));
}

function areSpacingScaleMapsEqual(left, right) {
  return Math.abs((left?.time ?? DEFAULT_SPACING_SCALE) - (right?.time ?? DEFAULT_SPACING_SCALE)) < 0.0005
    && Math.abs((left?.editor ?? DEFAULT_SPACING_SCALE) - (right?.editor ?? DEFAULT_SPACING_SCALE)) < 0.0005
    && Math.abs((left?.game ?? DEFAULT_SPACING_SCALE) - (right?.game ?? DEFAULT_SPACING_SCALE)) < 0.0005;
}

function isPrimaryPointer(event) {
  return event.button === 0 || event.pointerType === "touch" || event.pointerType === "pen";
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

export function formatSpacingScaleDisplay(mode, value) {
  const normalizedMode = normalizeSpacingMode(mode);
  const normalizedScale = clampScale(value);
  if (normalizedMode === "time") {
    return `${normalizedScale.toFixed(2)}x(${Math.round(DEFAULT_VIEWER_PIXELS_PER_SECOND * normalizedScale)}px/s)`;
  }
  if (normalizedMode === "editor") {
    return `${normalizedScale.toFixed(2)}x(${Math.round(DEFAULT_EDITOR_PIXELS_PER_BEAT * normalizedScale)}px/beat)`;
  }
  return `${normalizedScale.toFixed(2)}x`;
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
