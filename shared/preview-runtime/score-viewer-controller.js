import {
  createDefaultGameTimingConfig,
  DEFAULT_GAME_DURATION_MS,
  DEFAULT_GAME_HS_FIX_MODE,
  DEFAULT_GAME_LANE_COVER_PERMILLE,
  DEFAULT_GAME_LANE_COVER_VISIBLE,
  DEFAULT_GAME_LANE_HEIGHT_PERCENT,
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
  getGameLaneCoverHeightPx,
  getGameLaneCoverPermilleFromPointer,
  getGameJudgeLinePositionRatioFromPointer,
  getGameJudgeLineY,
  getGameLaneGeometry,
  getGameLaneHeightPercentFromPointer,
  getGameSettingGreenNumber,
  getJudgeLineY,
  hasViewerSelectionChanged,
  getTimeSecForBeat,
  getTimeSecForEditorScrollTop,
  getScrollTopForTimeSec,
  getTimeSecForScrollTop,
  getViewerCursor,
  normalizeGameDurationMs,
  normalizeGameHsFixMode,
  normalizeGameLaneCoverPermille,
  normalizeGameLaneCoverVisible,
  normalizeGameLaneHeightPercent,
  normalizeGameLaneHeightPercentForSlider,
  normalizeGameLaneHeightPercentForWheel,
  normalizeGameTimingConfig,
  normalizeInvisibleNoteVisibility,
  normalizeJudgeLinePositionRatio,
  normalizeViewerMode,
  resolveViewerModeForModel,
} from "./score-viewer-model.js";
import {
  areRendererConfigsEqual,
  createScoreViewerRenderer,
  DEFAULT_RENDERER_CONFIG,
  estimateViewerWidth,
  normalizeRendererConfig,
} from "./score-viewer-renderer.js";

const DEFAULT_WHEEL_LINE_HEIGHT_PX = 16;
const MIN_SPACING_SCALE = 0.5;
const MAX_SPACING_SCALE = 8.0;
export const SPACING_STEP = 0.05;
export const SPACING_WHEEL_STEP = 0.01;
const DEFAULT_SPACING_SCALE = 1.0;
export const GAME_DURATION_SLIDER_STEP = 10;
export const GAME_DURATION_WHEEL_STEP = 1;
export const GAME_LANE_HEIGHT_SLIDER_STEP = 1;
export const GAME_LANE_HEIGHT_WHEEL_STEP = 0.1;
export const GAME_LANE_COVER_SLIDER_STEP = 10;
export const GAME_LANE_COVER_WHEEL_STEP = 1;
const GAME_PLAYBACK_SCROLL_SYNC_VIEWPORT_RATIO = 0.4;
const GAME_PLAYBACK_SCROLL_SYNC_MIN_PX = 120;
export const JUDGE_LINE_DRAG_HIT_MARGIN_PX = 10;
const GAME_GREEN_DISPLAY_COLOR = "#00FF00";

export function createScoreViewerController({
  root,
  onTimeChange = () => {},
  onPlaybackToggle = () => {},
  onViewerModeChange = () => {},
  onInvisibleNoteVisibilityChange = () => {},
  onJudgeLinePositionChange = () => {},
  onSpacingScaleChange = () => {},
  onGameTimingConfigChange = () => {},
  onRendererConfigChange = () => {},
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

  const detailSettingsToggle = document.createElement("button");
  detailSettingsToggle.className = "score-viewer-detail-settings-toggle";
  detailSettingsToggle.type = "button";
  detailSettingsToggle.setAttribute("aria-label", "Open viewer detail settings");
  detailSettingsToggle.textContent = "⚙";

  playbackRow.append(playbackButton, playbackTime, detailSettingsToggle);

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
  const spacingValuePrimary = document.createElement("span");
  spacingValuePrimary.className = "score-viewer-spacing-value-primary";
  const spacingValueSecondary = document.createElement("span");
  spacingValueSecondary.className = "score-viewer-spacing-value-secondary";
  spacingValue.append(spacingValuePrimary, spacingValueSecondary);
  spacingRow.append(spacingTitle, spacingValue);

  const spacingInput = document.createElement("input");
  spacingInput.className = "score-viewer-spacing-input";
  spacingInput.type = "range";
  spacingInput.min = String(MIN_SPACING_SCALE);
  spacingInput.max = String(MAX_SPACING_SCALE);
  spacingInput.step = String(SPACING_STEP);
  spacingInput.value = String(DEFAULT_SPACING_SCALE);

  const settingsPanel = document.createElement("div");
  settingsPanel.className = "score-viewer-settings-panel";
  const spacingSection = document.createElement("div");
  spacingSection.className = "score-viewer-settings-group score-viewer-spacing-section";
  const gameSettingsSection = document.createElement("div");
  gameSettingsSection.className = "score-viewer-settings-group score-viewer-game-settings-section";
  const modeSection = document.createElement("div");
  modeSection.className = "score-viewer-settings-group score-viewer-mode-section";

  const laneHeightRow = createSettingRow("Height", "score-viewer-lane-height-row");
  laneHeightRow.row.classList.add("score-viewer-game-setting");
  const laneHeightInput = document.createElement("input");
  laneHeightInput.className = "score-viewer-spacing-input score-viewer-lane-height-input";
  laneHeightInput.type = "range";
  laneHeightInput.min = "0";
  laneHeightInput.max = "100";
  laneHeightInput.step = String(GAME_LANE_HEIGHT_SLIDER_STEP);
  laneHeightInput.value = String(DEFAULT_GAME_LANE_HEIGHT_PERCENT);
  laneHeightInput.classList.add("score-viewer-game-setting");

  const laneCoverRow = createSettingRow("Cover", "score-viewer-lane-cover-row");
  laneCoverRow.row.classList.add("score-viewer-game-setting");
  const laneCoverInput = document.createElement("input");
  laneCoverInput.className = "score-viewer-spacing-input score-viewer-lane-cover-input";
  laneCoverInput.type = "range";
  laneCoverInput.min = "0";
  laneCoverInput.max = "1000";
  laneCoverInput.step = String(GAME_LANE_COVER_SLIDER_STEP);
  laneCoverInput.value = String(DEFAULT_GAME_LANE_COVER_PERMILLE);
  laneCoverInput.classList.add("score-viewer-game-setting");

  const laneCoverVisibleRow = document.createElement("label");
  laneCoverVisibleRow.className = "score-viewer-status-row score-viewer-checkbox-row score-viewer-lane-cover-visible-row";
  laneCoverVisibleRow.classList.add("score-viewer-game-setting");
  const laneCoverVisibleLabel = document.createElement("span");
  laneCoverVisibleLabel.className = "score-viewer-mode-title";
  laneCoverVisibleLabel.textContent = "Cover Visible";
  const laneCoverVisibleControl = document.createElement("input");
  laneCoverVisibleControl.className = "score-viewer-checkbox-input";
  laneCoverVisibleControl.type = "checkbox";
  laneCoverVisibleControl.checked = DEFAULT_GAME_LANE_COVER_VISIBLE;
  laneCoverVisibleRow.append(laneCoverVisibleLabel, laneCoverVisibleControl);

  const hsFixRow = document.createElement("div");
  hsFixRow.className = "score-viewer-status-row score-viewer-mode-row score-viewer-hs-fix-row";
  hsFixRow.classList.add("score-viewer-game-setting");
  const hsFixTitle = document.createElement("span");
  hsFixTitle.className = "score-viewer-mode-title";
  hsFixTitle.textContent = "HS-FIX";
  const hsFixSelect = document.createElement("select");
  hsFixSelect.className = "score-viewer-mode-select score-viewer-hs-fix-select";
  hsFixSelect.append(
    createModeOption("start", "START BPM"),
    createModeOption("max", "MAX BPM"),
    createModeOption("main", "MAIN BPM"),
    createModeOption("min", "MIN BPM"),
  );
  hsFixSelect.value = DEFAULT_GAME_HS_FIX_MODE;
  hsFixRow.append(hsFixTitle, hsFixSelect);

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
    createModeOption("lunatic", "Lunatic"),
  );

  const invisibleNoteVisibilitySelect = document.createElement("select");
  invisibleNoteVisibilitySelect.className = "score-viewer-mode-select score-viewer-invisible-note-select";
  invisibleNoteVisibilitySelect.append(
    createModeOption("hide", "INVISIBLE Hide"),
    createModeOption("show", "INVISIBLE Show"),
  );

  modeControls.append(modeSelect, invisibleNoteVisibilitySelect);
  modeRow.append(modeTitle, modeControls);

  spacingSection.append(
    spacingRow,
    spacingInput,
  );
  gameSettingsSection.append(
    laneHeightRow.row,
    laneHeightInput,
    laneCoverRow.row,
    laneCoverInput,
    laneCoverVisibleRow,
    hsFixRow,
  );
  modeSection.append(
    modeRow,
  );
  settingsPanel.append(spacingSection, gameSettingsSection, modeSection);
  statusPanel.append(playbackRow, metricsRow, settingsPanel);
  bottomBar.append(statusPanel);

  const judgeLine = document.createElement("div");
  judgeLine.className = "score-viewer-judge-line";
  const laneHeightHandle = document.createElement("div");
  laneHeightHandle.className = "score-viewer-drag-line score-viewer-lane-height-handle";
  const laneCoverHandle = document.createElement("div");
  laneCoverHandle.className = "score-viewer-drag-line score-viewer-lane-cover-handle";

  root.replaceChildren(scrollHost, canvas, bottomBar, laneHeightHandle, laneCoverHandle, judgeLine);

  const renderer = createScoreViewerRenderer(canvas);
  const state = {
    model: null,
    selectedTimeSec: 0,
    selectedBeat: 0,
    isPinned: false,
    isOpen: false,
    isPlaying: false,
    spacingScaleByMode: createDefaultSpacingScaleByMode(),
    gameTimingConfig: createDefaultGameTimingConfig(),
    rendererConfig: DEFAULT_RENDERER_CONFIG,
    viewerMode: DEFAULT_VIEWER_MODE,
    invisibleNoteVisibility: DEFAULT_INVISIBLE_NOTE_VISIBILITY,
    judgeLinePositionRatio: DEFAULT_JUDGE_LINE_POSITION_RATIO,
    hoveredDragHandle: null,
  };
  const uiState = {
    canvasHidden: null,
    bottomBarHidden: null,
    judgeLineHidden: null,
    laneHeightHandleHidden: null,
    laneCoverHandleHidden: null,
    judgeLineRatioCss: null,
    judgeLineTopCss: null,
    laneHeightHandleTopCss: null,
    laneCoverHandleTopCss: null,
    rootDragHandleHoveredClass: null,
    rootDragHandleDraggingClass: null,
    scrollHostDragHandleHoveredClass: null,
    scrollHostDragHandleDraggingClass: null,
    judgeLineDraggableClass: null,
    judgeLineDraggingClass: null,
    laneHeightHandleDraggableClass: null,
    laneHeightHandleDraggingClass: null,
    laneCoverHandleDraggableClass: null,
    laneCoverHandleDraggingClass: null,
    playbackButtonDisabled: null,
    playbackButtonText: null,
    playbackButtonLabel: null,
    playbackTime: null,
    measureText: null,
    comboText: null,
    spacingPrimaryText: null,
    spacingSecondaryText: null,
    spacingSecondaryDisplay: null,
    spacingSecondaryColor: null,
    spacingInputValue: null,
    spacingInputMin: null,
    spacingInputMax: null,
    spacingInputStep: null,
    laneHeightText: null,
    laneHeightInputValue: null,
    laneCoverText: null,
    laneCoverInputValue: null,
    laneCoverVisibleChecked: null,
    hsFixValue: null,
    modeSelectValue: null,
    modeSelectDisabled: null,
    invisibleNoteVisibilityValue: null,
    invisibleNoteVisibilityDisabled: null,
    gameSettingsHidden: null,
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
      canDragLaneHeight: canDragGameTimingHandle(event),
      canDragLaneCover: canDragGameTimingHandle(event),
      canDragScroll: canDragScroll(event),
      isJudgeLineHit: isPointerNearJudgeLine(event),
      isLaneHeightHit: isPointerNearLaneHeightHandle(event),
      isLaneCoverHit: isPointerNearLaneCoverHandle(event),
    });
    if (!dragIntent) {
      return;
    }
    if (isActiveDragHandleType(dragIntent)) {
      dragState = {
        type: dragIntent,
        pointerId: event.pointerId,
      };
      updateDragHandleFromPointer(dragIntent, event, { notify: true });
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
      updateHoveredDragHandle(event);
      return;
    }
    if (isActiveDragHandleType(dragState.type)) {
      updateDragHandleFromPointer(dragState.type, event, { notify: true });
    } else {
      const deltaY = event.clientY - dragState.startY;
      scrollHost.scrollTop = dragState.startScrollTop + deltaY;
      syncTimeFromScrollPosition({ force: true });
    }
    event.preventDefault();
  });

  scrollHost.addEventListener("pointerleave", () => {
    if (isActiveDragHandleType(dragState?.type)) {
      return;
    }
    setHoveredDragHandle(null);
  });
  statusPanel.addEventListener("mouseleave", () => {
    blurFocusedStatusPanelControl();
  });
  scrollHost.addEventListener("pointerup", handlePointerRelease);
  scrollHost.addEventListener("pointercancel", handlePointerRelease);
  scrollHost.addEventListener("lostpointercapture", handlePointerRelease);

  spacingInput.addEventListener("input", () => {
    const resolvedViewerMode = getResolvedViewerMode();
    if (isGameViewerMode(resolvedViewerMode)) {
      updateGameTimingConfig({
        durationMs: normalizeGameDurationMs(Number.parseFloat(spacingInput.value)),
      }, { notify: true });
      return;
    }
    updateSpacingScaleForMode(
      resolvedViewerMode,
      normalizeSliderSpacingScale(Number.parseFloat(spacingInput.value)),
      { notify: true },
    );
  });

  spacingInput.addEventListener("wheel", (event) => {
    if (!state.isOpen || !state.model) {
      return;
    }
    const resolvedViewerMode = getResolvedViewerMode();
    const delta = event.deltaY < 0
      ? (isGameViewerMode(resolvedViewerMode) ? GAME_DURATION_WHEEL_STEP : SPACING_WHEEL_STEP)
      : event.deltaY > 0
        ? (isGameViewerMode(resolvedViewerMode) ? -GAME_DURATION_WHEEL_STEP : -SPACING_WHEEL_STEP)
        : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (isGameViewerMode(resolvedViewerMode)) {
      updateGameTimingConfig({
        durationMs: normalizeGameDurationMs(state.gameTimingConfig.durationMs + delta),
      }, { notify: true });
      return;
    }
    updateSpacingScaleForMode(
      resolvedViewerMode,
      roundSpacingScaleToHundredths(getSpacingScaleForMode(resolvedViewerMode) + delta),
      { notify: true },
    );
  }, { passive: false });

  laneHeightInput.addEventListener("input", () => {
    updateGameTimingConfig({
      laneHeightPercent: normalizeGameLaneHeightPercentForSlider(Number.parseFloat(laneHeightInput.value)),
    }, { notify: true });
  });

  laneHeightInput.addEventListener("wheel", (event) => {
    if (!state.isOpen || !state.model || !isGameViewerMode(getResolvedViewerMode())) {
      return;
    }
    const delta = event.deltaY < 0
      ? GAME_LANE_HEIGHT_WHEEL_STEP
      : event.deltaY > 0
        ? -GAME_LANE_HEIGHT_WHEEL_STEP
        : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateGameTimingConfig({
      laneHeightPercent: normalizeGameLaneHeightPercentForWheel(state.gameTimingConfig.laneHeightPercent + delta),
    }, { notify: true });
  }, { passive: false });

  laneCoverInput.addEventListener("input", () => {
    updateGameTimingConfig({
      laneCoverPermille: normalizeGameLaneCoverPermille(Number.parseFloat(laneCoverInput.value)),
    }, { notify: true });
  });

  laneCoverInput.addEventListener("wheel", (event) => {
    if (!state.isOpen || !state.model || !isGameViewerMode(getResolvedViewerMode())) {
      return;
    }
    const delta = event.deltaY < 0
      ? GAME_LANE_COVER_WHEEL_STEP
      : event.deltaY > 0
        ? -GAME_LANE_COVER_WHEEL_STEP
        : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateGameTimingConfig({
      laneCoverPermille: normalizeGameLaneCoverPermille(state.gameTimingConfig.laneCoverPermille + delta),
    }, { notify: true });
  }, { passive: false });

  laneCoverVisibleControl.addEventListener("change", () => {
    updateGameTimingConfig({
      laneCoverVisible: normalizeGameLaneCoverVisible(laneCoverVisibleControl.checked),
    }, { notify: true });
  });

  hsFixSelect.addEventListener("change", () => {
    updateGameTimingConfig({
      hsFixMode: normalizeGameHsFixMode(hsFixSelect.value),
    }, { notify: true });
  });

  modeSelect.addEventListener("change", () => {
    const nextMode = normalizeViewerMode(modeSelect.value);
    if ((nextMode === "game" || nextMode === "lunatic") && !state.model?.supportsGameMode) {
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
    renderScene({ updateChrome: true });
  });

  playbackButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePlayback();
  });

  scrollHost.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragState) {
      return;
    }
    togglePlayback();
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
      setHoveredDragHandle(null, { render: false });
    }
    root.classList.toggle("is-visible", state.isOpen && Boolean(state.model));
    syncScrollPosition();
    renderScene({ updateChrome: true });
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
    renderScene({ updateChrome: true });
  }

  function setJudgeLinePositionRatio(nextRatio) {
    const normalizedRatio = normalizeJudgeLinePositionRatio(nextRatio);
    if (Math.abs(state.judgeLinePositionRatio - normalizedRatio) < 0.000001) {
      return;
    }
    state.judgeLinePositionRatio = normalizedRatio;
    editorFrameStateCache = null;
    syncScrollPosition();
    renderScene({ updateChrome: true });
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

  function setGameTimingConfig(nextGameTimingConfig = {}) {
    const normalizedGameTimingConfig = normalizeGameTimingConfig({
      ...state.gameTimingConfig,
      ...nextGameTimingConfig,
    });
    if (areGameTimingConfigsEqual(state.gameTimingConfig, normalizedGameTimingConfig)) {
      return;
    }
    state.gameTimingConfig = normalizedGameTimingConfig;
    refreshLayout();
  }

  function setRendererConfig(nextRendererConfig = {}) {
    const normalizedRendererConfig = normalizeRendererConfig({
      ...state.rendererConfig,
      ...nextRendererConfig,
    });
    if (areRendererConfigsEqual(state.rendererConfig, normalizedRendererConfig)) {
      return;
    }
    state.rendererConfig = normalizedRendererConfig;
    refreshLayout();
  }

  function setEmptyState(_title, _message) {}

  function togglePlayback() {
    if (!state.model || !state.isOpen) {
      return;
    }
    onPlaybackToggle(!state.isPlaying);
  }

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
    renderScene({ updateChrome: true });
  }

  function renderScene({ updateChrome = false } = {}) {
    const showScene = Boolean(state.model && state.isOpen);
    const resolvedViewerMode = getResolvedViewerMode();
    const viewportHeight = root.clientHeight || 0;
    const currentJudgeLineY = getCurrentJudgeLineY(viewportHeight);
    const editorFrameState = showScene && resolvedViewerMode === "editor"
      ? getEditorFrameStateForCurrentView(viewportHeight, currentJudgeLineY)
      : null;
    const cursor = getViewerCursor(
      state.model,
      state.selectedTimeSec,
      resolvedViewerMode,
      state.selectedBeat,
    );

    if (updateChrome) {
      renderSceneChrome({
        showScene,
        resolvedViewerMode,
        viewportHeight,
        currentJudgeLineY,
      });
    }
    renderSceneFrame({
      showScene,
      resolvedViewerMode,
      cursor,
      editorFrameState,
      currentJudgeLineY,
    });
  }

  function renderSceneChrome({
    showScene,
    resolvedViewerMode,
    viewportHeight,
    currentJudgeLineY,
  }) {
    const isGameMode = isGameViewerMode(resolvedViewerMode);
    const currentGameLaneGeometry = isGameMode
      ? getCurrentGameLaneGeometry(viewportHeight)
      : null;
    const spacingDisplay = formatSpacingDisplay({
      mode: resolvedViewerMode,
      spacingScale: getSpacingScaleForMode(resolvedViewerMode),
      durationMs: state.gameTimingConfig.durationMs,
    });
    const spacingSliderConfig = isGameMode
      ? {
        min: String(1),
        max: String(5000),
        step: String(GAME_DURATION_SLIDER_STEP),
        value: String(state.gameTimingConfig.durationMs),
      }
      : {
        min: String(MIN_SPACING_SCALE),
        max: String(MAX_SPACING_SCALE),
        step: String(SPACING_STEP),
        value: getSpacingScaleForMode(resolvedViewerMode).toFixed(2),
      };
    setHiddenIfChanged(canvas, !showScene, "canvasHidden");
    setHiddenIfChanged(bottomBar, !showScene, "bottomBarHidden");
    setHiddenIfChanged(judgeLine, !showScene, "judgeLineHidden");
    setHiddenIfChanged(laneHeightHandle, !showScene || !isGameMode, "laneHeightHandleHidden");
    setHiddenIfChanged(
      laneCoverHandle,
      !showScene || !isGameMode || !state.gameTimingConfig.laneCoverVisible,
      "laneCoverHandleHidden",
    );
    setStylePropertyIfChanged(root, "--score-viewer-judge-line-ratio", String(state.judgeLinePositionRatio), "judgeLineRatioCss");
    setStylePropertyIfChanged(root, "--score-viewer-judge-line-top", `${currentJudgeLineY}px`, "judgeLineTopCss");
    if (isGameMode && currentGameLaneGeometry) {
      setStyleValueIfChanged(laneHeightHandle, "top", `${currentGameLaneGeometry.laneTopY}px`, "laneHeightHandleTopCss");
      setStyleValueIfChanged(
        laneCoverHandle,
        "top",
        `${Math.min(
          currentGameLaneGeometry.laneTopY + getGameLaneCoverHeightPx(
            viewportHeight,
            state.judgeLinePositionRatio,
            state.gameTimingConfig.laneHeightPercent,
            state.gameTimingConfig.laneCoverPermille,
          ),
          currentGameLaneGeometry.judgeLineY,
        )}px`,
        "laneCoverHandleTopCss",
      );
    }
    setHiddenIfChanged(gameSettingsSection, !isGameMode, "gameSettingsHidden");
    setDisabledIfChanged(playbackButton, !state.model, "playbackButtonDisabled");
    setTextIfChanged(spacingValuePrimary, spacingDisplay.primaryText, "spacingPrimaryText");
    setTextIfChanged(spacingValueSecondary, spacingDisplay.secondaryText, "spacingSecondaryText");
    setStyleValueIfChanged(
      spacingValueSecondary,
      "display",
      spacingDisplay.secondaryText === "" ? "none" : "inline",
      "spacingSecondaryDisplay",
    );
    setStyleValueIfChanged(
      spacingValueSecondary,
      "color",
      spacingDisplay.secondaryColor,
      "spacingSecondaryColor",
    );
    setAttributeIfChanged(spacingInput, "min", spacingSliderConfig.min, "spacingInputMin");
    setAttributeIfChanged(spacingInput, "max", spacingSliderConfig.max, "spacingInputMax");
    setAttributeIfChanged(spacingInput, "step", spacingSliderConfig.step, "spacingInputStep");
    setValueIfChanged(spacingInput, spacingSliderConfig.value, "spacingInputValue");
    if (isGameMode && currentGameLaneGeometry) {
      setTextIfChanged(
        laneHeightRow.value,
        formatLaneHeightDisplay(
          state.gameTimingConfig.laneHeightPercent,
          currentGameLaneGeometry.viewportHeight,
          currentGameLaneGeometry.judgeDistancePx,
        ),
        "laneHeightText",
      );
      setValueIfChanged(laneHeightInput, String(state.gameTimingConfig.laneHeightPercent), "laneHeightInputValue");
      setTextIfChanged(
        laneCoverRow.value,
        formatLaneCoverDisplay(state.gameTimingConfig.laneCoverPermille),
        "laneCoverText",
      );
      setValueIfChanged(laneCoverInput, String(state.gameTimingConfig.laneCoverPermille), "laneCoverInputValue");
      setCheckedIfChanged(laneCoverVisibleControl, state.gameTimingConfig.laneCoverVisible, "laneCoverVisibleChecked");
      setValueIfChanged(hsFixSelect, state.gameTimingConfig.hsFixMode, "hsFixValue");
    }
    setValueIfChanged(modeSelect, resolvedViewerMode, "modeSelectValue");
    setDisabledIfChanged(modeSelect, !state.model, "modeSelectDisabled");
    setValueIfChanged(invisibleNoteVisibilitySelect, state.invisibleNoteVisibility, "invisibleNoteVisibilityValue");
    setDisabledIfChanged(invisibleNoteVisibilitySelect, !state.model, "invisibleNoteVisibilityDisabled");
  }

  function renderSceneFrame({
    showScene,
    resolvedViewerMode,
    cursor,
    editorFrameState,
    currentJudgeLineY,
  }) {
    toggleClassIfChanged(
      root,
      "is-drag-handle-hovered",
      showScene && isActiveDragHandleType(state.hoveredDragHandle),
      "rootDragHandleHoveredClass",
    );
    toggleClassIfChanged(
      root,
      "is-drag-handle-dragging",
      isActiveDragHandleType(dragState?.type),
      "rootDragHandleDraggingClass",
    );
    toggleClassIfChanged(
      scrollHost,
      "is-drag-handle-hovered",
      showScene && isActiveDragHandleType(state.hoveredDragHandle),
      "scrollHostDragHandleHoveredClass",
    );
    toggleClassIfChanged(
      scrollHost,
      "is-drag-handle-dragging",
      isActiveDragHandleType(dragState?.type),
      "scrollHostDragHandleDraggingClass",
    );
    toggleClassIfChanged(
      judgeLine,
      "is-draggable",
      showScene && state.hoveredDragHandle === "judge-line",
      "judgeLineDraggableClass",
    );
    toggleClassIfChanged(
      judgeLine,
      "is-dragging",
      dragState?.type === "judge-line",
      "judgeLineDraggingClass",
    );
    toggleClassIfChanged(
      laneHeightHandle,
      "is-draggable",
      showScene && state.hoveredDragHandle === "lane-height",
      "laneHeightHandleDraggableClass",
    );
    toggleClassIfChanged(
      laneHeightHandle,
      "is-dragging",
      dragState?.type === "lane-height",
      "laneHeightHandleDraggingClass",
    );
    toggleClassIfChanged(
      laneCoverHandle,
      "is-draggable",
      showScene && state.hoveredDragHandle === "lane-cover",
      "laneCoverHandleDraggableClass",
    );
    toggleClassIfChanged(
      laneCoverHandle,
      "is-dragging",
      dragState?.type === "lane-cover",
      "laneCoverHandleDraggingClass",
    );
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
    renderer.render(showScene ? state.model : null, cursor.timeSec, {
      viewerMode: resolvedViewerMode,
      pixelsPerSecond: getPixelsPerSecond(),
      pixelsPerBeat: getPixelsPerBeat(),
      editorFrameState,
      showInvisibleNotes: state.invisibleNoteVisibility === "show",
      judgeLineY: currentJudgeLineY,
      gameTimingConfig: state.gameTimingConfig,
      rendererConfig: state.rendererConfig,
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
  const initialSpacingDisplay = formatSpacingDisplay({
    mode: DEFAULT_VIEWER_MODE,
    spacingScale: DEFAULT_SPACING_SCALE,
  });
  spacingValuePrimary.textContent = initialSpacingDisplay.primaryText;
  spacingValueSecondary.textContent = initialSpacingDisplay.secondaryText;
  spacingValueSecondary.style.display = initialSpacingDisplay.secondaryText === "" ? "none" : "inline";
  spacingValueSecondary.style.color = initialSpacingDisplay.secondaryColor;
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
    setGameTimingConfig,
    setRendererConfig,
    setEmptyState,
    refreshLayout,
    destroy,
  };

  function handlePointerRelease(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    clearDragState();
    renderScene();
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
    scrollHost.classList.remove("is-drag-handle-dragging");
    judgeLine.classList.remove("is-dragging");
    laneHeightHandle.classList.remove("is-dragging");
    laneCoverHandle.classList.remove("is-dragging");
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

  function canDragGameTimingHandle(event) {
    return Boolean(
      state.model
        && state.isOpen
        && isGameViewerMode(getResolvedViewerMode())
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
      `${estimateViewerWidth(state.model.score.mode, state.model.score.laneCount, state.rendererConfig)}px`,
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
    return DEFAULT_EDITOR_PIXELS_PER_BEAT * getSpacingScaleForMode("editor");
  }

  function getCurrentJudgeLineY(viewportHeight = root.clientHeight || 0) {
    if (isGameViewerMode(getResolvedViewerMode())) {
      return getGameJudgeLineY(
        viewportHeight,
        state.judgeLinePositionRatio,
        state.gameTimingConfig.laneHeightPercent,
      );
    }
    return getJudgeLineY(viewportHeight, state.judgeLinePositionRatio);
  }

  function getCurrentGameLaneGeometry(viewportHeight = root.clientHeight || 0) {
    return getGameLaneGeometry(
      viewportHeight,
      state.judgeLinePositionRatio,
      state.gameTimingConfig.laneHeightPercent,
    );
  }

  function getEditorFrameStateForCurrentView(
    viewportHeight = root.clientHeight || 0,
    judgeLineY = getCurrentJudgeLineY(viewportHeight),
  ) {
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

  function setStylePropertyIfChanged(element, propertyName, nextValue, key) {
    if (uiState[key] === nextValue) {
      return;
    }
    uiState[key] = nextValue;
    element.style.setProperty(propertyName, nextValue);
  }

  function setStyleValueIfChanged(element, styleName, nextValue, key) {
    if (uiState[key] === nextValue) {
      return;
    }
    uiState[key] = nextValue;
    element.style[styleName] = nextValue;
  }

  function setCheckedIfChanged(element, nextValue, key) {
    if (uiState[key] === nextValue) {
      return;
    }
    uiState[key] = nextValue;
    element.checked = Boolean(nextValue);
  }

  function setHiddenIfChanged(element, nextValue, key = null) {
    if (!element) {
      return;
    }
    if (key && uiState[key] === nextValue) {
      return;
    }
    element.hidden = Boolean(nextValue);
    element.style.display = nextValue ? "none" : "";
    if (key) {
      uiState[key] = Boolean(nextValue);
    }
  }

  function toggleClassIfChanged(element, className, nextValue, key) {
    const normalizedValue = Boolean(nextValue);
    if (uiState[key] === normalizedValue) {
      return;
    }
    uiState[key] = normalizedValue;
    element.classList.toggle(className, normalizedValue);
  }

  function setHoveredDragHandle(nextHandle, { render = true } = {}) {
    const normalizedHandle = isActiveDragHandleType(nextHandle) ? nextHandle : null;
    if (state.hoveredDragHandle === normalizedHandle) {
      return;
    }
    state.hoveredDragHandle = normalizedHandle;
    if (render) {
      renderScene();
    }
  }

  function updateHoveredDragHandle(event) {
    if (!state.model || !state.isOpen) {
      if (state.hoveredDragHandle) {
        setHoveredDragHandle(null);
      }
      return;
    }
    const hoveredHandle = resolvePointerDragIntent({
      canDragJudgeLine: canDragJudgeLine(event),
      canDragLaneHeight: canDragGameTimingHandle(event),
      canDragLaneCover: canDragGameTimingHandle(event),
      canDragScroll: false,
      isJudgeLineHit: isPointerNearJudgeLine(event),
      isLaneHeightHit: isPointerNearLaneHeightHandle(event),
      isLaneCoverHit: isPointerNearLaneCoverHandle(event),
    });
    const nextHandle = isActiveDragHandleType(hoveredHandle) ? hoveredHandle : null;
    if (nextHandle !== state.hoveredDragHandle) {
      setHoveredDragHandle(nextHandle);
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

  function isPointerNearLaneHeightHandle(event) {
    if (!isGameViewerMode(getResolvedViewerMode())) {
      return false;
    }
    const rootRect = root.getBoundingClientRect();
    return isJudgeLineHit({
      pointerClientY: event.clientY,
      rootTop: rootRect.top,
      judgeLineY: getCurrentGameLaneGeometry(rootRect.height).laneTopY,
    });
  }

  function isPointerNearLaneCoverHandle(event) {
    if (!isGameViewerMode(getResolvedViewerMode()) || !state.gameTimingConfig.laneCoverVisible) {
      return false;
    }
    const rootRect = root.getBoundingClientRect();
    const laneGeometry = getCurrentGameLaneGeometry(rootRect.height);
    return isJudgeLineHit({
      pointerClientY: event.clientY,
      rootTop: rootRect.top,
      judgeLineY: Math.min(
        laneGeometry.laneTopY + getGameLaneCoverHeightPx(
          rootRect.height,
          state.judgeLinePositionRatio,
          state.gameTimingConfig.laneHeightPercent,
          state.gameTimingConfig.laneCoverPermille,
        ),
        laneGeometry.judgeLineY,
      ),
    });
  }

  function updateDragHandleFromPointer(handleType, event, { notify = false } = {}) {
    if (handleType === "judge-line") {
      updateJudgeLinePositionFromPointer(event, { notify });
      return;
    }
    if (handleType === "lane-height") {
      updateLaneHeightFromPointer(event, { notify });
      return;
    }
    if (handleType === "lane-cover") {
      updateLaneCoverFromPointer(event, { notify });
    }
  }

  function updateJudgeLinePositionFromPointer(event, { notify = false } = {}) {
    const rootRect = root.getBoundingClientRect();
    const pointerOffsetY = event.clientY - rootRect.top;
    const nextRatio = isGameViewerMode(getResolvedViewerMode())
      ? getGameJudgeLinePositionRatioFromPointer(
        pointerOffsetY,
        rootRect.height,
        state.gameTimingConfig.laneHeightPercent,
      )
      : getJudgeLinePositionRatioFromPointer({
        pointerClientY: event.clientY,
        rootTop: rootRect.top,
        rootHeight: rootRect.height,
      });
    if (Math.abs(state.judgeLinePositionRatio - nextRatio) < 0.000001) {
      setHoveredDragHandle("judge-line");
      return;
    }
    state.judgeLinePositionRatio = nextRatio;
    editorFrameStateCache = null;
    setHoveredDragHandle("judge-line", { render: false });
    syncScrollPosition();
    renderScene({ updateChrome: true });
    if (notify) {
      onJudgeLinePositionChange(state.judgeLinePositionRatio);
    }
  }

  function updateLaneHeightFromPointer(event, { notify = false } = {}) {
    const rootRect = root.getBoundingClientRect();
    const nextLaneHeightPercent = getGameLaneHeightPercentFromPointer(
      event.clientY - rootRect.top,
      rootRect.height,
      state.gameTimingConfig.laneHeightPercent,
    );
    setHoveredDragHandle("lane-height", { render: false });
    updateGameTimingConfig({ laneHeightPercent: nextLaneHeightPercent }, { notify });
  }

  function updateLaneCoverFromPointer(event, { notify = false } = {}) {
    const rootRect = root.getBoundingClientRect();
    const nextLaneCoverPermille = getGameLaneCoverPermilleFromPointer(
      event.clientY - rootRect.top,
      rootRect.height,
      state.judgeLinePositionRatio,
      state.gameTimingConfig.laneHeightPercent,
      state.gameTimingConfig.laneCoverPermille,
    );
    setHoveredDragHandle("lane-cover", { render: false });
    updateGameTimingConfig({ laneCoverPermille: nextLaneCoverPermille }, { notify });
  }

  function getSpacingScaleForMode(mode) {
    return state.spacingScaleByMode[normalizeSpacingMode(mode)] ?? DEFAULT_SPACING_SCALE;
  }

  function updateSpacingScaleForMode(mode, nextScale, { notify = false } = {}) {
    const normalizedMode = normalizeSpacingMode(mode);
    const normalizedScale = clampScale(nextScale);
    if (Math.abs(getSpacingScaleForMode(normalizedMode) - normalizedScale) < 0.0005) {
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

  function updateGameTimingConfig(nextPartialConfig = {}, { notify = false } = {}) {
    const normalizedGameTimingConfig = normalizeGameTimingConfig({
      ...state.gameTimingConfig,
      ...nextPartialConfig,
    });
    if (areGameTimingConfigsEqual(state.gameTimingConfig, normalizedGameTimingConfig)) {
      return;
    }
    state.gameTimingConfig = normalizedGameTimingConfig;
    refreshLayout();
    if (notify) {
      onGameTimingConfigChange(state.gameTimingConfig);
    }
  }

  function blurFocusedStatusPanelControl() {
    const activeElement = root.ownerDocument?.activeElement;
    if (!activeElement || typeof activeElement.blur !== "function") {
      return;
    }
    if (!isDescendantOf(activeElement, statusPanel)) {
      return;
    }
    activeElement.blur();
  }
}

function createModeOption(value, label, disabled = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  return option;
}

function createSettingRow(title, className) {
  const row = document.createElement("div");
  row.className = `score-viewer-status-row score-viewer-spacing-row ${className}`;
  const titleElement = document.createElement("span");
  titleElement.className = "score-viewer-spacing-title";
  titleElement.textContent = title;
  const valueElement = document.createElement("span");
  valueElement.className = "score-viewer-spacing-value";
  row.append(titleElement, valueElement);
  return { row, title: titleElement, value: valueElement };
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
  if (!isGameViewerMode(viewerMode) || !isPlaying) {
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
  canDragLaneHeight,
  canDragLaneCover,
  canDragScroll,
  isJudgeLineHit,
  isLaneHeightHit,
  isLaneCoverHit,
}) {
  if (canDragJudgeLine && isJudgeLineHit) {
    return "judge-line";
  }
  if (canDragLaneHeight && isLaneHeightHit) {
    return "lane-height";
  }
  if (canDragLaneCover && isLaneCoverHit) {
    return "lane-cover";
  }
  if (canDragScroll) {
    return "scroll";
  }
  return null;
}

function isActiveDragHandleType(value) {
  return value === "judge-line" || value === "lane-height" || value === "lane-cover";
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

function isGameViewerMode(mode) {
  return mode === "game" || mode === "lunatic";
}

function normalizeSpacingMode(mode) {
  return mode === "editor" ? "editor" : isGameViewerMode(mode) ? "game" : "time";
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

function areGameTimingConfigsEqual(left, right) {
  return Math.abs((left?.durationMs ?? DEFAULT_GAME_DURATION_MS) - (right?.durationMs ?? DEFAULT_GAME_DURATION_MS)) < 0.000001
    && Math.abs((left?.laneHeightPercent ?? DEFAULT_GAME_LANE_HEIGHT_PERCENT) - (right?.laneHeightPercent ?? DEFAULT_GAME_LANE_HEIGHT_PERCENT)) < 0.000001
    && Math.abs((left?.laneCoverPermille ?? DEFAULT_GAME_LANE_COVER_PERMILLE) - (right?.laneCoverPermille ?? DEFAULT_GAME_LANE_COVER_PERMILLE)) < 0.000001
    && (left?.laneCoverVisible ?? DEFAULT_GAME_LANE_COVER_VISIBLE) === (right?.laneCoverVisible ?? DEFAULT_GAME_LANE_COVER_VISIBLE)
    && (left?.hsFixMode ?? DEFAULT_GAME_HS_FIX_MODE) === (right?.hsFixMode ?? DEFAULT_GAME_HS_FIX_MODE);
}

function isPrimaryPointer(event) {
  return event.button === 0
    || event.button === -1
    || event.button === undefined
    || event.pointerType === "touch"
    || event.pointerType === "pen";
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

function formatSpacingDisplay({
  mode,
  spacingScale = DEFAULT_SPACING_SCALE,
  durationMs = DEFAULT_GAME_DURATION_MS,
} = {}) {
  const normalizedMode = normalizeSpacingMode(mode);
  if (normalizedMode === "game") {
    const gameDurationDisplay = formatGameDurationDisplay(durationMs);
    return {
      primaryText: gameDurationDisplay.primaryText,
      secondaryText: gameDurationDisplay.secondaryText,
      secondaryColor: GAME_GREEN_DISPLAY_COLOR,
    };
  }
  return {
    primaryText: formatSpacingScaleDisplay(normalizedMode, spacingScale),
    secondaryText: "",
    secondaryColor: "",
  };
}

function formatGameDurationDisplay(durationMs) {
  const normalizedDurationMs = normalizeGameDurationMs(durationMs);
  return {
    primaryText: `${normalizedDurationMs}ms`,
    secondaryText: `(${getGameSettingGreenNumber(normalizedDurationMs)})`,
  };
}

function formatLaneHeightDisplay(laneHeightPercent, viewportHeight, judgeDistancePx) {
  const normalizedLaneHeightPercent = normalizeGameLaneHeightPercent(laneHeightPercent);
  const normalizedViewportHeight = Math.max(Number.isFinite(viewportHeight) ? viewportHeight : 0, 0);
  const normalizedJudgeDistancePx = Math.max(Number.isFinite(judgeDistancePx) ? judgeDistancePx : 0, 0);
  return `${normalizedLaneHeightPercent.toFixed(1)}%(${Math.round(normalizedViewportHeight)}px ${Math.round(normalizedJudgeDistancePx)}px)`;
}

function formatLaneCoverDisplay(laneCoverPermille) {
  const normalizedLaneCoverPermille = normalizeGameLaneCoverPermille(laneCoverPermille);
  return `${normalizedLaneCoverPermille}(${(normalizedLaneCoverPermille / 10).toFixed(1)}%)`;
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

function isDescendantOf(element, ancestor) {
  let currentNode = element;
  while (currentNode) {
    if (currentNode === ancestor) {
      return true;
    }
    currentNode = currentNode.parentNode ?? null;
  }
  return false;
}
